'use strict';

// Bug grave de #9: o content script aceitava as mensagens de copiar/salvar de
// qualquer um, então qualquer site injetava frases no histórico e sobrescrevia
// o clipboard. O caminho legítimo (player em iframe que cai para o frame de
// cima quando o clipboard falha) tem de continuar funcionando.

const { test, expect } = require('../fixtures');

const CLIPBOARD_ORIGINAL = 'O que a pessoa tinha copiado antes.';
const LEGENDA = 'The quiet harbor woke before the gulls did.';

// O clipboard é lido e escrito pelo frame de cima, então a permissão é da origem dele.
async function prepararClipboard(context, page, origem) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origem });
  await page.evaluate(texto => navigator.clipboard.writeText(texto), CLIPBOARD_ORIGINAL);
}

const lerClipboard = page => page.evaluate(() => navigator.clipboard.readText());

// A página hostil age sozinha; nada pode ter sido gravado nem copiado.
async function esperarQuePaginaHostilNaoMudeNada({ context, page, paginas, extensao }, agir) {
  await page.goto(paginas.url('hostil.html'));
  await expect(page.locator('#btn-minerador-pro')).toBeVisible();
  await prepararClipboard(context, page, paginas.origem);

  await page.evaluate(agir);

  // Dá tempo às mensagens de chegarem ao service worker antes de afirmar a ausência.
  await page.waitForTimeout(1500);
  expect(await extensao.frases()).toEqual([]);
  expect(await lerClipboard(page)).toBe(CLIPBOARD_ORIGINAL);
}

test('uma página hostil que manda as mensagens de copiar/salvar não grava frase nem mexe no clipboard', async ({ context, page, paginas, extensao }) => {
  await esperarQuePaginaHostilNaoMudeNada({ context, page, paginas, extensao }, () => window.mandarMensagens());
});

test('uma página hostil que simula o atalho e o clique no botão sobre uma legenda plantada não grava frase nem mexe no clipboard', async ({ context, page, paginas, extensao }) => {
  await esperarQuePaginaHostilNaoMudeNada({ context, page, paginas, extensao }, () => window.simularAtalhoEClique());
});

test('legenda num player em iframe de outra origem: minerar ainda grava a frase e copia', async ({ context, page, paginas, extensao }) => {
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('player.html'))}`));
  const player = page.frameLocator('#player');
  await expect(player.locator('#btn-minerador-pro')).toBeVisible();
  await prepararClipboard(context, page, paginas.origem);

  // O foco fica no player, como quando a pessoa clica no vídeo antes do atalho.
  await player.locator('video').click();
  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => lerClipboard(page)).toBe(LEGENDA);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);
});

test('legenda num player no frame de cima: minerar grava a frase e copia', async ({ context, page, paginas, extensao }) => {
  await page.goto(paginas.url('player.html'));
  await expect(page.locator('#btn-minerador-pro')).toBeVisible();
  await prepararClipboard(context, page, paginas.origem);

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => lerClipboard(page)).toBe(LEGENDA);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);
});
