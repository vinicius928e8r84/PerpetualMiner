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

const fs = require('fs');
const path = require('path');

const { test, expect } = require('../fixtures');

const FRASE_RUSSA = 'Я улыбаюсь';

/**
 * O valor de um token no tema padrão de `veio/tokens.css`.
 *
 * O badge não é CSS — o Chrome recebe a cor escrita —, então `background.js`
 * guarda uma cópia das duas. Lendo o token aqui, o teste falha se a cópia e o
 * token se separarem.
 */
function tokenDoTemaPadrao(nome) {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'veio', 'tokens.css'), 'utf8');
  const ateOClaro = css.slice(0, css.indexOf('[data-tema="claro"]'));
  const achado = ateOClaro.match(new RegExp(`${nome}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!achado) throw new Error(`Token ${nome} não encontrado no tema padrão de veio/tokens.css`);
  return achado[1];
}

/** "#F5B83D" como o Chrome devolve a cor: [R, G, B, A]. */
function comoORgba(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(255);
}

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

test('a vitrine mostra os três estados do badge, nas cores dos tokens', async ({ page, paginas }) => {
  // O badge de verdade é desenhado pelo Chrome na barra do navegador, então o
  // preview do Vercel não o alcança. A vitrine tem uma imitação dele, para
  // conferir cor e contraste no navegador comum.
  await page.goto(paginas.url('vitrine.html'));

  const estados = page.locator('.badge-estado');
  await expect(estados).toHaveCount(3);

  const contando = estados.filter({ hasText: 'Contando' });
  await expect(contando.locator('.icone-com-badge b')).toHaveText('12');
  await expect(contando).toContainText('Mineração automática: 12 hoje');

  const noLimite = estados.filter({ hasText: 'Todos os ligados no limite' });
  await expect(noLimite.locator('.icone-com-badge b')).toHaveText('25');
  await expect(noLimite).toContainText('Mineração automática: limite de hoje atingido');

  // Desligado não tem badge nenhum, e o tooltip é o nome da extensão.
  const desligado = estados.filter({ hasText: 'Os dois idiomas desligados' });
  await expect(desligado.locator('.icone-com-badge b')).toHaveCount(0);
  await expect(desligado).toContainText('PerpetualMiner');

  // A cor sai dos tokens, não de um literal repetido na vitrine.
  await expect(contando.locator('.icone-com-badge b')).toHaveCSS(
    'background-color', `rgb(${comoORgba(tokenDoTemaPadrao('--veio-accent')).slice(0, 3).join(', ')})`);
  await expect(contando.locator('.icone-com-badge b')).toHaveCSS(
    'color', `rgb(${comoORgba(tokenDoTemaPadrao('--veio-accent-ink')).slice(0, 3).join(', ')})`);
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

  // E são as mesmas de `veio/tokens.css`: mudar o token sem mudar a cópia de
  // `background.js` quebra aqui, em vez de sair um badge fora da identidade.
  expect(cores.fundo).toEqual(comoORgba(tokenDoTemaPadrao('--veio-accent')));
  expect(cores.texto).toEqual(comoORgba(tokenDoTemaPadrao('--veio-accent-ink')));
});
