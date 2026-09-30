'use strict';

// A legenda na Max: o player da Max escreve o nome do episódio numa classe
// `Subtitle-Fuse-Web-Play…`, e a leitura pegava esse nome no lugar da fala
// (a frase gravada era “DNR”). A página-fixture tem o player da Max com o cue, o
// título, a temporada/episódio, o nome do episódio e o rótulo oculto, e é servida
// em www.max.com por rota, sem rede.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures');

const FALA = "It's got a heated pool, gym,";
const NOME_DO_EPISODIO = 'DNR';
const PAGINA_DA_MAX = fs.readFileSync(path.join(__dirname, '..', 'pages', 'player-max.html'), 'utf8');

const botaoFlutuante = page => page.getByRole('button', { name: /^Minerar legenda/ });

async function abrirPlayerDaMax(page) {
  await page.route('https://www.max.com/**', route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA_DA_MAX }));
  await page.goto('https://www.max.com/video/watch/shameless');
  await expect(botaoFlutuante(page)).toBeVisible();
}

test('na Max, Alt+S minera a fala na tela e não o nome do episódio', async ({ page, extensao }) => {
  await abrirPlayerDaMax(page);

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([FALA]);
  expect(await extensao.frases()).toEqual([expect.objectContaining({ contexto: expect.objectContaining({ fonte: 'max' }) })]);
});

test('na Max, a fala trocada continua sendo a minerada, nunca o nome do episódio', async ({ page, extensao }) => {
  await abrirPlayerDaMax(page);
  await page.locator('#cue').evaluate(no => { no.textContent = 'Nobody is watching the pool.'; });

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual(['Nobody is watching the pool.']);
});

test('na Max, a mineração automática grava a fala e nunca o nome do episódio', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } },
  });
  await abrirPlayerDaMax(page);
  // A mineração automática só olha a legenda de um vídeo que está tocando.
  await page.evaluate(async () => {
    const tela = document.createElement('canvas');
    tela.getContext('2d').fillRect(0, 0, 1, 1);
    const video = document.querySelector('video');
    video.srcObject = tela.captureStream();
    await video.play();
  });

  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([FALA]);
  await page.waitForTimeout(1500);
  expect((await extensao.frases()).map(f => f.texto)).not.toContain(NOME_DO_EPISODIO);
});
