/**
 * test_sync_reforco.js — O sync do Chrome e as listas de retry são reforço
 *
 * Execução: node test_sync_reforco.js
 *
 * A recusa do chrome.storage (lastError) rejeita; a falha do sync e das listas de retry vai
 * para o `aviso` sem derrubar o apagar nem apagar a lista; o sync cheio fica com as 500 mais novas.
 */

'use strict';

const { criarSincronizacao, armazenamentoDoChrome, PREFIXO_DO_TOMBSTONE } = require('./lib/sincronizacao.js');

let falhas = 0;
function assert(condicao, rotulo) {
  console.log(`  ${condicao ? '✓' : '✗ FALHOU:'} ${rotulo}`);
  if (!condicao) falhas++;
}
const clone = v => JSON.parse(JSON.stringify(v));

async function rodar() {
  console.log('\nlastError: o que o Chrome recusa rejeita com a mensagem dele');
  const area = { get: (k, cb) => cb({}), set: (i, cb) => cb(), remove: (k, cb) => cb() };
  const { local } = armazenamentoDoChrome({ local: area, sync: area });
  globalThis.chrome = { runtime: { lastError: { message: 'QUOTA_BYTES_PER_ITEM quota exceeded' } } };
  let recusa = null;
  try { await local.set({ b: 2 }); } catch (e) { recusa = e; }
  delete globalThis.chrome;
  assert(recusa?.message === 'QUOTA_BYTES_PER_ITEM quota exceeded', 'o set rejeita com o lastError');

  console.log('\nReforço: a falha vai para o aviso, sem apagar o que já estava guardado');
  const dados = { pm_deleted_ids: [7, 8] };
  const avisos = [];
  const recusar = () => Promise.reject(new Error('disco cheio'));
  let lerFalha = true;
  const localFalho = {
    get: () => (lerFalha ? recusar() : Promise.resolve(clone(dados))),
    set: itens => { Object.assign(dados, clone(itens)); return Promise.resolve(); },
    remove: () => Promise.resolve(),
  };
  const syncFalho = { get: () => Promise.resolve({}), set: recusar, remove: () => Promise.resolve() };
  const sinc = criarSincronizacao({
    nuvem: null, armazenamento: { local: localFalho, sync: syncFalho }, aviso: (m, e) => avisos.push([m, e.message]),
  });
  assert(await sinc.apagar([9]) === null, 'o sync recusar não derruba o apagar');
  assert(avisos.some(([, m]) => m === 'disco cheio'), 'a falha do sync vai para o aviso');
  assert(JSON.stringify(dados.pm_deleted_ids) === '[7,8]', 'a leitura da lista falhar pula a escrita: pm_deleted_ids não é sobrescrita');
  lerFalha = false;
  await sinc.apagar([9]);
  assert(JSON.stringify(dados.pm_deleted_ids) === '[7,8,"9"]', 'com a leitura de volta, o id novo entra na lista');

  console.log('\nSync cheio: grava os novos antes de remover os velhos; ficam 500');
  const noSync = {};
  for (let i = 1; i <= 10; i++) noSync[`${PREFIXO_DO_TOMBSTONE}${i}`] = 1000 + i;
  const quando = [];
  const sync = {
    get: () => Promise.resolve(clone(noSync)),
    set: itens => { quando.push('set'); Object.assign(noSync, itens); return Promise.resolve(); },
    remove: chaves => { quando.push('remove'); for (const c of chaves) delete noSync[c]; return Promise.resolve(); },
  };
  const cheio = criarSincronizacao({
    nuvem: null, armazenamento: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve(), remove: () => Promise.resolve() }, sync },
    agora: () => 5000,
  });
  await cheio.apagar(Array.from({ length: 495 }, (_, i) => 100000 + i));
  assert(Object.keys(noSync).length === 500, 'o sync fica com 500 tombstones');
  assert(quando.join() === 'set,remove', 'coube nos 512: grava antes de remover');

  console.log(falhas ? `\n${falhas} FALHARAM` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
}

rodar().catch(err => { console.error(err); process.exit(1); });
