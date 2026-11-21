'use strict';

const { criarSincronizacao, criarSessao, nuvemHttp, armazenamentoDoChrome, paraCampos, deCampos,
  tombstoneFirestore, tombstonesSync, MOTIVO, PREFIXO_DO_TOMBSTONE } = require('../lib/sincronizacao');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m', blue: '\x1b[34m',
};
const ok = (msg) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const fail = (msg) => console.log(`  ${C.red}✗ FALHOU: ${msg}${C.reset}`);
const info = (msg) => console.log(`  ${C.gray}  ${msg}${C.reset}`);
const head = (msg) => console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}`);
const sep = () => console.log(`${C.gray}${'─'.repeat(60)}${C.reset}`);

let passed = 0, failed = 0;

function assert(condition, label) {
  if (condition) { ok(label); passed++; }
  else { fail(label); failed++; }
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

let firestore = {};
let firestoreTomb = {};
let nuvemFalha = {};

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

let storageSync = {};
let localA = {};
let localB = {};
let computadores = new Map();
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
  storageSync = {}; localA = {}; localB = {};
  computadores = new Map();
  _phraseCounter = 0;
  ligar(localA);
  ligar(localB);
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

async function removerFrases(storage, ids, { firestoreFailure = false } = {}) {
  nuvemFalha.apagar = firestoreFailure;
  const erro = await de(storage).sinc.apagar(ids);
  nuvemFalha.apagar = false;
  return !erro;
}

async function carregarFrases(storage, { atuais = [] } = {}) {
  const resultado = await de(storage).sinc.carregar({ atuais: () => atuais });
  await resultado.concluida;
  return resultado.frases;
}

function guardarFraseNova(storage, texto, streaming) {
  const frase = { texto, data: '06/04/2026', streaming, id: Date.now() + (++_phraseCounter), idioma: 'Inglês' };
  const { frases = [] } = getLocal(storage, { frases: [] });
  setLocal(storage, { frases: [frase, ...frases] });
  return frase;
}

async function capturarFrase(storage, texto, { syncFails = false, syncInFlight = false } = {}) {
  const frase = guardarFraseNova(storage, texto, 'youtube');
  if (!syncFails && !syncInFlight) await de(storage).nuvem.gravarFrase(frase);
  return frase;
}

async function adicionarFraseManual(storage, texto, { syncFails = false } = {}) {
  const frase = guardarFraseNova(storage, texto, 'manual');
  if (!syncFails) await de(storage).nuvem.gravarFrase(frase);
  return frase;
}

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
function idNoLocal(storage, id) {
  return getLocal(storage, { frases: [] }).frases.some(f => String(f.id) === String(id));
}
async function lerTombstoneSync() {
  const itens = await areaEmMemoria(storageSync).get(null);
  return new Set(Object.keys(itens).filter(k => k.startsWith(PREFIXO_DO_TOMBSTONE)).map(k => k.slice(PREFIXO_DO_TOMBSTONE.length)));
}
async function idNoTombstoneSync(id) {
  return (await lerTombstoneSync()).has(String(id)) || String(id) in firestoreTomb;
}

const DIA = 24 * 60 * 60 * 1000;
const diasAtras = (dias) => Date.now() - dias * DIA;

function fraseDaNetflix(texto, id) {
  return { texto, data: '01/02/2026', streaming: 'netflix', id, idioma: 'Inglês' };
}
const frasesLocais = (storage) => getLocal(storage, { frases: [] }).frases;
const idsApagadosAqui = (storage) => getLocal(storage, { pm_deleted_ids: [] }).pm_deleted_ids;
const apagarTudoPendente = (storage) => getLocal(storage, { pm_apagar_tudo: null }).pm_apagar_tudo;
const docsNoFirestore = () => Object.keys(firestore).length;

async function comNuvemFalhando(qual, acao) {
  nuvemFalha[qual] = true;
  try {
    return await acao();
  } finally {
    nuvemFalha[qual] = false;
  }
}

async function erroDe(acao) {
  try {
    await acao();
    return null;
  } catch (e) {
    return e;
  }
}

async function desfechoDe(promessa) {
  const [desfecho] = await Promise.allSettled([promessa]);
  return desfecho;
}
const rejeitouComExpirou = (desfecho) => desfecho.status === 'rejected' && desfecho.reason?.motivo === MOTIVO.EXPIROU;

function conferirPresencas(vis, presencas, prefixo = '') {
  for (const [texto, rotulo, presente] of presencas) assert(fraseVisivel(vis, texto) === presente, `${prefixo}${rotulo}`);
}

async function adicaoEmAApareceEmB() {
  const fa = await capturarFrase(localA, 'Hello world');
  const visB = await carregarFrases(localB);

  assert(idNoFirestore(fa.id), 'frase está no Firestore após captura');
  assert(fraseVisivel(visB, 'Hello world'), 'frase aparece no painel do dispositivo B');
  info(`Firestore tem ${docsNoFirestore()} doc(s)`);
}

async function delecaoEmASomeDeB() {
  const frase = await capturarFrase(localA, 'To delete');
  await carregarFrases(localB);

  await deletarFrase(localA, frase.id);

  const visB = await carregarFrases(localB);

  assert(!idNoFirestore(frase.id), 'frase removida do Firestore');
  assert(!fraseVisivel(visB, 'To delete'), 'frase NÃO aparece no painel do B após deleção em A');
  assert(await idNoTombstoneSync(frase.id), 'tombstone ainda ativo após B processar (expira em 30 dias)');
  info(`Firestore tem ${docsNoFirestore()} doc(s)`);
}

async function pendenteEmBDeletadaEmA() {
  const frase = await capturarFrase(localB, 'Pendente no B', { syncFails: true });

  assert(!idNoFirestore(frase.id), 'frase NÃO está no Firestore (sync falhou)');
  assert(idNoLocal(localB, frase.id), 'frase está no local do B');

  await nuvemEmMemoria().gravarFrase(frase);
  await deletarFrase(localA, frase.id);

  assert(!idNoFirestore(frase.id), 'frase deletada do Firestore por A');
  assert(await idNoTombstoneSync(frase.id), 'id está no tombstone sync após deleção em A');

  const visB = await carregarFrases(localB);

  assert(!idNoFirestore(frase.id), 'frase NÃO foi re-subida ao Firestore por B');
  assert(!fraseVisivel(visB, 'Pendente no B'), 'frase NÃO aparece no painel do B');
  assert(!idNoLocal(localB, frase.id), 'frase tirada do local do B (sem leak)');
  info(`Tombstone size: ${(await lerTombstoneSync()).size}`);
}

async function delecaoOfflineRepetidaPorB() {
  const frase = await capturarFrase(localA, 'Offline delete');

  await deletarFrase(localA, frase.id, { firestoreFailure: true });

  assert(idNoFirestore(frase.id), 'frase ainda no Firestore (delete falhou)');
  assert(await idNoTombstoneSync(frase.id), 'id está no tombstone sync');

  const visB = await carregarFrases(localB);

  assert(!idNoFirestore(frase.id), 'B deletou do Firestore via tombstone sync');
  assert(!fraseVisivel(visB, 'Offline delete'), 'frase NÃO aparece no painel do B');

  const visA = await carregarFrases(localA);
  assert(!fraseVisivel(visA, 'Offline delete'), 'frase NÃO aparece no painel do A após retry');
}

async function fraseAntigaDeletadaHojePropaga() {
  const idAntigo = diasAtras(40);
  const frase = fraseDaNetflix('Frase antiga', idAntigo);
  await nuvemEmMemoria().gravarFrase(frase);
  setLocal(localA, { frases: [frase] });
  setLocal(localB, { frases: [frase] });

  await deletarFrase(localA, frase.id);

  const tombstone = await lerTombstoneSync();
  assert(tombstone.has(String(idAntigo)), 'tombstone contém frase antiga (TTL conta da deleção, não da criação)');

  const visB = await carregarFrases(localB);
  assert(!idNoFirestore(frase.id), 'frase antiga removida do Firestore');
  assert(!fraseVisivel(visB, 'Frase antiga'), 'frase antiga NÃO aparece no B');
}

async function delecaoEmANaoAfetaOutrasEmB() {
  await capturarFrase(localA, 'Keep this');
  const f2 = await capturarFrase(localA, 'Delete this');

  await carregarFrases(localB);
  await capturarFrase(localB, 'From B');

  await deletarFrase(localA, f2.id);

  const visB = await carregarFrases(localB);

  conferirPresencas(visB, [
    ['Keep this', 'f1 (não deletada) ainda aparece em B', true],
    ['Delete this', 'f2 (deletada em A) não aparece em B', false],
    ['From B', 'f3 (de B) ainda aparece em B', true],
  ]);
  info(`Painel B mostra ${visB.length} frase(s)`);
}

async function delecaoEmBPropagaParaA() {
  const frase = await capturarFrase(localA, 'Delete from B');
  await carregarFrases(localB);

  await deletarFrase(localB, frase.id);

  const visA = await carregarFrases(localA);
  assert(!idNoFirestore(frase.id), 'frase removida do Firestore por B');
  assert(!fraseVisivel(visA, 'Delete from B'), 'frase não aparece no painel de A');
}

async function apagarTudoEmAPropagaParaB() {
  const ids = [];
  for (const texto of ['Phrase 1', 'Phrase 2', 'Phrase 3']) ids.push((await capturarFrase(localA, texto)).id);
  await carregarFrases(localB);

  await removerFrases(localA, ids);
  setLocal(localA, { frases: [] });

  const visB = await carregarFrases(localB);
  assert(docsNoFirestore() === 0, 'Firestore vazio após apagar tudo');
  assert(visB.length === 0, 'Painel B mostra 0 frases após apagar tudo em A');
}

async function tombstoneExpiradoEIgnorado() {
  const deletedAt31d = diasAtras(31);
  const fAntiga = fraseDaNetflix('Tombstone expirado', diasAtras(60));
  const fRecente = fraseDaNetflix('Tombstone válido', Date.now() - 1000);
  firestore[fAntiga.id] = fAntiga;
  firestore[fRecente.id] = fRecente;

  storageSync[`${PREFIXO_DO_TOMBSTONE}${fAntiga.id}`] = deletedAt31d;
  storageSync[`${PREFIXO_DO_TOMBSTONE}${fRecente.id}`] = Date.now();

  const visB = await carregarFrases(localB);
  assert(fraseVisivel(visB, 'Tombstone expirado'), 'tombstone expirado (31d) NÃO apaga a frase');
  assert(!fraseVisivel(visB, 'Tombstone válido'), 'tombstone recente apaga a frase');
  assert(idNoFirestore(fAntiga.id) && !idNoFirestore(fRecente.id), 'só a frase com tombstone válido saiu da nuvem');
  assert(!(`${PREFIXO_DO_TOMBSTONE}${fAntiga.id}` in storageSync), 'chave expirada removida do sync storage');

  firestoreTomb[fAntiga.id] = deletedAt31d;
  const visA = await carregarFrases(localA);
  assert(fraseVisivel(visA, 'Tombstone expirado'), 'tombstone da nuvem expirado (31d) NÃO apaga a frase');
}

async function capturaEmBComPainelAbertoEmA() {
  await capturarFrase(localA, 'Already synced');

  const f2 = await capturarFrase(localB, 'New from B');

  const visA = await carregarFrases(localA);
  assert(fraseVisivel(visA, 'Already synced'), 'f1 aparece em A');
  assert(fraseVisivel(visA, 'New from B'), 'f2 (de B) aparece em A via Firestore');
  assert(idNoFirestore(f2.id), 'f2 está no Firestore');
}

async function reDelecaoEIdempotente() {
  const frase = await capturarFrase(localA, 'Double delete');

  await deletarFrase(localA, frase.id);
  await deletarFrase(localA, frase.id);

  const visB = await carregarFrases(localB);
  assert(!fraseVisivel(visB, 'Double delete'), 'frase não aparece em B mesmo com double delete');
  assert(!idNoFirestore(frase.id), 'Firestore não tem a frase');
}

async function delecaoSeletivaPreservaORestante() {
  const frases = [];
  for (let i = 1; i <= 5; i++) frases.push(await capturarFrase(localA, `Phrase ${i}`));

  await carregarFrases(localB);

  await deletarFrase(localA, frases[1].id);
  await deletarFrase(localA, frases[3].id);

  const visB = await carregarFrases(localB);
  conferirPresencas(visB, [
    ['Phrase 1', 'Phrase 1 presente', true],
    ['Phrase 2', 'Phrase 2 deletada', false],
    ['Phrase 3', 'Phrase 3 presente', true],
    ['Phrase 4', 'Phrase 4 deletada', false],
    ['Phrase 5', 'Phrase 5 presente', true],
  ]);
  assert(visB.length === 3, `B mostra exatamente 3 frases (mostrou ${visB.length})`);
}

async function painelAbreComSyncEmVoo() {
  const frase = await capturarFrase(localA, 'In-flight phrase', { syncInFlight: true });

  assert(!idNoFirestore(frase.id), 'frase não está no Firestore ainda (sync em voo)');

  const visA = await carregarFrases(localA);

  assert(fraseVisivel(visA, 'In-flight phrase'), 'frase aparece no painel (local como buffer)');
  assert(idNoFirestore(frase.id), 'orphan detectado e re-enviado ao Firestore');
}

async function adicaoManualRecuperaNaProximaAbertura() {
  const frase = await adicionarFraseManual(localA, 'Manual phrase', { syncFails: true });

  assert(!idNoFirestore(frase.id), 'frase não está no Firestore (sync falhou)');

  const visA = await carregarFrases(localA);

  assert(fraseVisivel(visA, 'Manual phrase'), 'frase recuperada no painel após refresh');
  assert(idNoFirestore(frase.id), 'frase re-enviada ao Firestore com sucesso');
}

async function tombstoneVenceAFraseLocal() {
  const frase = await capturarFrase(localA, 'Will be deleted', { syncInFlight: true });

  await nuvemEmMemoria().gravarFrase(frase);
  await deletarFrase(localA, frase.id);

  assert(!idNoFirestore(frase.id), 'frase deletada do Firestore');
  assert(await idNoTombstoneSync(frase.id), 'tombstone ativo');

  const visA = await carregarFrases(localA);

  assert(!fraseVisivel(visA, 'Will be deleted'), 'frase NÃO re-aparece');
  assert(!idNoFirestore(frase.id), 'frase NÃO re-subiu ao Firestore');
}

async function adicaoManualEmBApareceEmA() {
  const frase = await adicionarFraseManual(localB, 'Manual from B', { syncFails: true });

  assert(!idNoFirestore(frase.id), 'frase não está no Firestore');

  const visB = await carregarFrases(localB);
  assert(fraseVisivel(visB, 'Manual from B'), 'frase aparece em B após re-envio');
  assert(idNoFirestore(frase.id), 'frase chegou ao Firestore');

  const visA = await carregarFrases(localA);
  assert(fraseVisivel(visA, 'Manual from B'), 'frase de B aparece em A');
}

async function delecoesSimultaneasEmAEB() {
  const fA = await capturarFrase(localA, 'Phrase A');
  const fB = await capturarFrase(localB, 'Phrase B');
  assert(idNoFirestore(fA.id), 'fA no Firestore');
  assert(idNoFirestore(fB.id), 'fB no Firestore');

  await deletarFrase(localA, fA.id);
  await deletarFrase(localB, fB.id);

  const tomb = await lerTombstoneSync();
  assert(tomb.has(String(fA.id)), 'tombstone contém fA (deletada por A)');
  assert(tomb.has(String(fB.id)), 'tombstone contém fB (deletada por B)');

  conferirPresencas(await carregarFrases(localA), [
    ['Phrase A', 'fA não aparece', false],
    ['Phrase B', 'fB não aparece (deletada por B)', false],
  ], 'A: ');
  conferirPresencas(await carregarFrases(localB), [
    ['Phrase A', 'fA não aparece (deletada por A)', false],
    ['Phrase B', 'fB não aparece', false],
  ], 'B: ');

  assert(docsNoFirestore() === 0, 'Firestore vazio');
}

async function delecoesSimultaneasPreservamTerceiros() {
  const fA = await capturarFrase(localA, 'Delete by A');
  const fB = await capturarFrase(localB, 'Delete by B');
  await capturarFrase(localA, 'Keep this');

  await carregarFrases(localB);

  await deletarFrase(localA, fA.id);
  await deletarFrase(localB, fB.id);

  const visA = await carregarFrases(localA);
  const visB = await carregarFrases(localB);

  const presencas = [
    ['Delete by A', 'fA removida', false],
    ['Delete by B', 'fB removida', false],
    ['Keep this', 'fKeep presente', true],
  ];
  conferirPresencas(visA, presencas, 'A: ');
  conferirPresencas(visB, presencas, 'B: ');
}

async function apagarTudoComANuvemFora() {
  const antes1 = await capturarFrase(localA, 'Gravada em A');
  const antesB = await capturarFrase(localB, 'Gravada em B antes do apagar tudo');
  await carregarFrases(localA);

  const resultado = await comNuvemFalhando('apagar', () => de(localA).sinc.apagarTudo([antes1.id], antesB.id));
  setLocal(localA, { frases: [] });

  assert(!resultado.ok && resultado.erro instanceof Error, 'apagarTudo avisa que a nuvem falhou');
  assert(apagarTudoPendente(localA)?.uid === 'uid-teste', 'pm_apagar_tudo guardado até a nuvem confirmar');
  assert(idNoFirestore(antes1.id), 'a nuvem ainda tem as frases');

  const depois = await capturarFrase(localB, 'Minerada depois');

  const visA = await carregarFrases(localA);
  assert(!idNoFirestore(antes1.id) && !idNoFirestore(antesB.id), 'frases de antes do Apagar tudo saíram da nuvem (também a de B, que A nunca tinha em mãos)');
  assert(idNoFirestore(depois.id), 'o que foi minerado depois fica na nuvem');
  assert(fraseVisivel(visA, 'Minerada depois') && visA.length === 1, 'A mostra só o que veio depois');
  assert(apagarTudoPendente(localA) === null, 'pm_apagar_tudo é limpo');
}

async function apagarTudoComANuvemNoAr() {
  const f1 = await capturarFrase(localA, 'Phrase 1');
  const f2 = await capturarFrase(localB, 'Phrase 2 de B');
  const resultado = await de(localA).sinc.apagarTudo([f1.id], f2.id);
  setLocal(localA, { frases: [] });

  assert(resultado.ok, 'apagarTudo confirma');
  assert(docsNoFirestore() === 0, 'a nuvem ficou vazia, inclusive a frase de B');
  assert(!('pm_apagar_tudo' in localA), 'nenhuma pendência de Apagar tudo');
  assert(await idNoTombstoneSync(f2.id), 'a frase de B ganhou tombstone');
  assert((await carregarFrases(localB)).length === 0, 'B abre o painel e não vê nada');
}

async function semContaSoGravaTombstonesLocais() {
  ligar(localA, { semConta: true });
  const resultado = await de(localA).sinc.apagarTudo([1, 2]);
  assert(resultado.ok, 'apagarTudo sem conta resolve ok');
  assert(!('pm_apagar_tudo' in localA), 'sem conta não há Apagar tudo pendente');
  const erro = await de(localA).sinc.apagar([3]);
  assert(erro === null, 'apagar sem conta não falha');
  assert(idsApagadosAqui(localA).includes('3'), 'o id fica em pm_deleted_ids');
  assert((await lerTombstoneSync()).has('3'), 'e no tombstone do sync');
}

async function marcasJuntamLocalENuvem() {
  const marcadaAqui = await capturarFrase(localA, 'Marcada aqui');
  const marcadaLa = await capturarFrase(localA, 'Marcada na nuvem');
  const marcarExportada = (f) => (f.id === marcadaAqui.id ? { ...f, status: 'exported' } : f);
  setLocal(localA, { frases: frasesLocais(localA).map(marcarExportada) });
  firestore[marcadaLa.id] = { ...marcadaLa, exportadaTxt: true };

  const vis = await carregarFrases(localA);
  const porTexto = (t) => vis.find(f => f.texto === t);
  assert(porTexto('Marcada aqui').status === 'exported', 'a marca daqui aparece na lista');
  assert(firestore[marcadaAqui.id].status === 'exported', 'e vai para a nuvem (retry)');
  assert(porTexto('Marcada na nuvem').exportadaTxt === true, 'a marca da nuvem aparece na lista');
  assert(frasesLocais(localA).find(f => f.id === marcadaLa.id).exportadaTxt === true, 'e é aplicada ao local');
}

async function fraseQueNaoSobeNuncaSome() {
  const frase = await capturarFrase(localA, 'Nuvem recusa', { syncFails: true });
  const resultado = await comNuvemFalhando('gravarFrase', async () => {
    const carregado = await de(localA).sinc.carregar({ atuais: () => [] });
    await carregado.concluida;
    return carregado;
  });

  assert(fraseVisivel(resultado.frases, 'Nuvem recusa'), 'a frase continua na lista');
  assert(resultado.falhaNasOrfas?.quantas === 1, 'a falha é contada (falhaNasOrfas)');
  assert(resultado.desteComputador === 1, 'desteComputador conta as frases locais');
  assert(idNoLocal(localA, frase.id), 'continua no local');

  const depois = await carregarFrases(localA);
  assert(fraseVisivel(depois, 'Nuvem recusa') && idNoFirestore(frase.id),
    'na próxima abertura sobe');
}

async function edicaoDuranteARespostaSobrevive() {
  const frase = await capturarFrase(localA, 'Antes da edição', { syncInFlight: true });
  let leituras = 0;
  const resultado = await de(localA).sinc.carregar({
    atuais: () => { leituras++; return [{ ...frase, texto: 'Depois da edição' }]; },
  });
  await resultado.concluida;
  assert(leituras === 1, 'a lista da tela é consultada uma vez, depois da leitura da nuvem');
  assert(fraseVisivel(resultado.frases, 'Depois da edição'), 'a órfã aparece com a edição');
  assert(!fraseVisivel(resultado.frases, 'Antes da edição'), 'e não com o texto antigo');
}

async function nuvemCaladaCarregarRejeita() {
  const frase = await capturarFrase(localA, 'Só aqui', { syncFails: true });
  nuvemFalha.listar = true;
  const erro = await erroDe(() => de(localA).sinc.carregar());
  assert(erro !== null, 'carregar rejeita com a causa');
  assert(frasesLocais(localA).some(f => f.id === frase.id), 'a frase continua no local');
}

async function deleteQueFalhouERepetido() {
  const frase = await capturarFrase(localA, 'Delete teimoso');
  await deletarFrase(localA, frase.id, { firestoreFailure: true });
  assert(idsApagadosAqui(localA).includes(String(frase.id)), 'id fica em pm_deleted_ids');

  const vis = await carregarFrases(localA);
  assert(!fraseVisivel(vis, 'Delete teimoso') && !idNoFirestore(frase.id), 'o retry apagou da nuvem');
  assert(idsApagadosAqui(localA).length === 0, 'e limpou pm_deleted_ids');
}

async function subirFrasesDeUmaVez() {
  const f1 = await capturarFrase(localA, 'Minerada 1', { syncFails: true });
  const erro = await comNuvemFalhando('gravarFrases', () => de(localA).sinc.subirFrases([f1]));
  assert(erro instanceof Error && !idNoFirestore(f1.id) && idNoLocal(localA, f1.id), 'a falha é devolvida e a frase fica no local');
  assert(await de(localA).sinc.subirFrases([f1]) === null && idNoFirestore(f1.id) && idNoLocal(localA, f1.id), 'ao subir, chega à nuvem e continua no local');
}

const CENARIOS_DO_SYNC = [
  ['CENÁRIO 1 — Adição no dispositivo A aparece no dispositivo B', adicaoEmAApareceEmB],
  ['CENÁRIO 2 — Deleção no dispositivo A desaparece do dispositivo B (cenário principal)', delecaoEmASomeDeB],
  ['CENÁRIO 3 — O bug original: frase pendente em B, deletada em A', pendenteEmBDeletadaEmA],
  ['CENÁRIO 4 — Deleção offline em A: retry quando B abre o painel', delecaoOfflineRepetidaPorB],
  ['CENÁRIO 5 — Frase antiga (>30d) deletada hoje propaga corretamente', fraseAntigaDeletadaHojePropaga],
  ['CENÁRIO 6 — Deleção em A não afeta outras frases em B', delecaoEmANaoAfetaOutrasEmB],
  ['CENÁRIO 7 — Deleção em B propaga para A', delecaoEmBPropagaParaA],
  ['CENÁRIO 8 — "Apagar tudo" em A propaga para B', apagarTudoEmAPropagaParaB],
  ['CENÁRIO 9 — Tombstone TTL: entradas expiradas são ignoradas', tombstoneExpiradoEIgnorado],
  ['CENÁRIO 10 — Captura em B durante painel aberto em A não perde dados', capturaEmBComPainelAbertoEmA],
  ['CENÁRIO 11 — Re-deleção da mesma frase (idempotência)', reDelecaoEIdempotente],
  ['CENÁRIO 12 — Múltiplas frases: deleção seletiva preserva o restante', delecaoSeletivaPreservaORestante],
  ['CENÁRIO 13 — Race condition: painel abre enquanto sync ainda está em voo', painelAbreComSyncEmVoo],
  ['CENÁRIO 14 — Adição manual (painel): sync falha, recupera na próxima abertura', adicaoManualRecuperaNaProximaAbertura],
  ['CENÁRIO 15 — Tombstone vence: frase local tombstoned NÃO re-sobe', tombstoneVenceAFraseLocal],
  ['CENÁRIO 16 — Adição manual em B: sync falha, aparece em A após B abrir painel', adicaoManualEmBApareceEmA],
  ['CENÁRIO 17 — Deleções simultâneas em A e B (o bug relatado)', delecoesSimultaneasEmAEB],
  ['CENÁRIO 18 — Deleções simultâneas não afetam frases de terceiros', delecoesSimultaneasPreservamTerceiros],
  ['CENÁRIO 19 — Apagar tudo com a nuvem fora do ar: o sync seguinte conclui, e o que veio depois fica', apagarTudoComANuvemFora],
  ['CENÁRIO 20 — Apagar tudo com a nuvem no ar apaga tudo e não deixa pendência', apagarTudoComANuvemNoAr],
  ['CENÁRIO 21 — Sem conta: Apagar tudo e apagar só gravam os tombstones deste computador', semContaSoGravaTombstonesLocais],
  ['CENÁRIO 22 — Marcas Enviada ao Anki / Exportada juntam local e nuvem', marcasJuntamLocalENuvem],
  ['CENÁRIO 23 — Frase que não sobe fica na lista e no computador (nunca some)', fraseQueNaoSobeNuncaSome],
  ['CENÁRIO 24 — Uma edição feita enquanto a nuvem responde sobrevive (a lista da tela é lida no fim)', edicaoDuranteARespostaSobrevive],
  ['CENÁRIO 25 — A nuvem não responde: carregar rejeita e nada local é descartado', nuvemCaladaCarregarRejeita],
  ['CENÁRIO 26 — Tombstone local: o DELETE que falhou é repetido no próximo carregamento', deleteQueFalhouERepetido],
  ['CENÁRIO 27 — Subir frases de uma vez: a falha é devolvida e nada some do computador', subirFrasesDeUmaVez],
];

const DOCS = 'https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents';

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

const recusa = (status, error) => () => ({ status, corpo: { error } });
const ehRenovacao = (url) => url.includes('securetoken');

function codecFazIdaEVolta() {
  const frase = { id: 123, texto: 'Hello', idioma: 'Inglês', keywords: ['a', 'b'], exportadaTxt: true, contexto: { titulo: 'Show', episodio: 3 }, nulo: null };
  const volta = deCampos(paraCampos(frase));
  assert(volta.id === 123 && volta.texto === 'Hello' && volta.exportadaTxt === true, 'números, textos e booleanos');
  assert(JSON.stringify(volta.keywords) === '["a","b"]', 'listas de textos');
  assert(volta.contexto.titulo === 'Show' && volta.contexto.episodio === 3, 'mapas (recursivo, com número dentro)');
  assert(!('nulo' in volta), 'null não vai para a nuvem');
  assert(paraCampos({ id: 5 }).id.integerValue === '5', 'inteiros vão como integerValue em texto');
}

function tombstoneTemMascaraPorCampo() {
  const { mascara, corpo } = tombstoneFirestore(['123', '456'], 99);
  assert(decodeURIComponent(mascara) === 'updateMask.fieldPaths=ids.`123`&updateMask.fieldPaths=ids.`456`', 'máscara por id, entre crases');
  assert(corpo.fields.ids.mapValue.fields['123'].integerValue === '99', 'corpo guarda a hora da deleção');
  assert(tombstonesSync(['7'], 5)[`${PREFIXO_DO_TOMBSTONE}7`] === 5, 'chave pm_del_{id} do chrome.storage.sync');
}

async function listarPaginaEDecodifica() {
  const paginas = {
    p1: { corpo: { documents: [{ fields: paraCampos({ id: 1, texto: 'um' }) }], nextPageToken: 'p2' } },
    p2: { corpo: { documents: [{ fields: paraCampos({ id: 2, texto: 'dois' }) }] } },
  };
  const { nuvem, pedidos } = nuvemDeTeste((url) => (url.includes('pageToken=p2') ? paginas.p2 : paginas.p1));
  const frases = await nuvem.listarFrases();
  assert(frases.map(f => f.texto).join() === 'um,dois', 'as duas páginas, na ordem');
  assert(pedidos[0].url === `${DOCS}/usuarios/u1/frases?pageSize=300`, 'primeira página em usuarios/{uid}/frases');
  assert(pedidos[1].url.endsWith('&pageToken=p2') && pedidos[1].token === 'Bearer token-bom', 'segunda página com o token da conta');
}

async function gravarCamposComMascara() {
  const semODocumento = recusa(404, { message: 'NOT_FOUND' });
  const { nuvem, pedidos } = nuvemDeTeste((url) => (url.includes('currentDocument.exists=true') ? semODocumento() : {}));
  await nuvem.gravarFrase({ id: 9, texto: 'x', keywords: ['k'] }, ['keywords']);
  assert(pedidos[0].url.endsWith('/frases/9?updateMask.fieldPaths=keywords&currentDocument.exists=true'), 'PATCH com updateMask e currentDocument.exists');
  assert(pedidos.length === 2 && pedidos[1].url.endsWith('/frases/9') && pedidos[1].metodo === 'PATCH', 'o 404 vira um PATCH do documento inteiro');
  await nuvem.gravarFrase({ id: 10, texto: 'y' });
  assert(pedidos[2].url.endsWith('/frases/10') && pedidos[2].corpo.fields.texto.stringValue === 'y', 'sem campos, grava todos');
}

async function apagarDistingueAusenteDeRecusa() {
  const a = nuvemDeTeste(() => ({ status: 404, corpo: {} }));
  let erro = await erroDe(() => a.nuvem.apagarFrases(['1', '2']));
  assert(erro === null && a.pedidos.length === 2 && a.pedidos.every(p => p.metodo === 'DELETE'), 'um DELETE por frase; 404 não é falha');

  const b = nuvemDeTeste(recusa(403, { status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' }));
  erro = await erroDe(() => b.nuvem.apagarFrases(['1']));
  assert(erro?.motivo === MOTIVO.RECUSADO && /insufficient/.test(erro.message), '403 → motivo RECUSADO, com a mensagem da nuvem');

  const c = nuvemDeTeste(recusa(503, { message: 'UNAVAILABLE' }));
  erro = await erroDe(() => c.nuvem.listarFrases());
  assert(erro?.status === 503 && !erro.motivo, '503 → falha comum, com o status');
}

async function tombstoneDaNuvemGravaELe() {
  const tombstones = { corpo: { fields: { ids: { mapValue: { fields: { 11: { integerValue: '1000' } } } } } } };
  const { nuvem, pedidos } = nuvemDeTeste((url, opcoes) => (opcoes.method === 'PATCH' ? {} : tombstones));
  await nuvem.gravarTombstones(['11'], 1000);
  assert(pedidos[0].url === `${DOCS}/usuarios/u1/meta/deleted?updateMask.fieldPaths=ids.\`11\``, 'PATCH em usuarios/{uid}/meta/deleted');
  const lidos = await nuvem.lerTombstones();
  assert(lidos.get('11') === 1000, 'lê id → hora da deleção');
}

const RENOVACAO = { corpo: { id_token: 'token-novo', refresh_token: 'refresh-novo' } };

async function renovaPertoDeVencer() {
  const a = nuvemDeTeste((url) => (ehRenovacao(url) ? RENOVACAO : { corpo: {} }), { expiresAt: Date.now() + 30_000 });
  await a.nuvem.listarFrases();
  assert(a.pedidos[0].url.startsWith('https://securetoken.googleapis.com/v1/token?key='), 'token perto de vencer: renova antes do pedido');
  assert(a.pedidos[1].token === 'Bearer token-novo', 'o pedido usa o token novo');
  const [renovada] = a.renovadas;
  assert(a.renovadas.length === 1 && renovada.refreshToken === 'refresh-novo' && renovada.uid === 'u1' && renovada.expiresAt > Date.now() + 50 * 60_000,
    'aoRenovar recebe as credenciais completas para gravar');
}

async function renovaUmaVezApos401() {
  let chamadas = 0;
  const tokenRuim = recusa(401, { message: 'bad token' });
  const b = nuvemDeTeste((url) => {
    if (ehRenovacao(url)) return RENOVACAO;
    return ++chamadas === 1 ? tokenRuim() : { corpo: {} };
  });
  await b.nuvem.listarFrases();
  assert(b.pedidos.map(p => p.token || 'renovação').join() === 'Bearer token-bom,renovação,Bearer token-novo', '401: renova e repete uma vez');
}

async function sessaoQueNaoRenovaExpira() {
  const c = nuvemDeTeste(recusa(401, { message: 'sempre' }));
  let erro = await erroDe(() => c.nuvem.listarFrases());
  assert(erro?.motivo === MOTIVO.EXPIROU, 'um 401 que se repete → motivo EXPIROU');

  const d = nuvemDeTeste(() => ({}), { refreshToken: null, expiresAt: 0 });
  erro = await erroDe(() => d.nuvem.listarFrases());
  assert(erro?.motivo === MOTIVO.EXPIROU && d.pedidos.length === 0, 'sem refresh token → EXPIROU, sem pedido');

  const renovacaoRecusada = recusa(400, { message: 'TOKEN_EXPIRED' });
  const e2 = nuvemDeTeste((url) => (ehRenovacao(url) ? renovacaoRecusada() : {}), { expiresAt: 0 });
  erro = await erroDe(() => e2.nuvem.listarFrases());
  assert(erro?.motivo === MOTIVO.EXPIROU && erro.message === 'TOKEN_EXPIRED', 'renovação recusada → EXPIROU, com a mensagem');
}

async function sessaoRenovaEExpira() {
  await renovaPertoDeVencer();
  await renovaUmaVezApos401();
  await sessaoQueNaoRenovaExpira();
}

async function armazenamentoViraPromessas() {
  const dados = {};
  const area = { get: (k, cb) => cb({ ...dados }), set: (i, cb) => { Object.assign(dados, i); cb(); }, remove: (k, cb) => { for (const x of [].concat(k)) delete dados[x]; cb(); } };
  const { local, sync } = armazenamentoDoChrome({ local: area, sync: area });
  await local.set({ a: 1 });
  assert((await sync.get(null)).a === 1, 'set/get viram promessas');
  await local.remove('a');
  assert(!('a' in dados), 'remove também');
}

async function revogarBarraARenovacaoEmVoo() {
  let responder;
  const resposta = new Promise(resolve => { responder = resolve; });
  const a = nuvemDeTeste(() => resposta, { expiresAt: 0 });
  const pedido = a.nuvem.listarFrases();
  assert(a.pedidos.length === 1 && a.pedidos[0].url.includes('securetoken'), 'a renovação está em voo');
  a.sessao.revogar();
  responder({ corpo: { id_token: 'token-tardio', refresh_token: 'refresh-tardio' } });
  const resultado = await desfechoDe(pedido);
  assert(resultado.status === 'rejected' && resultado.reason?.motivo === MOTIVO.EXPIROU, 'o pedido rejeita com EXPIROU após a revogação');
  assert(a.renovadas.length === 0, 'a renovação tardia não chama aoRenovar');
  assert(a.pedidos.length === 1, 'nenhum pedido chega ao Firestore após a renovação tardia');
}

async function sessaoRevogadaRecusaTodoPedido() {
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
    assert(rejeitouComExpirou(await desfechoDe(pedir())), `${nome} rejeita com EXPIROU numa sessão revogada`);
  }
  assert(b.pedidos.length === 0 && b.renovadas.length === 0, 'a sessão revogada não faz pedidos nem persiste credenciais');
  b.sessao.invalidar();
  const aindaRevogada = await desfechoDe(b.sessao.token());
  assert(rejeitouComExpirou(aindaRevogada) && b.pedidos.length === 0,
    'invalidar o token não reativa a sessão revogada');
}

async function revogarAntesDoEnvioBarraOTokenObtido() {
  const c = nuvemDeTeste(() => ({}));
  const comTokenValido = c.nuvem.listarFrases();
  c.sessao.revogar();
  const semPedido = await desfechoDe(comTokenValido);
  assert(rejeitouComExpirou(semPedido) && c.pedidos.length === 0,
    'a revogação antes do envio impede usar um token já obtido');
}

async function revogarBarraARespostaEmVoo() {
  for (const [nome, pedir] of [
    ['leitura', nuvem => nuvem.listarFrases()],
    ['lotes', nuvem => nuvem.gravarFrases(Array.from({ length: 501 }, (_, id) => ({ id, texto: 'x' })))],
  ]) {
    const d = nuvemDeTeste(() => { d.sessao.revogar(); return {}; });
    const emVoo = await desfechoDe(pedir(d.nuvem));
    assert(rejeitouComExpirou(emVoo) && d.pedidos.length === 1,
      `${nome}: a resposta em voo rejeita após revogar, sem continuar os pedidos`);
  }
}

async function revogarDuranteALeituraDaResposta() {
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
  const semRenovar = await desfechoDe(token);
  assert(rejeitouComExpirou(semRenovar) && renovadas.length === 0,
    'revogar durante a leitura da resposta também impede aoRenovar');
}

async function revogarASessao() {
  await revogarBarraARenovacaoEmVoo();
  await sessaoRevogadaRecusaTodoPedido();
  await revogarAntesDoEnvioBarraOTokenObtido();
  await revogarBarraARespostaEmVoo();
  await revogarDuranteALeituraDaResposta();
}

const CENARIOS_DO_HTTP = [
  ['HTTP 1 — Codec: ida e volta, com mapas e listas', codecFazIdaEVolta],
  ['HTTP 2 — Tombstone: o campo do id vai entre crases, com updateMask por campo', tombstoneTemMascaraPorCampo],
  ['HTTP 3 — Listar frases pagina e decodifica', listarPaginaEDecodifica],
  ['HTTP 4 — Gravar campos: máscara e documento existente; sem o documento, grava inteiro', gravarCamposComMascara],
  ['HTTP 5 — Apagar: 404 é tudo certo; uma recusa sobe com o motivo', apagarDistingueAusenteDeRecusa],
  ['HTTP 6 — Tombstone da nuvem: grava por campo e lê as horas', tombstoneDaNuvemGravaELe],
  ['HTTP 7 — Sessão: renova perto de vencer, guarda o que renovou e tenta uma vez após 401', sessaoRenovaEExpira],
  ['HTTP 8 — armazenamentoDoChrome adapta o chrome.storage de callbacks', armazenamentoViraPromessas],
  ['HTTP 9 — Revogar a sessão impede pedidos e uma renovação em voo', revogarASessao],
];

async function rodarCenarios(cenarios, antes = () => {}) {
  for (const [titulo, cenario] of cenarios) {
    head(titulo);
    sep();
    antes();
    await cenario();
  }
}

function resumir() {
  console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
  const total = passed + failed;
  if (failed === 0) {
    console.log(`${C.bold}${C.green}TODOS OS TESTES PASSARAM: ${passed}/${total}${C.reset}`);
  } else {
    console.log(`${C.bold}${C.red}FALHAS: ${failed}/${total}  |  Passaram: ${passed}/${total}${C.reset}`);
  }
  console.log(`${C.bold}${'═'.repeat(60)}${C.reset}\n`);
}

async function rodar() {
  resetState();
  await rodarCenarios(CENARIOS_DO_SYNC, resetState);
  await rodarCenarios(CENARIOS_DO_HTTP);
  resumir();
  process.exit(failed > 0 ? 1 : 0);
}

rodar().catch(err => { console.error(err); process.exit(1); });
