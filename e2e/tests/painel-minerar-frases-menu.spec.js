'use strict';

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');

async function abrirFrases(page, extensao) {
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frases mineradas');
}

const cabecalho = page => page.locator('.shell-area[data-area="frases"] .shell-cabecalho');
const botaoMinerar = page => cabecalho(page).getByRole('button', { name: 'Minerar frases' });
const menu = page => page.getByRole('menu', { name: 'Minerar frases' });
const itemDoMenu = (page, nome) => menu(page).getByRole('menuitem', { name: nome });
const modal = page => page.getByRole('dialog', { name: 'Minerar frases' });
const aba = (page, nome) => modal(page).getByRole('radio', { name: nome, exact: true });
const campoDeFrases = page => modal(page).getByRole('textbox', { name: 'Frases' });
const botaoDeMinerar = page => modal(page).getByRole('button', { name: /^Minerar/ });

async function abrirColar(page) {
  await botaoMinerar(page).click();
  await itemDoMenu(page, /^Colar/).click();
  await expect(modal(page)).toBeVisible();
}

async function abrirArquivo(page) {
  await botaoMinerar(page).click();
  await itemDoMenu(page, /^Arquivo \.txt/).click();
  await expect(modal(page)).toBeVisible();
}

// Exceção de teste: sem-estado-guardado — abrir o menu não grava nada.
test('o cabeçalho traz [Minerar frases ▾], que abre o menu Colar · Arquivo .txt · Foto com uma linha de explicação', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);

  await expect(botaoMinerar(page)).toHaveAttribute('aria-haspopup', 'menu');
  await expect(botaoMinerar(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(menu(page)).toBeHidden();

  await botaoMinerar(page).click();
  await expect(botaoMinerar(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    /Colar\s*Uma frase por linha/,
    /Arquivo \.txt\s*Importar um \.txt com uma frase por linha/,
    /Foto\s*Abre Minerar de uma foto numa aba nova/,
  ]);
  await expect(itemDoMenu(page, /^Colar/)).toBeFocused();
});

// Exceção de teste: sem-estado-guardado — andar pelo menu com o teclado não grava nada.
test('pelo teclado: setas andam no menu, Esc fecha e devolve o foco ao botão', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);

  await botaoMinerar(page).focus();
  await page.keyboard.press('Enter');
  await expect(itemDoMenu(page, /^Colar/)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(itemDoMenu(page, /^Arquivo/)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(itemDoMenu(page, /^Foto/)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(itemDoMenu(page, /^Colar/)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(itemDoMenu(page, /^Foto/)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(botaoMinerar(page)).toBeFocused();
  await expect(botaoMinerar(page)).toHaveAttribute('aria-expanded', 'false');

  const contorno = await botaoMinerar(page).evaluate(b => getComputedStyle(b).outlineStyle);
  expect(contorno).not.toBe('none');
});

// Exceção de teste: sem-estado-guardado — abrir e fechar o menu não gravam nada.
test('um clique fora fecha o menu', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await botaoMinerar(page).click();
  await expect(menu(page)).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(menu(page)).toBeHidden();
});

// Exceção de teste: sem-estado-guardado — escrever no Colar só conta as frases; nada é gravado até Minerar.
test('Colar abre o modal na aba Colar, com o campo focado, a contagem ao vivo e “Minerar N frases”', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);

  await expect(aba(page, 'Colar')).toBeChecked();
  await expect(aba(page, 'Arquivo .txt')).not.toBeChecked();
  await expect(campoDeFrases(page)).toBeFocused();
  await expect(campoDeFrases(page)).toHaveAttribute('placeholder', 'Cole as frases, uma por linha');
  await expect(modal(page).getByRole('textbox', { name: 'Fonte' })).toBeVisible();
  await expect(modal(page).getByRole('textbox', { name: 'Título' })).toBeVisible();
  await expect(modal(page).locator('.minerar-contagem')).toHaveText('0 frases');
  await expect(botaoDeMinerar(page)).toHaveText('Minerar frases');

  await campoDeFrases(page).fill('Break a leg.\n\n   \nKeep me posted.\nThat ship has sailed.');
  await expect(modal(page).locator('.minerar-contagem')).toHaveText('3 frases');
  await expect(botaoDeMinerar(page)).toHaveText('Minerar 3 frases');

  await campoDeFrases(page).fill('Break a leg.');
  await expect(modal(page).locator('.minerar-contagem')).toHaveText('1 frase');
  await expect(botaoDeMinerar(page)).toHaveText('Minerar 1 frase');
});

// Exceção de teste: sem-estado-guardado — abrir o modal na aba Arquivo .txt não grava nada.
test('Arquivo .txt abre o modal na aba certa, com a área de escolher o arquivo', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirArquivo(page);

  await expect(aba(page, 'Arquivo .txt')).toBeChecked();
  await expect(modal(page)).toContainText('Escolha um arquivo .txt');
  await expect(modal(page)).toContainText(
    'Uma frase por linha. O .txt exportado daqui volta com o contexto. Frases que já estão no histórico ficam de fora.');
  await expect(modal(page).getByRole('button', { name: 'Escolher arquivo' })).toBeFocused();
  await expect(modal(page).getByRole('button', { name: 'Cancelar' })).toBeVisible();
});

// Exceção de teste: sem-estado-guardado — trocar de aba não grava nada.
test('as abas trocam no lugar e o texto colado não se perde', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await abrirColar(page);
  await campoDeFrases(page).fill('Break a leg.');

  await modal(page).locator('label').filter({ hasText: 'Arquivo .txt' }).click();
  await expect(aba(page, 'Arquivo .txt')).toBeChecked();
  await expect(campoDeFrases(page)).toBeHidden();

  await aba(page, 'Arquivo .txt').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(aba(page, 'Colar')).toBeChecked();
  await expect(campoDeFrases(page)).toHaveValue('Break a leg.');
});

// Exceção de teste: sem-estado-guardado — abrir o modal pelo primeiro uso não grava nada.
test('o Minerar frases do primeiro uso (PAI-02) abre o modal em Colar', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await page.locator('#frases-lista .veio-vazio').getByRole('button', { name: 'Minerar frases' }).click();
  await expect(modal(page)).toBeVisible();
  await expect(aba(page, 'Colar')).toBeChecked();
  await expect(campoDeFrases(page)).toBeFocused();
});
