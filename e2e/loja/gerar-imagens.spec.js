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

const SAIDA = path.resolve(__dirname, '..', '..', 'docs', 'loja');
const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';
const JANELA = { width: 1280, height: 800 };

// A contagem do dia é do service worker, que não tem o relógio parado: ela vale para o dia de verdade.
const diaDeHoje = () => {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
};

const salvar = (page, nome, opcoes = {}) => page.screenshot({ path: path.join(SAIDA, nome), ...opcoes });

test.beforeAll(() => fs.mkdirSync(SAIDA, { recursive: true }));

// ─── 1 · Legenda de um vídeo, com o overlay e o aviso de minerada ───────────

const PLAYER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Aula de exemplo</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0c0b0a; font-family: system-ui, sans-serif; overflow: hidden; }
    .player { position: relative; width: 1280px; height: 800px; }
    video { width: 100%; height: 100%; display: block;
      background:
        radial-gradient(ellipse 60% 45% at 30% 38%, rgba(232, 168, 84, .55), transparent 70%),
        radial-gradient(ellipse 70% 40% at 72% 30%, rgba(96, 128, 158, .50), transparent 70%),
        linear-gradient(180deg, #2a3646 0%, #48607a 46%, #1b2530 47%, #11171e 100%); }
    .caption-window { position: absolute; left: 50%; right: auto; width: 900px; bottom: 150px; transform: translateX(-50%); text-align: center; }
    .caption-text { color: #fff; font-size: 30px; line-height: 1.35; background: rgba(0, 0, 0, .65); padding: 4px 12px; }
    .barra { position: absolute; left: 0; right: 0; bottom: 0; height: 64px; display: flex; align-items: center; gap: 18px; padding: 0 28px; background: linear-gradient(transparent, rgba(0, 0, 0, .7)); color: #ddd; font-size: 14px; }
    .barra .trilha { flex: 1; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, .28); }
    .barra .trilha i { display: block; width: 38%; height: 100%; border-radius: 2px; background: #e8a854; }
    .barra .play { width: 0; height: 0; border-left: 14px solid #ddd; border-top: 9px solid transparent; border-bottom: 9px solid transparent; }
  </style>
</head>
<body>
  <div class="player">
    <video muted></video>
    <div class="caption-window"><span class="caption-text" id="legenda">The quiet harbor woke before the gulls did.</span></div>
    <div class="barra"><span class="play"></span><span>12:41</span><div class="trilha"><i></i></div><span>33:20</span></div>
  </div>
</body>
</html>`;

test('captura 1: legenda com o overlay e o aviso de minerada', async ({ page, context, paginas, fakes, extensao }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  const dia = diaDeHoje();
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: dia, en: { count: 7 }, ru: { count: 0 } },
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem });
  await page.route(paginas.url('player.html'), route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: PLAYER }));
  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('player.html'));
  await expect(page.getByRole('button', { name: 'Minerar legenda (Alt+S)' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press('Alt+KeyS');
  const chip = page.locator('perpetualminer-overlay .pm-chip');
  await expect(chip).toBeVisible();
  await page.locator('perpetualminer-overlay').evaluate(host =>
    Promise.all(host.shadowRoot.getAnimations({ subtree: true }).map(animacao => animacao.finished)));
  await salvar(page, 'captura-1.png');
});

// ─── 2 · Painel de estudos, lista de Frases ─────────────────────────────────

const FRASES = [
  { id: 12, texto: 'The quiet harbor woke before the gulls did.', data: HOJE, streaming: 'web', idioma: 'Inglês', keywords: ['harbor@10'], status: 'exported', contexto: { fonte: 'web', titulo: 'Harbor Notes', detalhe: '' } },
  { id: 11, texto: 'She was reluctant to say anything.', data: HOJE, streaming: 'livro', idioma: 'Inglês', keywords: ['reluctant@4'], autoKeyword: true, contexto: { fonte: 'livro', titulo: 'The Lantern Keeper', detalhe: 'cap. 4' } },
  { id: 10, texto: 'Не всё то золото, что блестит.', data: HOJE, streaming: 'web', idioma: 'Russo', keywords: ['золото@2'], contexto: { fonte: 'web', titulo: 'Пословицы', detalhe: '' } },
  { id: 9, texto: 'The meeting was put off until next week.', data: '17/09/2026', streaming: 'pdf', idioma: 'Inglês', keywords: ['put@6', 'off@8'], contexto: { fonte: 'pdf', titulo: 'Office English', detalhe: 'cap. 2' } },
  { id: 8, texto: 'Мы с тобой одной крови — ты и я.', data: '17/09/2026', streaming: 'livro', idioma: 'Russo', keywords: ['крови@4'], status: 'exported', contexto: { fonte: 'livro', titulo: 'Книга джунглей', detalhe: 'cap. 3' } },
  { id: 7, texto: 'You cannot have your cake and eat it.', data: '17/09/2026', streaming: 'manual', idioma: 'Inglês', keywords: ['cake@8'], contexto: { fonte: 'manual', titulo: '', detalhe: '' } },
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
  await salvar(page, 'captura-2.png');
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
  await salvar(page, 'captura-3.png');
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
  await salvar(page, 'captura-4.png', { animations: 'disabled' });
});

// ─── 5 · O popup da barra, com o contador do dia ────────────────────────────

test('captura 5: popup da barra com o contador do dia', async ({ context, page, paginas, extensao }) => {
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

  await page.route(paginas.url('composicao.html'), route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <link rel="stylesheet" href="/veio/tokens.css">
      <style>
        html, body { margin: 0; width: 1280px; height: 800px; background: var(--veio-bg); color: var(--veio-text, #f1ece2); font-family: var(--veio-fonte-ui); overflow: hidden; }
        body { display: flex; align-items: center; justify-content: center; gap: 96px; }
        .texto { width: 480px; }
        h1 { font-family: var(--veio-fonte-display); font-size: 44px; line-height: 1.15; margin: 0 0 20px; letter-spacing: -.01em; }
        p { font-size: 20px; line-height: 1.5; margin: 0; color: var(--veio-text-2, #b9b1a2); }
        img { width: 425px; height: 750px; border-radius: 14px; border: 1px solid var(--veio-border); box-shadow: 0 24px 60px rgba(0, 0, 0, .55); }
      </style></head><body>
      <div class="texto"><h1>O dia de estudo,<br>a um clique.</h1><p>O popup da barra mostra quantas frases você já minerou hoje e as últimas que guardou.</p></div>
      <img alt="" src="data:image/png;base64,${popup}">
      </body></html>`,
  }));
  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('composicao.html'));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('img')).toBeVisible();
  await salvar(page, 'captura-5.png');
});

// ─── Imagem promocional pequena e ícone da loja ─────────────────────────────

test('promoção pequena 440x280 e ícone 128 sobre o fundo do tema', async ({ page, paginas }) => {
  const composicao = (largura, altura, corpo, estilo) => page.route(paginas.url('composicao.html'), route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="/veio/tokens.css">
      <style>html, body { margin: 0; width: ${largura}px; height: ${altura}px; background: var(--veio-bg); overflow: hidden; }
      ${estilo}</style></head><body>${corpo}</body></html>`,
  }));

  await composicao(440, 280, `<div class="c"><img src="/veio/icones/icone-128.png" alt="" width="96" height="96"><b>PerpetualMiner</b><span>Frases de legendas, textos e fotos, prontas para estudar.</span></div>`, `
    .c { height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; font-family: var(--veio-fonte-ui); text-align: center; }
    b { font-family: var(--veio-fonte-display); font-size: 34px; color: #f1ece2; letter-spacing: -.01em; }
    span { font-size: 15px; line-height: 1.4; color: #b9b1a2; max-width: 320px; }`);
  await page.setViewportSize({ width: 440, height: 280 });
  await page.goto(paginas.url('composicao.html'));
  await page.evaluate(() => document.fonts.ready);
  await salvar(page, 'promo-pequena-440x280.png');
  await page.unroute(paginas.url('composicao.html'));

  // O ícone existente é RGBA: achatado sobre o fundo do tema, sem alfa.
  await composicao(128, 128, `<img src="/veio/icones/icone-128.png" alt="" width="128" height="128" style="display:block">`, '');
  await page.setViewportSize({ width: 128, height: 128 });
  await page.goto(paginas.url('composicao.html'));
  await expect(page.locator('img')).toBeVisible();
  await salvar(page, 'icone-128.png');
});
