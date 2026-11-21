'use strict';

const { criarSincronizacao, criarSessao, nuvemHttp, PREFIXO_DO_TOMBSTONE } = require('../lib/sincronizacao.js');

let falhas = 0;
function assert(condicao, rotulo) {
  console.log(`  ${condicao ? '✓' : '✗ FALHOU:'} ${rotulo}`);
  if (!condicao) falhas++;
}
const clone = v => JSON.parse(JSON.stringify(v));

function area(dados) {
  return {
    async get(chaves) {
      if (chaves === null) return clone(dados);
      const pedidas = typeof chaves === 'string' ? { [chaves]: undefined } : chaves;
      const r = {};
      for (const [k, padrao] of Object.entries(pedidas)) {
        if (k in dados) r[k] = clone(dados[k]);
        else if (padrao !== undefined) r[k] = padrao;
      }
      return r;
    },
    async set(itens) { Object.assign(dados, clone(itens)); },
    async remove(chaves) { for (const k of [].concat(chaves)) delete dados[k]; },
  };
}

function nuvemQueResponde(status, corpo = {}) {
  const sessao = criarSessao({ credenciais: { uid: 'u1', idToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000 } });
  return nuvemHttp({ sessao, buscar: async () => ({ ok: status < 300, status, json: async () => corpo }) });
}

function nuvemEmMemoria(uid, { lerFalha = false } = {}) {
  const pedidos = [];
  return {
    uid,
    pedidos,
    async listarFrases() { return []; },
    async gravarFrase(f) { pedidos.push(['gravarFrase', f.id]); },
    async gravarFrases(fs) { pedidos.push(['gravarFrases', fs.map(f => f.id)]); },
    async apagarFrases(ids) { pedidos.push(['apagarFrases', ids]); },
    async lerTombstones() { if (lerFalha) throw Object.assign(new Error('UNAVAILABLE'), { status: 503 }); return new Map(); },
    async gravarTombstones(ids) { pedidos.push(['gravarTombstones', ids]); throw new Error('HTTP 503'); },
  };
}

async function adaptador() {
  console.log('\nO adaptador separa "meta/deleted não existe" de "a leitura falhou"');
  const [semDocumento] = await Promise.allSettled([nuvemQueResponde(404, { error: { status: 'NOT_FOUND', message: 'NOT_FOUND' } }).lerTombstones()]);
  assert(semDocumento.value instanceof Map && semDocumento.value.size === 0, '404: quem nunca apagou nada não tem tombstones');
  const [fora] = await Promise.allSettled([nuvemQueResponde(503, { error: { message: 'UNAVAILABLE' } }).lerTombstones()]);
  assert(fora.status === 'rejected' && fora.reason?.status === 503, '503: a leitura rejeita com o status');
}

async function carregarSemTombstones() {
  console.log('\nCom meta/deleted ilegível, o carregar rejeita sem subir nem tirar nada');
  const local = { frases: [{ id: 7, texto: 'só aqui' }], pm_deleted_ids: ['5'] };
  const sync = { [`${PREFIXO_DO_TOMBSTONE}5`]: 1 };
  const nuvem = nuvemEmMemoria('u1', { lerFalha: true });
  const s = criarSincronizacao({ nuvem, agora: () => 2, armazenamento: { local: area(local), sync: area(sync) } });
  const [carregar] = await Promise.allSettled([s.carregar({ atuais: () => local.frases })]);
  assert(carregar.status === 'rejected' && carregar.reason?.status === 503, 'o carregar rejeita com a falha da leitura (o painel diz Sem sincronizar)');
  assert(!nuvem.pedidos.some(([p]) => p === 'gravarFrase' || p === 'gravarFrases'), 'a Frase que só está aqui não sobe');
  assert(`${PREFIXO_DO_TOMBSTONE}5` in sync, 'o tombstone do Chrome Sync fica');
  assert(JSON.stringify(local.pm_deleted_ids) === '["5"]' && local.frases.length === 1, 'nada local é tirado');
}

async function listasDaConta() {
  console.log('\nAs listas pendentes são da conta que as marcou');
  const doComputador = { frases: [] };
  const naU1 = nuvemEmMemoria('u1');
  await criarSincronizacao({ nuvem: naU1, agora: () => 2, armazenamento: { local: area(doComputador), sync: area({}) } }).apagar([9]);
  assert(doComputador.pm_listas_pendentes_uid === 'u1' && doComputador.pm_tombstone_pendente.includes('9'), 'o apagar na u1 deixa o tombstone pendente, da u1');
  await criarSincronizacao({ nuvem: nuvemEmMemoria('u1'), agora: () => 2, armazenamento: { local: area(doComputador), sync: area({}) } }).carregar();
  assert(doComputador.pm_tombstone_pendente.includes('9'), 'sair e entrar na mesma conta não descarta a lista');
  const naU2 = nuvemEmMemoria('u2');
  await criarSincronizacao({ nuvem: naU2, agora: () => 2, armazenamento: { local: area(doComputador), sync: area({}) } }).carregar();
  assert(!naU2.pedidos.some(([, ids]) => [].concat(ids).includes('9')), 'a u2 não recebe o tombstone nem o DELETE da u1');
  assert(doComputador.pm_listas_pendentes_uid === 'u2' && !doComputador.pm_tombstone_pendente.length && !doComputador.pm_deleted_ids.length,
    'e as listas da u1 são descartadas');
}

async function rodar() {
  await adaptador();
  await carregarSemTombstones();
  await listasDaConta();
  console.log(falhas ? `\n${falhas} FALHARAM` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
}

rodar().catch(err => { console.error(err); process.exit(1); });
