'use strict';

// Bug de #9: "Deletar" no popup só apagava deste computador. Com a conta
// conectada, a frase continuava no Firestore, sem tombstone, e voltava ao
// histórico na próxima sincronização do painel.

const { test, expect } = require('../fixtures');

const APAGAR = 'The lighthouse keeper forgot to wind the lamp.';
const FICA = 'Snow gathered quietly on the station platform.';

async function minerar(page, textos) {
  return page.evaluate(lista => Promise.all(lista.map(texto =>
    chrome.runtime.sendMessage({
      type: 'SALVAR_HISTORICO',
      texto,
      origem: 'manual',
      idioma: 'Inglês',
      contexto: { fonte: 'manual', titulo: 'Manual Input', detalhe: '' },
    }),
  )), textos);
}

async function apagarNoPopup(page, extensao, texto) {
  await page.goto(extensao.url('popup.html'));
  await page.locator('.card-frase', { hasText: texto }).locator('.chk-frase').check();
  await page.locator('#btnDeleteSelected').click();
  await expect(page.locator('#listaUltimas')).not.toContainText(texto);
}

async function sincronizarNoPainel(page, extensao) {
  await page.goto(extensao.url('painel.html'));
  await expect(page.locator('#sync-status')).toHaveText(/Sincronizado/);
}

test('com a conta conectada, a frase apagada no popup sai da nuvem e não volta na sincronização', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-popup' });
  await page.goto(extensao.url('popup.html'));
  const [apagada] = await minerar(page, [APAGAR, FICA]);
  await expect.poll(() => fakes.google.frasesDe('uid-popup').length).toBe(2);

  await apagarNoPopup(page, extensao, APAGAR);

  await expect.poll(() => fakes.google.frasesDe('uid-popup').map(f => f.texto)).toEqual([FICA]);
  await expect.poll(() => fakes.google.apagadasDe('uid-popup')).toEqual([String(apagada.frase.id)]);

  await sincronizarNoPainel(page, extensao);
  await expect(page.locator('#total-count')).toHaveText('1');
  await expect(page.getByText(FICA)).toBeVisible();
  await expect(page.getByText(APAGAR)).toHaveCount(0);
  expect((await extensao.frases()).map(f => f.texto)).toEqual([FICA]);
});

test('apagada no popup, a frase não volta de outro computador que ainda a tem no histórico local', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-outro' });
  await page.goto(extensao.url('popup.html'));
  const [apagada] = await minerar(page, [APAGAR]);
  await expect.poll(() => fakes.google.frasesDe('uid-outro').length).toBe(1);

  await apagarNoPopup(page, extensao, APAGAR);
  await expect.poll(() => fakes.google.apagadasDe('uid-outro')).toEqual([String(apagada.frase.id)]);

  // O outro computador: tem a frase no histórico local e o Chrome sync ainda
  // não trouxe a deleção. Só o tombstone na nuvem impede que ela seja reenviada.
  await extensao.serviceWorker.evaluate(() => chrome.storage.sync.clear());
  await extensao.gravarStorage({ frases: [apagada.frase], pm_deleted_ids: [], pm_pending_sync: [] });

  await sincronizarNoPainel(page, extensao);
  await expect(page.locator('#total-count')).toHaveText('0');
  await expect(page.getByText(APAGAR)).toHaveCount(0);
  expect(fakes.google.frasesDe('uid-outro')).toEqual([]);
  expect(await extensao.frases()).toEqual([]);
});

test('sem conta, apagar no popup tira a frase só deste computador', async ({ page, extensao, fakes }) => {
  await page.goto(extensao.url('popup.html'));
  await minerar(page, [APAGAR, FICA]);

  await apagarNoPopup(page, extensao, APAGAR);

  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([FICA]);
  await page.reload();
  await expect(page.locator('#listaUltimas')).toContainText(FICA);
  await expect(page.locator('#listaUltimas')).not.toContainText(APAGAR);
  expect(fakes.google.requisicoes.filter(r => r.url.includes('firestore.googleapis.com'))).toEqual([]);
});
