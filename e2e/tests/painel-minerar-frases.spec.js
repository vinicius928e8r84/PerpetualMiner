'use strict';

const { test, expect } = require('../fixtures');
const { fotografar, registrarEstado } = require('../evidencias-mineracao');

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

async function escolherArquivo(page, conteudo, nome = 'frases.txt') {
  const [seletor] = await Promise.all([
    page.waitForEvent('filechooser'),
    modal(page).getByRole('button', { name: /Escolher (outro )?arquivo/ }).click(),
  ]);
  await seletor.setFiles({ name: nome, mimeType: 'text/plain', buffer: Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'utf8') });
}

// Exceção de teste: sem-estado-guardado — o item Foto só abre outra aba; nada é gravado.
test('Foto abre Minerar de uma foto numa aba nova', async ({ page, context, extensao }) => {
  await abrirFrases(page, extensao);
  await botaoMinerar(page).click();
  const [aba] = await Promise.all([
    context.waitForEvent('page'),
    itemDoMenu(page, /^Foto/).click(),
  ]);
  await expect(aba).toHaveURL(extensao.url('bookreader/bookreader.html'));
  await expect(menu(page)).toBeHidden();
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
  expect(await extensao.frases()).toEqual([]);
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
  await fotografar(page, 'c1-painel-mineradas.png');
  await registrarEstado(extensao, 'c1-painel-mineradas.json');
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
  await page.waitForTimeout(500);
  expect((await extensao.frases()).map(f => f.texto).sort()).toEqual(['Break a leg.', 'Keep me posted.']);
});

test('carregando (ADD-04): “Minerando N de M…” no próprio modal, sem campos nem botões para mexer', async ({ page, extensao, fakes }) => {
  let soltar;
  const segurada = new Promise(resolve => { soltar = resolve; });
  fakes.anki.responder('POST', '/anki/vocabulary', async () => { await segurada; return { json: { words: [] } }; });

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
  await expect(campoDeFrases(page)).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();
  expect(await extensao.frases()).toEqual([]);
});

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
});

test('a nuvem falhou: fica o aviso persistente ADD-06 com Tentar de novo, sem Detalhes e sem toast de sucesso', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-add06' });
  await abrirFrases(page, extensao);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  fakes.google.recusarEscritas();

  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.\nKeep me posted.');
  await botaoDeMinerar(page).click();

  const aviso = avisos(page).getByRole('alert');
  await expect(aviso).toContainText('2 frases mineradas neste computador, mas não foram para a nuvem.');
  await expect(aviso.getByText('Detalhes')).toHaveCount(0);
  await expect(modal(page)).toBeHidden();
  await expect(toasts(page)).toHaveCount(0);
  expect(await extensao.frases()).toHaveLength(2);
  await expect(cartoes(page)).toHaveCount(2);
  await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar');
  await page.waitForTimeout(4000);
  await expect(aviso).toBeVisible();

  fakes.google.recusarEscritas(false);
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(avisos(page).getByRole('alert')).toHaveCount(0);
  expect(fakes.google.frasesDe('uid-add06').map(f => f.texto).sort()).toEqual(['Break a leg.', 'Keep me posted.']);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  expect((await extensao.frases()).map(f => f.texto).sort()).toEqual(['Break a leg.', 'Keep me posted.']);
});

// Exceção de teste: sem-estado-guardado — o Foto ↗ só fecha o modal e abre outra aba; nada é gravado.
test('Foto ↗, ao lado das abas, fecha o modal e abre Minerar de uma foto numa aba nova', async ({ page, context, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);
  const [nova] = await Promise.all([
    context.waitForEvent('page'),
    modal(page).getByRole('button', { name: 'Foto', exact: true }).click(),
  ]);
  await expect(nova).toHaveURL(extensao.url('bookreader/bookreader.html'));
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

test('nada novo só com repetidas: ADD-09 não fala de zero linhas ilegíveis', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [frase(2, 'Keep me posted.'), frase(1, 'Break a leg.')] });
  await abrirFrases(page, extensao);
  await abrirArquivo(page);
  await escolherArquivo(page, 'Break a leg.\nKeep me posted.\n');

  await expect(modal(page).locator('.minerar-resultado')).toHaveText('Nenhuma frase nova: 2 já estavam no histórico.');
  expect(await extensao.frases()).toHaveLength(2);
});

test('nada novo só com linhas ilegíveis: ADD-09 não fala de zero repetidas', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirArquivo(page);
  await escolherArquivo(page, 'palavra : [Contexto: web - Desconhecido - Desconhecido]\n');

  await expect(modal(page).locator('.minerar-resultado')).toHaveText('Nenhuma frase nova: 1 linha não pôde ser lida.');
  expect(await extensao.frases()).toEqual([]);
});

test('enquanto o .txt ainda está sendo lido, Minerar no Colar não começa uma segunda mineração', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
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

test('com movimento reduzido, a barra de progresso não anima', async ({ page, extensao, fakes }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let soltar;
  const segurada = new Promise(resolve => { soltar = resolve; });
  fakes.anki.responder('POST', '/anki/vocabulary', async () => { await segurada; return { json: { words: [] } }; });

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
  expect((await extensao.frases()).map(f => f.texto).sort()).toEqual(['Break a leg.', 'Keep me posted.']);
});
