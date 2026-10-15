/**
 * test_sync.js — A sincronização de verdade, entre dois computadores
 *
 * Execução: node test_sync.js
 *
 * Carrega lib/sincronizacao.js (o mesmo arquivo que o painel e o service worker
 * carregam) e liga dois computadores (A e B) a uma nuvem em memória e a um
 * chrome.storage.sync compartilhado, cada um com o seu chrome.storage.local.
 * A seam é a nuvem: aqui ela é a memória; na extensão e nos e2e, o REST do
 * Firestore (as últimas seções do teste cobrem esse adaptador com um fetch falso).
 *
 * A chave da OpenAI que acompanha a conta (#154) tem a sua parte: cada computador tem o seu
 * cofre (a chave na extensão e a cópia da Conexão dele) e os dois dividem a mesma nuvem.
 * As chaves aqui são de mentira.
 */

'use strict';

const { criarSincronizacao, criarSessao, nuvemHttp, armazenamentoDoChrome, paraCampos, deCampos,
  tombstoneFirestore, tombstonesSync, MOTIVO, TTL_DO_TOMBSTONE, PREFIXO_DO_TOMBSTONE } = require('./lib/sincronizacao.js');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan:  '\x1b[36m', gray: '\x1b[90m', blue: '\x1b[34m',
};
const ok   = (msg) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const fail = (msg) => console.log(`  ${C.red}✗ FALHOU: ${msg}${C.reset}`);
const info = (msg) => console.log(`  ${C.gray}  ${msg}${C.reset}`);
const head = (msg) => console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}`);
const sep  = ()    => console.log(`${C.gray}${'─'.repeat(60)}${C.reset}`);

let passed = 0, failed = 0;

function assert(condition, label) {
  if (condition) { ok(label); passed++; }
  else           { fail(label); failed++; }
}

const clone = (v) => JSON.parse(JSON.stringify(v));

function areaEmMemoria(dados) {
  return {
    async get(chaves) {
      if (chaves === null) return clone(dados);
      const pedidas = typeof chaves === 'string' ? { [chaves]: undefined }
        : Array.isArray(chaves) ? Object.fromEntries(chaves.map(k => [k, undefined])) : chaves;
      const resultado = {};
      for (const [k, padrao] of Object.entries(pedidas)) {
        if (k in dados) resultado[k] = clone(dados[k]);
        else if (padrao !== undefined) resultado[k] = padrao;
      }
      return resultado;
    },
    async set(itens) { for (const [k, v] of Object.entries(itens)) dados[k] = clone(v); },
    async remove(chaves) { for (const k of [].concat(chaves)) delete dados[k]; },
  };
}

// O que a nuvem guarda, compartilhado entre A e B, e o que ela está fazendo de errado.
let firestore     = {};   // { phraseId: phrase }
let firestoreTomb = {};   // { phraseId: deletedAt }  (usuarios/{uid}/meta/deleted)
let nuvemFalha    = {};   // { apagar, gravarFrases, gravarFrase, listar, chave }: true = a nuvem recusa

function nuvemEmMemoria(uid = 'uid-teste') {
  const recusar = (qual) => { if (nuvemFalha[qual]) throw new Error(`nuvem fora do ar (${qual})`); };
  return {
    uid,
    async listarFrases() { recusar('listar'); return Object.values(firestore).map(clone); },
    async gravarFrase(frase) { recusar('gravarFrase'); firestore[String(frase.id)] = clone(frase); },
    async gravarFrases(frases) { recusar('gravarFrases'); for (const f of frases) firestore[String(f.id)] = clone(f); },
    async apagarFrases(ids) { recusar('apagar'); for (const id of ids) delete firestore[String(id)]; },
    async lerTombstones() { return new Map(Object.entries(firestoreTomb).map(([id, em]) => [id, Number(em)])); },
    async gravarTombstones(ids, apagadaEm) { for (const id of ids) firestoreTomb[String(id)] = apagadaEm; },
  };
}

let storageSync   = {};   // chrome.storage.sync   — compartilhado entre A e B
let storageLocalA = {};   // chrome.storage.local do computador A
let storageLocalB = {};   // chrome.storage.local do computador B
let computadores  = new Map();   // storage local → { sinc, nuvem, daqui, sincDaChave }
let _phraseCounter = 0;

function ligar(storageLocal, { semConta = false, uid = 'uid-teste' } = {}) {
  const nuvem = semConta ? null : nuvemEmMemoria(uid);
  const sinc = criarSincronizacao({
    nuvem,
    armazenamento: { local: areaEmMemoria(storageLocal), sync: areaEmMemoria(storageSync) },
  });
  computadores.set(storageLocal, { sinc, nuvem });
}

function resetState() {
  firestore = {}; firestoreTomb = {}; nuvemFalha = {};
  storageSync = {}; storageLocalA = {}; storageLocalB = {};
  computadores = new Map();
  _phraseCounter = 0;
  ligar(storageLocalA);
  ligar(storageLocalB);
}

const de = (storage) => computadores.get(storage);

function getLocal(storage, defaults) {
  const result = {};
  for (const [k, v] of Object.entries(defaults)) result[k] = k in storage ? clone(storage[k]) : v;
  return result;
}
function setLocal(storage, data) {
  for (const [k, v] of Object.entries(data)) storage[k] = clone(v);
}

/** O painel apaga: tira da tela e do local, e a sincronização grava os tombstones e apaga da nuvem. */
async function removerFrases(storage, ids, { firestoreFailure = false } = {}) {
  nuvemFalha.apagar = firestoreFailure;
  const erro = await de(storage).sinc.apagar(ids);
  nuvemFalha.apagar = false;
  return !erro;
}

/** O painel abre: a lista que ele mostraria. `atuais` é o que já está na tela. */
async function carregarFrases(storage, { atuais = [] } = {}) {
  const resultado = await de(storage).sinc.carregar({ atuais: () => atuais });
  await resultado.concluida;
  return resultado.frases;
}

/**
 * A captura (content.js → background.js): grava no local e marca como pendente
 * ANTES de tentar a nuvem; se a nuvem aceita, tira a marca.
 * @param {boolean} opts.syncFails    — a nuvem recusa
 * @param {boolean} opts.syncInFlight — o envio ainda não completou (frase só no local)
 */
async function capturarFrase(storage, texto, { syncFails = false, syncInFlight = false } = {}) {
  const frase = { texto, data: '06/04/2026', streaming: 'youtube', id: Date.now() + (++_phraseCounter), idioma: 'Inglês' };
  const { frases = [], pm_pending_sync = [] } = getLocal(storage, { frases: [], pm_pending_sync: [] });
  setLocal(storage, { frases: [frase, ...frases], pm_pending_sync: [...new Set([...pm_pending_sync, String(frase.id)])] });

  if (!syncFails && !syncInFlight) {
    await de(storage).nuvem.gravarFrase(frase);
    const { pm_pending_sync: ps } = getLocal(storage, { pm_pending_sync: [] });
    setLocal(storage, { pm_pending_sync: ps.filter(id => id !== String(frase.id)) });
  }
  return frase;
}

/**
 * Adição manual pelo painel (salvarMultiAdd/importarArquivoTxt): salva no local e
 * tenta a nuvem, sem pm_pending_sync. A falha é recuperada na próxima abertura do painel.
 */
async function adicionarFraseManual(storage, texto, { syncFails = false } = {}) {
  const frase = { texto, data: '06/04/2026', streaming: 'manual', id: Date.now() + (++_phraseCounter), idioma: 'Inglês' };
  const { frases = [] } = getLocal(storage, { frases: [] });
  setLocal(storage, { frases: [frase, ...frases] });
  if (!syncFails) await de(storage).nuvem.gravarFrase(frase);
  return frase;
}

/** Apagar uma frase pelo painel */
async function deletarFrase(storage, id, opts = {}) {
  await removerFrases(storage, [id], opts);
  const { frases = [] } = getLocal(storage, { frases: [] });
  setLocal(storage, { frases: frases.filter(f => f.id !== id) });
}

function fraseVisivel(frases, texto) {
  return frases.some(f => f.texto === texto);
}
function idNoFirestore(id) {
  return String(id) in firestore;
}
function idNoPendingSync(storage, id) {
  const { pm_pending_sync = [] } = getLocal(storage, { pm_pending_sync: [] });
  return pm_pending_sync.includes(String(id));
}
/** Os ids marcados em pm_del_{id} no chrome.storage.sync. */
async function lerTombstoneSync() {
  const itens = await areaEmMemoria(storageSync).get(null);
  return new Set(Object.keys(itens).filter(k => k.startsWith(PREFIXO_DO_TOMBSTONE)).map(k => k.slice(PREFIXO_DO_TOMBSTONE.length)));
}
async function idNoTombstoneSync(id) {
  return (await lerTombstoneSync()).has(String(id)) || String(id) in firestoreTomb;
}

async function rodar() {
resetState();

head('CENÁRIO 1 — Adição no dispositivo A aparece no dispositivo B');
sep();
await (async () => {
  resetState();
  const fa = await capturarFrase(storageLocalA, 'Hello world');
  const visB = await carregarFrases(storageLocalB);

  assert(idNoFirestore(fa.id),              'frase está no Firestore após captura');
  assert(fraseVisivel(visB, 'Hello world'), 'frase aparece no painel do dispositivo B');
  info(`Firestore tem ${Object.keys(firestore).length} doc(s)`);
})();

head('CENÁRIO 2 — Deleção no dispositivo A desaparece do dispositivo B (cenário principal)');
sep();
await (async () => {
  resetState();
  // Setup: frase existe em ambos
  const frase = await capturarFrase(storageLocalA, 'To delete');
  await carregarFrases(storageLocalB); // B sincroniza, vê a frase

  // A deleta
  await deletarFrase(storageLocalA, frase.id);

  // B abre o painel
  const visB = await carregarFrases(storageLocalB);

  assert(!idNoFirestore(frase.id),            'frase removida do Firestore');
  assert(!fraseVisivel(visB, 'To delete'),    'frase NÃO aparece no painel do B após deleção em A');
  // Tombstone fica ativo por 30 dias (expira naturalmente; só é limpo se frase ainda estava no Firestore)
  assert(await idNoTombstoneSync(frase.id),         'tombstone ainda ativo após B processar (expira em 30 dias)');
  info(`Firestore tem ${Object.keys(firestore).length} doc(s)`);
})();

head('CENÁRIO 3 — O bug original: frase pendente em B, deletada em A');
sep();
await (async () => {
  resetState();
  // B captura frase mas o sync com Firestore falha → fica em pm_pending_sync
  const frase = await capturarFrase(storageLocalB, 'Pendente no B', { syncFails: true });

  assert(!idNoFirestore(frase.id),                'frase NÃO está no Firestore (sync falhou)');
  assert(idNoPendingSync(storageLocalB, frase.id),'frase está em pm_pending_sync do B');

  // A de alguma forma sabe da frase (ex: subiu depois por outro meio) e deleta
  await nuvemEmMemoria().gravarFrase(frase); // coloca no Firestore manualmente para simular que chegou
  await deletarFrase(storageLocalA, frase.id);

  assert(!idNoFirestore(frase.id),               'frase deletada do Firestore por A');
  assert(await idNoTombstoneSync(frase.id),            'id está no tombstone sync após deleção em A');

  // B abre o painel — SEM o fix, re-subiria a frase
  const visB = await carregarFrases(storageLocalB);

  assert(!idNoFirestore(frase.id),               'frase NÃO foi re-subida ao Firestore por B');
  assert(!fraseVisivel(visB, 'Pendente no B'),   'frase NÃO aparece no painel do B');
  assert(!idNoPendingSync(storageLocalB, frase.id), 'pm_pending_sync limpo (sem leak)');
  info(`Tombstone size: ${(await lerTombstoneSync()).size}`);
})();

head('CENÁRIO 4 — Deleção offline em A: retry quando B abre o painel');
sep();
await (async () => {
  resetState();
  const frase = await capturarFrase(storageLocalA, 'Offline delete');

  // A tenta deletar mas Firestore falha → fica em pm_deleted_ids E pm_deleted_sync
  await deletarFrase(storageLocalA, frase.id, { firestoreFailure: true });

  assert(idNoFirestore(frase.id),             'frase ainda no Firestore (delete falhou)');
  assert(await idNoTombstoneSync(frase.id),         'id está no tombstone sync');

  // B abre o painel → tombstone sync ativa → B deleta do Firestore
  const visB = await carregarFrases(storageLocalB);

  assert(!idNoFirestore(frase.id),            'B deletou do Firestore via tombstone sync');
  assert(!fraseVisivel(visB, 'Offline delete'),'frase NÃO aparece no painel do B');

  // A re-abre o painel → tombstone local faz retry (frase já foi deletada por B, 404 = ok)
  const visA = await carregarFrases(storageLocalA);
  assert(!fraseVisivel(visA, 'Offline delete'),'frase NÃO aparece no painel do A após retry');
})();

head('CENÁRIO 5 — Frase antiga (>30d) deletada hoje propaga corretamente');
sep();
await (async () => {
  resetState();
  // Frase criada 40 dias atrás (id no passado)
  const idAntigo = Date.now() - 40 * 24 * 60 * 60 * 1000;
  const frase = { texto: 'Frase antiga', data: '01/02/2026', streaming: 'netflix', id: idAntigo, idioma: 'Inglês' };
  await nuvemEmMemoria().gravarFrase(frase);
  setLocal(storageLocalA, { frases: [frase] });
  setLocal(storageLocalB, { frases: [frase] });

  // A deleta hoje
  await deletarFrase(storageLocalA, frase.id);

  // Verifica que o tombstone NÃO expirou imediatamente (bug do TTL antigo)
  const tombstone = await lerTombstoneSync();
  assert(tombstone.has(String(idAntigo)), 'tombstone contém frase antiga (TTL conta da deleção, não da criação)');

  // B abre o painel
  const visB = await carregarFrases(storageLocalB);
  assert(!idNoFirestore(frase.id),                'frase antiga removida do Firestore');
  assert(!fraseVisivel(visB, 'Frase antiga'),     'frase antiga NÃO aparece no B');
})();

head('CENÁRIO 6 — Deleção em A não afeta outras frases em B');
sep();
await (async () => {
  resetState();
  const f1 = await capturarFrase(storageLocalA, 'Keep this');
  const f2 = await capturarFrase(storageLocalA, 'Delete this');

  // B sincroniza e também captura uma frase própria
  await carregarFrases(storageLocalB);
  const f3 = await capturarFrase(storageLocalB, 'From B');

  // A deleta apenas f2
  await deletarFrase(storageLocalA, f2.id);

  // B abre painel
  const visB = await carregarFrases(storageLocalB);

  assert(fraseVisivel(visB, 'Keep this'),     'f1 (não deletada) ainda aparece em B');
  assert(!fraseVisivel(visB, 'Delete this'),  'f2 (deletada em A) não aparece em B');
  assert(fraseVisivel(visB, 'From B'),        'f3 (de B) ainda aparece em B');
  info(`Painel B mostra ${visB.length} frase(s)`);
})();

head('CENÁRIO 7 — Deleção em B propaga para A');
sep();
await (async () => {
  resetState();
  const frase = await capturarFrase(storageLocalA, 'Delete from B');
  await carregarFrases(storageLocalB); // B sincroniza

  // B deleta
  await deletarFrase(storageLocalB, frase.id);

  // A abre painel
  const visA = await carregarFrases(storageLocalA);
  assert(!idNoFirestore(frase.id),               'frase removida do Firestore por B');
  assert(!fraseVisivel(visA, 'Delete from B'),   'frase não aparece no painel de A');
})();

head('CENÁRIO 8 — "Apagar tudo" em A propaga para B');
sep();
await (async () => {
  resetState();
  const f1 = await capturarFrase(storageLocalA, 'Phrase 1');
  const f2 = await capturarFrase(storageLocalA, 'Phrase 2');
  const f3 = await capturarFrase(storageLocalA, 'Phrase 3');
  await carregarFrases(storageLocalB);

  // A apaga tudo
  const ids = [f1.id, f2.id, f3.id];
  await removerFrases(storageLocalA, ids);
  setLocal(storageLocalA, { frases: [] });

  const visB = await carregarFrases(storageLocalB);
  assert(Object.keys(firestore).length === 0,  'Firestore vazio após apagar tudo');
  assert(visB.length === 0,                    'Painel B mostra 0 frases após apagar tudo em A');
})();

head('CENÁRIO 9 — Tombstone TTL: entradas expiradas são ignoradas');
sep();
await (async () => {
  resetState();
  const deletedAt31d = Date.now() - 31 * 24 * 60 * 60 * 1000;
  const fAntiga  = { texto: 'Tombstone expirado', data: '01/02/2026', streaming: 'netflix', id: Date.now() - 60 * 24 * 60 * 60 * 1000, idioma: 'Inglês' };
  const fRecente = { texto: 'Tombstone válido',   data: '01/02/2026', streaming: 'netflix', id: Date.now() - 1000, idioma: 'Inglês' };
  firestore[fAntiga.id] = fAntiga;
  firestore[fRecente.id] = fRecente;

  // Uma chave por frase: uma expirada (31 dias) e uma válida
  storageSync[`${PREFIXO_DO_TOMBSTONE}${fAntiga.id}`]  = deletedAt31d;
  storageSync[`${PREFIXO_DO_TOMBSTONE}${fRecente.id}`] = Date.now();

  const visB = await carregarFrases(storageLocalB);
  assert(fraseVisivel(visB, 'Tombstone expirado'),  'tombstone expirado (31d) NÃO apaga a frase');
  assert(!fraseVisivel(visB, 'Tombstone válido'),   'tombstone recente apaga a frase');
  assert(idNoFirestore(fAntiga.id) && !idNoFirestore(fRecente.id), 'só a frase com tombstone válido saiu da nuvem');
  // chave expirada é removida automaticamente
  assert(!(`${PREFIXO_DO_TOMBSTONE}${fAntiga.id}` in storageSync), 'chave expirada removida do sync storage');

  // E o tombstone na nuvem também expira com o TTL
  firestoreTomb[fAntiga.id] = deletedAt31d;
  const visA = await carregarFrases(storageLocalA);
  assert(fraseVisivel(visA, 'Tombstone expirado'),  'tombstone da nuvem expirado (31d) NÃO apaga a frase');
})();

head('CENÁRIO 10 — Captura em B durante painel aberto em A não perde dados');
sep();
await (async () => {
  resetState();
  // A tem uma frase
  const f1 = await capturarFrase(storageLocalA, 'Already synced');

  // B captura uma frase nova enquanto A está sincronizando (sem falha)
  const f2 = await capturarFrase(storageLocalB, 'New from B');

  // A carrega frases (deve incluir as de B via Firestore)
  const visA = await carregarFrases(storageLocalA);
  assert(fraseVisivel(visA, 'Already synced'), 'f1 aparece em A');
  assert(fraseVisivel(visA, 'New from B'),     'f2 (de B) aparece em A via Firestore');
  assert(idNoFirestore(f2.id),                'f2 está no Firestore');
})();

head('CENÁRIO 11 — Re-deleção da mesma frase (idempotência)');
sep();
await (async () => {
  resetState();
  const frase = await capturarFrase(storageLocalA, 'Double delete');

  await deletarFrase(storageLocalA, frase.id);
  await deletarFrase(storageLocalA, frase.id); // segunda deleção do mesmo id

  const visB = await carregarFrases(storageLocalB);
  assert(!fraseVisivel(visB, 'Double delete'), 'frase não aparece em B mesmo com double delete');
  assert(!idNoFirestore(frase.id),             'Firestore não tem a frase');
})();

head('CENÁRIO 12 — Múltiplas frases: deleção seletiva preserva o restante');
sep();
await (async () => {
  resetState();
  const frases = [];
  for (let i = 1; i <= 5; i++) frases.push(await capturarFrase(storageLocalA, `Phrase ${i}`));

  await carregarFrases(storageLocalB);

  // A deleta frases 2 e 4
  await deletarFrase(storageLocalA, frases[1].id);
  await deletarFrase(storageLocalA, frases[3].id);

  const visB = await carregarFrases(storageLocalB);
  assert(fraseVisivel(visB, 'Phrase 1'), 'Phrase 1 presente');
  assert(!fraseVisivel(visB, 'Phrase 2'), 'Phrase 2 deletada');
  assert(fraseVisivel(visB, 'Phrase 3'), 'Phrase 3 presente');
  assert(!fraseVisivel(visB, 'Phrase 4'), 'Phrase 4 deletada');
  assert(fraseVisivel(visB, 'Phrase 5'), 'Phrase 5 presente');
  assert(visB.length === 3, `B mostra exatamente 3 frases (mostrou ${visB.length})`);
})();

head('CENÁRIO 13 — Race condition: painel abre enquanto sync ainda está em voo');
sep();
await (async () => {
  resetState();
  const frase = await capturarFrase(storageLocalA, 'In-flight phrase', { syncInFlight: true });

  assert(!idNoFirestore(frase.id),                 'frase não está no Firestore ainda (sync em voo)');

  // Painel abre imediatamente — frase está no local, deve aparecer e ser re-enviada
  const visA = await carregarFrases(storageLocalA);

  assert(fraseVisivel(visA, 'In-flight phrase'),   'frase aparece no painel (local como buffer)');
  assert(idNoFirestore(frase.id),                  'orphan detectado e re-enviado ao Firestore');
})();

head('CENÁRIO 14 — Adição manual (painel): sync falha, recupera na próxima abertura');
sep();
await (async () => {
  resetState();
  // Simula salvarMultiAdd: salva local, Firestore falha (sem pm_pending_sync)
  const frase = await adicionarFraseManual(storageLocalA, 'Manual phrase', { syncFails: true });

  assert(!idNoFirestore(frase.id),               'frase não está no Firestore (sync falhou)');

  // Refresh do painel — nova lógica detecta como orphan e re-sobe
  const visA = await carregarFrases(storageLocalA);

  assert(fraseVisivel(visA, 'Manual phrase'),    'frase recuperada no painel após refresh');
  assert(idNoFirestore(frase.id),               'frase re-enviada ao Firestore com sucesso');
})();

head('CENÁRIO 15 — Tombstone vence: frase local tombstoned NÃO re-sobe');
sep();
await (async () => {
  resetState();
  const frase = await capturarFrase(storageLocalA, 'Will be deleted', { syncInFlight: true });

  await nuvemEmMemoria().gravarFrase(frase); // sync completou em background
  await deletarFrase(storageLocalA, frase.id); // usuário deleta (remove do local + tombstone)

  assert(!idNoFirestore(frase.id),               'frase deletada do Firestore');
  assert(await idNoTombstoneSync(frase.id),            'tombstone ativo');

  // Painel re-abre: tombstone vence, não re-sobe
  const visA = await carregarFrases(storageLocalA);

  assert(!fraseVisivel(visA, 'Will be deleted'), 'frase NÃO re-aparece');
  assert(!idNoFirestore(frase.id),               'frase NÃO re-subiu ao Firestore');
})();

head('CENÁRIO 16 — Adição manual em B: sync falha, aparece em A após B abrir painel');
sep();
await (async () => {
  resetState();
  // B adiciona manualmente (sync falha — frase só no local de B)
  const frase = await adicionarFraseManual(storageLocalB, 'Manual from B', { syncFails: true });

  assert(!idNoFirestore(frase.id), 'frase não está no Firestore');

  // B abre painel → detecta orphan → re-sobe
  const visB = await carregarFrases(storageLocalB);
  assert(fraseVisivel(visB, 'Manual from B'), 'frase aparece em B após re-envio');
  assert(idNoFirestore(frase.id),             'frase chegou ao Firestore');

  // A abre painel → vê a frase de B
  const visA = await carregarFrases(storageLocalA);
  assert(fraseVisivel(visA, 'Manual from B'), 'frase de B aparece em A');
})();

head('CENÁRIO 17 — Deleções simultâneas em A e B (o bug relatado)');
sep();
await (async () => {
  resetState();
  const fA = await capturarFrase(storageLocalA, 'Phrase A');
  const fB = await capturarFrase(storageLocalB, 'Phrase B');
  // ambas chegam ao Firestore
  assert(idNoFirestore(fA.id), 'fA no Firestore');
  assert(idNoFirestore(fB.id), 'fB no Firestore');

  // A e B SIMULTANEAMENTE deletam suas frases
  // Simula race: ambos chamam marcarParaDeletarSync ao mesmo tempo
  // Com o array antigo, um sobrescreveria o outro
  // Com per-key, cada um escreve sua própria chave → sem conflito
  await deletarFrase(storageLocalA, fA.id); // grava pm_del_{fA.id}
  await deletarFrase(storageLocalB, fB.id); // grava pm_del_{fB.id} — não conflita

  const tomb = await lerTombstoneSync();
  assert(tomb.has(String(fA.id)), 'tombstone contém fA (deletada por A)');
  assert(tomb.has(String(fB.id)), 'tombstone contém fB (deletada por B)');

  // A abre painel — deve não ver nenhuma das duas
  const visA = await carregarFrases(storageLocalA);
  assert(!fraseVisivel(visA, 'Phrase A'), 'A: fA não aparece');
  assert(!fraseVisivel(visA, 'Phrase B'), 'A: fB não aparece (deletada por B)');

  // B abre painel — deve não ver nenhuma das duas
  const visB = await carregarFrases(storageLocalB);
  assert(!fraseVisivel(visB, 'Phrase A'), 'B: fA não aparece (deletada por A)');
  assert(!fraseVisivel(visB, 'Phrase B'), 'B: fB não aparece');

  assert(Object.keys(firestore).length === 0, 'Firestore vazio');
})();

head('CENÁRIO 18 — Deleções simultâneas não afetam frases de terceiros');
sep();
await (async () => {
  resetState();
  const fA     = await capturarFrase(storageLocalA, 'Delete by A');
  const fB     = await capturarFrase(storageLocalB, 'Delete by B');
  const fKeep  = await capturarFrase(storageLocalA, 'Keep this');

  await carregarFrases(storageLocalB); // B sincroniza fKeep

  // Deleções simultâneas
  await deletarFrase(storageLocalA, fA.id);
  await deletarFrase(storageLocalB, fB.id);

  const visA = await carregarFrases(storageLocalA);
  const visB = await carregarFrases(storageLocalB);

  assert(!fraseVisivel(visA, 'Delete by A'), 'A: fA removida');
  assert(!fraseVisivel(visA, 'Delete by B'), 'A: fB removida');
  assert(fraseVisivel(visA, 'Keep this'),    'A: fKeep presente');

  assert(!fraseVisivel(visB, 'Delete by A'), 'B: fA removida');
  assert(!fraseVisivel(visB, 'Delete by B'), 'B: fB removida');
  assert(fraseVisivel(visB, 'Keep this'),    'B: fKeep presente');
})();

head('CENÁRIO 19 — Apagar tudo com a nuvem fora do ar: o sync seguinte conclui, e o que veio depois fica');
sep();
await (async () => {
  resetState();
  const antes1 = await capturarFrase(storageLocalA, 'Gravada em A');
  const antesB = await capturarFrase(storageLocalB, 'Gravada em B antes do apagar tudo');
  await carregarFrases(storageLocalA); // A vê as duas (B subiu a dela)

  // A apaga tudo com a nuvem recusando as escritas: o que ela viu fica marcado
  nuvemFalha.apagar = true;
  const resultado = await de(storageLocalA).sinc.apagarTudo([antes1.id]);
  nuvemFalha.apagar = false;
  setLocal(storageLocalA, { frases: [] });

  assert(!resultado.ok && resultado.erro instanceof Error, 'apagarTudo avisa que a nuvem falhou');
  assert(getLocal(storageLocalA, { pm_apagar_tudo: null }).pm_apagar_tudo?.uid === 'uid-teste', 'pm_apagar_tudo guardado até a nuvem confirmar');
  assert(idNoFirestore(antes1.id), 'a nuvem ainda tem as frases');

  // Depois do apagar tudo, outra frase é minerada em B
  await new Promise(r => setTimeout(r, 5));
  const depois = await capturarFrase(storageLocalB, 'Minerada depois');

  // O próximo carregamento de A alcança a nuvem e conclui
  const visA = await carregarFrases(storageLocalA);
  assert(!idNoFirestore(antes1.id) && !idNoFirestore(antesB.id), 'frases de antes do Apagar tudo saíram da nuvem (também a de B, que A nunca tinha em mãos)');
  assert(idNoFirestore(depois.id),                              'o que foi minerado depois fica na nuvem');
  assert(fraseVisivel(visA, 'Minerada depois') && visA.length === 1, 'A mostra só o que veio depois');
  assert(getLocal(storageLocalA, { pm_apagar_tudo: null }).pm_apagar_tudo === null, 'pm_apagar_tudo é limpo');
})();

head('CENÁRIO 20 — Apagar tudo com a nuvem no ar apaga tudo e não deixa pendência');
sep();
await (async () => {
  resetState();
  const f1 = await capturarFrase(storageLocalA, 'Phrase 1');
  const f2 = await capturarFrase(storageLocalB, 'Phrase 2 de B');
  const resultado = await de(storageLocalA).sinc.apagarTudo([f1.id]);
  setLocal(storageLocalA, { frases: [] });

  assert(resultado.ok,                                    'apagarTudo confirma');
  assert(Object.keys(firestore).length === 0,             'a nuvem ficou vazia, inclusive a frase de B');
  assert(!('pm_apagar_tudo' in storageLocalA),            'nenhuma pendência de Apagar tudo');
  assert(await idNoTombstoneSync(f2.id),                  'a frase de B ganhou tombstone');
  assert((await carregarFrases(storageLocalB)).length === 0, 'B abre o painel e não vê nada');
})();

head('CENÁRIO 21 — Sem conta: Apagar tudo e apagar só gravam os tombstones deste computador');
sep();
await (async () => {
  resetState();
  ligar(storageLocalA, { semConta: true });
  const resultado = await de(storageLocalA).sinc.apagarTudo([1, 2]);
  assert(resultado.ok,                                    'apagarTudo sem conta resolve ok');
  assert(!('pm_apagar_tudo' in storageLocalA),            'sem conta não há Apagar tudo pendente');
  const erro = await de(storageLocalA).sinc.apagar([3]);
  assert(erro === null,                                   'apagar sem conta não falha');
  assert(getLocal(storageLocalA, { pm_deleted_ids: [] }).pm_deleted_ids.includes('3'), 'o id fica em pm_deleted_ids');
  assert((await lerTombstoneSync()).has('3'),             'e no tombstone do sync');
})();

head('CENÁRIO 22 — Marcas Enviada ao Anki / Exportada juntam local e nuvem');
sep();
await (async () => {
  resetState();
  const marcadaAqui = await capturarFrase(storageLocalA, 'Marcada aqui');
  const marcadaLa   = await capturarFrase(storageLocalA, 'Marcada na nuvem');
  setLocal(storageLocalA, { frases: getLocal(storageLocalA, { frases: [] }).frases.map(f => f.id === marcadaAqui.id ? { ...f, status: 'exported' } : f) });
  firestore[marcadaLa.id] = { ...marcadaLa, exportadaTxt: true }; // outro computador exportou

  const vis = await carregarFrases(storageLocalA);
  const porTexto = (t) => vis.find(f => f.texto === t);
  assert(porTexto('Marcada aqui').status === 'exported',      'a marca daqui aparece na lista');
  assert(firestore[marcadaAqui.id].status === 'exported',     'e vai para a nuvem (retry)');
  assert(porTexto('Marcada na nuvem').exportadaTxt === true,  'a marca da nuvem aparece na lista');
  assert(getLocal(storageLocalA, { frases: [] }).frases.find(f => f.id === marcadaLa.id).exportadaTxt === true, 'e é aplicada ao local');
})();

head('CENÁRIO 23 — Frase que não sobe fica na lista e na fila de retry (nunca some do computador)');
sep();
await (async () => {
  resetState();
  const frase = await capturarFrase(storageLocalA, 'Nuvem recusa', { syncFails: true });
  nuvemFalha.gravarFrase = true;
  const resultado = await de(storageLocalA).sinc.carregar({ atuais: () => [] });
  await resultado.concluida;
  nuvemFalha.gravarFrase = false;

  assert(fraseVisivel(resultado.frases, 'Nuvem recusa'),      'a frase continua na lista');
  assert(resultado.falhaNasOrfas?.quantas === 1,              'a falha é contada (falhaNasOrfas)');
  assert(resultado.desteComputador === 1,                     'desteComputador conta as frases locais');
  assert(idNoPendingSync(storageLocalA, frase.id),            'continua em pm_pending_sync');

  const depois = await carregarFrases(storageLocalA);
  assert(fraseVisivel(depois, 'Nuvem recusa') && idNoFirestore(frase.id) && !idNoPendingSync(storageLocalA, frase.id),
    'na próxima abertura sobe e sai da fila');
})();

head('CENÁRIO 24 — Uma edição feita enquanto a nuvem responde sobrevive (a lista da tela é lida no fim)');
sep();
await (async () => {
  resetState();
  const frase = await capturarFrase(storageLocalA, 'Antes da edição', { syncInFlight: true });
  let leituras = 0;
  const resultado = await de(storageLocalA).sinc.carregar({
    atuais: () => { leituras++; return [{ ...frase, texto: 'Depois da edição' }]; },
  });
  await resultado.concluida;
  assert(leituras === 1,                                       'a lista da tela é consultada uma vez, depois da leitura da nuvem');
  assert(fraseVisivel(resultado.frases, 'Depois da edição'),   'a órfã aparece com a edição');
  assert(!fraseVisivel(resultado.frases, 'Antes da edição'),   'e não com o texto antigo');
})();

head('CENÁRIO 25 — A nuvem não responde: carregar rejeita e nada local é descartado');
sep();
await (async () => {
  resetState();
  const frase = await capturarFrase(storageLocalA, 'Só aqui', { syncFails: true });
  nuvemFalha.listar = true;
  let erro = null;
  try { await de(storageLocalA).sinc.carregar(); } catch (e) { erro = e; }
  assert(erro !== null,                                        'carregar rejeita com a causa');
  assert(getLocal(storageLocalA, { frases: [] }).frases.some(f => f.id === frase.id), 'a frase continua no local');
})();

head('CENÁRIO 26 — Tombstone local: o DELETE que falhou é repetido no próximo carregamento');
sep();
await (async () => {
  resetState();
  const frase = await capturarFrase(storageLocalA, 'Delete teimoso');
  await deletarFrase(storageLocalA, frase.id, { firestoreFailure: true });
  assert(getLocal(storageLocalA, { pm_deleted_ids: [] }).pm_deleted_ids.includes(String(frase.id)), 'id fica em pm_deleted_ids');

  const vis = await carregarFrases(storageLocalA);
  assert(!fraseVisivel(vis, 'Delete teimoso') && !idNoFirestore(frase.id), 'o retry apagou da nuvem');
  assert(getLocal(storageLocalA, { pm_deleted_ids: [] }).pm_deleted_ids.length === 0, 'e limpou pm_deleted_ids');
})();

head('CENÁRIO 27 — Subir frases de uma vez: tira da fila de retry; a falha é devolvida');
sep();
await (async () => {
  resetState();
  const f1 = await capturarFrase(storageLocalA, 'Minerada 1', { syncFails: true });
  nuvemFalha.gravarFrases = true;
  const erro = await de(storageLocalA).sinc.subirFrases([f1]);
  nuvemFalha.gravarFrases = false;
  assert(erro instanceof Error && !idNoFirestore(f1.id) && idNoPendingSync(storageLocalA, f1.id), 'a falha é devolvida e a fila fica');
  assert(await de(storageLocalA).sinc.subirFrases([f1]) === null && idNoFirestore(f1.id) && !idNoPendingSync(storageLocalA, f1.id), 'ao subir, sai da fila');
})();

const DOCS = 'https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents';

/** Um fetch que responde com o que `responder(url, opcoes)` devolve ({ status, corpo }) e guarda os pedidos. */
function fetchFalso(responder) {
  const pedidos = [];
  const buscar = async (url, opcoes = {}) => {
    const decodificada = decodeURIComponent(url);
    pedidos.push({ url: decodificada, metodo: opcoes.method || 'GET', corpo: opcoes.body ? JSON.parse(opcoes.body) : null, token: opcoes.headers?.Authorization });
    const { status = 200, corpo = {} } = await responder(decodificada, opcoes, pedidos.length);
    return { ok: status >= 200 && status < 300, status, json: async () => corpo };
  };
  return { buscar, pedidos };
}

function nuvemDeTeste(responder, credenciais = {}) {
  const fetch = fetchFalso(responder);
  const renovadas = [];
  const sessao = criarSessao({
    credenciais: { uid: 'u1', idToken: 'token-bom', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000, ...credenciais },
    aoRenovar: c => renovadas.push(c),
    buscar: fetch.buscar,
  });
  return { sessao, nuvem: nuvemHttp({ sessao, buscar: fetch.buscar }), pedidos: fetch.pedidos, renovadas };
}

head('HTTP 1 — Codec: ida e volta, com mapas e listas');
sep();
{
  const frase = { id: 123, texto: 'Hello', idioma: 'Inglês', keywords: ['a', 'b'], exportadaTxt: true, contexto: { titulo: 'Show', episodio: 3 }, nulo: null };
  const volta = deCampos(paraCampos(frase));
  assert(volta.id === 123 && volta.texto === 'Hello' && volta.exportadaTxt === true, 'números, textos e booleanos');
  assert(JSON.stringify(volta.keywords) === '["a","b"]',                           'listas de textos');
  assert(volta.contexto.titulo === 'Show' && volta.contexto.episodio === 3,         'mapas (recursivo, com número dentro)');
  assert(!('nulo' in volta),                                                        'null não vai para a nuvem');
  assert(paraCampos({ id: 5 }).id.integerValue === '5',                             'inteiros vão como integerValue em texto');
}

head('HTTP 2 — Tombstone: o campo do id vai entre crases, com updateMask por campo');
sep();
{
  const { mascara, corpo } = tombstoneFirestore(['123', '456'], 99);
  assert(decodeURIComponent(mascara) === 'updateMask.fieldPaths=ids.`123`&updateMask.fieldPaths=ids.`456`', 'máscara por id, entre crases');
  assert(corpo.fields.ids.mapValue.fields['123'].integerValue === '99',             'corpo guarda a hora da deleção');
  assert(tombstonesSync(['7'], 5)[`${PREFIXO_DO_TOMBSTONE}7`] === 5,                'chave pm_del_{id} do chrome.storage.sync');
}

head('HTTP 3 — Listar frases pagina e decodifica');
sep();
await (async () => {
  const { nuvem, pedidos } = nuvemDeTeste((url) => url.includes('pageToken=p2')
    ? { corpo: { documents: [{ fields: paraCampos({ id: 2, texto: 'dois' }) }] } }
    : { corpo: { documents: [{ fields: paraCampos({ id: 1, texto: 'um' }) }], nextPageToken: 'p2' } });
  const frases = await nuvem.listarFrases();
  assert(frases.map(f => f.texto).join() === 'um,dois',                             'as duas páginas, na ordem');
  assert(pedidos[0].url === `${DOCS}/usuarios/u1/frases?pageSize=300`,              'primeira página em usuarios/{uid}/frases');
  assert(pedidos[1].url.endsWith('&pageToken=p2') && pedidos[1].token === 'Bearer token-bom', 'segunda página com o token da conta');
})();

head('HTTP 4 — Gravar campos: máscara e documento existente; sem o documento, grava inteiro');
sep();
await (async () => {
  const { nuvem, pedidos } = nuvemDeTeste((url) => url.includes('currentDocument.exists=true') ? { status: 404, corpo: { error: { message: 'NOT_FOUND' } } } : {});
  await nuvem.gravarFrase({ id: 9, texto: 'x', keywords: ['k'] }, ['keywords']);
  assert(pedidos[0].url.endsWith('/frases/9?updateMask.fieldPaths=keywords&currentDocument.exists=true'), 'PATCH com updateMask e currentDocument.exists');
  assert(pedidos.length === 2 && pedidos[1].url.endsWith('/frases/9') && pedidos[1].metodo === 'PATCH', 'o 404 vira um PATCH do documento inteiro');
  await nuvem.gravarFrase({ id: 10, texto: 'y' });
  assert(pedidos[2].url.endsWith('/frases/10') && pedidos[2].corpo.fields.texto.stringValue === 'y', 'sem campos, grava todos');
})();

head('HTTP 5 — Gravar em lote: 500 por batchWrite');
sep();
await (async () => {
  const { nuvem, pedidos } = nuvemDeTeste(() => ({}));
  await nuvem.gravarFrases(Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, texto: 't' })));
  const lotes = pedidos.filter(p => p.url === `${DOCS}:batchWrite`);
  assert(lotes.length === 3 && lotes.map(l => l.corpo.writes.length).join() === '500,500,1', 'três lotes: 500, 500 e 1');
  assert(lotes[0].corpo.writes[0].update.name === 'projects/perpetualminer-4c219/databases/(default)/documents/usuarios/u1/frases/1', 'o nome do documento é o caminho completo');
})();

head('HTTP 6 — Apagar: 404 é tudo certo; uma recusa sobe com o motivo');
sep();
await (async () => {
  const a = nuvemDeTeste(() => ({ status: 404, corpo: {} }));
  let erro = null;
  try { await a.nuvem.apagarFrases(['1', '2']); } catch (e) { erro = e; }
  assert(erro === null && a.pedidos.length === 2 && a.pedidos.every(p => p.metodo === 'DELETE'), 'um DELETE por frase; 404 não é falha');

  const b = nuvemDeTeste(() => ({ status: 403, corpo: { error: { status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } } }));
  erro = null;
  try { await b.nuvem.apagarFrases(['1']); } catch (e) { erro = e; }
  assert(erro?.motivo === MOTIVO.RECUSADO && /insufficient/.test(erro.message), '403 → motivo RECUSADO, com a mensagem da nuvem');

  const c = nuvemDeTeste(() => ({ status: 503, corpo: { error: { message: 'UNAVAILABLE' } } }));
  erro = null;
  try { await c.nuvem.listarFrases(); } catch (e) { erro = e; }
  assert(erro?.status === 503 && !erro.motivo,                                      '503 → falha comum, com o status');
})();

head('HTTP 7 — Tombstone da nuvem: grava por campo e lê as horas');
sep();
await (async () => {
  const { nuvem, pedidos } = nuvemDeTeste((url, opcoes) => opcoes.method === 'PATCH' ? {} :
    { corpo: { fields: { ids: { mapValue: { fields: { 11: { integerValue: '1000' } } } } } } });
  await nuvem.gravarTombstones(['11'], 1000);
  assert(pedidos[0].url === `${DOCS}/usuarios/u1/meta/deleted?updateMask.fieldPaths=ids.\`11\``, 'PATCH em usuarios/{uid}/meta/deleted');
  const lidos = await nuvem.lerTombstones();
  assert(lidos.get('11') === 1000,                                                  'lê id → hora da deleção');
})();

head('HTTP 8 — Sessão: renova perto de vencer, guarda o que renovou e tenta uma vez após 401');
sep();
await (async () => {
  const renovacao = { corpo: { id_token: 'token-novo', refresh_token: 'refresh-novo' } };
  const a = nuvemDeTeste((url) => url.includes('securetoken') ? renovacao : { corpo: {} }, { expiresAt: Date.now() + 30_000 });
  await a.nuvem.listarFrases();
  assert(a.pedidos[0].url.startsWith('https://securetoken.googleapis.com/v1/token?key='),   'token perto de vencer: renova antes do pedido');
  assert(a.pedidos[1].token === 'Bearer token-novo',                                       'o pedido usa o token novo');
  assert(a.renovadas.length === 1 && a.renovadas[0].refreshToken === 'refresh-novo' && a.renovadas[0].uid === 'u1' && a.renovadas[0].expiresAt > Date.now() + 50 * 60_000,
    'aoRenovar recebe as credenciais completas para gravar');

  let chamadas = 0;
  const b = nuvemDeTeste((url) => {
    if (url.includes('securetoken')) return renovacao;
    return ++chamadas === 1 ? { status: 401, corpo: { error: { message: 'bad token' } } } : { corpo: {} };
  });
  await b.nuvem.listarFrases();
  assert(b.pedidos.map(p => p.token || 'renovação').join() === 'Bearer token-bom,renovação,Bearer token-novo', '401: renova e repete uma vez');

  const c = nuvemDeTeste(() => ({ status: 401, corpo: { error: { message: 'sempre' } } }));
  let erro = null;
  try { await c.nuvem.listarFrases(); } catch (e) { erro = e; }
  assert(erro?.motivo === MOTIVO.EXPIROU,                                                  'um 401 que se repete → motivo EXPIROU');

  const d = nuvemDeTeste(() => ({}), { refreshToken: null, expiresAt: 0 });
  erro = null;
  try { await d.nuvem.listarFrases(); } catch (e) { erro = e; }
  assert(erro?.motivo === MOTIVO.EXPIROU && d.pedidos.length === 0,                        'sem refresh token → EXPIROU, sem pedido');

  const e2 = nuvemDeTeste((url) => url.includes('securetoken') ? { status: 400, corpo: { error: { message: 'TOKEN_EXPIRED' } } } : {}, { expiresAt: 0 });
  erro = null;
  try { await e2.nuvem.listarFrases(); } catch (e) { erro = e; }
  assert(erro?.motivo === MOTIVO.EXPIROU && erro.message === 'TOKEN_EXPIRED',              'renovação recusada → EXPIROU, com a mensagem');
})();

head('HTTP 9 — armazenamentoDoChrome adapta o chrome.storage de callbacks');
sep();
await (async () => {
  const dados = {};
  const area = { get: (k, cb) => cb({ ...dados }), set: (i, cb) => { Object.assign(dados, i); cb(); }, remove: (k, cb) => { for (const x of [].concat(k)) delete dados[x]; cb(); } };
  const { local, sync } = armazenamentoDoChrome({ local: area, sync: area });
  await local.set({ a: 1 });
  assert((await sync.get(null)).a === 1,                                                   'set/get viram promessas');
  await local.remove('a');
  assert(!('a' in dados),                                                                  'remove também');
})();

head('HTTP 10 — Revogar a sessão impede pedidos e uma renovação em voo');
sep();
await (async () => {
  let responder;
  const resposta = new Promise(resolve => { responder = resolve; });
  const a = nuvemDeTeste(() => resposta, { expiresAt: 0 });
  const pedido = a.nuvem.listarFrases();
  assert(a.pedidos.length === 1 && a.pedidos[0].url.includes('securetoken'), 'a renovação está em voo');
  a.sessao.revogar();
  responder({ corpo: { id_token: 'token-tardio', refresh_token: 'refresh-tardio' } });
  const [resultado] = await Promise.allSettled([pedido]);
  assert(resultado.status === 'rejected' && resultado.reason?.motivo === MOTIVO.EXPIROU, 'o pedido rejeita com EXPIROU após a revogação');
  assert(a.renovadas.length === 0, 'a renovação tardia não chama aoRenovar');
  assert(a.pedidos.length === 1, 'nenhum pedido chega ao Firestore após a renovação tardia');

  const b = nuvemDeTeste(() => ({}));
  b.sessao.revogar();
  b.sessao.revogar();
  const pedidosRevogados = [
    ['token', () => b.sessao.token()],
    ['listar frases', () => b.nuvem.listarFrases()],
    ['gravar frase', () => b.nuvem.gravarFrase({ id: 1, texto: 'x' })],
    ['gravar lote', () => b.nuvem.gravarFrases([{ id: 1, texto: 'x' }])],
    ['apagar frases', () => b.nuvem.apagarFrases(['1'])],
    ['ler tombstones', () => b.nuvem.lerTombstones()],
    ['gravar tombstones', () => b.nuvem.gravarTombstones(['1'], 1000)],
  ];
  for (const [nome, pedir] of pedidosRevogados) {
    const [r] = await Promise.allSettled([pedir()]);
    assert(r.status === 'rejected' && r.reason?.motivo === MOTIVO.EXPIROU, `${nome} rejeita com EXPIROU numa sessão revogada`);
  }
  assert(b.pedidos.length === 0 && b.renovadas.length === 0, 'a sessão revogada não faz pedidos nem persiste credenciais');
  b.sessao.invalidar();
  const [aindaRevogada] = await Promise.allSettled([b.sessao.token()]);
  assert(aindaRevogada.status === 'rejected' && aindaRevogada.reason?.motivo === MOTIVO.EXPIROU && b.pedidos.length === 0,
    'invalidar o token não reativa a sessão revogada');

  const c = nuvemDeTeste(() => ({}));
  const comTokenValido = c.nuvem.listarFrases();
  c.sessao.revogar();
  const [semPedido] = await Promise.allSettled([comTokenValido]);
  assert(semPedido.status === 'rejected' && semPedido.reason?.motivo === MOTIVO.EXPIROU && c.pedidos.length === 0,
    'a revogação antes do envio impede usar um token já obtido');

  for (const [nome, pedir] of [
    ['leitura', nuvem => nuvem.listarFrases()],
    ['lotes', nuvem => nuvem.gravarFrases(Array.from({ length: 501 }, (_, id) => ({ id, texto: 'x' })))],
  ]) {
    const d = nuvemDeTeste(() => { d.sessao.revogar(); return {}; });
    const [emVoo] = await Promise.allSettled([pedir(d.nuvem)]);
    assert(emVoo.status === 'rejected' && emVoo.reason?.motivo === MOTIVO.EXPIROU && d.pedidos.length === 1,
      `${nome}: a resposta em voo rejeita após revogar, sem continuar os pedidos`);
  }

  let entregarCorpo, avisarLeitura;
  const corpo = new Promise(resolve => { entregarCorpo = resolve; });
  const lendoCorpo = new Promise(resolve => { avisarLeitura = resolve; });
  const renovadas = [];
  const sessao = criarSessao({
    credenciais: { uid: 'u1', refreshToken: 'refresh', expiresAt: 0 },
    aoRenovar: c => renovadas.push(c),
    buscar: async () => ({ ok: true, status: 200, json: () => { avisarLeitura(); return corpo; } }),
  });
  const token = sessao.token();
  await lendoCorpo;
  sessao.revogar();
  entregarCorpo({ id_token: 'token-tardio', refresh_token: 'refresh-tardio' });
  const [semRenovar] = await Promise.allSettled([token]);
  assert(semRenovar.status === 'rejected' && semRenovar.reason?.motivo === MOTIVO.EXPIROU && renovadas.length === 0,
    'revogar durante a leitura da resposta também impede aoRenovar');
})();

console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
const total = passed + failed;
if (failed === 0) {
  console.log(`${C.bold}${C.green}TODOS OS TESTES PASSARAM: ${passed}/${total}${C.reset}`);
} else {
  console.log(`${C.bold}${C.red}FALHAS: ${failed}/${total}  |  Passaram: ${passed}/${total}${C.reset}`);
}
console.log(`${C.bold}${'═'.repeat(60)}${C.reset}\n`);

process.exit(failed > 0 ? 1 : 0);
}

rodar().catch(err => { console.error(err); process.exit(1); });
