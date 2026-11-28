'use strict';

const { test, expect, botaoFlutuante } = require('../fixtures');

const FALA = 'Nobody is watching the pool tonight.';
const URL_DO_PRIME_VIDEO = 'https://www.primevideo.com/detail/xray';

const pagina = (corpo, fora = '', tituloDaAba = 'The Boys | Prime Video') => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${tituloDaAba}</title>
  <style>
    body { margin: 0; background: #111; font-family: sans-serif; color: #fff; }
    .player { position: relative; width: 640px; height: 360px; margin: 24px; }
    video { width: 640px; height: 360px; background: #000; display: block; }
    .xray { position: absolute; left: 8px; top: 200px; width: 120px; font-size: 16px; }
    .no-alto { position: absolute; left: 200px; top: 12px; font-size: 18px; }
    .na-base { position: absolute; left: 200px; right: 0; bottom: 60px; text-align: center; font-size: 22px; }
    .no-rodape { position: absolute; left: 200px; right: 0; bottom: 8px; text-align: center; font-size: 16px; }
    .debaixo-do-player { position: absolute; left: 300px; top: 3000px; font-size: 16px; }
  </style>
</head>
<body><div class="player"><video muted></video>${corpo}</div>${fora}</body>
</html>`;

const textos = async extensao => (await extensao.frases()).map(f => f.texto);

async function abrirOPrimeVideo(page, corpo, { fora, tituloDaAba } = {}) {
  await page.route('https://www.primevideo.com/**', route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: pagina(corpo, fora, tituloDaAba) }));
  await page.goto(URL_DO_PRIME_VIDEO);
  await expect(botaoFlutuante(page)).toBeVisible();
}

const XRAY = '<div class="xray"><span>Elenco: Karl Urban</span></div>';
const INTERFACE = '<span class="no-rodape">Pular abertura</span>';

test('no Prime Video sem os seletores da legenda, a fala fica na metade de baixo, à direita do X-Ray e longe do texto de interface', async ({ page, extensao }) => {
  await abrirOPrimeVideo(page, `${XRAY}<span class="no-alto">A família Hughie em foco</span><span class="na-base">${FALA}</span>${INTERFACE}`);

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
});

test('no Prime Video sem os seletores da legenda, só o X-Ray, o texto do alto e a interface não são minerados', async ({ page, extensao }) => {
  await abrirOPrimeVideo(page, `${XRAY}<span class="no-alto">A família Hughie em foco</span>${INTERFACE}`);

  await page.keyboard.press('Alt+KeyS');

  await page.waitForTimeout(1500);
  expect(await textos(extensao)).toEqual([]);
});

test('no Prime Video sem os seletores da legenda, o horário e o texto em coreano que vêm depois da fala não a trocam', async ({ page, extensao }) => {
  await abrirOPrimeVideo(page, `${XRAY}<span class="na-base">${FALA}</span><span class="no-rodape">00:42:10</span><span class="no-rodape">안녕하세요 여러분</span>`);

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
});

test('no Prime Video sem os seletores da legenda, o texto dentro do contêiner do player que vem depois da fala não a troca', async ({ page, extensao }) => {
  await abrirOPrimeVideo(page, `${XRAY}<span class="na-base">${FALA}</span><div class="dv-ui-web-player-container"><span class="no-rodape">Rewatch this scene again</span></div>`);

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
});

const IDIOMAS_DA_PAGINA_DE_DETALHES = '<div class="debaixo-do-player"><span>Idiomas de áudio</span><span>Português (Brasil), Deutsch, മലയാളം</span></div>';
const LEGENDA_DE_HOJE = text => `<span class="atvwebplayersdk-captions-text f7j034j na-base" style="background-color: rgba(0, 0, 0, 0.5); color: rgb(255, 255, 255);">${text}</span>`;

test('no player do Prime Video de hoje, a legenda de um span só com <br> é a Frase, em uma linha', async ({ page, extensao }) => {
  await abrirOPrimeVideo(page, LEGENDA_DE_HOJE('If you waited till rush hour,<br>your plan would be more effective.'),
    { fora: IDIOMAS_DA_PAGINA_DE_DETALHES });

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual(['If you waited till rush hour, your plan would be more effective.']);
});

test('no player do Prime Video de hoje, uma fala com “next” é a Frase, não o nome de um idioma da página de detalhes', async ({ page, extensao }) => {
  await abrirOPrimeVideo(page, LEGENDA_DE_HOJE('May I sit next to you?'), { fora: IDIOMAS_DA_PAGINA_DE_DETALHES });

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual(['May I sit next to you?']);
});

test('no player do Prime Video de hoje, sem fala na tela, o texto da página de detalhes debaixo do player não é minerado', async ({ page, extensao }) => {
  await abrirOPrimeVideo(page, '', { fora: IDIOMAS_DA_PAGINA_DE_DETALHES });

  await page.keyboard.press('Alt+KeyS');

  await page.waitForTimeout(1500);
  expect(await textos(extensao)).toEqual([]);
});
