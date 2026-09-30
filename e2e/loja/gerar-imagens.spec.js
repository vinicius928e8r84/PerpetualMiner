'use strict';

// Gera as capturas e a imagem promocional da Chrome Web Store em `docs/loja/`,
// pelas telas reais da extensão no Chromium, com a rede falsificada e frases
// de exemplo (nada pessoal, nenhuma série ou marca de streaming na tela).
//
//   cd e2e && npx playwright test -c loja --workers=1 && node loja/validar.js
//
// O que sai daqui não muda a extensão: só lê as telas e escreve PNGs.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures');
const { IMAGENS, CAPTURA } = require('./imagens');

const SAIDA = path.resolve(__dirname, '..', '..', 'docs', 'loja');
const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';
const JANELA = { width: CAPTURA.largura, height: CAPTURA.altura };

// A contagem do dia é do service worker, que não tem o relógio parado: ela vale para o dia de verdade.
const diaDeHoje = () => {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
};

const salvar = (page, imagem, opcoes = {}) => page.screenshot({ path: path.join(SAIDA, imagem.arquivo), ...opcoes });

test.beforeAll(() => fs.mkdirSync(SAIDA, { recursive: true }));

// ─── 1 · Legenda de um vídeo, com o overlay e o aviso de minerada ───────────

test('captura 1: legenda com o overlay e o aviso de minerada', async ({ page, context, paginas, fakes, extensao }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  const dia = diaDeHoje();
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: dia, en: { count: 7 }, ru: { count: 0 } },
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem });
  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('player-loja.html'));
  await expect(page.getByRole('button', { name: 'Minerar legenda (Alt+S)' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press('Alt+KeyS');
  const chip = page.locator('perpetualminer-overlay .pm-chip');
  await expect(chip).toBeVisible();
  await page.locator('perpetualminer-overlay').evaluate(host =>
    Promise.all(host.shadowRoot.getAnimations({ subtree: true }).map(animacao => animacao.finished)));
  await salvar(page, IMAGENS.captura1);
});

// ─── 2 · Painel de estudos, lista de Frases ─────────────────────────────────

/**
 * A Palavra como o painel a guarda (`palavra@índice`): o índice é o do token na
 * frase, contando os espaços e a pontuação, como `tokenizarFrase` (painel.js).
 */
function palavra(texto, alvo) {
  const tokens = texto.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[^\p{L}\p{N}]/gu);
  return `${alvo}@${tokens.findIndex(token => token.toLowerCase() === alvo)}`;
}

const FRASES = [
  { id: 12, texto: 'The quiet harbor woke before the gulls did.', data: HOJE, streaming: 'web', idioma: 'Inglês', keywords: [palavra('The quiet harbor woke before the gulls did.', 'harbor')], status: 'exported', contexto: { fonte: 'web', titulo: 'Harbor Notes', detalhe: '' } },
  { id: 11, texto: 'She was reluctant to say anything.', data: HOJE, streaming: 'livro', idioma: 'Inglês', keywords: [palavra('She was reluctant to say anything.', 'reluctant')], autoKeyword: true, contexto: { fonte: 'livro', titulo: 'The Lantern Keeper', detalhe: 'cap. 4' } },
  { id: 10, texto: 'Не всё то золото, что блестит.', data: HOJE, streaming: 'web', idioma: 'Russo', keywords: [palavra('Не всё то золото, что блестит.', 'золото')], contexto: { fonte: 'web', titulo: 'Пословицы', detalhe: '' } },
  { id: 9, texto: 'The meeting was put off until next week.', data: '17/09/2026', streaming: 'pdf', idioma: 'Inglês', keywords: [palavra('The meeting was put off until next week.', 'put'), palavra('The meeting was put off until next week.', 'off')], contexto: { fonte: 'pdf', titulo: 'Office English', detalhe: 'cap. 2' } },
  { id: 8, texto: 'Мы с тобой одной крови — ты и я.', data: '17/09/2026', streaming: 'livro', idioma: 'Russo', keywords: [palavra('Мы с тобой одной крови — ты и я.', 'крови')], status: 'exported', contexto: { fonte: 'livro', titulo: 'Книга джунглей', detalhe: 'cap. 3' } },
  { id: 7, texto: 'You cannot have your cake and eat it.', data: '17/09/2026', streaming: 'manual', idioma: 'Inglês', keywords: [palavra('You cannot have your cake and eat it.', 'cake')], contexto: { fonte: 'manual', titulo: '', detalhe: '' } },
  { id: 6, texto: 'Let us call it a day.', data: '15/09/2026', streaming: 'web', idioma: 'Inglês', contexto: { fonte: 'web', titulo: 'Everyday Idioms', detalhe: '' } },
];

test('captura 2: painel de estudos, lista de Frases', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize(JANELA);
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(FRASES.length);
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await salvar(page, IMAGENS.captura2);
});

// ─── 3 · Minerar de uma foto, com as frases lidas ───────────────────────────

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'pages', 'pagina-marcada.png'));
const foto = nome => ({ name: nome, mimeType: 'image/png', buffer: PAGINA });
const LIVRO = 'The Lantern Keeper';
const FRASES_FOTO_1 = [
  'Above all, don’t lie to yourself.',
  'The mystery of human existence lies not in just staying alive, but in finding something to live for.',
  'Love in action is a harsh and dreadful thing compared with love in dreams.',
];
const FRASES_FOTO_2 = [
  'Нет ничего обольстительнее для человека, как свобода его совести.',
  'If you want to be respected by others, the great thing is to respect yourself.',
];

test('captura 3: minerar de uma foto, com as frases lidas', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ bookTitleDefault: LIVRO, geminiApiKey: 'chave-de-teste' });
  await page.setViewportSize(JANELA);
  await page.goto(extensao.url('bookreader.html'));
  await expect(page.getByRole('heading', { name: 'Minerar de uma foto' })).toBeVisible();
  fakes.gemini.responderFrases(FRASES_FOTO_1);
  fakes.gemini.responderFrases(FRASES_FOTO_2);
  await page.locator('#foto-arquivo').setInputFiles([foto('IMG_2041.jpg'), foto('IMG_2042.jpg')]);
  const fila = page.getByRole('list', { name: 'Fotos' }).getByRole('listitem');
  await expect(fila.filter({ hasText: 'IMG_2042.jpg' })).toContainText('2 frases');
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await salvar(page, IMAGENS.captura3);
});

// ─── 4 · Configurações: atalhos, chave do Gemini e aparência ────────────────

test('captura 4: Configurações com Atalhos aberto', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: FRASES,
    geminiApiKey: 'AIzaSyD4kQ7wL2mXe9pRtB8nVfH0cJ3kQ9',
  });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize(JANELA);
  await page.goto(extensao.url('painel.html#configuracoes/atalhos'));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await expect(page.locator('#cfg-atalhos').getByRole('group', { name: 'Minerar legenda' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await salvar(page, IMAGENS.captura4, { animations: 'disabled' });
});

// ─── 5 · O popup da barra, com o contador do dia ────────────────────────────

test('captura 5: popup da barra com a mineração automática do dia', async ({ context, page, paginas, extensao }) => {
  const dia = diaDeHoje();
  await extensao.gravarStorage({
    frases: FRASES,
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } },
    pm_auto_miner_daily: { date: dia, en: { count: 12 }, ru: { count: 0 } },
  });

  // O popup tem 340 px: sai em dobro de resolução e entra numa composição 1280 × 800.
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: 340, height: 600 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 340, height: 600, deviceScaleFactor: 2, mobile: false });
  await page.goto(extensao.url('popup.html'));
  await expect(page.locator('#ultimas li')).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready);
  const popup = (await page.screenshot()).toString('base64');
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('loja-popup.html'));
  await page.locator('#popup').evaluate((img, base64) => { img.src = `data:image/png;base64,${base64}`; return img.decode(); }, popup);
  await page.evaluate(() => document.fonts.ready);
  await salvar(page, IMAGENS.captura5);
});

// ─── Imagem promocional pequena e ícone da loja ─────────────────────────────

test('promoção pequena 440x280 e ícone 128 sobre o fundo do tema', async ({ page, paginas }) => {
  await page.setViewportSize({ width: IMAGENS.promo.largura, height: IMAGENS.promo.altura });
  await page.goto(paginas.url('loja-promo.html'));
  await expect(page.locator('img')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await salvar(page, IMAGENS.promo);

  // O ícone existente é RGBA: achatado sobre o fundo do tema, sai sem alfa.
  await page.setViewportSize({ width: IMAGENS.icone.largura, height: IMAGENS.icone.altura });
  await page.goto(paginas.url('loja-icone.html'));
  await expect(page.locator('img')).toBeVisible();
  await salvar(page, IMAGENS.icone);
});
