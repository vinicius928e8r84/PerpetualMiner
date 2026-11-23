'use strict';

const { test, expect, botaoFlutuante } = require('../fixtures');

const FALA = 'Nobody is watching the pool tonight.';

const pagina = corpo => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Aula de natação</title>
  <style>
    body { margin: 0; background: #111; font-family: sans-serif; color: #fff; }
    .player { position: relative; width: 640px; height: 360px; margin: 24px; }
    video { width: 640px; height: 360px; background: #000; display: block; }
    .fala { position: absolute; left: 0; right: 0; bottom: 36px; text-align: center; font-size: 22px; }
    .titulo { position: absolute; left: 0; right: 0; top: 12px; text-align: center; font-size: 18px; }
  </style>
</head>
<body><div class="player"><video muted></video>${corpo}</div></body>
</html>`;

const CASOS = [
  {
    nome: 'num site sem leitor próprio, uma legenda sem classe de legenda só é achada pelo leitor visual',
    url: 'https://www.exemplo-de-player.com/aula/2',
    corpo: `<div class="titulo">Lesson three: the cold pool</div><div class="fala">${FALA}</div>`,
    esperada: FALA,
  },
  {
    nome: 'o leitor visual ignora o botão do player e o texto da metade de cima do vídeo',
    url: 'https://www.exemplo-de-player.com/aula/3',
    corpo: `<div class="titulo">Lesson three: the cold pool</div><button style="position:absolute;right:8px;bottom:8px">Share this clip with friends</button>`
      + `<div class="fala">${FALA}</div>`,
    esperada: FALA,
  },
  {
    nome: 'no JW Player, a legenda é a do .jw-text-track-cue, ainda que fique na metade de cima do vídeo',
    url: 'https://www.exemplo-de-jwplayer.com/aula/1',
    corpo: `<div class="jw-captions jw-reset titulo"><div class="jw-text-track-display"><div class="jw-text-track-cue jw-reset">${FALA}</div></div></div>`,
    esperada: FALA,
  },
  {
    nome: 'no Video.js, o texto direto do .vjs-text-track-cue, ainda que fique na metade de cima do vídeo',
    url: 'https://www.exemplo-de-videojs.com/aula/1',
    corpo: `<div class="vjs-text-track-display titulo"><div class="vjs-text-track-cue">${FALA}</div></div>`,
    esperada: FALA,
  },
  {
    nome: 'no Video.js, o cue com o texto numa div filha (como o player o monta) é achado pelo leitor visual',
    url: 'https://www.exemplo-de-videojs.com/aula/2',
    corpo: `<div class="vjs-text-track-display fala"><div><div class="vjs-text-track-cue"><div>${FALA}</div></div></div></div>`,
    esperada: FALA,
  },
];

for (const caso of CASOS) {
  test(`Alt+S minera a legenda: ${caso.nome}`, async ({ page, extensao }) => {
    await page.route(`${new URL(caso.url).origin}/**`, route =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: pagina(caso.corpo) }));
    await page.goto(caso.url);
    await expect(botaoFlutuante(page)).toBeVisible();

    await page.keyboard.press('Alt+KeyS');

    await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([caso.esperada]);
  });
}
