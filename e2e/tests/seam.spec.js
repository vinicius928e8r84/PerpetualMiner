'use strict';

// O caminho feliz de hoje, exercitado pelo seam: cada página-fixture e cada
// fake mostra que funciona do jeito que a pessoa usa a extensão.

const { test, expect } = require('../fixtures');

const LEGENDA = 'The quiet harbor woke before the gulls did.';

test('no player com legenda, Alt+S minera a legenda com o Contexto da página', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url('player.html'));
  await expect(page.locator('#btn-minerador-pro')).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toContain(LEGENDA);
  const frase = (await extensao.frases()).find(f => f.texto === LEGENDA);
  expect(frase).toMatchObject({
    idioma: 'Inglês',
    contexto: { fonte: 'web', titulo: 'Player falso · Episódio de teste' },
  });
});

test('numa página comum, o atalho gravado minera o texto selecionado', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_atalho: { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false },
  });
  await page.goto(paginas.url('texto.html'));

  await page.locator('#trecho').selectText();
  await page.keyboard.press('Alt+KeyE');

  await expect.poll(extensao.frases).toEqual([
    expect.objectContaining({
      texto: 'Every lantern along the pier flickered in the salt wind.',
      streaming: 'selecao',
      contexto: expect.objectContaining({ fonte: 'selecao', titulo: 'Página comum · Artigo de teste' }),
    }),
  ]);
});

test('numa página sem vídeo, Alt+S não minera nada', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url('sem-video.html'));
  await page.keyboard.press('Alt+KeyS');

  // Dá tempo ao content script de rodar os intervalos dele antes de afirmar a ausência.
  await page.waitForTimeout(1500);
  await expect(page.locator('#btn-minerador-pro')).toHaveCount(0);
  expect(await extensao.frases()).toEqual([]);
});

test('com a sessão semeada, a frase minerada chega ao Firestore da conta', async ({ page, paginas, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-sync' });
  await page.goto(paginas.url('player.html'));
  await expect(page.locator('#btn-minerador-pro')).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(() => fakes.google.frasesDe('uid-sync').map(f => f.texto)).toContain(LEGENDA);
  await expect.poll(async () => (await extensao.lerStorage({ pm_pending_sync: [] })).pm_pending_sync).toEqual([]);
});

test('a Palavra é detectada pelo vocabulário que a Conexão com o Anki devolve', async ({ page, paginas, extensao, fakes }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  await page.goto(paginas.url('player.html'));
  await expect(page.locator('#btn-minerador-pro')).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  await expect.poll(async () => (await extensao.frases()).find(f => f.texto === LEGENDA)).toMatchObject({
    keywords: [expect.stringMatching(/^gulls@/)],
    autoKeyword: true,
  });
});
