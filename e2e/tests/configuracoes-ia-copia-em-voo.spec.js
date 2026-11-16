'use strict';

const { test, expect } = require('../fixtures');

const CHAVE = 'sk-proj-chave-de-exemplo-9f3a';
const OUTRA_CHAVE = 'sk-proj-OutraChaveDoTeste0987654321-wxyz';

const card = page => page.locator('#cfg-ia');
const corpo = page => card(page).locator('.cfg-corpo');
const campo = page => card(page).getByRole('textbox', { name: 'Chave da OpenAI' });

const chaveNoBancoDaExtensao = page => page.evaluate(() => new Promise((resolver, rejeitar) => {
  const pedido = indexedDB.open('pm-segredos', 1);
  pedido.onupgradeneeded = () => pedido.result.createObjectStore('chaves');
  pedido.onerror = () => rejeitar(pedido.error);
  pedido.onsuccess = () => {
    const leitura = pedido.result.transaction('chaves').objectStore('chaves').get('openai');
    leitura.onsuccess = () => resolver(leitura.result || '');
  };
}));

async function colarEConferir(page, chave) {
  await campo(page).fill(chave);
  await card(page).getByRole('button', { name: 'Conferir e salvar' }).click();
}

test('S3: com uma chave nova a caminho, o outro lugar do card não diz que a Conexão guarda a cópia', async ({ page, extensao, fakes }) => {
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await colarEConferir(page, CHAVE);
  await expect(corpo(page)).toContainText('A Conexão com o Anki guarda a chave.');

  let liberar;
  fakes.anki.responder('POST', '/ia/openai/chave', req => new Promise(resolver => {
    liberar = () => {
      fakes.anki.guardarChaveNaConexao('wxyz', req.postDataJSON().versao);
      resolver({ status: 200, json: { ok: true, ultimos4: 'wxyz' } });
    };
  }));
  await card(page).getByRole('button', { name: 'Trocar chave' }).click();
  await colarEConferir(page, OUTRA_CHAVE);
  await expect(card(page).getByRole('button', { name: 'Conferindo a chave…' })).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => typeof liberar).toBe('function');

  await page.goto(extensao.url('painel.html#boas-vindas/ia'));
  const passo = page.locator('.bv-card');
  await expect(passo.getByText('Chave conferida', { exact: true })).toBeVisible();
  await expect(passo).not.toContainText('A Conexão com o Anki guarda a chave.');
  await expect(passo).not.toContainText('cópia da chave');

  liberar();
  await expect(passo.getByText('••••••••wxyz')).toBeVisible();
  expect(fakes.anki.chaveNaConexao()).toMatch(/wxyz$/);
  expect(await extensao.lerStorage('pm_chave_openai')).toMatchObject({ pm_chave_openai: { ultimos4: 'wxyz' } });
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
});
