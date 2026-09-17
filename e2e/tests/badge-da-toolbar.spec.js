'use strict';

// Passo 6 do redesign: o contador da mineração automática no badge da toolbar.
//
// O badge é do Chrome, não do DOM: o Playwright não tira uma foto do ícone da
// extensão. Os testes olham o que a extensão entrega ao Chrome — o texto do
// badge e o tooltip do ícone, por `chrome.action.getBadgeText` e
// `chrome.action.getTitle` —, que é exatamente o que a pessoa lê na toolbar.
//
// A mineração automática que aumenta o contador entra pelo handler que o content
// script chama (`handleAutoMinerCandidate`), como o teste do menu de contexto faz
// com o handler do Chrome. As duas exceções estão na seção de testes do CLAUDE.md.

const { test, expect } = require('../fixtures');

const FRASE_RUSSA = 'Я улыбаюсь';

/** O que a pessoa vê na toolbar: o texto do badge e o tooltip do ícone. */
function naToolbar(extensao) {
  return extensao.serviceWorker.evaluate(async () => ({
    badge: await chrome.action.getBadgeText({}),
    tooltip: await chrome.action.getTitle({}),
  }));
}

/** A data de um dia no formato que o contador diário usa. */
function diaDe(momento) {
  return [
    momento.getFullYear(),
    String(momento.getMonth() + 1).padStart(2, '0'),
    String(momento.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Semeia os idiomas e os contadores de um dia da mineração automática. */
function semearMineracaoAutomatica(extensao, { en, ru, dia = diaDe(new Date()) }) {
  return extensao.gravarStorage({
    pm_auto_miner_settings: {
      en: { enabled: en.ligado, dailyLimit: en.limite },
      ru: { enabled: ru.ligado, dailyLimit: ru.limite },
    },
    pm_auto_miner_daily: {
      date: dia,
      en: { count: en.hoje },
      ru: { count: ru.hoje },
    },
  });
}

test('o badge soma só os idiomas ligados', async ({ extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 12 },
    ru: { ligado: false, limite: 20, hoje: 13 },
  });

  // O 13 do russo desligado fica de fora: o badge mostra os 12 do inglês.
  await expect.poll(() => naToolbar(extensao)).toEqual({
    badge: '12',
    tooltip: 'Mineração automática: 12 hoje',
  });
});

test('com os dois idiomas desligados não há badge', async ({ extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: false, limite: 20, hoje: 12 },
    ru: { ligado: false, limite: 20, hoje: 13 },
  });

  await expect.poll(() => naToolbar(extensao)).toEqual({
    badge: '',
    tooltip: 'PerpetualMiner',
  });
});

test('quando todos os ligados bateram o limite, o tooltip diz isso', async ({ extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 15, hoje: 15 },
    ru: { ligado: true, limite: 10, hoje: 10 },
  });

  await expect.poll(() => naToolbar(extensao)).toEqual({
    badge: '25',
    tooltip: 'Mineração automática: limite de hoje atingido',
  });
});

test('um só dos ligados no limite ainda mostra o contador', async ({ extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 15, hoje: 15 },
    ru: { ligado: true, limite: 20, hoje: 3 },
  });

  await expect.poll(() => naToolbar(extensao)).toEqual({
    badge: '18',
    tooltip: 'Mineração automática: 18 hoje',
  });
});

test('ligar e desligar um idioma no popup muda o badge na hora', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 12 },
    ru: { ligado: false, limite: 20, hoje: 13 },
  });
  await expect.poll(async () => (await naToolbar(extensao)).badge).toBe('12');

  await page.goto(extensao.url('popup.html'));
  await page.locator('#autoMinerRu').check();

  await expect.poll(() => naToolbar(extensao)).toEqual({
    badge: '25',
    tooltip: 'Mineração automática: 25 hoje',
  });

  await page.locator('#autoMinerEn').uncheck();

  await expect.poll(() => naToolbar(extensao)).toEqual({
    badge: '13',
    tooltip: 'Mineração automática: 13 hoje',
  });
});

test('cada mineração automática soma um no badge', async ({ extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: false, limite: 20, hoje: 0 },
    ru: { ligado: true, limite: 20, hoje: 4 },
  });
  // O vocabulário do Anki em cache, sem nenhuma palavra conhecida: a frase russa
  // tem um item novo só, então a mineração automática a aceita.
  await extensao.gravarStorage({
    pm_auto_keyword_vocab_ru: {
      cacheVersion: 2,
      deckName: 'RUSSIAN',
      createdAt: Date.now(),
      words: [], terms: [], wordInfo: {}, termInfo: {},
    },
  });
  await expect.poll(async () => (await naToolbar(extensao)).badge).toBe('4');

  const resultado = await extensao.serviceWorker.evaluate(texto => handleAutoMinerCandidate({
    texto,
    origem: 'auto',
    lang: 'ru',
    contexto: { fonte: 'netflix', titulo: 'Episódio', detalhe: '' },
  }), FRASE_RUSSA);

  expect(resultado.action).toBe('saved');
  await expect.poll(() => naToolbar(extensao)).toEqual({
    badge: '5',
    tooltip: 'Mineração automática: 5 hoje',
  });
});

test('na virada do dia o badge zera, e um alarme diário faz isso sem ninguém mexer', async ({ extensao }) => {
  const ontem = diaDe(new Date(Date.now() - 24 * 60 * 60 * 1000));
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 12 },
    ru: { ligado: false, limite: 20, hoje: 13 },
    dia: ontem,
  });

  // O contador de ontem não conta como o de hoje.
  await expect.poll(() => naToolbar(extensao)).toEqual({
    badge: '0',
    tooltip: 'Mineração automática: 0 hoje',
  });

  // E a virada acontece sozinha: há um alarme que se repete a cada 24 h.
  const alarme = await extensao.serviceWorker.evaluate(
    () => chrome.alarms.get('pm-virada-do-dia'));
  expect(alarme?.periodInMinutes).toBe(24 * 60);
});

test('o badge usa as cores da identidade Veio', async ({ extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 3 },
    ru: { ligado: false, limite: 20, hoje: 0 },
  });
  await expect.poll(async () => (await naToolbar(extensao)).badge).toBe('3');

  const cores = await extensao.serviceWorker.evaluate(async () => ({
    fundo: await chrome.action.getBadgeBackgroundColor({}),
    texto: await chrome.action.getBadgeTextColor({}),
  }));

  // #F5B83D com texto #1A1204, a dupla da spec da identidade.
  expect(cores.fundo).toEqual([0xF5, 0xB8, 0x3D, 255]);
  expect(cores.texto).toEqual([0x1A, 0x12, 0x04, 255]);
});
