'use strict';

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';
const ONTEM = '17/09/2026';
const HA_TRES_DIAS = '15/09/2026';

function frase(id, texto, extras = {}) {
  return { id, texto, data: HOJE, streaming: 'netflix', idioma: 'Inglês', ...extras };
}

function frasesDeExemplo(n) {
  return Array.from({ length: n }, (_, i) =>
    frase(1_700_000_000_000 + (n - i), `Sentence number ${n - i} about the harbour.`));
}

async function abrirFrases(page, extensao) {
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frases mineradas');
}

const lista = page => page.locator('#frases-lista');
const cartoes = page => lista(page).locator('.veio-frase');
const cartao = (page, texto) => cartoes(page).filter({ hasText: texto });
const busca = page => page.getByRole('searchbox', { name: 'Buscar nas frases' });
const paginas = page => page.getByRole('navigation', { name: 'Páginas' });
const palavra = (page, textoDaFrase, nome) =>
  cartao(page, textoDaFrase).getByRole('button', { name: nome, exact: true });

test('cada frase é um cartão sob o cabeçalho do seu dia: hoje, ontem, há 3 dias', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(3, 'That was a close call.', { data: HOJE }),
      frase(2, 'He barely made it to the station.', { data: ONTEM }),
      frase(1, 'Let us call it a day.', { data: HA_TRES_DIAS }),
    ],
  });
  await abrirFrases(page, extensao);

  const cabecalhos = lista(page).locator('.veio-cabecalho-de-data');
  await expect(cabecalhos).toHaveText(['hoje', 'ontem', 'há 3 dias']);
  await expect(cartoes(page)).toHaveText([/close call/, /barely made it/, /call it a day/]);
  expect(await cabecalhos.first().evaluate(el => getComputedStyle(el).textTransform)).toBe('uppercase');
});

test('a linha de Contexto traz a Fonte, Título · Detalhe e o selo Enviada ao Anki', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(2, 'I never take it for granted.', {
        streaming: 'netflix', status: 'exported',
        contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: 'T1E3' },
      }),
      frase(1, 'The results were far from conclusive.', {
        streaming: 'web', contexto: { fonte: 'web', titulo: 'Nature', detalhe: '' },
      }),
    ],
  });
  await abrirFrases(page, extensao);

  const enviada = cartao(page, 'take it for granted').locator('.veio-frase__contexto');
  await expect(enviada).toHaveText(/Netflix\s*Dark · T1E3\s*Enviada ao Anki/);

  const daWeb = cartao(page, 'far from conclusive').locator('.veio-frase__contexto');
  await expect(daWeb).toHaveText(/Web\s*Nature/);
  await expect(daWeb).not.toContainText('Enviada ao Anki');
  await expect(daWeb).not.toContainText('·');
});

test('a frase em cirílico sai marcada como russa e reta; a inglesa, como inglesa', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(2, 'Я улыбаюсь каждое утро без причины.', { idioma: 'Russo' }),
      frase(1, 'The quiet harbor woke before the gulls did.'),
    ],
  });
  await abrirFrases(page, extensao);

  const russa = cartao(page, 'улыбаюсь').locator('.veio-frase__texto');
  await expect(russa).toHaveAttribute('lang', 'ru');
  expect(await russa.evaluate(el => getComputedStyle(el).fontStyle)).toBe('normal');
  const estilos = await russa.getByRole('button').evaluateAll(els => els.map(el => getComputedStyle(el).fontStyle));
  expect(estilos).toHaveLength(6);
  expect(new Set(estilos)).toEqual(new Set(['normal']));
  await expect(cartao(page, 'quiet harbor').locator('.veio-frase__texto')).toHaveAttribute('lang', 'en');
});

test('uma frase com marcação aparece literal no cartão, sem virar elemento', async ({ page, extensao }) => {
  const comMarcacao = 'Say <b>hello</b> to <img src=x onerror="window.__injetado=1">';
  await extensao.gravarStorage({
    frases: [frase(1, comMarcacao, { contexto: { fonte: 'web', titulo: '<i>Página</i>', detalhe: '' } })],
  });
  await abrirFrases(page, extensao);

  await expect(cartao(page, 'hello').locator('.veio-frase__texto')).toHaveText(comMarcacao);
  await expect(cartao(page, 'hello')).toContainText('<i>Página</i>');
  await expect(lista(page).locator('b, i, img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__injetado)).toBeUndefined();
});

test('o chip diz palavra: quando foi escolhida e auto: quando foi detectada, e a Palavra fica grifada', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(2, 'She was reluctant to say anything.', { keywords: ['reluctant@4'], autoKeyword: true }),
      frase(1, 'That was a close call.', { keywords: ['close@6', 'call@8'] }),
    ],
  });
  await abrirFrases(page, extensao);

  await expect(cartao(page, 'reluctant').locator('.veio-chip-palavra')).toHaveText(/^auto:\s*reluctant/);
  await expect(cartao(page, 'close call').locator('.veio-chip-palavra')).toHaveText(/^palavra:\s*close call/);
  await expect(palavra(page, 'close call', 'close')).toHaveAttribute('aria-pressed', 'true');
  await expect(palavra(page, 'close call', 'That')).toHaveAttribute('aria-pressed', 'false');
  const fundo = await palavra(page, 'close call', 'close').evaluate(el => getComputedStyle(el).backgroundImage);
  expect(fundo).toContain('linear-gradient');
  await expect(cartao(page, 'close call')).not.toContainText('keyword');
});

test('clicar numa palavra grava a Palavra (chip palavra:), e ela continua grifada depois de recarregar', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [frase(1, 'He barely made it to the station.')] });
  await abrirFrases(page, extensao);
  await expect(cartao(page, 'barely').locator('.veio-chip-palavra')).toHaveCount(0);

  await palavra(page, 'barely', 'barely').click();

  await expect(cartao(page, 'barely').locator('.veio-chip-palavra')).toHaveText(/^palavra:\s*barely/);
  await expect(palavra(page, 'barely', 'barely')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await extensao.frases())[0].keywords).toEqual(['barely@2']);

  await page.reload();
  await expect(palavra(page, 'barely', 'barely')).toHaveAttribute('aria-pressed', 'true');
  await expect(cartao(page, 'barely').locator('.veio-chip-palavra')).toHaveText(/^palavra:\s*barely/);

  await palavra(page, 'barely', 'barely').click();
  await expect(palavra(page, 'barely', 'barely')).toHaveAttribute('aria-pressed', 'false');
  await expect(cartao(page, 'barely').locator('.veio-chip-palavra')).toHaveCount(0);
  await expect.poll(async () => (await extensao.frases())[0].keywords).toEqual([]);
});

test('escolher uma palavra detectada troca auto: por palavra:', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [frase(1, 'She was reluctant to say anything.', { keywords: ['reluctant@4'], autoKeyword: true })],
  });
  await abrirFrases(page, extensao);

  await palavra(page, 'reluctant', 'anything').click();

  await expect(cartao(page, 'reluctant').locator('.veio-chip-palavra')).toHaveText(/^palavra:\s*reluctant anything/);
  await expect.poll(async () => (await extensao.frases())[0]).toMatchObject({
    keywords: ['reluctant@4', 'anything@10'], autoKeyword: false,
  });
});

test('no chip, × remove a Palavra e + começa outro grupo', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(2, 'You cannot have your cake and eat it.', { keywords: ['cake@8'] }),
      frase(1, 'That was a close call.', { keywords: ['close@6'] }),
    ],
  });
  await abrirFrases(page, extensao);

  await cartao(page, 'cake').getByRole('button', { name: 'Adicionar outro grupo' }).click();
  await palavra(page, 'cake', 'eat').click();
  await expect(cartao(page, 'cake').locator('.veio-chip-palavra')).toHaveText(/^palavra:\s*cake \| eat/);
  await expect.poll(async () => (await extensao.frases())[0].keywords).toEqual(['cake@8', '|', 'eat@12']);

  await cartao(page, 'close call').getByRole('button', { name: 'Remover a palavra' }).click();
  await expect(cartao(page, 'close call').locator('.veio-chip-palavra')).toHaveCount(0);
  await expect(palavra(page, 'close call', 'close')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await extensao.frases())[1].keywords).toEqual([]);
});

test('pelo teclado: Tab entra na frase, as setas andam pelas palavras e Enter escolhe', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [frase(1, 'Keep me posted.')] });
  await abrirFrases(page, extensao);

  const primeira = palavra(page, 'Keep me posted', 'Keep');
  await primeira.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(palavra(page, 'Keep me posted', 'posted')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(palavra(page, 'Keep me posted', 'posted')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await extensao.frases())[0].keywords).toEqual(['posted@4']);
  await expect(cartao(page, 'Keep me posted').locator('[role="button"][tabindex="0"]')).toHaveCount(1);
});

// Exceção de teste: sem-estado-guardado — abrir o modal Minerar frases não grava nada.
test('primeiro uso: PAI-02 com o atalho de legenda padrão (Alt+S) e Minerar frases', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);

  const vazio = lista(page).locator('.veio-vazio');
  await expect(vazio.locator('.veio-vazio__titulo')).toHaveText('Nenhuma frase ainda.');
  await expect(vazio.locator('.veio-vazio__texto')).toHaveText(
    'Minere de um vídeo com Alt+S ou use Minerar frases para colar, importar ou ler uma foto.');
  expect(await vazio.locator('.veio-vazio__titulo').evaluate(el => Number(getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
  await expect(vazio.locator('kbd')).toHaveText('Alt+S');

  await vazio.getByRole('button', { name: 'Minerar frases' }).click();
  await expect(page.getByRole('dialog', { name: 'Minerar frases' })).toBeVisible();
});

test('primeiro uso com o atalho de legenda trocado para Ctrl+Shift+K: PAI-02 mostra Ctrl+Shift+K', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    pm_atalho_legenda: { type: 'keyboard', code: 'KeyK', altKey: false, ctrlKey: true, shiftKey: true },
  });
  await abrirFrases(page, extensao);

  const vazio = lista(page).locator('.veio-vazio');
  await expect(vazio.locator('.veio-vazio__texto')).toHaveText(
    'Minere de um vídeo com Ctrl+Shift+K ou use Minerar frases para colar, importar ou ler uma foto.');
  await expect(vazio.locator('kbd')).toHaveText('Ctrl+Shift+K');

  await extensao.gravarStorage({
    pm_atalho_legenda: { type: 'keyboard', code: 'KeyL', altKey: true, ctrlKey: false, shiftKey: false },
  });
  await expect(vazio.locator('kbd')).toHaveText('Alt+L');
});

// Exceção de teste: sem-estado-guardado — o Definir atalho só leva a Configurações › Atalhos; nada é gravado.
test('primeiro uso sem atalho de legenda gravado: PAI-02 mostra “Sem atalho” + Definir atalho, que leva a Configurações › Atalhos', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await abrirFrases(page, extensao);

  const vazio = lista(page).locator('.veio-vazio');
  await expect(vazio.locator('kbd')).toHaveText('Sem atalho');
  await expect(vazio.locator('kbd')).toHaveClass(/veio-kbd--sem-atalho/);
  await expect(vazio.locator('.veio-vazio__texto')).toHaveText(
    'Minere de um vídeo com Sem atalho Definir atalho ou use Minerar frases para colar, importar ou ler uma foto.');

  await vazio.getByRole('link', { name: 'Definir atalho' }).click();
  await expect(page).toHaveURL(/#configuracoes\/atalhos$/);
  await expect(page.getByRole('button', { name: 'Atalhos', exact: true })).toHaveAttribute('aria-expanded', 'true');
});

// Exceção de teste: sem-estado-guardado — abrir o modal pelo menu não grava nada.
test('Minerar frases abre o modal por cima da tela inteira, não no fim da página', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html#frases'));
  await page.getByRole('button', { name: 'Minerar frases' }).first().click();
  await page.getByRole('menuitem', { name: /^Colar/ }).click();
  await expect(page.getByRole('dialog', { name: 'Minerar frases' })).toBeVisible();
  const modal = page.locator('#modal-minerar');
  await expect(modal).toBeVisible();
  const caixa = await modal.boundingBox();
  const tela = page.viewportSize();
  expect(caixa).toEqual({ x: 0, y: 0, width: tela.width, height: tela.height });
});

test('carregando: 5 cartões-esqueleto, sem texto; quando a nuvem responde, as frases', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-lista' });
  fakes.google.segurarLeituras();
  await abrirFrases(page, extensao);

  const esqueletos = lista(page).locator('.veio-frase-esqueleto');
  await expect(esqueletos).toHaveCount(5);
  await expect(lista(page)).toHaveText('');
  await expect(lista(page)).toHaveAttribute('aria-busy', 'true');
});

test('se a nuvem falha ao carregar, a lista mostra as frases deste computador', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [frase(1, 'Break a leg tonight.')] });
  await extensao.semearSessao({ uid: 'uid-falha' });
  fakes.google.recusarLeituras();
  await abrirFrases(page, extensao);

  await expect(cartoes(page)).toHaveText([/Break a leg/]);
  await expect(lista(page)).not.toHaveAttribute('aria-busy', 'true');
});

// Exceção de teste: sem-estado-guardado — andar pelas páginas e buscar não gravam nada.
test('10 por página, com “1–10 de 24” e ‹ › para andar', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(24) });
  await abrirFrases(page, extensao);

  await expect(cartoes(page)).toHaveCount(10);
  await expect(paginas(page)).toContainText('1–10 de 24');
  await expect(paginas(page)).toContainText('1 de 3');
  await expect(paginas(page).getByRole('button', { name: 'Primeira página' })).toBeDisabled();
  await expect(paginas(page).getByRole('button', { name: 'Página anterior' })).toBeDisabled();

  await paginas(page).getByRole('button', { name: 'Próxima página' }).click();
  await expect(paginas(page)).toContainText('11–20 de 24');
  await expect(cartoes(page).first()).toContainText('Sentence number 14 ');

  await paginas(page).getByRole('button', { name: 'Última página' }).click();
  await expect(paginas(page)).toContainText('21–24 de 24');
  await expect(paginas(page)).toContainText('3 de 3');
  await expect(cartoes(page)).toHaveCount(4);
  await expect(paginas(page).getByRole('button', { name: 'Próxima página' })).toBeDisabled();

  await busca(page).fill('Sentence');
  await expect(paginas(page)).toContainText('1–10 de 24');
});

test('os números da paginação saem em PT-BR: “1–10 de 1.284” e “1 de 129”', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(1284) });
  await abrirFrases(page, extensao);

  await expect(paginas(page)).toContainText('1–10 de 1.284');
  await expect(paginas(page)).toContainText('1 de 129');
});

// Exceção de teste: sem-estado-guardado — a seleção fica só na tela; nada é gravado.
test('o cartão selecionado ganha o destaque', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(12) });
  await abrirFrases(page, extensao);

  const primeiro = cartoes(page).first();
  await primeiro.getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await expect(primeiro).toHaveClass(/veio-frase--selecionada/);
  await expect(cartoes(page).nth(1)).not.toHaveClass(/veio-frase--selecionada/);
});

// Exceção de teste: sem-estado-guardado — abrir o menu não grava nada.
test('o cabeçalho traz Minerar frases, que abre o menu Colar · Arquivo .txt · Foto (#31)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirFrases(page, extensao);

  const cabecalho = page.locator('.shell-area[data-area="frases"] .shell-cabecalho');
  await cabecalho.getByRole('button', { name: 'Minerar frases' }).click();
  await expect(page.getByRole('menu', { name: 'Minerar frases' }).getByRole('menuitem')).toHaveCount(3);
});

// Exceção de teste: sem-estado-guardado — a seleção fica só na tela; nada é gravado.
test('“Selecionar página” marca a página inteira, fica misto com parte dela e desmarca', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(12) });
  await abrirFrases(page, extensao);

  const selecionarPagina = page.getByRole('checkbox', { name: 'Selecionar página' });
  await expect(selecionarPagina).not.toBeChecked();

  await cartoes(page).first().getByRole('checkbox', { name: 'Selecionar frase' }).check();
  expect(await selecionarPagina.evaluate(el => el.indeterminate)).toBe(true);

  await selecionarPagina.click();
  await expect(selecionarPagina).toBeChecked();
  await expect(lista(page).getByRole('checkbox', { name: 'Selecionar frase', checked: true })).toHaveCount(10);
  await expect(page.locator('#selection-count')).toHaveText('10 selecionadas');

  await selecionarPagina.click();
  await expect(selecionarPagina).not.toBeChecked();
  await expect(lista(page).getByRole('checkbox', { name: 'Selecionar frase', checked: true })).toHaveCount(0);
});

test('sem frases, a linha “Selecionar página” não aparece', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await expect(lista(page).locator('.veio-vazio')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Selecionar página' })).toBeHidden();
});

// Exceção de teste: sem-estado-guardado — o foco do teclado e a troca de página não gravam nada.
test('cada controle do cartão, do chip e da paginação tem nome, e o foco do teclado aparece nele', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(2_000_000_000_000, 'That was a close call.', { keywords: ['close@6'] }),
      ...frasesDeExemplo(11),
    ],
  });
  await abrirFrases(page, extensao);

  const comChip = cartao(page, 'close call');
  const controles = [
    page.getByRole('checkbox', { name: 'Selecionar página' }),
    comChip.getByRole('checkbox', { name: 'Selecionar frase' }),
    comChip.getByRole('button', { name: 'Remover a palavra' }),
    comChip.getByRole('button', { name: 'Adicionar outro grupo' }),
    comChip.getByRole('button', { name: 'Editar texto' }),
    comChip.getByRole('button', { name: 'Editar contexto' }),
    comChip.getByRole('button', { name: 'Copiar frase' }),
    comChip.getByRole('button', { name: 'Apagar frase' }),
    paginas(page).getByRole('button', { name: 'Próxima página' }),
    paginas(page).getByRole('button', { name: 'Última página' }),
  ];
  const voltar = [
    paginas(page).getByRole('button', { name: 'Primeira página' }),
    paginas(page).getByRole('button', { name: 'Página anterior' }),
  ];
  for (const botao of voltar) await expect(botao).toBeDisabled();

  const focoAparece = async controle => {
    await controle.focus();
    const contorno = await controle.evaluate(el => {
      const estilo = getComputedStyle(el);
      return estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0;
    });
    expect(contorno, await controle.evaluate(el => el.outerHTML.slice(0, 80))).toBe(true);
    await expect(controle).toBeVisible();
  };
  await page.keyboard.press('Tab');
  for (const controle of controles) await focoAparece(controle);

  await paginas(page).getByRole('button', { name: 'Próxima página' }).click();
  await page.keyboard.press('Tab');
  for (const botao of voltar) await focoAparece(botao);
});

test('com movimento reduzido, os cartões-esqueleto ficam parados', async ({ page, extensao, fakes }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await extensao.semearSessao({ uid: 'uid-parado' });
  fakes.google.segurarLeituras();
  await abrirFrases(page, extensao);

  const brilho = lista(page).locator('.veio-frase-esqueleto').first();
  await expect(brilho).toBeVisible();
  expect(await brilho.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});
