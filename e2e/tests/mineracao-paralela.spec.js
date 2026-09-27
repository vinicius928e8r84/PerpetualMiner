'use strict';

// Bug grave de #9: minerar várias frases em paralelo (como Minerar de uma foto
// faz) perdia frases numa corrida read-modify-write no service worker, e a tela
// dizia "N salvos" mesmo assim.

const { test, expect } = require('../fixtures');

const FRASES = [
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

  const respostas = await page.evaluate(frases => Promise.all(frases.map(texto =>
    chrome.runtime.sendMessage({
      type: 'SALVAR_HISTORICO',
      texto,
      origem: 'livro',
      idioma: 'Inglês',
      contexto: { fonte: 'livro', titulo: 'Livro de teste', detalhe: '' },
    }),
  )), FRASES);

  expect(respostas.every(r => r?.ok)).toBe(true);
  const gravadas = await extensao.frases();
  expect(gravadas.map(f => f.texto).sort()).toEqual([...FRASES].sort());
  expect(new Set(gravadas.map(f => f.id)).size).toBe(FRASES.length);
  await expect.poll(() => fakes.google.frasesDe('uid-paralelo').length).toBe(FRASES.length);
});

test('a contagem que Minerar de uma foto mostra depois de minerar bate com o que foi gravado', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ geminiApiKey: 'chave-de-teste' });
  fakes.gemini.responderFrases(FRASES);
  await page.goto(extensao.url('bookreader.html'));

  await page.locator('#foto-arquivo').setInputFiles({ name: 'pagina.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.getByRole('button', { name: 'Ler marcações' }).click();
  await expect(page.locator('#foto-minerar')).toHaveText(`Minerar ${FRASES.length} frases`);
  await page.locator('#foto-minerar').click();

  const toast = page.locator('.veio-toast');
  await expect(toast).toHaveText(/^\d+ frases? mineradas?$/);
  const contagemNaTela = Number((await toast.textContent()).match(/^(\d+)/)[1]);
  const gravadas = (await extensao.frases()).filter(f => f.streaming === 'livro');

  expect(contagemNaTela).toBe(FRASES.length);
  expect(gravadas.map(f => f.texto).sort()).toEqual([...FRASES].sort());
});

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
