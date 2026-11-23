'use strict';

const { test, expect } = require('../fixtures');

const abrirBanco = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('pm-segredos', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('chaves');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => resolve(req.result);
});

const guardarLegado = page => page.evaluate(async abrir => {
  const db = await (0, eval)(`(${abrir})`)();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('chaves', 'readwrite'), loja = tx.objectStore('chaves');
    loja.put('sk-fake-legado-dddd', 'openai'); loja.put('A', 'openai-conta'); loja.put(100, 'openai-em');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}, abrirBanco.toString());

const segredosLocais = page => page.evaluate(async abrir => {
  const db = await (0, eval)(`(${abrir})`)();
  const valores = await new Promise((resolve, reject) => {
    const req = db.transaction('chaves').objectStore('chaves').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return valores;
}, abrirBanco.toString());

test('legado com o dono já vinculado a uma conta: o segredo antigo some e a Conexão fica como estava', async ({ page, extensao, fakes }) => {
  fakes.anki.guardarChaveNaConexao('cccc', 3, 'A', 100, false);
  const daConexao = fakes.anki.chaveNaConexao();
  await extensao.semearSessao({ uid: 'A' });
  await page.goto(extensao.url('manifest.json'));
  await guardarLegado(page);

  await page.goto(extensao.url('painel.html#configuracoes/ia'));

  const card = page.locator('#cfg-ia');
  await expect(card.locator('.cfg-resumo')).toHaveText('••••••••cccc');
  await expect.poll(() => segredosLocais(page)).toEqual([]);
  expect(fakes.anki.chaveNaConexao() === daConexao).toBe(true);
  expect(fakes.anki.estadoDaChave()).toEqual(expect.objectContaining({ versao: 3, conta: 'A' }));
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai).toEqual(expect.objectContaining({ ultimos4: 'cccc', conta: 'A', versao: 3 }));
});
