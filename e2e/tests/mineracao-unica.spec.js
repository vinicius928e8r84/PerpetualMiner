'use strict';

// Minerar uma Frase por um caminho só: o menu de contexto e o atalho de seleção
// montam a mesma Fonte e o mesmo Contexto, e a pessoa só lê o que o service
// worker confirmou.

const { test, expect } = require('../fixtures');
const { fotografar, registrarEstado } = require('../evidencias-mineracao');

const TRECHO = 'Every lantern along the pier flickered in the salt wind.';

const minerarPeloMenu = (extensao, { selecao, pageUrl, titulo }) => extensao.serviceWorker.evaluate(
  ({ selecao, pageUrl, titulo }) => minerarSelecaoDoMenu(
    { menuItemId: 'minerar-perpetualminer', selectionText: selecao, pageUrl },
    { title: titulo },
  ),
  { selecao, pageUrl, titulo },
);

test('a seleção minerada pelo atalho e pelo menu numa página web grava a mesma Fonte', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_atalho: { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false },
  });
  await page.goto(paginas.url('texto.html'));
  await page.locator('#trecho').selectText();
  await page.keyboard.press('Alt+KeyE');
  await expect.poll(async () => (await extensao.frases()).length).toBe(1);

  await minerarPeloMenu(extensao, { selecao: 'The tide came in at dusk.', pageUrl: page.url(), titulo: 'Página comum · Artigo de teste' });
  await expect.poll(async () => (await extensao.frases()).length).toBe(2);

  const frases = await extensao.frases();
  const doAtalho = frases.find(f => f.texto === TRECHO);
  const doMenu = frases.find(f => f.texto === 'The tide came in at dusk.');
  expect(doMenu.streaming).toBe(doAtalho.streaming);
  expect(doMenu.contexto).toEqual(doAtalho.contexto);
  expect(doAtalho.contexto).toEqual({ fonte: 'web', titulo: 'Página comum · Artigo de teste', detalhe: '' });

  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(2);
  await expect(page.locator('.veio-frase__contexto .veio-selo')).toHaveText(['Web', 'Web']);
  await expect(page.locator('.veio-frase__contexto .frase-origem')).toHaveText([
    'Página comum · Artigo de teste', 'Página comum · Artigo de teste',
  ]);
  await fotografar(page, 'c1-selecao-web.png');
  await registrarEstado(extensao, 'c1-selecao-web.json');
});

for (const { titulo, tituloDoMenu } of [
  { titulo: 'Working with PDF', tituloDoMenu: 'Working with' },
  { titulo: 'jsPDF', tituloDoMenu: 'js' },
  { titulo: 'Working with Google Chrome', tituloDoMenu: 'Working with' },
  { titulo: '', tituloDoMenu: '' },
]) {
  test(`o atalho preserva o título ${JSON.stringify(titulo)} sem mudar a limpeza do menu`, async ({ page, paginas, extensao }) => {
    await extensao.gravarStorage({
      pm_atalho: { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false },
    });
    await page.goto(paginas.url('texto.html'));
    await page.evaluate(titulo => { document.title = titulo; }, titulo);
    await page.locator('#trecho').selectText();
    await page.keyboard.press('Alt+KeyE');

    await expect.poll(extensao.frases).toEqual([
      expect.objectContaining({
        texto: TRECHO,
        streaming: 'web',
        contexto: { fonte: 'web', titulo, detalhe: '' },
      }),
    ]);

    const selecaoDoMenu = 'The tide came in at dusk.';
    await minerarPeloMenu(extensao, { selecao: selecaoDoMenu, pageUrl: page.url(), titulo: await page.title() });
    await expect.poll(async () => (await extensao.frases()).find(f => f.texto === selecaoDoMenu)).toMatchObject({
      streaming: 'web',
      contexto: { fonte: 'web', titulo: tituloDoMenu || page.url(), detalhe: '' },
    });

    if (titulo === 'Working with PDF') {
      await page.goto(extensao.url('painel.html#frases'));
      await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(2);
      const doAtalho = page.locator('.veio-frase').filter({ hasText: TRECHO });
      await expect(doAtalho.locator('.veio-frase__contexto .veio-selo')).toHaveText('Web');
      await expect(doAtalho.locator('.frase-origem')).toHaveText('Working with PDF');
      await fotografar(page, 'c1-titulo-literal.png');
      await registrarEstado(extensao, 'c1-titulo-literal.json');
    }
  });
}

test('a seleção de um PDF grava a Fonte PDF, com o título sem o sufixo do visualizador', async ({ page, extensao }) => {
  await minerarPeloMenu(extensao, {
    selecao: 'The ferry left without a single passenger.',
    pageUrl: 'https://exemplo.dev/livros/ferry.pdf',
    titulo: 'ferry.pdf - Google Chrome',
  });

  await expect.poll(extensao.frases).toEqual([
    expect.objectContaining({
      streaming: 'pdf',
      contexto: { fonte: 'pdf', titulo: 'ferry.pdf', detalhe: '' },
    }),
  ]);

  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.locator('.veio-frase__contexto .veio-selo')).toHaveText('PDF');
  await expect(page.locator('.frase-origem')).toHaveText('ferry.pdf');
  await fotografar(page, 'c1-menu-pdf.png');
  await registrarEstado(extensao, 'c1-menu-pdf.json');
});

for (const sufixo of ['', '?download=1#page=2']) {
  test(`o atalho e o menu gravam a mesma Fonte PDF no endereço .pdf${sufixo}`, async ({ page, paginas, extensao }) => {
    await extensao.gravarStorage({
      pm_atalho: { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false },
    });
    const url = paginas.url(`texto.pdf${sufixo}`);
    // Texto HTML num endereço .pdf: exerce a classificação da URL no content
    // script real, não o visualizador nativo de PDF do Chrome.
    await page.route('**/texto.pdf*', async route => {
      const resposta = await route.fetch({ url: paginas.url('texto.html') });
      await route.fulfill({ response: resposta });
    });
    await page.goto(url);
    await page.locator('#trecho').selectText();
    await page.keyboard.press('Alt+KeyE');
    await expect.poll(async () => (await extensao.frases()).length).toBe(1);
    await minerarPeloMenu(extensao, { selecao: 'The tide came in at dusk.', pageUrl: url, titulo: await page.title() });
    await expect.poll(async () => (await extensao.frases()).length).toBe(2);

    const frases = await extensao.frases();
    for (const frase of frases) {
      expect(frase.streaming).toBe('pdf');
      expect(frase.contexto).toEqual({ fonte: 'pdf', titulo: 'Página comum · Artigo de teste', detalhe: '' });
    }
  });
}
