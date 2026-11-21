'use strict';

require('../lib/historico.js');
const { tombstonesDoSync, PREFIXO_DO_TOMBSTONE } = globalThis.PerpetualMiner.ListasPendentes;

let falhas = 0;
function assert(condicao, rotulo) {
  console.log(`  ${condicao ? '✓' : '✗ FALHOU:'} ${rotulo}`);
  if (!condicao) falhas++;
}
const clone = v => JSON.parse(JSON.stringify(v));
const chave = id => `${PREFIXO_DO_TOMBSTONE}${id}`;
const DIA = 24 * 60 * 60 * 1000;

function syncDeTeste(guardado = {}) {
  const ordem = [];
  const sync = {
    get: () => Promise.resolve(clone(guardado)),
    set: itens => { ordem.push('set'); Object.assign(guardado, itens); return Promise.resolve(); },
    remove: chaves => { ordem.push('remove'); [].concat(chaves).forEach(c => delete guardado[c]); return Promise.resolve(); },
  };
  return { sync, guardado, ordem };
}

const tombstonesGuardados = guardado => Object.keys(guardado).filter(c => c.startsWith(PREFIXO_DO_TOMBSTONE));

async function quandoNaoCabeRemoveAntesDeGravar() {
  console.log('\nSync que não cabe nos 512: remove os velhos antes de gravar; ficam os 500 mais novos');
  const velhos = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [chave(i + 1), 1001 + i]));
  const { sync, guardado, ordem } = syncDeTeste({ ...velhos, outra_chave: 1 });
  await tombstonesDoSync({ sync, agora: () => 5000 }).marcar(Array.from({ length: 495 }, (_, i) => 100000 + i));
  assert(ordem.join() === 'remove,set', '515 não cabem: remove antes de gravar');
  assert(tombstonesGuardados(guardado).length === 500, 'o sync fica com 500 tombstones');
  assert([16, 17, 18, 19, 20].every(id => chave(id) in guardado), 'dos velhos ficam os 5 apagados por último');
  assert(!(chave(15) in guardado), 'e o sexto mais novo sai');
  assert(guardado.outra_chave === 1, 'o que não é tombstone fica');
}

async function quandoCabeGravaAntesDeRemover() {
  console.log('\nSync que cabe nos 512: grava antes de remover');
  const { sync, ordem } = syncDeTeste({ [chave(1)]: 1000 });
  await tombstonesDoSync({ sync, agora: () => 5000 }).marcar([2]);
  assert(ordem.join() === 'set,remove', 'grava, depois remove (nada)');
}

async function maisDeQuinhentosIdsFicamOsMaiores() {
  console.log('\nMais de 500 ids: vão os 500 maiores, com a hora de agora');
  const { sync, guardado } = syncDeTeste();
  await tombstonesDoSync({ sync, agora: () => 5000 }).marcar(Array.from({ length: 600 }, (_, i) => i + 1));
  assert(Object.keys(guardado).length === 500, 'o sync fica com 500 tombstones');
  assert(chave(101) in guardado, 'o id 101 fica');
  assert(!(chave(100) in guardado), 'o id 100 não entra');
  assert(Object.values(guardado).every(v => v === 5000), 'cada um com a hora do apagar');
}

async function lerTiraOExpirado() {
  console.log('\nLer: o que passou dos 30 dias sai do sync, o resto volta como id');
  const { sync, guardado } = syncDeTeste({ [chave(1)]: 11 * DIA, [chave(2)]: 9 * DIA, outra_chave: 1 });
  const lidos = await tombstonesDoSync({ sync, agora: () => 40 * DIA }).ler();
  assert(JSON.stringify([...lidos]) === '["1"]', 'só o id dentro dos 30 dias');
  assert(!(chave(2) in guardado), 'o expirado sai');
  assert(guardado.outra_chave === 1, 'o que não é tombstone fica');
}

async function lerSemExpiradoNaoRemove() {
  console.log('\nLer sem expirado: não remove nada');
  const { sync, ordem } = syncDeTeste({ [chave(1)]: 39 * DIA });
  const lidos = await tombstonesDoSync({ sync, agora: () => 40 * DIA }).ler();
  assert(lidos.has('1'), 'o id volta');
  assert(ordem.length === 0, 'nenhum remove');
}

async function limparTiraOTombstone() {
  console.log('\nLimpar: tira o tombstone do id e deixa os outros');
  const { sync, guardado } = syncDeTeste({ [chave(1)]: 1000, [chave(2)]: 1000 });
  await tombstonesDoSync({ sync, agora: () => 5000 }).limpar([1]);
  assert(!(chave(1) in guardado), 'o do id 1 sai');
  assert(chave(2) in guardado, 'o do id 2 fica');
}

async function rodar() {
  const casos = [quandoNaoCabeRemoveAntesDeGravar, quandoCabeGravaAntesDeRemover, maisDeQuinhentosIdsFicamOsMaiores,
    lerTiraOExpirado, lerSemExpiradoNaoRemove, limparTiraOTombstone];
  for (const caso of casos) await caso();
  console.log(falhas ? `\n${falhas} FALHARAM` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
}

rodar().catch(err => { console.error(err); process.exit(1); });
