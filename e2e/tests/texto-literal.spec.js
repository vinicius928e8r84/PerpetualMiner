'use strict';

// Texto da página (legenda, seleção, título) aparece nos avisos da extensão
// como texto: marcação dentro dele é mostrada literalmente, não vira elemento
// e nenhum handler roda.

const { test, expect } = require('../fixtures');

const LEGENDA = '<img src=x onerror="window.__injetado = \'legenda\'">Hold the line.';
const TITULO = '<img src=t onerror="window.__injetado = \'titulo\'"> Episódio';
const SELECAO = '<img src=x onerror="__injetado=1">Salt wind';

/** Dá tempo a um <img> injetado de falhar o carregamento e disparar o onerror. */
async function nadaFoiInjetado(page) {
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => ({
    imagens: document.querySelectorAll('img').length,
    injetado: window.__injetado ?? null,
  }))).toEqual({ imagens: 0, injetado: null });
}

test('minerar uma legenda com marcação mostra o texto literal e não injeta nada', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url('player-marcacao.html'));
  await expect(page.getByRole('button', { name: /^Minerar legenda/ })).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  // A pílula mostra a frase numa linha (a prévia pode começar perto da Palavra);
  // o Título não vai para o overlay, mas vai gravado no Contexto.
  const aviso = page.getByRole('status');
  await expect(aviso).toContainText('Hold the line.');
  await nadaFoiInjetado(page);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);
  expect((await extensao.frases())[0].contexto.titulo).toBe(TITULO);
});

test('minerar uma seleção com marcação mostra o texto literal e não injeta nada', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_atalho: { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false },
  });
  await page.goto(paginas.url('texto-marcacao.html'));

  await page.locator('#trecho').selectText();
  await page.keyboard.press('Alt+KeyE');

  // A prévia da pílula começa perto da Palavra: o trecho com a marcação aparece como texto.
  await expect(page.getByRole('status')).toContainText('onerror="__injetado=1">Salt wind');
  await nadaFoiInjetado(page);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([SELECAO]);
});
