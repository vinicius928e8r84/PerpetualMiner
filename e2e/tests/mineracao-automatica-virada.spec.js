'use strict';

// A Mineração automática na virada do dia (C2): a aba que bateu o limite ontem
// volta a minerar quando o dia vira, sem recarregar a página.
//
// O Chrome não deixa o teste esperar a meia-noite, então ele faz o que a
// meia-noite faz: o contador guardado passa a ser de ontem (a data deixa de ser
// a de hoje) e o alarme da virada do dia dispara, como em badge-da-toolbar.spec.js.
// O que se confere é o que a pessoa vê (o contador do botão) e o que fica
// gravado (a Frase), com a aba aberta desde antes.

const { test, expect } = require('../fixtures');

const FRASE_RUSSA = 'Я улыбаюсь';
const ALARME_VIRADA_DO_DIA = 'pm-virada-do-dia';

const botaoFlutuante = page => page.getByRole('button', { name: /^Minerar legenda/ });
const contador = page => page.locator('perpetualminer-overlay .pm-contador');

/** Um dia no formato do contador diário (AAAA-MM-DD, hora local). */
function diaDe(momento) {
  return [
    momento.getFullYear(),
    String(momento.getMonth() + 1).padStart(2, '0'),
    String(momento.getDate()).padStart(2, '0'),
  ].join('-');
}

async function tocarVideoComLegenda(page, texto) {
  // A mineração automática só olha a legenda de um vídeo que está tocando.
  await page.evaluate(async texto => {
    document.querySelector('#legenda').textContent = texto;
    const tela = document.createElement('canvas');
    tela.getContext('2d').fillRect(0, 0, 1, 1);
    const video = document.querySelector('video');
    video.srcObject = tela.captureStream();
    await video.play();
  }, texto);
}

test('ontem no limite, o alarme da virada do dia: a aba aberta volta a minerar', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 3 } },
    pm_auto_miner_daily: { date: diaDe(new Date()), en: { count: 0 }, ru: { count: 3 } },
    // O vocabulário do Anki em cache, sem nenhuma palavra conhecida: a frase russa
    // tem um item novo só, então a mineração automática a aceita.
    pm_auto_keyword_vocab_ru: {
      cacheVersion: 2, deckName: 'RUSSIAN', createdAt: Date.now(),
      words: [], terms: [], wordInfo: {}, termInfo: {},
    },
  });
  await page.goto(paginas.url('player.html'));
  await expect(botaoFlutuante(page)).toBeVisible();

  // A aba está no limite do dia: o contador diz isso e nada é minerado.
  await tocarVideoComLegenda(page, FRASE_RUSSA);
  await expect(contador(page)).toHaveText('3/3');
  await expect(botaoFlutuante(page)).toHaveAccessibleDescription('Mineração automática · Russo: limite de hoje atingido');
  await page.waitForTimeout(1500);
  expect(await extensao.frases()).toEqual([]);

  // O dia vira: o que está guardado é de ontem, e o alarme da meia-noite dispara.
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await extensao.gravarStorage({
    pm_auto_miner_daily: { date: diaDe(ontem), en: { count: 0 }, ru: { count: 3 } },
  });
  await extensao.serviceWorker.evaluate(
    nome => chrome.alarms.create(nome, { when: Date.now() + 100 }), ALARME_VIRADA_DO_DIA);

  // A aba, sem recarregar, minera a frase que estava na tela e conta uma de hoje.
  await expect.poll(async () => (await extensao.frases()).map(frase => frase.texto)).toEqual([FRASE_RUSSA]);
  await expect(contador(page)).toHaveText('1/3');
});
