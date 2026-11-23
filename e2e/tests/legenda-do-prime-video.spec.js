'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect, botaoFlutuante } = require('../fixtures');

const TEMPO_PARA_O_CONTENT_SCRIPT_RESPONDER = 1500;
const FALA = 'You never told me about the boys.';
const PAGINA_DO_PRIME_VIDEO = fs.readFileSync(path.join(__dirname, '..', 'pages', 'player-prime-video.html'), 'utf8');

const textos = async extensao => (await extensao.frases()).map(f => f.texto);

async function abrirPlayerDoPrimeVideo(page) {
  await page.route('https://www.primevideo.com/**', route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA_DO_PRIME_VIDEO }));
  await page.goto('https://www.primevideo.com/detail/1');
  await expect(botaoFlutuante(page)).toBeVisible();
}

const acrescentarAoPlayer = (page, html) =>
  page.locator('.player').evaluate((no, html) => { no.insertAdjacentHTML('beforeend', html); }, html);

test('no Prime Video sem os seletores diretos, Alt+S minera a fala da metade de baixo e não o X-Ray nem a interface', async ({ page, extensao }) => {
  await abrirPlayerDoPrimeVideo(page);

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
  expect(await extensao.frases()).toEqual([expect.objectContaining({ contexto: expect.objectContaining({ fonte: 'primevideo' }) })]);
});

test('no Prime Video, o último texto da faixa da legenda é o minerado, e o que não é fala fica de fora', async ({ page, extensao }) => {
  await abrirPlayerDoPrimeVideo(page);
  await acrescentarAoPlayer(page,
    '<div class="fala"><span>We will be late for the show.</span></div>'
    + '<div class="fala"><span>Ok</span></div>'
    + `<div class="fala"><span>${'long '.repeat(41)}</span></div>`
    + '<div class="fala"><span>字幕 の 台詞</span></div>'
    + '<div class="fala"><span>Mais informações do título</span></div>'
    + '<div class="dv-ui-web-player-container"><div class="fala"><span>Now playing in the player shell.</span></div></div>');

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual(['We will be late for the show.']);
});

test('no Prime Video, um seletor direto que só traz o tempo cai na leitura pela posição', async ({ page, extensao }) => {
  await abrirPlayerDoPrimeVideo(page);
  await acrescentarAoPlayer(page, '<div class="atvwebplayersdk-captions-text"><span>01:02 / 45:00</span></div>');

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
});

test('no Prime Video, sem nenhuma fala na faixa da legenda, nada é minerado', async ({ page, extensao }) => {
  await abrirPlayerDoPrimeVideo(page);
  await page.locator('#fala').evaluate(no => { no.textContent = ''; });

  await page.keyboard.press('Alt+KeyS');

  await page.waitForTimeout(TEMPO_PARA_O_CONTENT_SCRIPT_RESPONDER);
  expect(await extensao.frases()).toEqual([]);
});
