'use strict';

// Minerar uma Frase por um caminho só: o menu de contexto e o atalho de seleção
// montam a mesma Fonte e o mesmo Contexto, e a pessoa só lê o que o service
// worker confirmou.

const { test, expect } = require('../fixtures');

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
});

test('a seleção de um PDF grava a Fonte PDF, com o título sem o sufixo do visualizador', async ({ extensao }) => {
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
});
