'use strict';

// Passo 3 do redesign: Minerar frases (Colar e Arquivo .txt) e a ida para a Foto (#31).
//
// O cabeçalho de Frases ganha [Minerar frases ▾] com Colar · Arquivo .txt ·
// Foto. Colar e Arquivo .txt abrem um só modal com abas, já na aba certa:
// contagem ao vivo, “Minerar N frases”, o progresso de verdade (“Minerando 3 de
// 12…”) e os fins ADD: o toast, o aviso persistente ADD-06 quando a nuvem falha
// e ADD-07/08/09 no próprio modal. Foto abre Minerar de uma foto numa aba nova.
//
// Fecha três bugs de #9:
//   - Exportar → Importar .txt perdia as Palavras e cortava os textos com “ : ”;
//   - o overlay de importação nunca pintava, e o progresso da Adição em Massa
//     era falso (chegava ao fim antes de gravar qualquer frase);
//   - o duplo clique em “Adicionar frases” gravava as frases duas vezes.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado, nunca funções
// internas.

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';

function frase(id, texto, extras = {}) {
  return { id, texto, data: HOJE, streaming: 'netflix', idioma: 'Inglês', ...extras };
}

async function abrirFrases(page, extensao) {
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frases mineradas');
}

const cabecalho = page => page.locator('.shell-area[data-area="frases"] .shell-cabecalho');
const botaoMinerar = page => cabecalho(page).getByRole('button', { name: 'Minerar frases' });
const menu = page => page.getByRole('menu', { name: 'Minerar frases' });
const itemDoMenu = (page, nome) => menu(page).getByRole('menuitem', { name: nome });
const modal = page => page.getByRole('dialog', { name: 'Minerar frases' });
const aba = (page, nome) => modal(page).getByRole('radio', { name: nome, exact: true });
const campoDeFrases = page => modal(page).getByRole('textbox', { name: 'Frases' });
const botaoDeMinerar = page => modal(page).getByRole('button', { name: /^Minerar/ });
const progresso = page => modal(page).getByRole('progressbar');
const toasts = page => page.locator('.veio-toast');
const avisos = page => page.locator('#frases-avisos');
const cartoes = page => page.locator('#frases-lista .veio-frase');
const cartao = (page, texto) => cartoes(page).filter({ hasText: texto });

async function abrirColar(page) {
  await botaoMinerar(page).click();
  await itemDoMenu(page, /^Colar/).click();
  await expect(modal(page)).toBeVisible();
}

async function abrirArquivo(page) {
  await botaoMinerar(page).click();
  await itemDoMenu(page, /^Arquivo \.txt/).click();
  await expect(modal(page)).toBeVisible();
}

/** Escolhe um arquivo pela área do modal, como a pessoa faria. */
async function escolherArquivo(page, conteudo, nome = 'frases.txt') {
  const [seletor] = await Promise.all([
    page.waitForEvent('filechooser'),
    modal(page).getByRole('button', { name: /Escolher (outro )?arquivo/ }).click(),
  ]);
  await seletor.setFiles({ name: nome, mimeType: 'text/plain', buffer: Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'utf8') });
}

// ─── O menu Minerar frases (ADD-01 · ADD-11) ─────────────────────────────────

test('o cabeçalho traz [Minerar frases ▾], que abre o menu Colar · Arquivo .txt · Foto com uma linha de explicação', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);

  await expect(botaoMinerar(page)).toHaveAttribute('aria-haspopup', 'menu');
  await expect(botaoMinerar(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(menu(page)).toBeHidden();

  await botaoMinerar(page).click();
  await expect(botaoMinerar(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    /Colar\s*Uma frase por linha/,
    /Arquivo \.txt\s*Importar um \.txt com uma frase por linha/,
    /Foto\s*Abre Minerar de uma foto numa aba nova/,
  ]);
  // O foco entra no primeiro modo.
  await expect(itemDoMenu(page, /^Colar/)).toBeFocused();
});

test('pelo teclado: setas andam no menu, Esc fecha e devolve o foco ao botão', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);

  await botaoMinerar(page).focus();
  await page.keyboard.press('Enter');
  await expect(itemDoMenu(page, /^Colar/)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(itemDoMenu(page, /^Arquivo/)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(itemDoMenu(page, /^Foto/)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(itemDoMenu(page, /^Colar/)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(itemDoMenu(page, /^Foto/)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(botaoMinerar(page)).toBeFocused();
  await expect(botaoMinerar(page)).toHaveAttribute('aria-expanded', 'false');

  // O foco à vista no botão do cabeçalho.
  const contorno = await botaoMinerar(page).evaluate(b => getComputedStyle(b).outlineStyle);
  expect(contorno).not.toBe('none');
});

test('um clique fora fecha o menu', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await botaoMinerar(page).click();
  await expect(menu(page)).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(menu(page)).toBeHidden();
});

test('Foto abre Minerar de uma foto numa aba nova', async ({ page, context, extensao }) => {
  await abrirFrases(page, extensao);
  await botaoMinerar(page).click();
  const [aba] = await Promise.all([
    context.waitForEvent('page'),
    itemDoMenu(page, /^Foto/).click(),
  ]);
  await expect(aba).toHaveURL(extensao.url('bookreader.html'));
  await expect(menu(page)).toBeHidden();
});

// ─── O modal: Colar (ADD-02 · ADD-03 · ADD-04 · ADD-05) ──────────────────────

test('Colar abre o modal na aba Colar, com o campo focado, a contagem ao vivo e “Minerar N frases”', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);

  await expect(aba(page, 'Colar')).toBeChecked();
  await expect(aba(page, 'Arquivo .txt')).not.toBeChecked();
  await expect(campoDeFrases(page)).toBeFocused();
  await expect(campoDeFrases(page)).toHaveAttribute('placeholder', 'Cole as frases, uma por linha');
  await expect(modal(page).getByRole('textbox', { name: 'Fonte' })).toBeVisible();
  await expect(modal(page).getByRole('textbox', { name: 'Título' })).toBeVisible();
  await expect(modal(page).locator('.minerar-contagem')).toHaveText('0 frases');
  await expect(botaoDeMinerar(page)).toHaveText('Minerar frases');

  await campoDeFrases(page).fill('Break a leg.\n\n   \nKeep me posted.\nThat ship has sailed.');
  // Linhas em branco não contam.
  await expect(modal(page).locator('.minerar-contagem')).toHaveText('3 frases');
  await expect(botaoDeMinerar(page)).toHaveText('Minerar 3 frases');

  await campoDeFrases(page).fill('Break a leg.');
  await expect(modal(page).locator('.minerar-contagem')).toHaveText('1 frase');
  await expect(botaoDeMinerar(page)).toHaveText('Minerar 1 frase');
});

test('Colar vazio mostra “Cole pelo menos uma frase.” no campo, e escrever tira o erro', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);

  await botaoDeMinerar(page).click();
  const erro = modal(page).getByText('Cole pelo menos uma frase.');
  await expect(erro).toBeVisible();
  await expect(campoDeFrases(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(campoDeFrases(page)).toHaveAccessibleDescription(/Cole pelo menos uma frase\./);
  await expect(campoDeFrases(page)).toBeFocused();
  expect(await extensao.frases()).toEqual([]);

  await campoDeFrases(page).fill('Break a leg.');
  await expect(erro).toBeHidden();
  await expect(campoDeFrases(page)).not.toHaveAttribute('aria-invalid', 'true');
});

test('Minerar 3 frases grava as três com a Fonte e o Título, fecha o modal e dá o toast “3 frases mineradas”', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);

  await campoDeFrases(page).fill('Break a leg.\nKeep me posted.\nОн так и не сказал спасибо.');
  await modal(page).getByRole('textbox', { name: 'Fonte' }).fill('livro');
  await modal(page).getByRole('textbox', { name: 'Título' }).fill('Atomic Habits');
  await botaoDeMinerar(page).click();

  await expect(toasts(page)).toHaveText('3 frases mineradas');
  await expect(modal(page)).toBeHidden();
  await expect(cartoes(page)).toHaveCount(3);

  const gravadas = await extensao.frases();
  expect(gravadas.map(f => f.texto).sort()).toEqual(
    ['Break a leg.', 'Keep me posted.', 'Он так и не сказал спасибо.'].sort());
  for (const f of gravadas) {
    expect(f.contexto).toEqual({ fonte: 'livro', titulo: 'Atomic Habits', detalhe: '' });
    expect(f.streaming).toBe('livro');
  }
  expect(gravadas.find(f => f.texto.startsWith('Он')).idioma).toBe('Russo');
  expect(new Set(gravadas.map(f => f.id)).size).toBe(3);
});

test('sem Fonte, a frase colada fica com a Fonte Manual', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.');
  await botaoDeMinerar(page).click();

  await expect(toasts(page)).toHaveText('1 frase minerada');
  await expect(cartao(page, 'Break a leg.')).toContainText('Manual');
  expect((await extensao.frases())[0].contexto.fonte).toBe('manual');
});

test('a frase colada ganha a Palavra detectada, como na Adição em Massa de hoje', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);
  await campoDeFrases(page).fill('She was reluctant to say anything.');
  await botaoDeMinerar(page).click();

  await expect(toasts(page)).toHaveText('1 frase minerada');
  const [gravada] = await extensao.frases();
  expect(gravada.autoKeyword).toBe(true);
  expect(gravada.keywords.length).toBeGreaterThan(0);
  await expect(cartao(page, 'reluctant')).toContainText('auto:');
});

test('duplo clique em Minerar N frases: as frases entram uma vez só (bug de #9)', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.\nKeep me posted.');

  await botaoDeMinerar(page).dblclick();

  await expect(toasts(page)).toHaveText('2 frases mineradas');
  // Dá tempo a um segundo pedido que tivesse escapado.
  await page.waitForTimeout(500);
  expect((await extensao.frases()).map(f => f.texto).sort()).toEqual(['Break a leg.', 'Keep me posted.']);
});

test('carregando (ADD-04): “Minerando N de M…” no próprio modal, sem campos nem botões para mexer', async ({ page, extensao, fakes }) => {
  // A Palavra detectada pergunta à Conexão com o Anki pelo vocabulário: segurar
  // a resposta segura a primeira gravação.
  let soltar;
  const segurada = new Promise(resolve => { soltar = resolve; });
  fakes.anki.responder('GET', '/anki/vocabulary', async () => { await segurada; return { json: { words: [] } }; });

  await abrirFrases(page, extensao);
  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.\nKeep me posted.\nThat ship has sailed.');
  await botaoDeMinerar(page).click();

  await expect(modal(page).getByText('Minerando 0 de 3…')).toBeVisible();
  await expect(progresso(page)).toHaveAttribute('aria-valuenow', '0');
  await expect(progresso(page)).toHaveAttribute('aria-valuemax', '3');
  await expect(campoDeFrases(page)).toBeHidden();
  await expect(modal(page).getByRole('radio')).toHaveCount(0);
  expect(await extensao.frases()).toEqual([]);

  soltar();
  await expect(toasts(page)).toHaveText('3 frases mineradas');
});

test('o progresso acompanha as gravações reais: nunca mostra mais frases do que as gravadas (bug de #9)', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  // A cada troca do texto do progresso, conta quantas frases estão gravadas
  // naquele momento.
  await page.evaluate(() => {
    window.leituras = [];
    new MutationObserver(() => {
      const rotulo = document.querySelector('[role="dialog"] .minerar-progresso__rotulo');
      const m = rotulo?.textContent.match(/Minerando (\d+) de (\d+)/);
      if (!m) return;
      const mostradas = Number(m[1]);
      chrome.storage.local.get({ frases: [] }, ({ frases }) => window.leituras.push({ mostradas, gravadas: frases.length }));
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  await abrirColar(page);
  const linhas = Array.from({ length: 8 }, (_, i) => `Sentence number ${i + 1} about the harbour.`);
  await campoDeFrases(page).fill(linhas.join('\n'));
  await botaoDeMinerar(page).click();
  await expect(toasts(page)).toHaveText('8 frases mineradas');

  const leituras = await page.evaluate(() => window.leituras);
  expect(leituras.length).toBeGreaterThan(1);
  for (const { mostradas, gravadas } of leituras) expect(mostradas).toBeLessThanOrEqual(gravadas);
  expect(leituras.at(-1).mostradas).toBe(8);
  expect(await extensao.frases()).toHaveLength(8);
});

test('Cancelar e Esc fecham o modal sem minerar nada', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.');
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal(page)).toBeHidden();
  await expect(botaoMinerar(page)).toBeFocused();

  await abrirColar(page);
  // O campo abre limpo.
  await expect(campoDeFrases(page)).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();
  expect(await extensao.frases()).toEqual([]);
});

// ─── A nuvem falhou (ADD-06) ─────────────────────────────────────────────────

test('com a conta, as frases coladas sobem para a nuvem', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-minerar' });
  await abrirFrases(page, extensao);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.\nKeep me posted.');
  await botaoDeMinerar(page).click();

  await expect(toasts(page)).toHaveText('2 frases mineradas');
  const naNuvem = fakes.google.frasesDe('uid-minerar').map(f => f.texto).sort();
  expect(naNuvem).toEqual(['Break a leg.', 'Keep me posted.']);
  expect((await extensao.lerStorage({ pm_pending_sync: [] })).pm_pending_sync).toEqual([]);
});

test('a nuvem falhou: fica o aviso persistente ADD-06 com Tentar de novo e Detalhes, sem toast de sucesso', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-add06' });
  await abrirFrases(page, extensao);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  fakes.google.recusarEscritas();

  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.\nKeep me posted.');
  await botaoDeMinerar(page).click();

  const aviso = avisos(page).getByRole('alert');
  await expect(aviso).toContainText('2 frases mineradas neste computador, mas não foram para a nuvem.');
  await expect(aviso.getByText('Detalhes')).toBeVisible();
  await expect(modal(page)).toBeHidden();
  await expect(toasts(page)).toHaveCount(0);
  // As frases estão neste computador e na lista.
  expect(await extensao.frases()).toHaveLength(2);
  await expect(cartoes(page)).toHaveCount(2);
  // O card e o chip da conta dizem que este computador está sem sincronizar.
  await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar');
  // O aviso não some sozinho.
  await page.waitForTimeout(4000);
  await expect(aviso).toBeVisible();

  fakes.google.recusarEscritas(false);
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(avisos(page).getByRole('alert')).toHaveCount(0);
  expect(fakes.google.frasesDe('uid-add06').map(f => f.texto).sort()).toEqual(['Break a leg.', 'Keep me posted.']);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  expect((await extensao.lerStorage({ pm_pending_sync: [] })).pm_pending_sync).toEqual([]);
});

// ─── O modal: Arquivo .txt (ADD-07 · ADD-08 · ADD-09 · ADD-10) ───────────────

test('Arquivo .txt abre o modal na aba certa, com a área de escolher o arquivo', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirArquivo(page);

  await expect(aba(page, 'Arquivo .txt')).toBeChecked();
  await expect(modal(page)).toContainText('Escolha um arquivo .txt');
  await expect(modal(page)).toContainText(
    'Uma frase por linha. O .txt exportado daqui volta com o contexto. Frases que já estão no histórico ficam de fora.');
  await expect(modal(page).getByRole('button', { name: 'Escolher arquivo' })).toBeFocused();
  await expect(modal(page).getByRole('button', { name: 'Cancelar' })).toBeVisible();
});

test('as abas trocam no lugar e o texto colado não se perde', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.');

  await modal(page).locator('label').filter({ hasText: 'Arquivo .txt' }).click();
  await expect(aba(page, 'Arquivo .txt')).toBeChecked();
  await expect(campoDeFrases(page)).toBeHidden();

  // Setas também trocam de aba (o controle segmentado é um grupo de rádios).
  await aba(page, 'Arquivo .txt').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(aba(page, 'Colar')).toBeChecked();
  await expect(campoDeFrases(page)).toHaveValue('Break a leg.');
});

test('Foto ↗, ao lado das abas, fecha o modal e abre Minerar de uma foto numa aba nova', async ({ page, context, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);
  const [nova] = await Promise.all([
    context.waitForEvent('page'),
    modal(page).getByRole('button', { name: 'Foto', exact: true }).click(),
  ]);
  await expect(nova).toHaveURL(extensao.url('bookreader.html'));
  await expect(modal(page)).toBeHidden();
});

test('importa ao escolher: “2 frases mineradas · 1 já existia”, sem repetir o que já estava', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [frase(1, 'Break a leg.')] });
  await abrirFrases(page, extensao);
  await abrirArquivo(page);

  await escolherArquivo(page, 'Break a leg.\nKeep me posted.\nkeep me posted.\nThat ship has sailed.\n');

  await expect(toasts(page)).toHaveText('2 frases mineradas · 2 já existiam');
  await expect(modal(page)).toBeHidden();
  const textos = (await extensao.frases()).map(f => f.texto).sort();
  expect(textos).toEqual(['Break a leg.', 'Keep me posted.', 'That ship has sailed.']);
});

test('sem nenhuma repetida, o toast é só “N frases mineradas”, e a linha simples ganha a Fonte Importado', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirArquivo(page);
  await escolherArquivo(page, 'Keep me posted.\r\nThat ship has sailed.\r\n');

  await expect(toasts(page)).toHaveText('2 frases mineradas');
  const gravadas = await extensao.frases();
  expect(gravadas.map(f => f.texto).sort()).toEqual(['Keep me posted.', 'That ship has sailed.']);
  for (const f of gravadas) expect(f.streaming).toBe('importado');
});

test('arquivo vazio: “O arquivo está vazio.” no modal (ADD-08)', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirArquivo(page);
  await escolherArquivo(page, '\n   \n\n');

  const erro = modal(page).getByRole('alert');
  await expect(erro).toHaveText('O arquivo está vazio.');
  await expect(modal(page)).toContainText('frases.txt');
  await expect(modal(page).getByRole('button', { name: 'Escolher outro arquivo' })).toBeVisible();
  expect(await extensao.frases()).toEqual([]);
});

test('arquivo ilegível: ADD-07 no modal', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirArquivo(page);
  // Um binário: não é texto em UTF-8.
  await escolherArquivo(page, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x00, 0x1a]), 'foto.png');

  await expect(modal(page).getByRole('alert')).toHaveText(
    'Não deu para ler este arquivo. Use um .txt com uma frase por linha.');
  expect(await extensao.frases()).toEqual([]);
});

test('nada novo no arquivo: ADD-09 com o botão Fechar', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [frase(2, 'Keep me posted.'), frase(1, 'Break a leg.')] });
  await abrirFrases(page, extensao);
  await abrirArquivo(page);
  await escolherArquivo(page, 'Break a leg.\nKeep me posted.\npalavra : [Contexto: web - Desconhecido - Desconhecido]\n');

  await expect(modal(page).locator('.minerar-resultado')).toHaveText(
    'Nenhuma frase nova: 2 já estavam no histórico e 1 linha não pôde ser lida.');
  await expect(modal(page).getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
  await modal(page).getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await expect(modal(page)).toBeHidden();
  expect(await extensao.frases()).toHaveLength(2);
  await expect(toasts(page)).toHaveCount(0);
});

// ─── Exportar → Importar devolve as frases intactas (bug de #9) ──────────────

// `keywords` guarda a Palavra por posição na frase (palavra@índice do token).
const PARA_EXPORTAR = [
  frase(4, 'The harbour : a quiet place.', {
    keywords: ['harbour@2'], autoKeyword: false,
    contexto: { fonte: 'livro', titulo: 'Dark - Season 1', detalhe: 'cap. 3' }, streaming: 'livro',
  }),
  frase(3, 'Note : this matters a lot.', {
    contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: '' },
  }),
  frase(2, 'He got cold feet before the wedding.', {
    keywords: ['cold@4', 'feet@6', '|', 'wedding@12'], autoKeyword: false,
    contexto: { fonte: 'youtube', titulo: 'Vsauce', detalhe: 'canal' }, streaming: 'youtube',
  }),
  frase(1, 'Он так и не сказал спасибо.', {
    idioma: 'Russo', keywords: ['спасибо@10'], autoKeyword: false,
    contexto: { fonte: 'web', titulo: '', detalhe: '' }, streaming: 'web',
  }),
];

/** Exporta `frases` pela barra de seleção e importa o .txt num histórico vazio; devolve as frases gravadas por texto. */
async function exportarEImportar(page, extensao, frases) {
  await extensao.gravarStorage({ frases });
  await abrirFrases(page, extensao);
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#frases-barra').getByRole('button', { name: 'Exportar .txt', exact: true }).click(),
  ]);
  const exportado = require('fs').readFileSync(await download.path());

  await extensao.gravarStorage({ frases: [] });
  await page.reload();
  await expect(page.locator('#frases-lista .veio-vazio')).toBeVisible();
  await abrirArquivo(page);
  await escolherArquivo(page, exportado, 'perpetualminer-export.txt');
  await expect(toasts(page)).toHaveText(`${frases.length} frases mineradas`);
  return new Map((await extensao.frases()).map(f => [f.texto, f]));
}

test('exportar → importar o mesmo .txt num histórico vazio devolve as mesmas frases, Palavras e Contexto, com os “ : ” inteiros (bug de #9)', async ({ page, extensao }) => {
  const porTexto = await exportarEImportar(page, extensao, PARA_EXPORTAR);

  expect([...porTexto.keys()].sort()).toEqual(PARA_EXPORTAR.map(f => f.texto).sort());
  for (const original of PARA_EXPORTAR) {
    const importada = porTexto.get(original.texto);
    expect(importada.keywords || []).toEqual(original.keywords || []);
    expect(importada.contexto).toEqual(original.contexto);
    expect(importada.idioma).toBe(original.idioma);
  }
  // Na tela, a Palavra volta grifada com o chip de escolhida.
  await expect(cartao(page, 'The harbour : a quiet place.')).toContainText('palavra:');
  await expect(cartao(page, 'The harbour : a quiet place.').locator('.veio-chip-palavra')).toContainText('harbour');
  await expect(cartao(page, 'Note : this matters a lot.').locator('.veio-chip-palavra')).toHaveCount(0);
});

test('exportar → importar: uma frase sem Palavra que termina em “ :” volta inteira', async ({ page, extensao }) => {
  const porTexto = await exportarEImportar(page, extensao, [
    frase(2, 'Attention :', { contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: '' } }),
    frase(1, 'Look out.', { contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: '' } }),
  ]);

  expect([...porTexto.keys()].sort()).toEqual(['Attention :', 'Look out.']);
});

test('exportar → importar: uma Palavra que já não está no texto (texto editado) não vai parar no texto', async ({ page, extensao }) => {
  const porTexto = await exportarEImportar(page, extensao, [
    frase(2, 'She finally made it home.', {
      keywords: ['arrived@4'], autoKeyword: false,
      contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: '' },
    }),
    frase(1, 'Look out.', { contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: '' } }),
  ]);

  expect([...porTexto.keys()].sort()).toEqual(['Look out.', 'She finally made it home.']);
  expect(porTexto.get('She finally made it home.').keywords || []).toEqual([]);
});

test('enquanto o .txt ainda está sendo lido, Minerar no Colar não começa uma segunda mineração', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  // Um arquivo grande num disco lento: a leitura só termina quando o teste soltar.
  await page.evaluate(() => {
    const ler = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      return new Promise(resolve => { window.soltarLeitura = () => resolve(ler.call(this)); });
    };
  });
  await abrirArquivo(page);
  await escolherArquivo(page, 'From the file.\nAlso from the file.');
  await page.waitForFunction(() => typeof window.soltarLeitura === 'function');

  await modal(page).locator('label').filter({ hasText: 'Colar' }).click();
  await campoDeFrases(page).fill('Pasted meanwhile.');
  await botaoDeMinerar(page).click();
  await page.evaluate(() => window.soltarLeitura());

  await expect(toasts(page)).toHaveText('2 frases mineradas');
  expect((await extensao.frases()).map(f => f.texto).sort()).toEqual(['Also from the file.', 'From the file.']);
});

test('um .txt exportado por uma versão antiga, com Palavra e com “ : ” no texto, volta inteiro', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirArquivo(page);
  await escolherArquivo(page, [
    'harbour : The harbour : a quiet place. [Contexto: livro - Dark - Desconhecido]',
    'Note : this matters a lot. [Contexto: netflix - Dark - Desconhecido]',
  ].join('\n'));

  await expect(toasts(page)).toHaveText('2 frases mineradas');
  const porTexto = new Map((await extensao.frases()).map(f => [f.texto, f]));
  expect(porTexto.get('The harbour : a quiet place.').keywords).toEqual(['harbour@2']);
  expect(porTexto.has('Note : this matters a lot.')).toBe(true);
  expect(porTexto.get('Note : this matters a lot.').keywords || []).toEqual([]);
});

// ─── Primeiro uso e movimento reduzido ───────────────────────────────────────

test('o Minerar frases do primeiro uso (PAI-02) abre o modal em Colar', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await page.locator('#frases-lista .veio-vazio').getByRole('button', { name: 'Minerar frases' }).click();
  await expect(modal(page)).toBeVisible();
  await expect(aba(page, 'Colar')).toBeChecked();
  await expect(campoDeFrases(page)).toBeFocused();
});

test('com movimento reduzido, a barra de progresso não anima', async ({ page, extensao, fakes }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let soltar;
  const segurada = new Promise(resolve => { soltar = resolve; });
  fakes.anki.responder('GET', '/anki/vocabulary', async () => { await segurada; return { json: { words: [] } }; });

  await abrirFrases(page, extensao);
  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.\nKeep me posted.');
  await botaoDeMinerar(page).click();
  const preenchimento = modal(page).locator('.minerar-progresso__barra > i');
  await expect(preenchimento).toBeAttached();
  const transicao = await preenchimento.evaluate(el => getComputedStyle(el).transitionDuration);
  expect(transicao.split(',').every(t => parseFloat(t) === 0)).toBe(true);
  soltar();
  await expect(toasts(page)).toHaveText('2 frases mineradas');
});
