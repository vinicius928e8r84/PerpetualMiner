'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { AsyncLocalStorage, AsyncResource } = require('async_hooks');

const RAIZ = (function raiz(d) {
  if (fs.existsSync(path.join(d, 'background.js')) && fs.existsSync(path.join(d, 'lib/historico.js'))) return d;
  if (path.dirname(d) === d) throw new Error('raiz do PerpetualMiner não encontrada acima de ' + __dirname);
  return raiz(path.dirname(d));
})(__dirname);
const copia = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
Error.stackTraceLimit = 50;

const fontes = new Map();
function fonte(arquivo) {
  if (!fontes.has(arquivo)) {
    const texto = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    fontes.set(arquivo, { linhas: texto.split('\n'), script: new vm.Script(texto, { filename: arquivo }) });
  }
  return fontes.get(arquivo);
}

const ator = new AsyncLocalStorage();

function chamador() {
  for (const linha of new Error().stack.split('\n').slice(2)) {
    const m = linha.match(/\(?((?:lib\/)?[\w.-]+\.js):(\d+):\d+\)?$/);
    if (!m || !fontes.has(m[1])) continue;
    const texto = fontes.get(m[1]).linhas[Number(m[2]) - 1] || '';
    if (texto.includes('chrome.storage.local')) continue;
    return `${m[1]}:${m[2]}`;
  }
  return '?';
}

function novoMundo(escolhas) {
  const mundo = { dados: {}, pendentes: [], rastro: [], decisoes: [], escolhas };
  mundo.passo = (o_que, efeito) => new Promise(resolve => {
    mundo.pendentes.push({ quem: ator.getStore() || '?', o_que, onde: chamador(), executar: () => resolve(efeito()) });
  });
  mundo.escolher = () => {
    const d = mundo.decisoes.length;
    const i = d < escolhas.length ? escolhas[d] : 0;
    mundo.decisoes.push({ n: mundo.pendentes.length, i });
    return mundo.pendentes.splice(i, 1)[0];
  };
  return mundo;
}

function armazenamento(mundo, dados = mundo.dados) {
  const tocaFrases = chaves => dados === mundo.dados && (chaves === null || chaves === 'frases' ||
    (Array.isArray(chaves) ? chaves.includes('frases') : typeof chaves === 'object' && 'frases' in chaves));
  function ler(pedido) {
    if (pedido === null) return copia(dados);
    if (typeof pedido === 'string') pedido = [pedido];
    if (Array.isArray(pedido)) return Object.fromEntries(pedido.filter(c => c in dados).map(c => [c, copia(dados[c])]));
    return Object.fromEntries(Object.entries(pedido).map(([c, padrao]) => [c, copia(c in dados ? dados[c] : padrao)]));
  }
  const gravar = valores => { for (const [c, v] of Object.entries(valores)) dados[c] = copia(v); };
  const tirar = chaves => { for (const c of [].concat(chaves)) delete dados[c]; };
  const responder = (promessa, devolver) => (devolver ? void promessa.then(devolver) : promessa);
  return {
    get: (pedido, devolver) => responder(tocaFrases(pedido)
      ? mundo.passo('lê frases', () => ler(pedido))
      : Promise.resolve().then(() => ler(pedido)), devolver),
    set: (valores, devolver) => responder(tocaFrases(valores)
      ? mundo.passo('grava frases', () => gravar(valores))
      : Promise.resolve().then(() => gravar(valores)), devolver),
    remove: (chaves, devolver) => responder(Promise.resolve().then(() => tirar(chaves)), devolver),
  };
}

function trancas(mundo) {
  const filas = new Map();
  function conceder(nome) {
    const fila = filas.get(nome);
    const vez = fila[0];
    Promise.resolve().then(vez.fazer).then(
      r => { fila.shift(); vez.ok(r); if (fila.length) conceder(nome); },
      e => { fila.shift(); vez.falha(e); if (fila.length) conceder(nome); });
  }
  return {
    request(nome, ...resto) {
      const fazer = AsyncResource.bind(resto.at(-1));
      return new Promise((ok, falha) => mundo.passo('pede a tranca', () => {
        if (!filas.has(nome)) filas.set(nome, []);
        filas.get(nome).push({ fazer, ok, falha });
        if (filas.get(nome).length === 1) conceder(nome);
      }));
    },
  };
}

const nunca = () => 0;
const AGORA = Date.UTC(2026, 10, 19, 12);
class Relogio extends Date {
  constructor(...a) { if (a.length) super(...a); else super(AGORA); }
  static now() { return AGORA; }
}
function contexto(mundo, locks, extra = {}) {
  const local = armazenamento(mundo);
  const evento = { addListener() {} };
  const ctx = {
    console, Date: Relogio, Promise, setTimeout: nunca, clearTimeout: nunca, setInterval: nunca, clearInterval: nunca,
    navigator: { locks },
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    chrome: {
      contextMenus: { create() {}, removeAll(f) { f?.(); }, onClicked: evento },
      runtime: { id: 'pm', onInstalled: evento, onStartup: evento, onMessage: evento, lastError: null, sendMessage() {}, getURL: p => p, getManifest: () => ({ name: 'PerpetualMiner', version: '0' }) },
      storage: { local, sync: armazenamento(mundo, {}), onChanged: evento },
      tabs: { query: (_p, f) => f?.([]), sendMessage() {}, onRemoved: evento, onUpdated: evento },
      action: { setBadgeText() {}, setBadgeBackgroundColor() {}, setBadgeTextColor() {}, setTitle() {} },
      alarms: { create() {}, clear() {}, onAlarm: evento },
    },
    ...extra,
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  ctx.importScripts = (...arquivos) => arquivos.forEach(a => fonte(a).script.runInContext(ctx));
  vm.createContext(ctx);
  return ctx;
}

function montar(mundo) {
  const locks = trancas(mundo);
  const sw = contexto(mundo, locks);
  fonte('background.js').script.runInContext(sw);
  sw.evaluateAutoMinerPhrase = async () => ({ accept: true, reason: 'en_new_item', keywords: ['barely@2'] });
  const pagina = contexto(mundo, locks);
  fonte('lib/historico.js').script.runInContext(pagina);
  fonte('lib/sincronizacao.js').script.runInContext(pagina);
  return { sw, pagina, painel: pagina.PerpetualMiner };
}

const quieto = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };

async function executar(cenario, escolhas) {
  const mundo = novoMundo(escolhas);
  Object.assign(mundo.dados, copia(cenario.dados));
  const lados = montar(mundo);
  await quieto();
  mundo.pendentes.length = 0;
  const fim = new Map();
  const atores = cenario.atores.map(a => ator.run(a.nome, () => Promise.resolve().then(() => a.rodar(lados))
    .then(r => fim.set(a.nome, { r }), e => fim.set(a.nome, { erro: String(e?.stack || e) }))));
  for (;;) {
    await quieto();
    if (mundo.pendentes.length === 0) break;
    const p = mundo.escolher();
    mundo.rastro.push(`${p.quem.padEnd(14)} ${p.o_que.padEnd(13)} ${p.onde}`);
    p.executar();
  }
  const parados = cenario.atores.filter(a => !fim.has(a.nome)).map(a => a.nome);
  await Promise.race([Promise.all(atores), quieto()]);
  return { mundo, fim, parados };
}

const projetar = (f, iniciais) => {
  const p = { texto: f.texto };
  if (iniciais.has(String(f.id))) p.id = String(f.id);
  for (const campo of ['keywords', 'status', 'exportadaTxt']) if (f[campo] !== undefined) p[campo] = f[campo];
  return p;
};
const chave = lista => lista.map(f => JSON.stringify(f)).sort().join('\n');
const OPS = {
  acrescentar: (l, { frase }) => [frase, ...l],
  acrescentarSeNova: (l, { frase }) => (l.some(f => f.texto.toLowerCase() === frase.texto.toLowerCase()) ? l : [frase, ...l]),
  editar: (l, { ids, campos }) => l.map(f => (ids.map(String).includes(f.id) ? { ...f, ...campos } : f)),
  apagar: (l, { ids }) => l.filter(f => !ids.map(String).includes(f.id)),
};
function intercalacoesQueMantemAOrdemDeCadaAtor(seqs, prefixo = []) {
  if (seqs.every(s => s.length === 0)) return [prefixo];
  return seqs.flatMap((s, i) => (s.length ? intercalacoesQueMantemAOrdemDeCadaAtor(seqs.map((t, j) => (j === i ? t.slice(1) : t)), [...prefixo, s[0]]) : []));
}

function conferir(cenario, { mundo, fim, parados }) {
  const iniciais = new Set((cenario.dados.frases || []).map(f => String(f.id)));
  const final = mundo.dados.frases || [];
  const erros = [];
  if (parados.length) erros.push(`impasse: ${parados.join(', ')} não terminou`);
  for (const [nome, { erro }] of fim) if (erro) erros.push(`${nome} falhou: ${erro.split('\n')[0]}`);
  const ids = final.map(f => String(f.id));
  if (new Set(ids).size !== ids.length) erros.push(`ids repetidos: ${ids.join(', ')}`);
  const inicio = (cenario.dados.frases || []).map(f => projetar(f, iniciais));
  const possiveis = new Set(intercalacoesQueMantemAOrdemDeCadaAtor(cenario.atores.map(a => a.ops))
    .map(ordem => chave(ordem.reduce((l, op) => OPS[op.tipo](l, op), inicio))));
  const obtido = chave(final.map(f => projetar(f, iniciais)));
  if (!possiveis.has(obtido)) {
    const contar = k => k.split('\n').reduce((m, l) => m.set(JSON.parse(l).texto, (m.get(JSON.parse(l).texto) || 0) + 1), new Map());
    const no = contar(obtido);
    const maximo = new Map();
    for (const k of possiveis) for (const [t, n] of contar(k)) maximo.set(t, Math.max(maximo.get(t) || 0, n));
    const duplicata = [...no].some(([t, n]) => n > 1 && n > (maximo.get(t) || 0));
    erros.push(`${duplicata ? 'duplicata: a mesma Frase entrou duas vezes' : 'perda: uma escrita sumiu (Frase, campo ou apagamento)'}; o frases final não é o de nenhuma ordem em série\n` +
      `      final: ${obtido.split('\n').join('\n             ')}\n` +
      `      em série, por exemplo: ${[...possiveis][0].split('\n').join('\n                             ')}`);
  }
  return erros;
}

async function explorar(cenario, { um = false } = {}) {
  let escolhas = [];
  let ordens = 0;
  const falhas = [];
  for (;;) {
    const execucao = await executar(cenario, escolhas);
    ordens++;
    const erros = conferir(cenario, execucao);
    if (erros.length) {
      falhas.push({ erros, rastro: execucao.mundo.rastro });
      if (um) break;
    }
    const d = execucao.mundo.decisoes;
    let k = d.length - 1;
    while (k >= 0 && d[k].i + 1 >= d[k].n) k--;
    if (k < 0) break;
    escolhas = [...d.slice(0, k).map(x => x.i), d[k].i + 1];
  }
  return { ordens, falhas };
}

const f1 = { id: 1, texto: 'He barely made it to the station.', data: '18/11/2026', streaming: 'netflix', idioma: 'Inglês' };
const f2 = { id: 2, texto: 'Let us call it a day.', data: '18/11/2026', streaming: 'netflix', idioma: 'Inglês' };
const FOTO = 'The ferry left the harbour.';
const LEGENDA = 'I never saw it coming.';
const ajustes = { pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } } };

const foto = { nome: 'SW foto', rodar: ({ sw }) => sw.salvarFrase(FOTO, 'livro', null, 'Inglês',
  { keywords: ['harbour@3'], autoKeyword: false }, { comPalavraAutomatica: false, comNuvem: false }),
ops: [{ tipo: 'acrescentar', frase: { texto: FOTO, keywords: ['harbour@3'] } }] };
const legenda = nome => ({ nome, rodar: ({ sw }) => sw.handleAutoMinerCandidate({ texto: LEGENDA, lang: 'en', origem: 'netflix' }),
  ops: [{ tipo: 'acrescentarSeNova', frase: { texto: LEGENDA, keywords: ['barely@2'] } }] });
const palavra = { nome: 'Painel Palavra', rodar: ({ painel }) => painel.Historico.editar(1, { keywords: ['barely@2'] }),
  ops: [{ tipo: 'editar', ids: [1], campos: { keywords: ['barely@2'] } }] };
const apagar = { nome: 'Painel Apagar', rodar: ({ painel }) => painel.Historico.apagar([2]), ops: [{ tipo: 'apagar', ids: [2] }] };
const enviada = { nome: 'Painel Enviada', rodar: ({ painel }) => painel.Historico.marcarEnviadas([1, 2]),
  ops: [{ tipo: 'editar', ids: [1, 2], campos: { status: 'exported' } }] };
const carregar = { nome: 'Sync carregar', rodar: ({ pagina }) => {
  const nuvem = {
    uid: 'u1',
    listarFrases: async () => [{ ...f1, status: 'exported' }],
    lerTombstones: async () => [['2', AGORA]],
    gravarFrase: async () => {}, gravarFrases: async () => {}, apagarFrases: async () => {}, gravarTombstones: async () => {},
  };
  const { chrome } = pagina;
  return pagina.PerpetualMiner.Sincronizacao.criarSincronizacao({ nuvem, armazenamento: { local: chrome.storage.local, sync: chrome.storage.sync } })
    .carregar({ atuais: () => [] });
},
ops: [{ tipo: 'apagar', ids: [2] }, { tipo: 'editar', ids: [1], campos: { status: 'exported' } }] };

const CENARIOS = [
  { nome: 'foto-e-painel', dados: { frases: [f2, f1] }, atores: [foto, palavra, apagar, enviada] },
  { nome: 'carregar-com-conta', dados: { frases: [f2, f1] }, atores: [carregar, foto, palavra] },
  { nome: 'legenda-e-painel', dados: { frases: [f2, f1], ...ajustes }, atores: [legenda('SW legenda'), foto, apagar] },
  { nome: 'legenda-repetida', dados: { frases: [f1], ...ajustes }, atores: [legenda('SW legenda 1'), legenda('SW legenda 2')],
    conhecido: 'duplicata' },
];

async function principal() {
  const args = process.argv.slice(2);
  const so = args.includes('--cenario') ? args[args.indexOf('--cenario') + 1] : null;
  const um = args.includes('--um');
  let ruim = false;
  for (const cenario of CENARIOS.filter(c => !so || c.nome === so)) {
    const inicio = Date.now();
    const { ordens, falhas } = await explorar(cenario, { um });
    const tipos = new Set(falhas.flatMap(f => f.erros.map(e => e.split(':')[0])));
    const soOConhecido = cenario.conhecido && falhas.length > 0 && [...tipos].every(t => t === cenario.conhecido);
    const estado = falhas.length === 0 ? (cenario.conhecido ? 'PASSOU (o achado conhecido sumiu: atualize o cenário)' : 'PASSOU')
      : soOConhecido ? `FALHOU SÓ COMO O ACHADO CONHECIDO (${cenario.conhecido})` : 'FALHOU';
    if (!(falhas.length === 0 && !cenario.conhecido) && !soOConhecido) ruim = true;
    console.log(`${cenario.nome}: ${ordens} ordens, ${falhas.length} contraexemplos, ${Date.now() - inicio} ms → ${estado}`);
    if (falhas.length) {
      const [primeira] = falhas;
      console.log(`  contraexemplo (o primeiro de ${falhas.length}):`);
      primeira.rastro.forEach((p, i) => console.log(`    ${String(i + 1).padStart(2)}. ${p}`));
      primeira.erros.forEach(e => console.log(`    → ${e}`));
    }
  }
  process.exitCode = ruim ? 1 : 0;
}

if (require.main === module) principal();
module.exports = { CENARIOS, explorar };
