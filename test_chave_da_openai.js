'use strict';

// Public seams: real ChaveDaOpenAI + real sync in two independent JS contexts.
// Only Chrome storage, IndexedDB and HTTP are fakes. No real credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { criarSincronizacaoDaChave } = require('./lib/sincronizacao');

function computador() {
  const itens = new Map();
  const local = {};
  let aoAbrir = null;
  let aberturas = 0;
  let copia = '';
  // Each transaction reads a single snapshot; writes commit atomically.
  const indexedDB = { open() {
    const pedido = {};
    const numero = ++aberturas;
    setImmediate(async () => {
      if (aoAbrir) await aoAbrir(numero);
      pedido.result = { close() {}, transaction(_loja, modo) {
        const snapshot = new Map(itens);
        const tx = {};
        const loja = {
          get(item) {
            const req = {};
            queueMicrotask(() => { req.result = snapshot.get(item); req.onsuccess?.(); });
            return req;
          },
          getAllKeys() {
            const req = {};
            queueMicrotask(() => { req.result = [...snapshot.keys()]; req.onsuccess?.(); });
            return req;
          },
          getAll() {
            const req = {};
            queueMicrotask(() => { req.result = [...snapshot.values()]; req.onsuccess?.(); });
            return req;
          },
          put(valor, item) { snapshot.set(item, valor); },
          delete(item) { snapshot.delete(item); },
        };
        tx.objectStore = () => loja;
        setImmediate(() => {
          if (modo === 'readwrite') { itens.clear(); for (const [k, v] of snapshot) itens.set(k, v); }
          tx.oncomplete?.();
        });
        return tx;
      } };
      pedido.onsuccess?.();
    });
    return pedido;
  } };
  const storage = { async get(pedidas) {
    return Object.fromEntries(Object.entries(pedidas).map(([k, padrao]) => [k, local[k] ?? padrao]));
  }, async set(dados) { Object.assign(local, dados); }, async remove(k) { delete local[k]; } };
  const contexto = vm.createContext({ indexedDB, chrome: { storage: { local: storage } }, AbortSignal, Date,
    fetch: async (_url, opcoes) => {
      const dados = JSON.parse(opcoes.body);
      if (_url.endsWith('/apagar')) copia = '';
      else if (_url.endsWith('/chave')) copia = dados.chave;
      const json = _url.endsWith('/estado') ? { openai: { configurada: !!copia, ultimos4: copia.slice(-4) } }
        : { ok: true, ultimos4: copia.slice(-4) };
      return { status: 200, json: async () => json };
    }, PerpetualMiner: { ConexaoAnki: { ENDERECO: 'http://fake' } } });
  for (const arquivo of ['lib/pedido-ao-anki.js', 'lib/chave-da-openai.js']) {
    vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);
  }
  return { chave: contexto.PerpetualMiner.ChaveDaOpenAI, local, itens,
    copia: () => copia,
    aoAbrir(fn) { aberturas = 0; aoAbrir = fn; } };
}
const FAKE = 'sk-fake-canario-zz99';

test('P1: PATCH recusado preserva a pendência de A quando B tem outra chave', async () => {
  const pc = computador();
  pc.local.pm_user_info = { uid: 'A' };
  await pc.chave.confirmar(FAKE);
  const emA = (await pc.chave.daqui.ler()).em;
  const documentos = { B: { chave: 'sk-fake-conta-B-aaaa', em: emA + 10 } };
  let recusar = true;
  const sync = uid => criarSincronizacaoDaChave({ daqui: pc.chave.daqui, nuvem: {
    uid, async lerChaveDaOpenAI() { return documentos[uid] || null; },
    async gravarChaveDaOpenAI(valor) { if (recusar) throw new Error('503'); documentos[uid] = valor; },
  } }).sincronizar();
  await assert.rejects(sync('A'));
  pc.local.pm_user_info = { uid: 'B' };
  recusar = false;
  await sync('B');
  pc.local.pm_user_info = { uid: 'A' };
  await sync('A');
  assert.equal(documentos.A?.chave === FAKE, true);
  assert.equal(documentos.B.chave === FAKE, false);
});

test('F4: Apagar tudo remove segredos de todas as pendências e não os revive ao voltar às contas', async () => {
  const pc = computador();
  const docs = {};
  const sync = uid => criarSincronizacaoDaChave({ daqui: pc.chave.daqui, nuvem: {
    uid, async lerChaveDaOpenAI() { return docs[uid] || null; },
    async gravarChaveDaOpenAI(valor) { docs[uid] = structuredClone(valor); },
  } }).sincronizar();
  for (const uid of ['A', 'B', 'C']) {
    pc.local.pm_user_info = { uid };
    await pc.chave.confirmar(`sk-fake-${uid}-zz99`);
  }
  await pc.chave.apagar({ comConta: true, mesmoSemChave: true });
  assert.equal([...pc.itens.values()].some(v => typeof v === 'string' ? v.startsWith('sk-fake-') : Boolean(v?.chave)), false);
  assert.equal(docs.A, undefined); // No authorization to other accounts yet.
  for (const uid of ['C', 'A', 'B']) {
    pc.local.pm_user_info = { uid };
    await sync(uid);
    await pc.chave.conferirACopia();
    assert.equal((await pc.chave.daqui.ler()).chave, '');
    assert.equal(pc.copia(), '');
    assert.equal(docs[uid]?.chave, '');
  }
});

test('P2: a leitura da versão abre uma única transação, sem combinar chave antiga com tombstone', async () => {
  const pc = computador();
  await pc.chave.confirmar(FAKE);
  pc.aoAbrir(async numero => {
    if (numero === 2) {
      pc.itens.delete('openai');
      pc.itens.set('openai-em', 9999999999999);
    }
  });
  const lida = await pc.chave.daqui.ler();
  assert.equal(lida.chave === FAKE && lida.em === 9999999999999, false);
});

test('P2: apagamento durante a leitura da nuvem impede a subida da versão antiga', async () => {
  const pc = computador();
  pc.local.pm_user_info = { uid: 'A' };
  await pc.chave.confirmar(FAKE);
  let liberar;
  const espera = new Promise(resolve => { liberar = resolve; });
  let subiu = false;
  const nuvem = { uid: 'A', async lerChaveDaOpenAI() { await espera; return null; },
    async gravarChaveDaOpenAI() { subiu = true; } };
  const rodando = criarSincronizacaoDaChave({ nuvem, daqui: pc.chave.daqui }).sincronizar();
  await new Promise(resolve => setTimeout(resolve, 20));
  await pc.chave.apagar({ comConta: true });
  liberar();
  await rodando;
  assert.equal(subiu, false);
});

test('P5: dois cofres reais recebem chave e tombstone pelo sync e reconciliam via HTTP', async () => {
  const a = computador(), b = computador();
  a.local.pm_user_info = b.local.pm_user_info = { uid: 'A' };
  let documento = null;
  const nuvem = { uid: 'A', async lerChaveDaOpenAI() { return documento; },
    async gravarChaveDaOpenAI(valor) { documento = structuredClone(valor); } };
  const sync = pc => criarSincronizacaoDaChave({ nuvem, daqui: pc.chave.daqui }).sincronizar();
  await a.chave.confirmar(FAKE);
  await sync(a);
  await sync(b);
  await b.chave.conferirACopia();
  assert.equal(b.copia() === FAKE, true);
  await a.chave.apagar({ comConta: true });
  await sync(a);
  await sync(b);
  await b.chave.conferirACopia();
  assert.equal((await b.chave.daqui.ler()).chave, '');
  assert.equal(b.copia(), '');
  assert.equal(documento.chave, '');
});
