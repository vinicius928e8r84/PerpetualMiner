'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect, botaoFlutuante, tocarVideo } = require('../fixtures');

const FALA = "It's got a heated pool, gym,";
const OUTRA_FALA = 'Nobody is watching the pool.';
const TITULO_SEM_LEGENDA = 'Nenhuma legenda na tela';
const NOME_DO_EPISODIO = 'DNR';
const PAGINA_DA_MAX = fs.readFileSync(path.join(__dirname, '..', 'pages', 'player-max.html'), 'utf8');

const cue = texto => `<div class="TextCue-Fuse-Web-Play__sc-1wvp621-4 sTuVwX">${texto}</div>`;
const textos = async extensao => (await extensao.frases()).map(f => f.texto);

async function abrirPlayerDaMax(page) {
  await page.route('https://www.max.com/**', route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA_DA_MAX }));
  await page.goto('https://www.max.com/video/watch/shameless');
  await expect(botaoFlutuante(page)).toBeVisible();
}

const trocarJanelaDaLegenda = (page, html) =>
  page.locator('.legenda').evaluate((no, html) => { no.innerHTML = html; }, html);

test('na Max, Alt+S minera a fala na tela e não o nome do episódio', async ({ page, extensao }) => {
  await abrirPlayerDaMax(page);

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
  expect(await extensao.frases()).toEqual([expect.objectContaining({ contexto: expect.objectContaining({ fonte: 'max' }) })]);
});

test('na Max, a fala trocada continua sendo a minerada, nunca o nome do episódio', async ({ page, extensao }) => {
  await abrirPlayerDaMax(page);
  await page.locator('#legenda').evaluate(no => { no.textContent = 'Nobody is watching the pool.'; });

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual(['Nobody is watching the pool.']);
});

test('na Max, uma fala de duas linhas sai inteira, numa frase só', async ({ page, extensao }) => {
  await abrirPlayerDaMax(page);
  await trocarJanelaDaLegenda(page, cue("It's got a heated pool,") + cue('gym and a sauna.'));

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual(["It's got a heated pool, gym and a sauna."]);
});

test('na Max, um cue que embrulha outro cue não repete a fala', async ({ page, extensao }) => {
  await abrirPlayerDaMax(page);
  await trocarJanelaDaLegenda(page, `<div class="TextCue-Fuse-Web-Play__sc-1wvp621-3 wRaPpEr">${cue(FALA)}</div>`);

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
});

test('na Max, o cue de uma faixa antiga, escondida, não entra na fala', async ({ page, extensao }) => {
  await abrirPlayerDaMax(page);
  await trocarJanelaDaLegenda(page,
    `<div style="display: none">${cue('An old track line from before.')}</div>`
    + `<div style="opacity: 0">${cue('A faded line nobody sees.')}</div>`
    + cue(FALA));

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
});

test('na Max, sem nenhuma fala na tela, o nome do episódio não é minerado', async ({ page, extensao }) => {
  await abrirPlayerDaMax(page);
  await trocarJanelaDaLegenda(page, '');
  await page.locator('.contexto').evaluate(no => { no.style.top = 'auto'; no.style.bottom = '36px'; });

  await page.keyboard.press('Alt+KeyS');

  await expect(page.getByRole('status')).toContainText(TITULO_SEM_LEGENDA);
  expect(await extensao.frases()).toEqual([]);
});

test('na Max, a mineração automática grava a fala e nunca o nome do episódio', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } },
  });
  await abrirPlayerDaMax(page);
  await tocarVideo(page);

  await expect.poll(() => textos(extensao)).toEqual([FALA]);
  await page.locator('#legenda').evaluate((no, fala) => { no.textContent = fala; }, OUTRA_FALA);
  await expect.poll(async () => (await textos(extensao)).sort()).toEqual([FALA, OUTRA_FALA].sort());
  expect(await textos(extensao)).not.toContain(NOME_DO_EPISODIO);
});
