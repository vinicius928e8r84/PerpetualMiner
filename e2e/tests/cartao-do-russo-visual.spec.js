'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('../fixtures');

const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';
const PAGINA = pathToFileURL(path.join(__dirname, '..', '..', 'docs', 'design', 'cartao-do-russo.html')).href;

async function abrirOCartao(page, nivel) {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(PAGINA);
  await page.evaluate(() => document.fonts.ready);
  return page.locator('section', { has: page.getByRole('heading', { name: nivel }) });
}

for (const [nivel, arquivo] of [['Iniciante', 'cartao-do-russo-iniciante.png'], ['Intermediário', 'cartao-do-russo-intermediario.png'], ['Avançado', 'cartao-do-russo-avancado.png']]) {
  test(`o Cartão do russo no ${nivel}: a frente e o verso`, async ({ page }) => {
    test.fixme(true, AGUARDA_O_DONO);
    await expect(await abrirOCartao(page, nivel)).toHaveScreenshot(arquivo);
  });
}
