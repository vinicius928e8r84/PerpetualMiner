'use strict';

const { test, expect } = require('../fixtures');

const card = page => page.locator('#cfg-ia');
const resumo = page => card(page).locator('.cfg-resumo');

const guardarNoBancoAntigo = page => page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('pm-segredos', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('chaves');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result, tx = db.transaction('chaves', 'readwrite'), loja = tx.objectStore('chaves');
    loja.put('sk-fake-legado-aaaa', 'openai'); loja.put('A', 'openai-conta'); loja.put(100, 'openai-em');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  };
}));

const segredosLocais = page => page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('pm-segredos', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('chaves');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result, tx = db.transaction('chaves'), valores = tx.objectStore('chaves').getAll();
    tx.oncomplete = () => { db.close(); resolve(valores.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  };
}));

test('legado com a pessoa já vinculada a uma Conta: a chave antiga não vai à Conexão, a da Conta fica e o segredo antigo sai do navegador', async ({ page, extensao, fakes }) => {
  fakes.anki.guardarChaveNaConexao('bbbb', { versao: 3, conta: 'A', em: 100, naoEnviada: false });
  await extensao.semearSessao({ uid: 'A' });
  await page.goto(extensao.url('manifest.json'));
  await guardarNoBancoAntigo(page);

  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await expect(card(page)).toBeVisible();

  await expect(resumo(page)).toHaveText('••••••••bbbb');
  await expect.poll(() => segredosLocais(page)).toEqual([]);
  expect(fakes.anki.chaveNaConexao()?.endsWith('bbbb')).toBe(true);
  expect(fakes.anki.estadoDaChave()).toMatchObject({ versao: 3, conta: 'A' });
  expect(fakes.anki.requisicoes.filter(p => p.caminho === '/ia/openai/legado')).toEqual([]);
});
