'use strict';

// Bug grave de #9: salvar vários trechos em paralelo (como Minerar de uma foto
// faz) perdia frases numa corrida read-modify-write no service worker, e a tela
// dizia "N salvos" mesmo assim.

const { test, expect } = require('../fixtures');

const TRECHOS = [
  'The ferry left without a single passenger.',
  'She folded the map along its oldest crease.',
  'Rain drummed on the tin roof all night.',
  'He kept the letter unopened for a decade.',
  'The orchard smelled of bruised apples.',
  'A lone heron waded through the shallows.',
  'Their laughter echoed down the empty hall.',
  'The clock tower had stopped at noon.',
];

test('várias frases mineradas ao mesmo tempo ficam todas no histórico, uma vez cada', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-paralelo' });
  // Qualquer página da extensão fala com o service worker pela mesma mensagem que o content script usa.
  await page.goto(extensao.url('bookreader.html'));

  const respostas = await page.evaluate(trechos => Promise.all(trechos.map(texto =>
    chrome.runtime.sendMessage({
      type: 'SALVAR_HISTORICO',
      texto,
      origem: 'livro',
      idioma: 'Inglês',
      contexto: { fonte: 'livro', titulo: 'Livro de teste', detalhe: '' },
    }),
  )), TRECHOS);

  expect(respostas.every(r => r?.ok)).toBe(true);
  const frases = await extensao.frases();
  expect(frases.map(f => f.texto).sort()).toEqual([...TRECHOS].sort());
  expect(new Set(frases.map(f => f.id)).size).toBe(TRECHOS.length);
  await expect.poll(() => fakes.google.frasesDe('uid-paralelo').length).toBe(TRECHOS.length);
});

test('a contagem que Minerar de uma foto mostra depois de salvar bate com o que foi gravado', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ geminiApiKey: 'chave-de-teste' });
  fakes.gemini.responderTrechos(TRECHOS);
  await page.goto(extensao.url('bookreader.html'));
  await expect(page.locator('#api-key-input')).toHaveValue('chave-de-teste');

  await page.locator('#file-input').setInputFiles({ name: 'pagina.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.locator('#btn-analisar').click();
  await expect(page.locator('.result-item')).toHaveCount(TRECHOS.length);
  await page.locator('#btn-salvar').click();

  const botao = page.locator('#btn-salvar');
  await expect(botao).toHaveText(/\d+ trechos? salvos?/);
  const contagemNaTela = Number((await botao.textContent()).match(/(\d+) trecho/)[1]);
  const gravadas = (await extensao.frases()).filter(f => f.streaming === 'livro');

  expect(contagemNaTela).toBe(TRECHOS.length);
  expect(gravadas.map(f => f.texto).sort()).toEqual([...TRECHOS].sort());
});

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
