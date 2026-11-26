'use strict';

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono';
const ilha = page => page.locator('.shell-conteudo');
const estilo = page => page.getByRole('form', { name: /^Ajustes de envio · / }).getByRole('radiogroup', { name: 'Nível' });

async function abrirOEstilo(page, extensao, { largura = 1280, gravado = {}, idioma = 'Inglês' } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  if (idioma !== 'Inglês') await page.locator('#ajustes-cards').getByRole('button', { name: idioma, exact: true }).click();
  await expect(estilo(page)).toBeVisible();
  await expect(page.locator('.shell-conteudo .previa:visible iframe').first().contentFrame().locator('.card')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('o inglês no Iniciante: os três níveis, o texto do nível', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao);

  await expect(ilha(page)).toHaveScreenshot('ajustes-estilo.png');
});

test('o inglês no Avançado, escolhido e ainda não salvo', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao);
  await estilo(page).locator('label', { hasText: 'Avançado' }).click();
  await expect(page.getByRole('status')).toHaveText('Alterações não salvas');

  await expect(ilha(page)).toHaveScreenshot('ajustes-estilo-avancado.png');
});

test('o inglês no Intermediário: a prévia muda com o nível, antes de salvar', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao);
  await estilo(page).locator('label', { hasText: 'Intermediário' }).click();
  await expect(page.locator('.shell-conteudo .previa:visible')).toContainText('Exemplo do Intermediário em inglês');
  await expect(page.locator('.shell-conteudo .previa:visible iframe').first().contentFrame().getByText('Desistir de fazer algo')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('ajustes-estilo-intermediario.png');
});

test('o russo, com os três níveis (#163) e o Avançado escolhido e ainda não salvo', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao, { idioma: 'Russo' });
  await estilo(page).locator('label', { hasText: 'Avançado' }).click();

  await expect(ilha(page)).toHaveScreenshot('ajustes-estilo-russo.png');
});

test('na janela estreita os níveis ficam legíveis', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao, { largura: 760 });

  await expect(page).toHaveScreenshot('ajustes-estilo-estreita.png', { fullPage: false });
});
