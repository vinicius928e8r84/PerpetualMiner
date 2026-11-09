'use strict';

// Minerar de uma foto · a chave do Gemini vai no cabeçalho do pedido, não na URL (#11): uma URL fica no histórico, nos
// logs e nas mensagens de erro. O Gemini é falsificado na fronteira HTTP; a página minera pelo service worker de verdade.

const { test, expect } = require('../fixtures');

const CHAVE = 'chave-de-teste';
const FRASES = ['The ferry left without a single passenger.', 'Rain drummed on the tin roof all night.'];
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('a chave do Gemini vai no cabeçalho do pedido e a URL não leva a chave nem parâmetro nenhum', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES);
  await extensao.gravarStorage({ geminiApiKey: CHAVE });
  await page.goto(extensao.url('bookreader.html'));
  await page.locator('#foto-arquivo').setInputFiles([{ name: 'pagina.png', mimeType: 'image/png', buffer: PNG_1X1 }]);
  await page.getByRole('button', { name: 'Ler marcações' }).click();
  await expect(page.getByText('2 frases encontradas')).toBeVisible();

  expect(fakes.gemini.chamadas).toHaveLength(1);
  const { chave, url } = fakes.gemini.chamadas[0];
  expect(chave).toBe(CHAVE);
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent');

  await page.locator('#foto-minerar').click();
  await expect(page.locator('.veio-toast')).toHaveText('2 frases mineradas');
  const gravadas = (await extensao.frases()).filter(f => f.streaming === 'livro');
  expect(gravadas.map(f => f.texto).sort()).toEqual([...FRASES].sort());
  expect((await extensao.lerStorage('geminiApiKey')).geminiApiKey).toBe(CHAVE);
});
