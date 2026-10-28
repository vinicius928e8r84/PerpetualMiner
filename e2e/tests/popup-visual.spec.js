'use strict';

// Referência visual do popup “Cockpit” (#38), na variante A do protótipo
// travado (docs/design/popup/prototipo-popup.html?variant=A). O dono revisa
// estas telas lado a lado com o protótipo; depois de aprovadas, qualquer
// mudança visual no popup faz o teste falhar até alguém olhar e atualizar a
// referência:
//
//   cd e2e && npx playwright test popup-visual --update-snapshots
//
// O popup tem 340 px de largura e teto de 600 px, como no balão do ícone.

const { test, expect } = require('../fixtures');
const { leituraDoVocabulario: leitura } = require('../leitura-do-vocabulario');

// O Contexto diz o dia da frase (PAI-11): o relógio fica parado no dia delas.
const AGORA = new Date('2026-09-18T12:00:00');

const FRASES = [
  { id: 7, texto: 'I’m not saying it’s your fault, I’m saying it’s your responsibility.', data: '18/09/2026', streaming: 'netflix', idioma: 'Inglês', keywords: ['responsibility@9'], contexto: { fonte: 'netflix', titulo: 'The Bear', detalhe: 'T2 · E7' } },
  { id: 6, texto: 'Мы с тобой одной крови — ты и я.', data: '18/09/2026', streaming: 'livro', idioma: 'Russo', keywords: ['крови@4'], contexto: { fonte: 'livro', titulo: 'Маугли', detalhe: 'cap. 3' } },
  { id: 5, texto: 'Не всё то золото, что блестит.', data: '18/09/2026', streaming: 'youtube', idioma: 'Russo', keywords: ['золото@2'], autoKeyword: true, contexto: { fonte: 'youtube', titulo: 'Редакция', detalhe: '' } },
  { id: 4, texto: 'The devil is in the details.', data: '18/09/2026', streaming: 'web', idioma: 'Inglês', keywords: ['details@5'], contexto: { fonte: 'web', titulo: 'The Atlantic', detalhe: '' } },
  { id: 3, texto: 'We were on a break!', data: '17/09/2026', streaming: 'netflix', idioma: 'Inglês', keywords: ['break@4'], contexto: { fonte: 'netflix', titulo: 'Friends', detalhe: 'T3 · E15' } },
  { id: 2, texto: 'Let’s call it a day.', data: '17/09/2026', streaming: 'youtube', idioma: 'Inglês', contexto: { fonte: 'youtube', titulo: 'Veritasium', detalhe: '' } },
];

// A contagem do dia é do service worker, que não tem o relógio parado: ela é
// gravada no dia de verdade.
const hoje = new Date();
const DIA = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
const mineracao = ({ en, ru }) => ({
  pm_auto_miner_settings: { en: { enabled: en[0], dailyLimit: en[1] }, ru: { enabled: ru[0], dailyLimit: ru[1] } },
  pm_auto_miner_daily: { date: DIA, en: { count: en[2] }, ru: { count: ru[2] } },
});
const DIA_NORMAL = mineracao({ en: [true, 20, 12], ru: [false, 15, 0] });

async function abrirPopup(page, extensao, { tema = 'escuro' } = {}) {
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: 340, height: 600 });
  if (tema !== 'escuro') await extensao.gravarStorage({ pm_tema: tema });
  await page.goto(extensao.url('popup.html'));
  await page.evaluate(() => document.fonts.ready);
}

const campo = page => page.getByRole('textbox', { name: 'Cole ou escreva uma frase' });

test('dia normal: inglês ligado, russo desligado, as 5 últimas', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES, ...DIA_NORMAL });
  await abrirPopup(page, extensao);
  await expect(page.locator('#ultimas li')).toHaveCount(5);
  await expect(page).toHaveScreenshot('popup-dia-normal.png');
});

test('dia normal no tema claro', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES, ...DIA_NORMAL });
  await abrirPopup(page, extensao, { tema: 'claro' });
  await expect(page.locator('#ultimas li')).toHaveCount(5);
  await expect(page).toHaveScreenshot('popup-claro.png');
});

test('primeiro uso: vazio que ensina o atalho', async ({ page, extensao }) => {
  await abrirPopup(page, extensao);
  await expect(page.locator('#ultimas kbd')).toHaveText(['Alt', 'S']);
  await expect(page).toHaveScreenshot('popup-primeiro-uso.png');
});

test('primeiro uso sem atalho gravado', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await abrirPopup(page, extensao);
  await expect(page.locator('#ultimas')).toContainText('Defina um atalho para minerar legendas de vídeo.');
  await expect(page.getByRole('contentinfo').locator('kbd')).toHaveText('Sem atalho');
  await expect(page).toHaveScreenshot('popup-sem-atalho.png');
});

test('limite de hoje atingido', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES, ...mineracao({ en: [true, 20, 20], ru: [true, 15, 4] }) });
  await abrirPopup(page, extensao);
  await expect(page.locator('.popup-azulejo__no-limite')).toHaveText('Limite de hoje atingido');
  await expect(page).toHaveScreenshot('popup-limite.png');
});

test('Conexão com o Anki desligada, com a leitura de ontem: o azulejo segue contando e o selo diz a idade', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({
    frases: FRASES,
    ...DIA_NORMAL,
    pm_anki_ja_conectou: true,
    pm_auto_keyword_vocab_en: leitura('CIMV', new Date('2026-09-17T14:02:00').getTime()),
  });
  await abrirPopup(page, extensao);
  await expect(page.getByText('Vocabulário de ontem, 14:02')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir o Anki' })).toBeVisible();
  await expect(page).toHaveScreenshot('popup-vocabulario-de-ontem.png');
});

test('Conexão com o Anki desligada, sem nenhuma leitura: o azulejo ligado espera o Anki', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({ frases: FRASES, pm_anki_ja_conectou: true, ...mineracao({ en: [true, 20, 0], ru: [false, 15, 0] }) });
  await abrirPopup(page, extensao);
  const espera = page.locator('.popup-azulejo__espera:visible');
  await expect(espera).toContainText('— esperando o Anki');
  await expect(espera).toContainText('Começa depois que o Anki abrir uma vez.');
  await expect(page.getByRole('button', { name: 'Abrir o Anki' })).toBeVisible();
  await expect(page).toHaveScreenshot('popup-esperando-o-anki.png');
});

test('mineração rápida que falhou', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES, ...DIA_NORMAL });
  await abrirPopup(page, extensao);
  await expect(page.locator('#ultimas li')).toHaveCount(5);
  await extensao.serviceWorker.evaluate(() => {
    chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
  });
  await campo(page).fill('Break a leg');
  await campo(page).press('Enter');
  await expect(page.getByRole('alert')).toContainText('Não deu para minerar a frase.');
  await campo(page).blur();
  await expect(page).toHaveScreenshot('popup-falha.png');
});

test('carregando: esqueleto', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES, ...DIA_NORMAL });
  await page.addInitScript(() => {
    const ler = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = (chaves, callback) => {
      if (chaves && typeof chaves === 'object' && 'frases' in chaves) return undefined;
      return ler(chaves, callback);
    };
  });
  await abrirPopup(page, extensao);
  await expect(page.locator('#ultimas .veio-esqueleto').first()).toBeVisible();
  await expect(page).toHaveScreenshot('popup-carregando.png', { animations: 'disabled' });
});

// O lembrete “Configuração pela metade” (ONB-14, #44): a instalação deixou a
// configuração começada e a Boas-vindas ainda não chegou a Tudo pronto. As
// frases, a Conexão com o Anki respondendo e o inglês ligado na mineração
// automática são 3 dos 7 passos.
test.describe('configuração pela metade (ONB-14)', () => {
  test.use({ lembreteDaConfiguracao: true });

  test('o cartão com o anel, acima de Abrir painel', async ({ page, extensao }) => {
    await extensao.gravarStorage({ frases: FRASES, ...DIA_NORMAL });
    await abrirPopup(page, extensao);
    await expect(page.getByRole('button', { name: /Configuração pela metade · 3 de 7/ })).toBeVisible();
    await expect(page.locator('#ultimas li')).toHaveCount(5);
    await expect(page).toHaveScreenshot('popup-configuracao-pela-metade.png');
  });

  test('o cartão no tema claro', async ({ page, extensao }) => {
    await extensao.gravarStorage({ frases: FRASES, ...DIA_NORMAL });
    await abrirPopup(page, extensao, { tema: 'claro' });
    await expect(page.getByRole('button', { name: /Configuração pela metade · 3 de 7/ })).toBeVisible();
    await expect(page.locator('#ultimas li')).toHaveCount(5);
    await expect(page).toHaveScreenshot('popup-configuracao-pela-metade-claro.png');
  });
});
