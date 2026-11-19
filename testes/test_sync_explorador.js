'use strict';

const { criarSincronizacao } = require('../lib/sincronizacao');

const clone = v => JSON.parse(JSON.stringify(v));
const AGORA = 1_000_000;
const MAXIMO_DE_FALHAS = 2;
const PEDIDOS_COM_FALHA = 24;
const PASSOS_DE_CARREGAR = 4;

function area(dados) {
  return {
    async get(chaves) {
      if (chaves === null) return clone(dados);
      const pedidas = typeof chaves === 'string' ? { [chaves]: undefined }
        : Array.isArray(chaves) ? Object.fromEntries(chaves.map(k => [k, undefined])) : chaves;
      const r = {};
      for (const [k, padrao] of Object.entries(pedidas)) {
        if (k in dados) r[k] = clone(dados[k]);
        else if (padrao !== undefined) r[k] = padrao;
      }
      return r;
    },
    async set(itens) { for (const [k, v] of Object.entries(itens)) dados[k] = clone(v); },
    async remove(chaves) { for (const k of [].concat(chaves)) delete dados[k]; },
  };
}

function mundo({ chromeSyncJunto, mascara, engoleTombstone }) {
  const firestore = { 1: { id: 1, texto: 'um' }, 2: { id: 2, texto: 'dois' } };
  const tombstones = {};
  const estado = { pedido: 0, comFalhas: true };
  const syncDeTodos = {};
  const passar = () => {
    const n = estado.pedido++;
    if (estado.comFalhas && n < PEDIDOS_COM_FALHA && mascara.includes(n)) throw new Error('HTTP 503');
  };
  const nuvem = {
    uid: 'u1',
    async listarFrases() { passar(); return Object.values(firestore).map(clone); },
    async gravarFrase(f) { passar(); firestore[String(f.id)] = clone(f); },
    async gravarFrases(fs) { passar(); for (const f of fs) firestore[String(f.id)] = clone(f); },
    async apagarFrases(ids) { passar(); for (const id of ids) delete firestore[String(id)]; },
    async lerTombstones() { passar(); return new Map(Object.entries(tombstones).map(([id, em]) => [id, Number(em)])); },
    async gravarTombstones(ids, em) { passar(); if (!engoleTombstone) for (const id of ids) tombstones[String(id)] = em; },
  };
  const computador = frases => {
    const local = { frases: clone(frases) };
    const sync = chromeSyncJunto ? syncDeTodos : {};
    const s = criarSincronizacao({ nuvem, agora: () => AGORA, armazenamento: { local: area(local), sync: area(sync) } });
    return { local, s };
  };
  const dois = [{ id: 1, texto: 'um' }, { id: 2, texto: 'dois' }];
  return { firestore, estado, pcs: { A: computador(dois), B: computador(dois), C: computador([]) } };
}

async function executar(passo, pc) {
  try {
    if (passo === 'carregar') {
      const antes = clone(pc.local.frases || []);
      const r = await pc.s.carregar({ atuais: () => antes });
      await r.concluida;
    } else if (passo === 'apagar 1') {
      pc.local.frases = pc.local.frases.filter(f => f.id !== 1);
      await pc.s.apagar([1]);
    } else if (passo === 'apagar tudo') {
      const ids = pc.local.frases.map(f => f.id);
      pc.local.frases = [];
      await pc.s.apagarTudo(ids, AGORA);
    }
  } catch {
    // um pedido que falha derruba só o passo; o resto da sequência segue
  }
}

function conferir(m, apagadas) {
  const problemas = [];
  const ids = lista => (lista || []).map(f => f.id).sort();
  const onde = { nuvem: ids(Object.values(m.firestore)), A: ids(m.pcs.A.local.frases), B: ids(m.pcs.B.local.frases), C: ids(m.pcs.C.local.frases) };
  for (const [lugar, lista] of Object.entries(onde)) {
    for (const id of apagadas) if (lista.includes(id)) problemas.push(`a Frase ${id} apagada voltou em ${lugar}`);
    for (const id of [1, 2].filter(i => !apagadas.includes(i))) {
      if (lugar !== 'C' && !lista.includes(id)) problemas.push(`a Frase ${id} não apagada sumiu de ${lugar}`);
    }
  }
  return problemas;
}

function sequencias() {
  const out = [[]];
  const computadores = ['A', 'B', 'C'];
  const acrescentar = (base, resto) => {
    if (resto === 0) return;
    for (const c of computadores) {
      const nova = [...base, ['carregar', c]];
      out.push(nova);
      acrescentar(nova, resto - 1);
    }
  };
  acrescentar([], PASSOS_DE_CARREGAR);
  return out;
}

function mascaras() {
  const out = [[]];
  for (let i = 0; i < PEDIDOS_COM_FALHA; i++) {
    out.push([i]);
    if (MAXIMO_DE_FALHAS > 1) for (let j = i + 1; j < PEDIDOS_COM_FALHA; j++) out.push([i, j]);
  }
  return out;
}

async function explorar({ chromeSyncJunto, engoleTombstone = false, primeiraFalha = false }) {
  const achados = new Map();
  let corridas = 0;
  const mascarasPossiveis = mascaras();
  for (const apagar of [['apagar 1', [1]], ['apagar tudo', [1, 2]]]) {
    for (const seq of sequencias()) {
      for (const mascara of mascarasPossiveis) {
        const m = mundo({ chromeSyncJunto, mascara, engoleTombstone });
        await executar(apagar[0], m.pcs.A);
        for (const [passo, c] of seq) await executar(passo, m.pcs[c]);
        m.estado.comFalhas = false;
        for (let volta = 0; volta < 2; volta++) for (const c of ['A', 'B', 'C']) await executar('carregar', m.pcs[c]);
        corridas++;
        for (const p of conferir(m, apagar[1])) {
          if (!achados.has(p)) achados.set(p, `${apagar[0]} em A, depois ${seq.map(([, c]) => `abre ${c}`).join(', ') || 'nada'}; pedidos que falham: ${mascara.length ? mascara.join(', ') : 'nenhum'}`);
        }
        if (primeiraFalha && achados.size) return { corridas, achados };
      }
    }
  }
  return { corridas, achados };
}

let falhas = 0;
function assert(condicao, rotulo) {
  console.log(`  ${condicao ? '✓' : '✗ FALHOU:'} ${rotulo}`);
  if (!condicao) falhas++;
}

function mostrar(achados) {
  for (const [problema, como] of achados) console.log(`      ${problema}\n        ${como}`);
}

async function rodar() {
  console.log('\nO explorador sabe falhar: uma nuvem que engole o tombstone, sem Chrome Sync entre os computadores');
  const quebrada = await explorar({ chromeSyncJunto: false, engoleTombstone: true, primeiraFalha: true });
  assert(quebrada.achados.size > 0, 'a Frase apagada que volta é achada');

  for (const chromeSyncJunto of [false, true]) {
    console.log(`\nSincronização: uma Frase apagada não volta, nem a não apagada some (${chromeSyncJunto ? 'com' : 'sem'} Chrome Sync entre os computadores)`);
    const inicio = Date.now();
    const { corridas, achados } = await explorar({ chromeSyncJunto });
    console.log(`      ${corridas} corridas em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
    mostrar(achados);
    assert(achados.size === 0, 'depois de todos abrirem o Painel sem falha, nenhuma promessa quebrada');
  }
  process.exit(falhas ? 1 : 0);
}

rodar().catch(err => { console.error(err); process.exit(1); });
