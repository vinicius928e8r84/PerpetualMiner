'use strict';

const { test, expect } = require('../fixtures');

const LEGENDA = '<img src=x onerror="window.__injetado = \'legenda\'">Hold the line.';
const TITULO = '<img src=t onerror="window.__injetado = \'titulo\'"> Episódio';
const SELECAO = '<img src=x onerror="__injetado=1">Salt wind';

async function nadaFoiInjetado(page) {
  await expect(page.locator('img[src="x"], img[src="t"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__injetado ?? null)).toBeNull();
}

test('minerar uma legenda com marcação mostra o texto literal e não injeta nada', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url('player-marcacao.html'));
  await expect(page.getByRole('button', { name: /^Minerar legenda/ })).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

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

  await expect(page.getByRole('status')).toContainText('onerror="__injetado=1">Salt wind');
  await nadaFoiInjetado(page);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([SELECAO]);
});
