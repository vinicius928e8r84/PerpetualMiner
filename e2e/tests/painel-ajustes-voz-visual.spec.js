'use strict';

// Referência visual da voz e do sotaque do áudio (#174), no Avançado dos Ajustes de envio: os dois sotaques do Google, a voz de
// reserva e o Ouvir ao lado de cada seletor. O protótipo aprovado é o P9 do #107 (fora do repositório, na resolução do #107); o dono
// compara estas telas com ele. Todas são PROPOSTAS (`test.fixme`, sem PNG na árvore) até a aprovação dele (CODING_STANDARDS regra 10).
// Aprovando: tirar o `fixme` e `cd e2e && npx playwright test painel-ajustes-voz-visual --update-snapshots`, e a entrada no livro
// `e2e/aprovados-visuais.json`.

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';
const ilha = page => page.locator('.shell-conteudo');
const formulario = page => page.getByRole('form', { name: /^Ajustes de envio · / });

async function abrirOAvancado(page, extensao, { largura = 1280, gravado = {}, idioma = 'Inglês' } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  if (idioma !== 'Inglês') await page.locator('#ajustes-cards').getByRole('button', { name: idioma, exact: true }).click();
  await formulario(page).locator('summary').click();
  await page.evaluate(() => document.fonts.ready);
}

test('o Avançado aberto: sotaques do Google, voz de reserva e o Ouvir de cada um', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOAvancado(page, extensao);

  await expect(ilha(page)).toHaveScreenshot('ajustes-voz.png');
});

test('o russo, com um sotaque só', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOAvancado(page, extensao, { idioma: 'Russo' });

  await expect(ilha(page)).toHaveScreenshot('ajustes-voz-russo.png');
});

test('Ouvir a voz de reserva sem a chave: a mensagem embaixo do seletor', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOAvancado(page, extensao);
  await formulario(page).getByRole('button', { name: 'Ouvir · Voz de reserva' }).click();
  await expect(formulario(page).getByRole('alert')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('ajustes-voz-sem-chave.png');
});

test('Sem reserva: a nota diz o que acontece e o Ouvir da reserva fica desligado', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOAvancado(page, extensao);
  await formulario(page).getByRole('combobox', { name: 'Voz de reserva' }).selectOption({ label: 'Sem reserva' });

  await expect(ilha(page)).toHaveScreenshot('ajustes-voz-sem-reserva.png');
});

test('na janela estreita os seletores ficam numa coluna', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOAvancado(page, extensao, { largura: 760 });

  await expect(page).toHaveScreenshot('ajustes-voz-estreita.png', { fullPage: false });
});
