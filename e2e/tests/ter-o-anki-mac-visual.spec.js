'use strict';

const { test, expect, comOSistema, SISTEMAS } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');

test.fixme('nunca conectada, com menos movimento: o desenho de arrastar o Anki para Aplicativos, parado, no Mac', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await comOSistema(page, SISTEMAS.MAC);
  await extensao.gravarStorage({ pm_anki_ja_conectou: false });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  await page.locator('#anki-primeira-vez').getByRole('button', { name: 'Não tenho' }).click();

  await expect(page.locator('.shell-conteudo')).toHaveScreenshot('anki-primeira-conexao-nao-tenho-parado.png', { animations: 'disabled' });
});
