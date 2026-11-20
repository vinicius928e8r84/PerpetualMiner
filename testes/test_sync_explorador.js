'use strict';

const { criarSincronizacao } = require('../lib/sincronizacao');

const clone = v => JSON.parse(JSON.stringify(v));
const AGORA = 1_000_000;
const PEDIDOS_COM_TRES_FALHAS = 12;
const PEDIDOS_COM_FALHA = 24;
const PASSOS_DE_CARREGAR = 3;
const CORRIDAS_CONCORRENTES = 3000;
const PASSOS_COM_ENTREGA = 3;
const PASSOS_SIMPLES = [['carregar', 'A'], ['carregar', 'B'], ['carregar', 'C']];
const PASSOS_COM_SYNC_ATRASADO = [...PASSOS_SIMPLES, ['entregar sync', '']];
const PASSOS_POR_SYNC = { separado: PASSOS_SIMPLES, junto: PASSOS_SIMPLES, atrasado: PASSOS_COM_SYNC_ATRASADO };
const PASSOS_COM_CONTA = [['carregar', 'A'], ['carregar', 'B'], ['entra em u1', 'A'], ['entra em u2', 'A']];

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

function mundo({ chromeSync, mascara, engoleTombstone }) {
  const firestore = { 1: { id: 1, texto: 'um' }, 2: { id: 2, texto: 'dois' } };
  const tombstones = {};
  const estado = { pedido: 0, comFalhas: true, tirouCedo: new Set(), naOutraConta: new Set() };
  const syncDeTodos = {};
  const caixas = {};
  const passar = () => {
    const n = estado.pedido++;
    if (estado.comFalhas && n < PEDIDOS_COM_FALHA && mascara.includes(n)) throw new Error('HTTP 503');
  };
  const daOutra = (oque, ids) => { for (const id of ids) estado.naOutraConta.add(`A mandou para a nuvem da conta u2 ${oque} da Frase ${id}, da lista pendente da u1`); };
  const criarNuvem = (uid, firestore, tombstones, naOutra = () => {}) => ({
    uid,
    async listarFrases() { passar(); return Object.values(firestore).map(clone); },
    async gravarFrase(f) { passar(); firestore[String(f.id)] = clone(f); },
    async gravarFrases(fs) { passar(); for (const f of fs) firestore[String(f.id)] = clone(f); },
    async apagarFrases(ids) { naOutra('o DELETE', ids); passar(); for (const id of ids) delete firestore[String(id)]; },
    async lerTombstones() { passar(); return new Map(Object.entries(tombstones).map(([id, em]) => [id, Number(em)])); },
    async gravarTombstones(ids, em) { naOutra('o tombstone', ids); estado.aoGravarTombstone?.(); passar(); if (!engoleTombstone) for (const id of ids) tombstones[String(id)] = em; },
  });
  const nuvens = { u1: criarNuvem('u1', firestore, tombstones), u2: criarNuvem('u2', {}, {}, daOutra) };
  const sincronizado = (nome, dados, local) => {
    const base = area(dados);
    const avisar = operacao => { for (const outro of Object.keys(caixas)) if (outro !== nome) caixas[outro].push(operacao); };
    return {
      get: base.get,
      async set(itens) { passar(); await base.set(itens); if (chromeSync === 'atrasado') avisar(['set', itens]); },
      async remove(chaves) {
        passar();
        for (const id of (local.pm_tombstone_pendente || []).filter(i => [].concat(chaves).includes(`pm_del_${i}`))) {
          if (!(id in tombstones)) estado.tirouCedo.add(`${nome} tirou do Chrome Sync o tombstone da Frase ${id} antes de ele existir na nuvem`);
        }
        await base.remove(chaves); if (chromeSync === 'atrasado') avisar(['remove', chaves]); },
    };
  };
  const computador = (nome, frases) => {
    const local = { frases: clone(frases), pm_migrated: 'u1' };
    const sync = chromeSync === 'junto' ? syncDeTodos : {};
    caixas[nome] = [];
    const armazenamento = { local: area(local), sync: sincronizado(nome, sync, local) };
    const pc = { local, sync, conta: 'u1' };
    pc.entrar = async uid => {
      pc.conta = uid;
      if (uid === 'u2') pc.passouPelaU2 = true;
      pc.nuvem = nuvens[uid];
      pc.s = criarSincronizacao({ nuvem: pc.nuvem, agora: () => AGORA, armazenamento });
      if (local.pm_migrated === uid) return;
      await pc.nuvem.gravarFrases(clone(local.frases)).catch(() => null);
      local.pm_migrated = uid;
    };
    pc.nuvem = nuvens.u1;
    pc.s = criarSincronizacao({ nuvem: pc.nuvem, agora: () => AGORA, armazenamento });
    return pc;
  };
  const dois = [{ id: 1, texto: 'um' }, { id: 2, texto: 'dois' }];
  const pcs = { A: computador('A', dois), B: computador('B', dois), C: computador('C', []) };
  const entregarSync = async () => {
    for (const [nome, pc] of Object.entries(pcs)) {
      const recebidas = caixas[nome].splice(0);
      for (const [metodo, arg] of recebidas) await area(pc.sync)[metodo](arg);
    }
  };
  return { firestore, estado, pcs, entregarSync };
}

async function executar(passo, pc) {
  return executarSemRecusar(passo, pc).catch(() => null);
}

async function executarSemRecusar(passo, pc) {
  if (passo.startsWith('entra em ')) {
    await pc.entrar(passo.slice('entra em '.length));
    return executarSemRecusar('carregar', pc);
  }
  if (passo === 'carregar') {
    const antes = clone(pc.local.frases || []);
    const r = await pc.s.carregar({ atuais: () => antes });
    await r.concluida;
    return r.frases;
  } else if (passo === 'apagar 1') {
    pc.local.frases = pc.local.frases.filter(f => f.id !== 1);
    await pc.s.apagar([1]);
  } else if (passo === 'apagar tudo') {
    const ids = pc.local.frases.map(f => f.id);
    pc.local.frases = [];
    await pc.s.apagarTudo(ids, AGORA);
  }
}

function conferir(m, apagadas) {
  const problemas = [...m.estado.naOutraConta];
  if (m.pcs.A.passouPelaU2) return problemas;
  const ids = lista => (lista || []).map(f => f.id).sort();
  const onde = { nuvem: ids(Object.values(m.firestore)), A: ids(m.pcs.A.local.frases), B: ids(m.pcs.B.local.frases), C: ids(m.pcs.C.local.frases) };
  for (const [lugar, lista] of Object.entries(onde)) {
    for (const id of apagadas) if (lista.includes(id)) problemas.push(`a Frase ${id} apagada voltou em ${lugar}`);
    for (const id of [1, 2].filter(i => !apagadas.includes(i))) {
      if (lugar !== 'C' && !lista.includes(id)) problemas.push(`a Frase ${id} não apagada sumiu de ${lugar}`);
    }
  }
  const problemasDeOrdem = [...m.estado.tirouCedo];
  problemas.push(...problemasDeOrdem);
  for (const nome of ['A', 'B', 'C']) {
    if ((m.pcs[nome].local.pm_tombstone_pendente || []).length) problemas.push(`o tombstone pendente de ${nome} não foi regravado`);
  }
  return problemas;
}

function sequencias(passos) {
  const out = [[]];
  const acrescentar = (base, resto) => {
    if (resto === 0) return;
    for (const passo of passos) {
      const nova = [...base, passo];
      out.push(nova);
      acrescentar(nova, resto - 1);
    }
  };
  acrescentar([], passos === PASSOS_SIMPLES ? PASSOS_DE_CARREGAR : PASSOS_COM_ENTREGA);
  return out;
}

function mascaras() {
  const out = [[]];
  for (let i = 0; i < PEDIDOS_COM_FALHA; i++) {
    out.push([i]);
    for (let j = i + 1; j < PEDIDOS_COM_FALHA; j++) {
      out.push([i, j]);
      if (j < PEDIDOS_COM_TRES_FALHAS) for (let k = j + 1; k < PEDIDOS_COM_TRES_FALHAS; k++) out.push([i, j, k]);
    }
  }
  return out;
}

const descrever = ([passo, c]) => (passo === 'carregar' ? `abre ${c}` : c ? `${c} ${passo}` : passo);

async function executarPasso([passo, c], m) {
  if (passo === 'entregar sync') return m.entregarSync();
  return executar(passo, m.pcs[c]);
}

function mostraApagadaEmA(frases, m, apagadas) {
  if (m.pcs.A.passouPelaU2) return [];
  const vistas = [...(frases || []), ...(m.pcs.A.local.frases || [])].map(f => f.id);
  return apagadas.filter(id => vistas.includes(id));
}

async function explorar({ chromeSync, engoleTombstone = false, primeiraFalha = false, passos = PASSOS_POR_SYNC[chromeSync] }) {
  const achados = new Map();
  let corridas = 0;
  const mascarasPossiveis = mascaras();
  for (const apagar of [['apagar 1', [1]], ['apagar tudo', [1, 2]]]) {
    for (const seq of sequencias(passos)) {
      for (const mascara of mascarasPossiveis) {
        const m = mundo({ chromeSync, mascara, engoleTombstone });
        const como = () => `${apagar[0]} em A, depois ${seq.map(descrever).join(', ') || 'nada'}; pedidos que falham: ${mascara.length ? mascara.join(', ') : 'nenhum'}`;
        await executar(apagar[0], m.pcs.A);
        for (const passo of seq) {
          const frases = await executarPasso(passo, m);
          if (passo[1] !== 'A') continue;
          for (const id of mostraApagadaEmA(frases, m, apagar[1])) {
            const problema = `a Frase ${id} apagada em A apareceu de novo em A`;
            if (!achados.has(problema)) achados.set(problema, como());
          }
        }
        m.estado.comFalhas = false;
        for (let volta = 0; volta < 2; volta++) {
          await m.entregarSync();
          for (const c of ['A', 'B', 'C']) await executar('carregar', m.pcs[c]);
        }
        corridas++;
        for (const p of conferir(m, apagar[1])) if (!achados.has(p)) achados.set(p, como());
        if (primeiraFalha && achados.size) return { corridas, achados };
      }
    }
  }
  return { corridas, achados };
}

function semente(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function areaDevagar(dados, sorteio) {
  const base = area(dados);
  const espera = async () => { for (let i = Math.floor(sorteio() * 6); i > 0; i--) await new Promise(r => setImmediate(r)); };
  return Object.fromEntries(['get', 'set', 'remove'].map(m => [m, async arg => { await espera(); const r = await base[m](arg); await espera(); return r; }]));
}

async function corridaConcorrente(n) {
  const sorteio = semente(n);
  const local = { frases: [{ id: 2, texto: 'dois' }], pm_tombstone_pendente: ['1'] };
  const nuvem = {
    uid: 'u1',
    async listarFrases() { return []; },
    async gravarFrase() {},
    async gravarFrases() {},
    async apagarFrases() {},
    async lerTombstones() { return new Map(); },
    async gravarTombstones(ids) { if (ids.includes('2')) throw new Error('HTTP 503'); },
  };
  const s = criarSincronizacao({ nuvem, agora: () => AGORA, armazenamento: { local: areaDevagar(local, sorteio), sync: area({}) } });
  const atraso = Math.floor(sorteio() * 25);
  const apagando = (async () => {
    for (let i = 0; i < atraso; i++) await new Promise(r => setImmediate(r));
    local.frases = [];
    await s.apagar([2]);
  })();
  await Promise.all([s.carregar({ atuais: () => [] }).then(r => r.concluida), apagando]);
  return (local.pm_tombstone_pendente || []).includes('2');
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
  const quebrada = await explorar({ chromeSync: 'separado', engoleTombstone: true, primeiraFalha: true });
  assert(quebrada.achados.size > 0, 'a Frase apagada que volta é achada');

  for (const chromeSync of ['separado', 'junto', 'atrasado']) {
    console.log(`\nSincronização: uma Frase apagada não volta, nem a não apagada some (Chrome Sync: ${{ separado: 'não chega', junto: 'instantâneo', atrasado: 'atrasado' }[chromeSync]})`);
    const inicio = Date.now();
    const { corridas, achados } = await explorar({ chromeSync });
    console.log(`      ${corridas} corridas em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
    mostrar(achados);
    assert(achados.size === 0, 'depois de todos abrirem o Painel sem falha, nenhuma promessa quebrada');
  }
  console.log('\nSair e entrar: na mesma conta a apagada não volta; outra conta não recebe a lista pendente da anterior (Chrome Sync: não chega)');
  const inicioDaConta = Date.now();
  const contas = await explorar({ chromeSync: 'separado', passos: PASSOS_COM_CONTA });
  console.log(`      ${contas.corridas} corridas em ${((Date.now() - inicioDaConta) / 1000).toFixed(1)} s`);
  mostrar(contas.achados);
  assert(contas.achados.size === 0, 'nenhuma promessa quebrada ao sair e entrar na mesma conta ou noutra');

  console.log('\nA lista do tombstone pendente não perde um id quando o carregar e o apagar andam juntos');
  let perdidas = 0;
  for (let n = 1; n <= CORRIDAS_CONCORRENTES; n++) if (!(await corridaConcorrente(n))) perdidas++;
  assert(perdidas === 0, `o id de um apagar com o tombstone recusado fica pendente (${CORRIDAS_CONCORRENTES} corridas, ${perdidas} perdidas)`);

  console.log('\nO apagar marca o tombstone como pendente antes de falar com a nuvem');
  const m = mundo({ chromeSync: 'separado', mascara: [], engoleTombstone: false });
  let pendenteNoPedido = null;
  m.estado.aoGravarTombstone = () => { pendenteNoPedido = clone(m.pcs.A.local.pm_tombstone_pendente || []); };
  await executar('apagar 1', m.pcs.A);
  assert(pendenteNoPedido?.includes('1'), 'quando o pedido do tombstone sai, o id já está em pm_tombstone_pendente');
  assert(!(m.pcs.A.local.pm_tombstone_pendente || []).length, 'e sai da lista quando a nuvem grava');
  process.exit(falhas ? 1 : 0);
}

rodar().catch(err => { console.error(err); process.exit(1); });
