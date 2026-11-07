'use strict';

// O desenho de arrastar o Anki para Aplicativos, no passo Ter o Anki do Mac (ONB-25, #238), com “menos movimento”: os dois
// quadros parados, lado a lado. É PROPOSTA (`test.fixme`): o dono ainda não olhou (CODING_STANDARDS regra 10), então a imagem
// não está na árvore. A tela de sempre, com o primeiro quadro, é o `nao-tenho` de `painel-anki-visual.spec.js` (também `test.fixme`).
// Aprovando: tirar o `fixme` e `cd e2e && npx playwright test ter-o-anki-mac-visual --update-snapshots`.

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
