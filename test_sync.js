/**
 * test_sync.js — Simulação completa da lógica de sync entre dispositivos
 *
 * Execução: node test_sync.js
 *
 * Simula dois dispositivos (A e B) compartilhando Firestore e chrome.storage.sync,
 * cada um com seu próprio chrome.storage.local independente.
 * Replica a lógica exata de carregarFrasesFirestore, removerFrasesFirestore,
 * marcarParaDeletarSync, lerTombstoneSync, etc.
 */

'use strict';

// ─── Cores para output ────────────────────────────────────────────────────────
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

// ─── Estado global simulado ───────────────────────────────────────────────────

let firestore      = {};   // { phraseId: phrase }  — compartilhado entre A e B
let firestoreTomb  = {};   // { phraseId: deletedAt } — tombstone no Firestore
let storageSync    = {};   // chrome.storage.sync   — compartilhado entre A e B
let storageLocalA  = {};   // chrome.storage.local do dispositivo A
let storageLocalB  = {};   // chrome.storage.local do dispositivo B

function resetState() {
  firestore      = {};
  firestoreTomb  = {};
  storageSync    = {};
  storageLocalA  = {};
  storageLocalB  = {};
  _phraseCounter = 0;
}

// ─── Helpers de storage ───────────────────────────────────────────────────────

function getLocal(storage, defaults) {
  const result = {};
  for (const [k, v] of Object.entries(defaults)) {
    result[k] = k in storage ? JSON.parse(JSON.stringify(storage[k])) : v;
  }
  return result;
}
function setLocal(storage, data) {
  for (const [k, v] of Object.entries(data)) storage[k] = JSON.parse(JSON.stringify(v));
}
function getSync(defaults)  { return getLocal(storageSync, defaults); }
function setSync(data)      { setLocal(storageSync, data); }

// ─── Constantes tombstone ─────────────────────────────────────────────────────

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOMB_PREFIX      = 'pm_del_';

// ─── Funções tombstone (réplica exata de painel.js) ───────────────────────────

function lerTombstoneSync() {
  const agora    = Date.now();
  const ids      = new Set();
  const expirados = [];
  for (const [key, deletedAt] of Object.entries(storageSync)) {
    if (!key.startsWith(TOMB_PREFIX)) continue;
    const phraseId = key.slice(TOMB_PREFIX.length);
    if (agora - Number(deletedAt) < TOMBSTONE_TTL_MS) {
      ids.add(phraseId);
    } else {
      expirados.push(key);
    }
  }
  for (const k of expirados) delete storageSync[k];
  return ids;
}

function marcarParaDeletarSync(ids) {
  const agora = Date.now();
  for (const id of ids) storageSync[`${TOMB_PREFIX}${id}`] = agora;
}

function limparTombstoneSync(ids) {
  for (const id of ids) delete storageSync[`${TOMB_PREFIX}${id}`];
}

function marcarParaDeletar(storage, ids) {
  const { pm_deleted_ids = [] } = getLocal(storage, { pm_deleted_ids: [] });
  const conjunto = new Set([...pm_deleted_ids, ...ids.map(String)]);
  setLocal(storage, { pm_deleted_ids: [...conjunto] });
}

function limparTombstone(storage, ids) {
  const { pm_deleted_ids = [] } = getLocal(storage, { pm_deleted_ids: [] });
  const removidos = new Set(ids.map(String));
  setLocal(storage, { pm_deleted_ids: pm_deleted_ids.filter(id => !removidos.has(id)) });
}

// ─── Operações Firestore simuladas ────────────────────────────────────────────

function firestoreGetAll() {
  return Object.values(firestore);
}

function firestorePatch(frase) {
  firestore[String(frase.id)] = { ...frase };
}

function firestoreBatchUpsert(frases) {
  for (const f of frases) firestore[String(f.id)] = { ...f };
}

function firestoreBatchDelete(ids) {
  for (const id of ids) delete firestore[String(id)];
}

// Tombstone Firestore: campo por id, sem conflito entre dispositivos
function lerTombstoneFirestore() {
  const agora = Date.now();
  const ids   = new Set();
  for (const [phraseId, deletedAt] of Object.entries(firestoreTomb)) {
    if (agora - Number(deletedAt) < TOMBSTONE_TTL_MS) ids.add(phraseId);
  }
  return ids;
}

function gravarTombstoneFirestore(ids) {
  const agora = Date.now();
  for (const id of ids) firestoreTomb[String(id)] = agora;
}

// ─── Operações de alto nível (réplica de painel.js) ───────────────────────────

// Contador global para garantir IDs únicos mesmo quando Date.now() retorna o
// mesmo valor em chamadas consecutivas (acontece em testes rápidos em Node.js)
let _phraseCounter = 0;

/**
 * Simula removerFrasesFirestore() do painel.js para um dispositivo.
 * Deleta do Firestore + marca tombstones.
 * @param {object} storage  — chrome.storage.local do dispositivo
 * @param {number[]} ids    — ids das frases a deletar
 * @param {boolean} firestoreFailure — simula falha no DELETE do Firestore
 */
function removerFrases(storage, ids, { firestoreFailure = false } = {}) {
  const idsStr = ids.map(String);
  marcarParaDeletarSync(idsStr);
  marcarParaDeletar(storage, idsStr);
  gravarTombstoneFirestore(idsStr); // tombstone Firestore (fonte de verdade)

  if (firestoreFailure) return false;

  firestoreBatchDelete(idsStr);
  limparTombstone(storage, idsStr);
  return true;
}

/**
 * Simula carregarFrasesFirestore() do painel.js para um dispositivo.
 * Retorna o array de frases que seria exibido no painel.
 */
function carregarFrases(storage) {
  let firestoreFrases = firestoreGetAll();

  // ── Tombstone local: retry de deletes que falharam neste dispositivo ──
  const { pm_deleted_ids = [] } = getLocal(storage, { pm_deleted_ids: [] });
  if (pm_deleted_ids.length > 0) {
    const deletedSet = new Set(pm_deleted_ids.map(String));
    const paraApagar = firestoreFrases.filter(f => deletedSet.has(String(f.id))).map(f => String(f.id));
    firestoreFrases  = firestoreFrases.filter(f => !deletedSet.has(String(f.id)));
    if (paraApagar.length > 0) {
      // retry silencioso
      try {
        firestoreBatchDelete(paraApagar);
        limparTombstone(storage, paraApagar);
      } catch { /* mantém no tombstone */ }
    }
  }

  // ── Tombstone cross-device: Firestore (fonte de verdade) + sync (fallback) ──
  const tombstoneFS  = lerTombstoneFirestore();
  const tombstoneCS  = lerTombstoneSync();
  const tombstoneSet = new Set([...tombstoneFS, ...tombstoneCS]);

  if (tombstoneSet.size > 0) {
    const paraApagar = firestoreFrases.filter(f => tombstoneSet.has(String(f.id))).map(f => String(f.id));
    firestoreFrases  = firestoreFrases.filter(f => !tombstoneSet.has(String(f.id)));
    if (paraApagar.length > 0) {
      firestoreBatchDelete(paraApagar);
      limparTombstoneSync(paraApagar);
    }
  }

  const firestoreIds = new Set(firestoreFrases.map(f => f.id));
  const { frases: localFrases = [] } = getLocal(storage, { frases: [] });

  // ── Regra fundamental: tombstone é a ÚNICA razão para descartar uma frase local ──
  const orphans = localFrases.filter(f =>
    !firestoreIds.has(f.id) && !tombstoneSet.has(String(f.id))
  );

  const localSemTombstoned = localFrases.filter(f => !tombstoneSet.has(String(f.id)));
  if (localSemTombstoned.length !== localFrases.length) {
    setLocal(storage, { frases: localSemTombstoned });
  }

  // Limpa pm_pending_sync de entradas tombstoned
  if (tombstoneSet.size > 0) {
    const { pm_pending_sync = [] } = getLocal(storage, { pm_pending_sync: [] });
    const filtrado = pm_pending_sync.filter(id => !tombstoneSet.has(id));
    if (filtrado.length !== pm_pending_sync.length)
      setLocal(storage, { pm_pending_sync: filtrado });
  }

  if (orphans.length > 0) {
    for (const f of orphans) firestorePatch(f);
    const enviadosSet = new Set(orphans.map(f => String(f.id)));
    const { pm_pending_sync: ps2 = [] } = getLocal(storage, { pm_pending_sync: [] });
    setLocal(storage, { pm_pending_sync: ps2.filter(id => !enviadosSet.has(id)) });
    for (const f of orphans) firestoreFrases.push(f);
  }

  return firestoreFrases;
}

/**
 * Simula captura de frase pelo content.js + background.js.
 * @param {object} storage
 * @param {string} texto
 * @param {object} opts
 * @param {boolean} opts.syncFails    — Firestore PATCH falha
 * @param {boolean} opts.syncInFlight — PATCH ainda não completou (frase só no local)
 */
function capturarFrase(storage, texto, { syncFails = false, syncInFlight = false } = {}) {
  const frase = { texto, data: '06/04/2026', streaming: 'youtube', id: Date.now() + (++_phraseCounter), idioma: 'Inglês' };

  // Salva no local E marca como pending ANTES de tentar o Firestore
  const { frases = [], pm_pending_sync = [] } = getLocal(storage, { frases: [], pm_pending_sync: [] });
  const pending = new Set([...pm_pending_sync, String(frase.id)]);
  setLocal(storage, { frases: [frase, ...frases], pm_pending_sync: [...pending] });

  if (!syncFails && !syncInFlight) {
    // Sync ok: PATCH no Firestore e remove do pending
    firestorePatch(frase);
    const { pm_pending_sync: ps } = getLocal(storage, { pm_pending_sync: [] });
    setLocal(storage, { pm_pending_sync: ps.filter(id => id !== String(frase.id)) });
  }
  // syncFails ou syncInFlight: frase fica em local (será orphan detectado pelo painel)
  return frase;
}

/**
 * Simula adição manual de frase via painel (salvarMultiAdd/importarArquivoTxt).
 * Salva no local e tenta Firestore. Com nova lógica, falha de sync
 * é automaticamente recuperada na próxima abertura do painel.
 */
function adicionarFraseManual(storage, texto, { syncFails = false } = {}) {
  const frase = { texto, data: '06/04/2026', streaming: 'manual', id: Date.now() + (++_phraseCounter), idioma: 'Inglês' };
  const { frases = [] } = getLocal(storage, { frases: [] });
  setLocal(storage, { frases: [frase, ...frases] });
  if (!syncFails) firestorePatch(frase);
  // Não adiciona a pm_pending_sync — simula comportamento atual do painel
  return frase;
}

/** Simula deleção de frase pelo painel */
function deletarFrase(storage, id, opts = {}) {
  removerFrases(storage, [id], opts);
  const { frases = [] } = getLocal(storage, { frases: [] });
  setLocal(storage, { frases: frases.filter(f => f.id !== id) });
}

// ─── Utilitários de verificação ───────────────────────────────────────────────

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
function idNoTombstoneSync(id) {
  const cs = lerTombstoneSync();
  const fs = lerTombstoneFirestore();
  return cs.has(String(id)) || fs.has(String(id));
}

// ═════════════════════════════════════════════════════════════════════════════
// CENÁRIOS DE TESTE
// ═════════════════════════════════════════════════════════════════════════════

head('CENÁRIO 1 — Adição no dispositivo A aparece no dispositivo B');
sep();
{
  resetState();
  const fa = capturarFrase(storageLocalA, 'Hello world');
  const visB = carregarFrases(storageLocalB);

  assert(idNoFirestore(fa.id),              'frase está no Firestore após captura');
  assert(fraseVisivel(visB, 'Hello world'), 'frase aparece no painel do dispositivo B');
  info(`Firestore tem ${Object.keys(firestore).length} doc(s)`);
}

head('CENÁRIO 2 — Deleção no dispositivo A desaparece do dispositivo B (cenário principal)');
sep();
{
  resetState();
  // Setup: frase existe em ambos
  const frase = capturarFrase(storageLocalA, 'To delete');
  carregarFrases(storageLocalB); // B sincroniza, vê a frase

  // A deleta
  deletarFrase(storageLocalA, frase.id);

  // B abre o painel
  const visB = carregarFrases(storageLocalB);

  assert(!idNoFirestore(frase.id),            'frase removida do Firestore');
  assert(!fraseVisivel(visB, 'To delete'),    'frase NÃO aparece no painel do B após deleção em A');
  // Tombstone fica ativo por 30 dias (expira naturalmente; só é limpo se frase ainda estava no Firestore)
  assert(idNoTombstoneSync(frase.id),         'tombstone ainda ativo após B processar (expira em 30 dias)');
  info(`Firestore tem ${Object.keys(firestore).length} doc(s)`);
}

head('CENÁRIO 3 — O bug original: frase pendente em B, deletada em A');
sep();
{
  resetState();
  // B captura frase mas o sync com Firestore falha → fica em pm_pending_sync
  const frase = capturarFrase(storageLocalB, 'Pendente no B', { syncFails: true });

  assert(!idNoFirestore(frase.id),                'frase NÃO está no Firestore (sync falhou)');
  assert(idNoPendingSync(storageLocalB, frase.id),'frase está em pm_pending_sync do B');

  // A de alguma forma sabe da frase (ex: subiu depois por outro meio) e deleta
  firestorePatch(frase); // coloca no Firestore manualmente para simular que chegou
  deletarFrase(storageLocalA, frase.id);

  assert(!idNoFirestore(frase.id),               'frase deletada do Firestore por A');
  assert(idNoTombstoneSync(frase.id),            'id está no tombstone sync após deleção em A');

  // B abre o painel — SEM o fix, re-subiria a frase
  const visB = carregarFrases(storageLocalB);

  assert(!idNoFirestore(frase.id),               'frase NÃO foi re-subida ao Firestore por B');
  assert(!fraseVisivel(visB, 'Pendente no B'),   'frase NÃO aparece no painel do B');
  assert(!idNoPendingSync(storageLocalB, frase.id), 'pm_pending_sync limpo (sem leak)');
  info(`Tombstone size: ${lerTombstoneSync().size}`);
}

head('CENÁRIO 4 — Deleção offline em A: retry quando B abre o painel');
sep();
{
  resetState();
  const frase = capturarFrase(storageLocalA, 'Offline delete');

  // A tenta deletar mas Firestore falha → fica em pm_deleted_ids E pm_deleted_sync
  deletarFrase(storageLocalA, frase.id, { firestoreFailure: true });

  assert(idNoFirestore(frase.id),             'frase ainda no Firestore (delete falhou)');
  assert(idNoTombstoneSync(frase.id),         'id está no tombstone sync');

  // B abre o painel → tombstone sync ativa → B deleta do Firestore
  const visB = carregarFrases(storageLocalB);

  assert(!idNoFirestore(frase.id),            'B deletou do Firestore via tombstone sync');
  assert(!fraseVisivel(visB, 'Offline delete'),'frase NÃO aparece no painel do B');

  // A re-abre o painel → tombstone local faz retry (frase já foi deletada por B, 404 = ok)
  const visA = carregarFrases(storageLocalA);
  assert(!fraseVisivel(visA, 'Offline delete'),'frase NÃO aparece no painel do A após retry');
}

head('CENÁRIO 5 — Frase antiga (>30d) deletada hoje propaga corretamente');
sep();
{
  resetState();
  // Frase criada 40 dias atrás (id no passado)
  const idAntigo = Date.now() - 40 * 24 * 60 * 60 * 1000;
  const frase = { texto: 'Frase antiga', data: '01/02/2026', streaming: 'netflix', id: idAntigo, idioma: 'Inglês' };
  firestorePatch(frase);
  setLocal(storageLocalA, { frases: [frase] });
  setLocal(storageLocalB, { frases: [frase] });

  // A deleta hoje
  deletarFrase(storageLocalA, frase.id);

  // Verifica que o tombstone NÃO expirou imediatamente (bug do TTL antigo)
  const tombstone = lerTombstoneSync();
  assert(tombstone.has(String(idAntigo)), 'tombstone contém frase antiga (TTL conta da deleção, não da criação)');

  // B abre o painel
  const visB = carregarFrases(storageLocalB);
  assert(!idNoFirestore(frase.id),                'frase antiga removida do Firestore');
  assert(!fraseVisivel(visB, 'Frase antiga'),     'frase antiga NÃO aparece no B');
}

head('CENÁRIO 6 — Deleção em A não afeta outras frases em B');
sep();
{
  resetState();
  const f1 = capturarFrase(storageLocalA, 'Keep this');
  const f2 = capturarFrase(storageLocalA, 'Delete this');

  // B sincroniza e também captura uma frase própria
  carregarFrases(storageLocalB);
  const f3 = capturarFrase(storageLocalB, 'From B');

  // A deleta apenas f2
  deletarFrase(storageLocalA, f2.id);

  // B abre painel
  const visB = carregarFrases(storageLocalB);

  assert(fraseVisivel(visB, 'Keep this'),     'f1 (não deletada) ainda aparece em B');
  assert(!fraseVisivel(visB, 'Delete this'),  'f2 (deletada em A) não aparece em B');
  assert(fraseVisivel(visB, 'From B'),        'f3 (de B) ainda aparece em B');
  info(`Painel B mostra ${visB.length} frase(s)`);
}

head('CENÁRIO 7 — Deleção em B propaga para A');
sep();
{
  resetState();
  const frase = capturarFrase(storageLocalA, 'Delete from B');
  carregarFrases(storageLocalB); // B sincroniza

  // B deleta
  deletarFrase(storageLocalB, frase.id);

  // A abre painel
  const visA = carregarFrases(storageLocalA);
  assert(!idNoFirestore(frase.id),               'frase removida do Firestore por B');
  assert(!fraseVisivel(visA, 'Delete from B'),   'frase não aparece no painel de A');
}

head('CENÁRIO 8 — "Apagar tudo" em A propaga para B');
sep();
{
  resetState();
  const f1 = capturarFrase(storageLocalA, 'Phrase 1');
  const f2 = capturarFrase(storageLocalA, 'Phrase 2');
  const f3 = capturarFrase(storageLocalA, 'Phrase 3');
  carregarFrases(storageLocalB);

  // A apaga tudo
  const ids = [f1.id, f2.id, f3.id];
  removerFrases(storageLocalA, ids);
  setLocal(storageLocalA, { frases: [] });

  const visB = carregarFrases(storageLocalB);
  assert(Object.keys(firestore).length === 0,  'Firestore vazio após apagar tudo');
  assert(visB.length === 0,                    'Painel B mostra 0 frases após apagar tudo em A');
}

head('CENÁRIO 9 — Tombstone TTL: entradas expiradas são ignoradas');
sep();
{
  resetState();
  const deletedAt31d = Date.now() - 31 * 24 * 60 * 60 * 1000;
  const idAntigo     = String(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const idRecente    = String(Date.now() - 1000);
  const deletedAtNow = Date.now();

  // Novo formato: uma chave por frase
  storageSync[`${TOMB_PREFIX}${idAntigo}`]  = deletedAt31d; // expirado
  storageSync[`${TOMB_PREFIX}${idRecente}`] = deletedAtNow; // válido

  const tombstone = lerTombstoneSync();
  assert(!tombstone.has(idAntigo),  'entrada expirada (31d) NÃO está no tombstone');
  assert(tombstone.has(idRecente),  'entrada recente está no tombstone');
  // chave expirada é removida automaticamente
  assert(!(`${TOMB_PREFIX}${idAntigo}` in storageSync), 'chave expirada removida do sync storage');
}

head('CENÁRIO 10 — Captura em B durante painel aberto em A não perde dados');
sep();
{
  resetState();
  // A tem uma frase
  const f1 = capturarFrase(storageLocalA, 'Already synced');

  // B captura uma frase nova enquanto A está sincronizando (sem falha)
  const f2 = capturarFrase(storageLocalB, 'New from B');

  // A carrega frases (deve incluir as de B via Firestore)
  const visA = carregarFrases(storageLocalA);
  assert(fraseVisivel(visA, 'Already synced'), 'f1 aparece em A');
  assert(fraseVisivel(visA, 'New from B'),     'f2 (de B) aparece em A via Firestore');
  assert(idNoFirestore(f2.id),                'f2 está no Firestore');
}

head('CENÁRIO 11 — Re-deleção da mesma frase (idempotência)');
sep();
{
  resetState();
  const frase = capturarFrase(storageLocalA, 'Double delete');

  deletarFrase(storageLocalA, frase.id);
  deletarFrase(storageLocalA, frase.id); // segunda deleção do mesmo id

  const visB = carregarFrases(storageLocalB);
  assert(!fraseVisivel(visB, 'Double delete'), 'frase não aparece em B mesmo com double delete');
  assert(!idNoFirestore(frase.id),             'Firestore não tem a frase');
}

head('CENÁRIO 12 — Múltiplas frases: deleção seletiva preserva o restante');
sep();
{
  resetState();
  const frases = [];
  for (let i = 1; i <= 5; i++) frases.push(capturarFrase(storageLocalA, `Phrase ${i}`));

  carregarFrases(storageLocalB);

  // A deleta frases 2 e 4
  deletarFrase(storageLocalA, frases[1].id);
  deletarFrase(storageLocalA, frases[3].id);

  const visB = carregarFrases(storageLocalB);
  assert(fraseVisivel(visB, 'Phrase 1'), 'Phrase 1 presente');
  assert(!fraseVisivel(visB, 'Phrase 2'), 'Phrase 2 deletada');
  assert(fraseVisivel(visB, 'Phrase 3'), 'Phrase 3 presente');
  assert(!fraseVisivel(visB, 'Phrase 4'), 'Phrase 4 deletada');
  assert(fraseVisivel(visB, 'Phrase 5'), 'Phrase 5 presente');
  assert(visB.length === 3, `B mostra exatamente 3 frases (mostrou ${visB.length})`);
}

head('CENÁRIO 13 — Race condition: painel abre enquanto sync ainda está em voo');
sep();
{
  resetState();
  const frase = capturarFrase(storageLocalA, 'In-flight phrase', { syncInFlight: true });

  assert(!idNoFirestore(frase.id),                 'frase não está no Firestore ainda (sync em voo)');

  // Painel abre imediatamente — frase está no local, deve aparecer e ser re-enviada
  const visA = carregarFrases(storageLocalA);

  assert(fraseVisivel(visA, 'In-flight phrase'),   'frase aparece no painel (local como buffer)');
  assert(idNoFirestore(frase.id),                  'orphan detectado e re-enviado ao Firestore');
}

head('CENÁRIO 14 — Adição manual (painel): sync falha, recupera na próxima abertura');
sep();
{
  resetState();
  // Simula salvarMultiAdd: salva local, Firestore falha (sem pm_pending_sync)
  const frase = adicionarFraseManual(storageLocalA, 'Manual phrase', { syncFails: true });

  assert(!idNoFirestore(frase.id),               'frase não está no Firestore (sync falhou)');

  // Refresh do painel — nova lógica detecta como orphan e re-sobe
  const visA = carregarFrases(storageLocalA);

  assert(fraseVisivel(visA, 'Manual phrase'),    'frase recuperada no painel após refresh');
  assert(idNoFirestore(frase.id),               'frase re-enviada ao Firestore com sucesso');
}

head('CENÁRIO 15 — Tombstone vence: frase local tombstoned NÃO re-sobe');
sep();
{
  resetState();
  const frase = capturarFrase(storageLocalA, 'Will be deleted', { syncInFlight: true });

  firestorePatch(frase); // sync completou em background
  deletarFrase(storageLocalA, frase.id); // usuário deleta (remove do local + tombstone)

  assert(!idNoFirestore(frase.id),               'frase deletada do Firestore');
  assert(idNoTombstoneSync(frase.id),            'tombstone ativo');

  // Painel re-abre: tombstone vence, não re-sobe
  const visA = carregarFrases(storageLocalA);

  assert(!fraseVisivel(visA, 'Will be deleted'), 'frase NÃO re-aparece');
  assert(!idNoFirestore(frase.id),               'frase NÃO re-subiu ao Firestore');
}

head('CENÁRIO 16 — Adição manual em B: sync falha, aparece em A após B abrir painel');
sep();
{
  resetState();
  // B adiciona manualmente (sync falha — frase só no local de B)
  const frase = adicionarFraseManual(storageLocalB, 'Manual from B', { syncFails: true });

  assert(!idNoFirestore(frase.id), 'frase não está no Firestore');

  // B abre painel → detecta orphan → re-sobe
  const visB = carregarFrases(storageLocalB);
  assert(fraseVisivel(visB, 'Manual from B'), 'frase aparece em B após re-envio');
  assert(idNoFirestore(frase.id),             'frase chegou ao Firestore');

  // A abre painel → vê a frase de B
  const visA = carregarFrases(storageLocalA);
  assert(fraseVisivel(visA, 'Manual from B'), 'frase de B aparece em A');
}

head('CENÁRIO 17 — Deleções simultâneas em A e B (o bug relatado)');
sep();
{
  resetState();
  const fA = capturarFrase(storageLocalA, 'Phrase A');
  const fB = capturarFrase(storageLocalB, 'Phrase B');
  // ambas chegam ao Firestore
  assert(idNoFirestore(fA.id), 'fA no Firestore');
  assert(idNoFirestore(fB.id), 'fB no Firestore');

  // A e B SIMULTANEAMENTE deletam suas frases
  // Simula race: ambos chamam marcarParaDeletarSync ao mesmo tempo
  // Com o array antigo, um sobrescreveria o outro
  // Com per-key, cada um escreve sua própria chave → sem conflito
  deletarFrase(storageLocalA, fA.id); // grava pm_del_{fA.id}
  deletarFrase(storageLocalB, fB.id); // grava pm_del_{fB.id} — não conflita

  const tomb = lerTombstoneSync();
  assert(tomb.has(String(fA.id)), 'tombstone contém fA (deletada por A)');
  assert(tomb.has(String(fB.id)), 'tombstone contém fB (deletada por B)');

  // A abre painel — deve não ver nenhuma das duas
  const visA = carregarFrases(storageLocalA);
  assert(!fraseVisivel(visA, 'Phrase A'), 'A: fA não aparece');
  assert(!fraseVisivel(visA, 'Phrase B'), 'A: fB não aparece (deletada por B)');

  // B abre painel — deve não ver nenhuma das duas
  const visB = carregarFrases(storageLocalB);
  assert(!fraseVisivel(visB, 'Phrase A'), 'B: fA não aparece (deletada por A)');
  assert(!fraseVisivel(visB, 'Phrase B'), 'B: fB não aparece');

  assert(Object.keys(firestore).length === 0, 'Firestore vazio');
}

head('CENÁRIO 18 — Deleções simultâneas não afetam frases de terceiros');
sep();
{
  resetState();
  const fA     = capturarFrase(storageLocalA, 'Delete by A');
  const fB     = capturarFrase(storageLocalB, 'Delete by B');
  const fKeep  = capturarFrase(storageLocalA, 'Keep this');

  carregarFrases(storageLocalB); // B sincroniza fKeep

  // Deleções simultâneas
  deletarFrase(storageLocalA, fA.id);
  deletarFrase(storageLocalB, fB.id);

  const visA = carregarFrases(storageLocalA);
  const visB = carregarFrases(storageLocalB);

  assert(!fraseVisivel(visA, 'Delete by A'), 'A: fA removida');
  assert(!fraseVisivel(visA, 'Delete by B'), 'A: fB removida');
  assert(fraseVisivel(visA, 'Keep this'),    'A: fKeep presente');

  assert(!fraseVisivel(visB, 'Delete by A'), 'B: fA removida');
  assert(!fraseVisivel(visB, 'Delete by B'), 'B: fB removida');
  assert(fraseVisivel(visB, 'Keep this'),    'B: fKeep presente');
}

// ─── Resultado final ──────────────────────────────────────────────────────────

console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
const total = passed + failed;
if (failed === 0) {
  console.log(`${C.bold}${C.green}TODOS OS TESTES PASSARAM: ${passed}/${total}${C.reset}`);
} else {
  console.log(`${C.bold}${C.red}FALHAS: ${failed}/${total}  |  Passaram: ${passed}/${total}${C.reset}`);
}
console.log(`${C.bold}${'═'.repeat(60)}${C.reset}\n`);

process.exit(failed > 0 ? 1 : 0);
