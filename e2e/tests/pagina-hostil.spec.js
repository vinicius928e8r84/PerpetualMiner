'use strict';

const { test, expect } = require('../fixtures');

const CLIPBOARD_ORIGINAL = 'O que a pessoa tinha copiado antes.';
const LEGENDA = 'The quiet harbor woke before the gulls did.';
const SENTINELA = 'A selection the person really mines, after the hostile page is done.';
const SELECAO_EM_ALT_E = { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false };

async function prepararClipboard(context, page, origem) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origem });
  await page.evaluate(texto => navigator.clipboard.writeText(texto), CLIPBOARD_ORIGINAL);
}

const lerClipboard = page => page.evaluate(() => navigator.clipboard.readText());

const textosGuardados = async extensao => (await extensao.frases()).map(f => f.texto);

async function minerarUmaSelecaoDeVerdade(page) {
  await page.evaluate(texto => {
    const trecho = document.createElement('p');
    trecho.id = 'sentinela';
    trecho.textContent = texto;
    document.body.append(trecho);
  }, SENTINELA);
  await page.locator('#sentinela').selectText();
  await page.keyboard.press('Alt+KeyE');
}

async function deixarAPaginaHostilAgir({ context, page, paginas, extensao }, agir) {
  await extensao.gravarStorage({ pm_atalho: SELECAO_EM_ALT_E });
  await page.goto(paginas.url('hostil.html'));
  await expect(page.getByRole('button', { name: /^Minerar legenda/ })).toBeVisible();
  await prepararClipboard(context, page, paginas.origem);

  await page.evaluate(agir);
  await minerarUmaSelecaoDeVerdade(page);

  await expect.poll(() => textosGuardados(extensao)).toContain(SENTINELA);
}

test('uma página hostil que manda as mensagens de copiar/salvar não grava frase nem mexe no clipboard', async ({ context, page, paginas, extensao }) => {
  await deixarAPaginaHostilAgir({ context, page, paginas, extensao }, () => window.mandarMensagens());

  expect((await extensao.frases()).map(f => f.texto)).toEqual([SENTINELA]);
  expect(await lerClipboard(page)).toBe(CLIPBOARD_ORIGINAL);
});

test('uma página hostil que simula o atalho e o clique no botão sobre uma legenda plantada não grava frase nem mexe no clipboard', async ({ context, page, paginas, extensao }) => {
  await deixarAPaginaHostilAgir({ context, page, paginas, extensao }, () => window.simularAtalhoEClique());

  expect((await extensao.frases()).map(f => f.texto)).toEqual([SENTINELA]);
  expect(await lerClipboard(page)).toBe(CLIPBOARD_ORIGINAL);
});

test('legenda num player em iframe de outra origem: minerar ainda grava a frase e copia', async ({ context, page, paginas, extensao }) => {
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('player.html'))}`));
  const player = page.frameLocator('#player');
  await expect(player.getByRole('button', { name: /^Minerar legenda/ })).toBeVisible();
  await prepararClipboard(context, page, paginas.origem);

  await player.locator('video').click();
  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => lerClipboard(page)).toBe(LEGENDA);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);
});

test('legenda num player no frame de cima: minerar grava a frase e copia', async ({ context, page, paginas, extensao }) => {
  await page.goto(paginas.url('player.html'));
  await expect(page.getByRole('button', { name: /^Minerar legenda/ })).toBeVisible();
  await prepararClipboard(context, page, paginas.origem);

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => lerClipboard(page)).toBe(LEGENDA);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);
});
