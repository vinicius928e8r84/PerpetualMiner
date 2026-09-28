'use strict';

// Referência visual do overlay na página (#40, #41): o botão flutuante, a marca
// sobre o texto capturado (a linha, o grifo e o chip) e a pílula, a reserva.
//
// O dono revisa estas telas lado a lado com o protótipo travado
// (docs/design/overlay/prototipo-overlay.html?variant=M1). Depois de aprovadas,
// elas são a referência: uma mudança visual faz o teste falhar até alguém olhar
// e atualizar:
//
//   cd e2e && npx playwright test overlay-visual --update-snapshots
//
// O sucesso some em ~3,5 s: cada foto é tirada logo que o feedback aparece.
// A marca entra em 150 ms: a foto espera a entrada terminar.

const { test, expect } = require('../fixtures');

// O player tem o tamanho do player do protótipo (1118 × 630): lado a lado com
// ele, a pílula aparece na mesma escala, e não maior porque o player é menor.
const JANELA = { width: 1166, height: 678 };

async function abrirPlayer(page, paginas) {
  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('player.html'));
  await page.evaluate(() => {
    for (const no of document.querySelectorAll('.player, video')) {
      no.style.width = '1118px';
      no.style.height = '630px';
    }
    // A legenda como a do protótipo: centrada, até ~560 px, quebrando em duas linhas.
    Object.assign(document.querySelector('.caption-window').style, {
      bottom: '110px', left: '50%', right: 'auto', width: '560px', transform: 'translateX(-50%)',
    });
    Object.assign(document.querySelector('.caption-text').style, { fontSize: '26px', lineHeight: '1.3' });
  });
  await expect(page.getByRole('button', { name: 'Minerar legenda (Alt+S)' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const player = page => page.locator('.player');

/** A marca na tela, com a entrada (150 ms) terminada. */
async function marcaParada(page) {
  const chip = page.locator('perpetualminer-overlay .pm-chip');
  await expect(chip).toBeVisible();
  await page.locator('perpetualminer-overlay').evaluate(host =>
    Promise.all(host.shadowRoot.getAnimations({ subtree: true }).map(animacao => animacao.finished)));
}

const segurarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  globalThis.__setOriginal ??= chrome.storage.local.set;
  globalThis.__seguradas = [];
  chrome.storage.local.set = (valores, callback) => new Promise(resolve => {
    globalThis.__seguradas.push(() => globalThis.__setOriginal.call(chrome.storage.local, valores)
      .then(() => { callback?.(); resolve(); }));
  });
});

const voltarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  chrome.storage.local.set = globalThis.__setOriginal;
  for (const soltar of globalThis.__seguradas) soltar();
});

const recusarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
});

test('o botão flutuante parado', async ({ page, paginas }) => {
  await abrirPlayer(page, paginas);
  await expect(player(page)).toHaveScreenshot('botao.png');
});

test('o botão com o mouse por cima: inteiro, sem rótulo', async ({ page, paginas }) => {
  await abrirPlayer(page, paginas);
  const botao = page.getByRole('button', { name: 'Minerar legenda (Alt+S)' });
  await botao.hover();
  await expect.poll(() => botao.evaluate(no => getComputedStyle(no).opacity)).toBe('1');
  await expect(player(page)).toHaveScreenshot('botao-hover.png');
});

test('MIN-01: a marca sob a legenda, com a Palavra grifada e o chip', async ({ page, context, paginas, fakes }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem });
  await abrirPlayer(page, paginas);
  await page.keyboard.press('Alt+KeyS');
  await marcaParada(page);
  await expect(player(page)).toHaveScreenshot('min-01.png');
});

test('MIN-01 com a legenda já trocada: a pílula, com a Palavra grifada', async ({ page, context, paginas, fakes, extensao }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem });
  await abrirPlayer(page, paginas);
  await segurarGravacoes(extensao);
  await page.keyboard.press('Alt+KeyS');
  await page.waitForTimeout(500);
  await page.locator('#legenda').evaluate(no => { no.textContent = 'A second line arrives on screen.'; });
  await voltarGravacoes(extensao);
  await expect(page.getByRole('status').locator('mark')).toBeVisible();
  await expect(player(page)).toHaveScreenshot('min-01-pilula.png');
});

test('MIN-02: minerada, sem cópia', async ({ page, paginas }) => {
  await page.route(paginas.url('player.html'), async route => {
    const resposta = await route.fetch();
    await route.fulfill({ response: resposta, headers: { ...resposta.headers(), 'permissions-policy': 'clipboard-write=()' } });
  });
  await abrirPlayer(page, paginas);
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByRole('status').getByText('Frase minerada', { exact: true })).toBeVisible();
  await expect(player(page)).toHaveScreenshot('min-02.png');
});

test('MIN-03: a falha ao gravar, com Tentar de novo e ×', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);
  await recusarGravacoes(extensao);
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText('Não deu para minerar')).toBeVisible();
  await expect(player(page)).toHaveScreenshot('min-03.png');
});

test('MIN-04: nenhuma legenda na tela', async ({ page, paginas }) => {
  await abrirPlayer(page, paginas);
  await page.locator('#legenda').evaluate(no => no.remove());
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText('Ligue as legendas do player e tente de novo.')).toBeVisible();
  await expect(player(page)).toHaveScreenshot('min-04.png');
});

test('MIN-10: página sem vídeo, a pílula livre no canto', async ({ page, paginas }) => {
  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('sem-video.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText('Esta página não tem vídeo com legenda.')).toBeVisible();
  await expect(page).toHaveScreenshot('min-10.png');
});

test('MIN-05: a marca sob a seleção numa página comum', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false } });
  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('texto.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#trecho').selectText();
  await page.keyboard.press('Alt+KeyE');
  await marcaParada(page);
  // A seleção azul do navegador sai da foto: a marca é o que se compara.
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await expect(page).toHaveScreenshot('min-05.png');
});

test('MIN-06: a mineração automática, a mesma marca mais apagada, com o idioma e o contador do dia', async ({ page, paginas, extensao }) => {
  const agora = new Date();
  const hoje = [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: hoje, en: { count: 0 }, ru: { count: 4 } },
    pm_auto_keyword_vocab_ru: { cacheVersion: 2, deckName: 'RUSSIAN', createdAt: Date.now(), words: [], terms: [], wordInfo: {}, termInfo: {} },
  });
  await abrirPlayer(page, paginas);
  // Um vídeo tocando de verdade: a mineração automática só olha legenda de vídeo que não está pausado.
  await page.evaluate(async () => {
    document.querySelector('#legenda').textContent = 'Я улыбаюсь';
    const tela = document.createElement('canvas');
    tela.getContext('2d').fillRect(0, 0, 1, 1);
    const video = document.querySelector('video');
    video.srcObject = tela.captureStream();
    await video.play();
  });
  await expect(page.getByText('Mineração automática', { exact: true })).toBeVisible();
  await marcaParada(page);
  // O vídeo toca um canvas todo preto, então o quadro não muda a foto.
  await expect(player(page)).toHaveScreenshot('min-06.png');
});

test('o contador do idioma da legenda no limite: contorno ouro', async ({ page, paginas, extensao }) => {
  const agora = new Date();
  const hoje = [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 15 }, ru: { enabled: false, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: hoje, en: { count: 15 }, ru: { count: 0 } },
  });
  await abrirPlayer(page, paginas);
  await expect(page.locator('perpetualminer-overlay .pm-contador')).toHaveText('15/15');
  await expect(player(page)).toHaveScreenshot('contador-no-limite.png');
});
