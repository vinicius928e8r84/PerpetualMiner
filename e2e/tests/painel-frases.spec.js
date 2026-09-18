'use strict';

// Passo 3 do redesign: a lista de Frases em cartões, com filtros, busca e
// paginação (#29).
//
// Cada frase é um cartão sob um cabeçalho de data (hoje · ontem · há 3 dias),
// com a Palavra grifada e o chip `palavra:`/`auto:`, e a linha de Contexto com a
// Fonte, Título · Detalhe e o selo do estado. Os filtros ficam numa linha, com a
// busca no texto e no Título (item 1 da lista fechada). A lista mostra os
// estados PAI-01 a PAI-04. As ações de hoje (selecionar, apagar, exportar,
// enviar ao Anki) continuam funcionando sobre os cartões até #30 e #32.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado, nunca funções
// internas.

const { test, expect } = require('../fixtures');

// O cabeçalho de data sai do relógio: ele fica parado neste dia.
const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';
const ONTEM = '17/09/2026';
const HA_TRES_DIAS = '15/09/2026';

/** Uma frase gravada como o service worker grava, com o que o teste pedir. */
function frase(id, texto, extras = {}) {
  return { id, texto, data: HOJE, streaming: 'netflix', idioma: 'Inglês', ...extras };
}

/** `n` frases de hoje, a mais nova primeiro. */
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
const filtro = (page, nome) => page.getByRole('combobox', { name: nome, exact: true });
const ocultar = page => page.getByRole('switch', { name: 'Ocultar enviadas e exportadas' });
/** A pessoa liga o toggle pelo rótulo: o <input> só existe para o leitor de tela. */
async function ligarOcultar(page) {
  await page.locator('.veio-toggle').getByText('Ocultar enviadas e exportadas').click();
  await expect(ocultar(page)).toBeChecked();
}
const paginas = page => page.getByRole('navigation', { name: 'Páginas' });
const palavra = (page, textoDaFrase, nome) =>
  cartao(page, textoDaFrase).getByRole('button', { name: nome, exact: true });

// ─── Cartões ─────────────────────────────────────────────────────────────────

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
  // O cabeçalho aparece em maiúsculas, pelo estilo, sem mudar o texto.
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

// ─── A Palavra ───────────────────────────────────────────────────────────────

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
  // A grifada usa o marca-texto kw-bg (a faixa de 50% a 94% da linha).
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

  // Clicar de novo desgrifa, e o chip sai.
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
  // A frase é uma parada só do Tab: as outras palavras ficam fora da ordem.
  await expect(cartao(page, 'Keep me posted').locator('[role="button"][tabindex="0"]')).toHaveCount(1);
});

// ─── Filtros e busca ─────────────────────────────────────────────────────────

const PARA_FILTRAR = [
  frase(4, 'That was a close call.', { streaming: 'netflix', contexto: { fonte: 'netflix', titulo: 'The Bear', detalhe: 'T2E1' } }),
  frase(3, 'Я тебе потом перезвоню.', { streaming: 'youtube', idioma: 'Russo', contexto: { fonte: 'youtube', titulo: 'Russian with Max', detalhe: '' } }),
  frase(2, 'It is a long shot, but worth trying.', { streaming: 'netflix', status: 'exported', contexto: { fonte: 'netflix', titulo: 'Ted Lasso', detalhe: 'T1E5' } }),
  frase(1, 'Let us call it a day.', { streaming: 'youtube', contexto: { fonte: 'youtube', titulo: 'Veritasium', detalhe: '' } }),
];

test('a busca acha pelo texto e pelo Título, e o × limpa', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: PARA_FILTRAR });
  await abrirFrases(page, extensao);
  const limpar = page.locator('.veio-busca').getByRole('button', { name: 'Limpar busca' });
  await expect(limpar).toBeHidden();

  await busca(page).fill('CALL');
  await expect(cartoes(page)).toHaveText([/close call/, /call it a day/]);
  await expect(limpar).toBeVisible();

  await busca(page).fill('ted lasso');
  await expect(cartoes(page)).toHaveText([/long shot/]);

  await limpar.click();
  await expect(busca(page)).toHaveValue('');
  await expect(cartoes(page)).toHaveCount(4);
  await expect(limpar).toBeHidden();
});

test('busca sem resultado mostra PAI-04 com Limpar busca, e Limpar filtros só se houver filtro', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: PARA_FILTRAR });
  await abrirFrases(page, extensao);
  const vazio = lista(page).locator('.veio-vazio');

  await busca(page).fill('zebra');
  await expect(vazio).toContainText('Nenhuma frase com “zebra”.');
  await expect(vazio.getByRole('button', { name: 'Limpar busca' })).toBeVisible();
  await expect(vazio.getByRole('button', { name: 'Limpar filtros' })).toHaveCount(0);

  await filtro(page, 'Idioma').selectOption({ label: 'Russo' });
  await expect(vazio.getByRole('button', { name: 'Limpar filtros' })).toBeVisible();

  await vazio.getByRole('button', { name: 'Limpar busca' }).click();
  await expect(busca(page)).toHaveValue('');
  await expect(cartoes(page)).toHaveText([/перезвоню/]);
});

test('Fonte, idioma, ordem e “Ocultar enviadas e exportadas” filtram a lista', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: PARA_FILTRAR });
  await abrirFrases(page, extensao);

  // Um dropdown só de Fonte, com as Fontes do histórico.
  await expect(filtro(page, 'Fonte').locator('option')).toHaveText(['Todas as fontes', 'Netflix', 'YouTube']);
  await filtro(page, 'Fonte').selectOption({ label: 'YouTube' });
  await expect(cartoes(page)).toHaveText([/перезвоню/, /call it a day/]);

  await filtro(page, 'Idioma').selectOption({ label: 'Inglês' });
  await expect(cartoes(page)).toHaveText([/call it a day/]);

  await filtro(page, 'Fonte').selectOption({ label: 'Todas as fontes' });
  await filtro(page, 'Ordem').selectOption({ label: 'Mais antigas primeiro' });
  await expect(cartoes(page)).toHaveText([/call it a day/, /long shot/, /close call/]);

  await ligarOcultar(page);
  await expect(cartoes(page)).toHaveText([/call it a day/, /close call/]);
});

test('filtros escondendo tudo mostram PAI-03, e Limpar filtros traz a lista de volta', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [PARA_FILTRAR[2]] });
  await abrirFrases(page, extensao);

  await ligarOcultar(page);
  const vazio = lista(page).locator('.veio-vazio');
  await expect(vazio).toContainText('Nenhuma frase com estes filtros.');
  await vazio.getByRole('button', { name: 'Limpar filtros' }).click();

  await expect(ocultar(page)).not.toBeChecked();
  await expect(cartoes(page)).toHaveText([/long shot/]);
});

// ─── Estados da lista ────────────────────────────────────────────────────────

test('primeiro uso: PAI-02 com o atalho de legenda de hoje (Alt+S) e Minerar frases', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);

  const vazio = lista(page).locator('.veio-vazio');
  await expect(vazio).toContainText(
    'Nenhuma frase ainda. Minere de um vídeo com Alt+S ou use Minerar frases para colar, importar ou ler uma foto.');
  await expect(vazio.locator('kbd')).toHaveText('Alt+S');

  await vazio.getByRole('button', { name: 'Minerar frases' }).click();
  await expect(page.locator('#bulk-add-modal')).toBeVisible();
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

// ─── Paginação ───────────────────────────────────────────────────────────────

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

  // Buscar volta para a primeira página.
  await busca(page).fill('Sentence');
  await expect(paginas(page)).toContainText('1–10 de 24');
});

test('os números da paginação saem em PT-BR: “1–10 de 1.284” e “1 de 129”', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(1284) });
  await abrirFrases(page, extensao);

  await expect(paginas(page)).toContainText('1–10 de 1.284');
  await expect(paginas(page)).toContainText('1 de 129');
});

// ─── As ações de hoje continuam sobre os cartões ─────────────────────────────

test('selecionar cartões e Exportar .txt baixa as frases escolhidas', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirFrases(page, extensao);

  await cartao(page, 'Sentence number 3 ').getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await cartao(page, 'Sentence number 1 ').getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await expect(page.locator('#selection-count')).toHaveText('2 selecionadas');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#btn-export').click(),
  ]);
  const conteudo = require('fs').readFileSync(await download.path(), 'utf8');
  expect(conteudo).toContain('Sentence number 3 about the harbour.');
  expect(conteudo).toContain('Sentence number 1 about the harbour.');
  expect(conteudo).not.toContain('Sentence number 2 ');
});

test('o cartão selecionado ganha o destaque, e “Pág.” marca a página inteira', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(12) });
  await abrirFrases(page, extensao);

  const primeiro = cartoes(page).first();
  await primeiro.getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await expect(primeiro).toHaveClass(/veio-frase--selecionada/);

  await page.locator('#btn-sel-pagina').click();
  await expect(lista(page).getByRole('checkbox', { name: 'Selecionar frase', checked: true })).toHaveCount(10);
  await expect(page.locator('#selection-count')).toHaveText('10 selecionadas');
});

// ─── Teclado, leitor de tela e movimento ─────────────────────────────────────

test('os controles da lista têm nome, e o foco do teclado aparece', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: PARA_FILTRAR });
  await abrirFrases(page, extensao);

  await expect(filtro(page, 'Fonte')).toBeVisible();
  await expect(filtro(page, 'Idioma')).toBeVisible();
  await expect(filtro(page, 'Ordem')).toBeVisible();
  await expect(busca(page)).toBeVisible();
  await expect(ocultar(page)).toBeVisible();

  // O foco aparece como contorno (botões, toggle, palavra) ou como o anel dos
  // campos Veio (box-shadow).
  const focoAparece = async locator => {
    await locator.focus();
    return locator.evaluate(el => {
      const alvo = el.closest('.veio-toggle')?.querySelector('.veio-toggle__trilho') || el;
      const estilo = getComputedStyle(alvo);
      return estilo.outlineStyle === 'solid' || estilo.boxShadow !== 'none';
    });
  };
  // O foco pelo teclado (não o do mouse) é o que precisa aparecer.
  await page.keyboard.press('Tab');
  for (const controle of [filtro(page, 'Fonte'), busca(page), ocultar(page), palavra(page, 'close call', 'That')]) {
    expect(await focoAparece(controle), await controle.evaluate(el => el.outerHTML.slice(0, 80))).toBe(true);
  }
});

test('com movimento reduzido, os cartões-esqueleto ficam parados', async ({ page, extensao, fakes }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await extensao.semearSessao({ uid: 'uid-parado' });
  fakes.google.segurarLeituras();
  await abrirFrases(page, extensao);

  const brilho = lista(page).locator('.veio-frase-esqueleto .veio-esqueleto').first();
  await expect(brilho).toBeVisible();
  expect(await brilho.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});
