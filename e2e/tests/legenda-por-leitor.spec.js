'use strict';

const { test, expect, botaoFlutuante } = require('../fixtures');

const FALA = 'The lighthouse keeper never left the island.';
const URL_DO_PLAYER = 'https://www.exemplo-de-player.com/aula/1';

const pagina = corpo => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Aula de teste</title>
  <style>
    body { margin: 0; background: #111; font-family: sans-serif; color: #fff; }
    .player { position: relative; width: 640px; height: 360px; margin: 24px; }
    video { width: 640px; height: 360px; background: #000; display: block; }
    .no-alto { position: absolute; left: 12px; top: 12px; font-size: 18px; }
    .na-base { position: absolute; left: 0; right: 0; bottom: 36px; text-align: center; font-size: 22px; }
    .no-rodape { position: absolute; left: 0; right: 0; bottom: 4px; text-align: center; font-size: 28px; }
  </style>
</head>
<body><div class="player"><video muted></video>${corpo}</div></body>
</html>`;

const textos = async extensao => (await extensao.frases()).map(f => f.texto);

async function abrirOPlayer(page, corpo) {
  await page.route('https://www.exemplo-de-player.com/**', route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: pagina(corpo) }));
  await page.goto(URL_DO_PLAYER);
  await expect(botaoFlutuante(page)).toBeVisible();
}

test('numa página em que nada se chama legenda, o leitor visual acha a fala na metade de baixo do vídeo e não o título no alto', async ({ page, extensao }) => {
  await abrirOPlayer(page, '<p class="no-alto">Aula 3 · Faróis do Atlântico</p><p class="na-base">' + FALA + '</p>');

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
});

test('numa página em que nada se chama legenda, um texto só no alto do vídeo não é minerado', async ({ page, extensao }) => {
  await abrirOPlayer(page, '<p class="no-alto">Aula 3 · Faróis do Atlântico</p>');

  await page.keyboard.press('Alt+KeyS');

  await page.waitForTimeout(1500);
  expect(await textos(extensao)).toEqual([]);
});

test('no JW Player, a fala vem da faixa de texto do player e não do texto maior que está mais embaixo', async ({ page, extensao }) => {
  await abrirOPlayer(page, '<div class="jw-text-track-display"><span class="jw-text-track-cue na-base">' + FALA + '</span></div>'
    + '<p class="no-rodape">Assista o próximo vídeo agora mesmo</p>');

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
});

test('no Video.js, a fala vem da faixa de texto do player e não do texto maior que está mais embaixo', async ({ page, extensao }) => {
  await abrirOPlayer(page, '<div class="vjs-text-track-display"><div class="vjs-text-track-cue na-base">' + FALA + '</div></div>'
    + '<p class="no-rodape">Assista o próximo vídeo agora mesmo</p>');

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
});
