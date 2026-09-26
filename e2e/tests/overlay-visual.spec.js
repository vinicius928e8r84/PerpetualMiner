'use strict';

// Referência visual do overlay na página (#40): o botão flutuante e a pílula.
//
// O dono revisa estas telas lado a lado com o protótipo travado
// (docs/design/overlay/prototipo-overlay.html?variant=M1). Depois de aprovadas,
// elas são a referência: uma mudança visual faz o teste falhar até alguém olhar
// e atualizar:
//
//   cd e2e && npx playwright test overlay-visual --update-snapshots
//
// O sucesso some em ~3,5 s: cada foto é tirada logo que o feedback aparece.

const { test, expect } = require('../fixtures');

const JANELA = { width: 760, height: 460 };

async function abrirPlayer(page, paginas) {
  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('player.html'));
  await expect(page.getByRole('button', { name: 'Minerar legenda (Alt+S)' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const player = page => page.locator('.player');

const recusarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
});

test('o botão flutuante parado', async ({ page, paginas }) => {
  await abrirPlayer(page, paginas);
  await expect(player(page)).toHaveScreenshot('botao.png');
});

test('o botão com o rótulo visível (mouse por cima)', async ({ page, paginas }) => {
  await abrirPlayer(page, paginas);
  await page.getByRole('button', { name: 'Minerar legenda (Alt+S)' }).hover();
  await expect(page.getByText('Minerar legenda', { exact: true })).toBeVisible();
  await expect(player(page)).toHaveScreenshot('botao-rotulo.png');
});

test('MIN-01: minerada e copiada, com a Palavra grifada', async ({ page, context, paginas, fakes }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem });
  await abrirPlayer(page, paginas);
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByRole('status').locator('mark')).toBeVisible();
  await expect(player(page)).toHaveScreenshot('min-01.png');
});

test('MIN-02: minerada, sem cópia', async ({ page, paginas }) => {
  await page.route(paginas.url('player.html'), async route => {
    const resposta = await route.fetch();
    await route.fulfill({ response: resposta, headers: { ...resposta.headers(), 'permissions-policy': 'clipboard-write=()' } });
  });
  await abrirPlayer(page, paginas);
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText('Frase minerada · não deu para copiar')).toBeVisible();
  await expect(player(page)).toHaveScreenshot('min-02.png');
});

test('MIN-03: a falha ao gravar, com Tentar de novo e ×', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);
  await recusarGravacoes(extensao);
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(player(page)).toHaveScreenshot('min-03.png');
});

test('MIN-04: nenhuma legenda na tela', async ({ page, paginas }) => {
  await abrirPlayer(page, paginas);
  await page.locator('#legenda').evaluate(no => no.remove());
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByRole('button', { name: 'Fechar' })).toBeVisible();
  await expect(player(page)).toHaveScreenshot('min-04.png');
});

test('MIN-10: página sem vídeo, a pílula livre no canto', async ({ page, paginas }) => {
  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('sem-video.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByRole('button', { name: 'Fechar' })).toBeVisible();
  await expect(page).toHaveScreenshot('min-10.png');
});

test('MIN-05: seleção minerada numa página comum', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false } });
  await page.setViewportSize(JANELA);
  await page.goto(paginas.url('texto.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#trecho').selectText();
  await page.keyboard.press('Alt+KeyE');
  await expect(page.getByText('Frase minerada · Inglês')).toBeVisible();
  await expect(page).toHaveScreenshot('min-05.png');
});

test('MIN-06: a mineração automática, com o título longo e a meta do idioma', async ({ page, paginas, extensao }) => {
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
  await expect(page.getByText('Mineração automática · Russo · 5 de 20 hoje')).toBeVisible();
  // O vídeo toca um canvas todo preto, então o quadro não muda a foto.
  await expect(player(page)).toHaveScreenshot('min-06.png');
});
