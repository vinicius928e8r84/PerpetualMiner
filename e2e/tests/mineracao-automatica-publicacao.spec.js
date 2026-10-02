'use strict';

const { test, expect, botaoFlutuante, tocarVideo } = require('../fixtures');
const { fotografar, registrarEstado } = require('../evidencias-mineracao');

const FRASE_RUSSA = 'Я улыбаюсь';
const ERRO_DE_GRAVACAO = 'QUOTA_BYTES quota exceeded';

test('a frase no limite atualiza o popup e a aba mesmo com a gravação do diagnóstico falhando', async ({ page, context, paginas, extensao }) => {
  const agora = new Date();
  const hoje = [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 3 } },
    pm_auto_miner_daily: { date: hoje, en: { count: 0 }, ru: { count: 2 } },
    pm_auto_keyword_vocab_ru: {
      cacheVersion: 2, deckName: 'RUSSIAN', createdAt: Date.now(),
      words: [], terms: [], wordInfo: {}, termInfo: {},
    },
  });
  await page.goto(paginas.url('player.html'));
  await expect(botaoFlutuante(page)).toBeVisible();
  await page.locator('#legenda').evaluate((no, texto) => { no.textContent = texto; }, FRASE_RUSSA);
  const contadorDaAba = page.locator('perpetualminer-overlay .pm-contador');
  await expect(contadorDaAba).toHaveText('2/3');

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 340, height: 600 });
  await popup.goto(extensao.url('popup.html'));
  const russo = popup.locator('.popup-azulejo[data-idioma="ru"]');
  const contadorDoPopup = russo.locator('.popup-azulejo__contador [aria-hidden="true"]');
  await expect(contadorDoPopup).toHaveText('2/3');
  await fotografar(popup, 'publicacao-popup-antes.png');

  await extensao.serviceWorker.evaluate(erro => {
    const gravar = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = (valores, callback) => {
      if (valores.pm_auto_miner_last_event?.action === 'saved') throw new Error(erro);
      return gravar(valores, callback);
    };
  }, ERRO_DE_GRAVACAO);
  await page.bringToFront();
  await tocarVideo(page);

  await expect.poll(async () => (await extensao.frases()).map(frase => frase.texto)).toEqual([FRASE_RUSSA]);
  await expect.poll(async () => (await extensao.lerStorage('pm_auto_miner_last_event')).pm_auto_miner_last_event?.reason).toBe(ERRO_DE_GRAVACAO);
  expect((await extensao.lerStorage('pm_auto_miner_daily')).pm_auto_miner_daily.ru.count).toBe(3);
  await expect(contadorDoPopup).toHaveText('3/3');
  await expect(russo.locator('.popup-azulejo__no-limite')).toHaveText('Limite de hoje atingido');
  await expect(popup.getByRole('spinbutton', { name: 'Limite por dia em russo' })).toHaveCount(0);
  await expect(contadorDaAba).toHaveText('3/3');
  await expect(botaoFlutuante(page)).toHaveAccessibleDescription('Mineração automática · Russo: limite de hoje atingido');
  expect((await extensao.lerStorage('pm_auto_miner_state_view')).pm_auto_miner_state_view.daily.ru.count).toBe(3);
  await fotografar(page.locator('.player'), 'publicacao-aba-depois.png');
  await fotografar(popup, 'publicacao-popup-depois.png');
  await registrarEstado(extensao, 'publicacao-diagnostico-falhou.json');
});
