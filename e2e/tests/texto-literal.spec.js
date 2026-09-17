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
  await expect(page.locator('#btn-minerador-pro')).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  const aviso = page.locator('#notificacao-minerador');
  await expect(aviso).toContainText(LEGENDA);
  await expect(aviso).toContainText(TITULO);
  await nadaFoiInjetado(page);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);
});

test('minerar uma seleção com marcação mostra o texto literal e não injeta nada', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_atalho: { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false },
  });
  await page.goto(paginas.url('texto-marcacao.html'));

  await page.locator('#trecho').selectText();
  await page.keyboard.press('Alt+KeyE');

  await expect(page.locator('#pm-capture-overlay')).toContainText(SELECAO);
  await nadaFoiInjetado(page);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([SELECAO]);
});
