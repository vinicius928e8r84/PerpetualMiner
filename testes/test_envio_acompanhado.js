'use strict';

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('../lib/pedido-ao-anki.js');
require('../painel/painel-envio-estado.js');
const { ConversaComOAnki, EnvioAcompanhado, SituacaoDoEnvio } = globalThis.PerpetualMiner;
const { ESTADO } = SituacaoDoEnvio;

const JOB = 'c7d1e2f3-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const vez = () => new Promise(resolve => setImmediate(resolve));
const FIM = ['completed', 'partial', 'failed'];

function conexaoDeMentira({ status = 'partial', lastError = 'openai_rate_limited', wiped = false, criado = true, chave = true } = {}) {
  const envios = new Map(criado ? [[JOB, { status, stage: status, progress: {}, lastError, wiped }]] : []);
  const pedidos = [];
  const corpos = [];
  const seguradas = new Map();
  const respostas = new Map();
  const json = (code, corpo) => ({ status: code, texto: JSON.stringify(corpo) });

  function responder(caminho, { jobId }) {
    const estado = envios.get(jobId);
    if (respostas.has(caminho)) return respostas.get(caminho)();
    if (caminho === '/jobs') {
      if (estado) return json(201, { jobId, status: estado.status });
      envios.set(jobId, { status: 'queued', stage: 'queued', progress: {}, lastError: null, wiped: false });
      return json(201, { jobId, status: 'queued' });
    }
    if (!estado) return json(404, { error: 'job_not_found' });
    if (caminho === '/jobs/get') return json(200, { job: { jobId }, state: { jobId, ...estado } });
    if (caminho === '/jobs/usar-a-chave') return usarAChave(jobId, estado);
    if (caminho !== '/jobs/retry') return json(404, { error: 'not_found' });
    if (estado.wiped || estado.lastError === 'frases_apagadas') return json(409, { error: 'job_wiped' });
    if (!FIM.includes(estado.status)) return json(200, { jobId, status: estado.status });
    envios.set(jobId, { ...estado, status: 'queued', stage: 'queued', progress: {}, lastError: null });
    return json(200, { jobId, status: 'queued' });
  }

  function usarAChave(jobId, estado) {
    if (FIM.includes(estado.status) || estado.wiped) return json(409, { error: 'job_finished' });
    if (!chave) return json(409, { error: 'openai_key_missing' });
    const { waiting, ...resto } = estado;
    envios.set(jobId, { ...resto, usingKey: true });
    return json(200, { jobId, status: estado.status });
  }

  async function transporte(pedido) {
    pedidos.push(pedido.caminho);
    corpos.push(pedido);
    const portao = seguradas.get(pedido.caminho);
    if (portao) {
      seguradas.delete(pedido.caminho);
      await portao.solta;
    }
    return responder(pedido.caminho, pedido.corpo);
  }

  return {
    conversa: ConversaComOAnki.criar({ transporte, sinalDoPrazo: () => undefined }),
    pedidos: caminho => pedidos.filter(c => c === caminho).length,
    corposDe: caminho => corpos.filter(p => p.caminho === caminho).map(p => p.corpo),
    estado: () => envios.get(JOB),
    mudar: mudanca => envios.set(JOB, { ...envios.get(JOB), ...mudanca }),
    esquecer: () => envios.delete(JOB),
    responderSempre: (caminho, resposta) => respostas.set(caminho, resposta),
    voltar: caminho => respostas.delete(caminho),
    segurar(caminho) {
      let soltar;
      const solta = new Promise(resolve => { soltar = resolve; });
      seguradas.set(caminho, { solta });
      return soltar;
    },
  };
}

function relogioManual() {
  const fila = [];
  const intervalos = [];
  return {
    esperar: ms => {
      intervalos.push(ms);
      return new Promise(resolve => fila.push(resolve));
    },
    intervalos: () => intervalos,
    esperando: () => fila.length,
    async passar() {
      assert.ok(fila.length, 'o módulo não está esperando a próxima leitura');
      fila.shift()();
      await vez();
    },
  };
}

function acompanharNaMentira(conexao, alvo = { jobId: JOB }, opcoes = {}) {
  const relogio = relogioManual();
  const envio = EnvioAcompanhado.acompanhar(alvo, { conversa: conexao.conversa, esperar: relogio.esperar, ...opcoes });
  const vistas = [];
  const lidos = [];
  envio.aoMudar((situacao, lido) => { vistas.push(situacao); lidos.push(lido); });
  return { envio, relogio, vistas, lidos, estados: () => vistas.map(s => s.estado) };
}

async function doisCliquesAntesDaRespostaSaoUmPedidoSo() {
  const conexao = conexaoDeMentira();
  const { envio } = acompanharNaMentira(conexao);
  const soltar = conexao.segurar('/jobs/retry');
  const primeiro = envio.tentarDeNovo();
  const segundo = envio.tentarDeNovo();
  await vez();
  soltar();
  assert.deepStrictEqual(await primeiro, { ok: true });
  assert.deepStrictEqual(await segundo, { ok: true });
  assert.strictEqual(conexao.pedidos('/jobs/retry'), 1);
  envio.largar();
}

async function oEnvioJaNaFilaTambemEOk() {
  const conexao = conexaoDeMentira({ status: 'running', lastError: null });
  const { envio, estados } = acompanharNaMentira(conexao);
  assert.deepStrictEqual(await envio.tentarDeNovo(), { ok: true });
  await vez();
  assert.deepStrictEqual(estados(), [ESTADO.ANDANDO]);
  envio.largar();
}

async function o409JobWipedViraApagadoESemLeitura() {
  const conexao = conexaoDeMentira({ wiped: true });
  const { envio, relogio } = acompanharNaMentira(conexao);
  assert.deepStrictEqual(await envio.tentarDeNovo(), { apagado: true });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);
  assert.strictEqual(relogio.esperando(), 0);
  assert.strictEqual(envio.situacao(), null);
}

async function aFalhaDizOPedidoEACausaESemLeitura() {
  const conexao = conexaoDeMentira();
  conexao.responderSempre('/jobs/retry', () => ({ status: 500, texto: '{"error":"retry_failed"}' }));
  const { envio } = acompanharNaMentira(conexao);
  assert.deepStrictEqual(await envio.tentarDeNovo(), { falha: `POST /jobs/retry ${JOB} · HTTP 500 · retry_failed` });

  conexao.responderSempre('/jobs/retry', () => { throw new Error('Failed to fetch'); });
  assert.deepStrictEqual(await envio.tentarDeNovo(), { falha: `POST /jobs/retry ${JOB} · Failed to fetch` });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);

  conexao.voltar('/jobs/retry');
  assert.deepStrictEqual(await envio.tentarDeNovo(), { ok: true });
  assert.strictEqual(conexao.pedidos('/jobs/retry'), 3);
  envio.largar();
}

async function acompanhaAteOFimEPara() {
  const conexao = conexaoDeMentira();
  const { envio, relogio, vistas, estados } = acompanharNaMentira(conexao);
  assert.strictEqual(envio.situacao(), null);
  await envio.tentarDeNovo();
  await vez();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA]);

  await relogio.passar();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA], 'a mesma situação não avisa de novo');

  conexao.mudar({ status: 'running', stage: 'generate_cards', progress: { done: 1, total: 2 } });
  await relogio.passar();
  conexao.mudar({ progress: { done: 2, total: 2 } });
  await relogio.passar();
  conexao.mudar({ status: 'completed', stage: 'completed', progress: {} });
  await relogio.passar();

  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA, ESTADO.ANDANDO, ESTADO.ANDANDO, ESTADO.CONCLUIDO]);
  assert.deepStrictEqual(vistas.slice(1, 3).map(s => [s.etapa, s.feitos, s.total]), [['generate_cards', 1, 2], ['generate_cards', 2, 2]]);
  assert.deepStrictEqual(envio.situacao(), { estado: ESTADO.CONCLUIDO });
  assert.strictEqual(relogio.esperando(), 0, 'no fim o módulo para de ler');
  assert.strictEqual(conexao.pedidos('/jobs/get'), 5);
}

async function asFrasesApagadasNoMeioTerminamComoApagado() {
  const conexao = conexaoDeMentira();
  const { envio, relogio, estados } = acompanharNaMentira(conexao);
  await envio.tentarDeNovo();
  await vez();
  conexao.mudar({ status: 'failed', stage: 'failed', lastError: 'frases_apagadas', wiped: true });
  await relogio.passar();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA, ESTADO.APAGADO]);
  assert.strictEqual(relogio.esperando(), 0);
}

async function oEnvioQueAConexaoNaoConheceEDesconhecidoEPara() {
  const conexao = conexaoDeMentira();
  const { envio, relogio, estados } = acompanharNaMentira(conexao);
  await envio.tentarDeNovo();
  await vez();
  conexao.esquecer();
  await relogio.passar();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA, ESTADO.DESCONHECIDO]);
  assert.strictEqual(relogio.esperando(), 0);
}

async function aLeituraSemRespostaNaoMudaNadaELeDeNovo() {
  const conexao = conexaoDeMentira();
  const { envio, relogio, estados } = acompanharNaMentira(conexao);
  await envio.tentarDeNovo();
  await vez();
  conexao.responderSempre('/jobs/get', () => { throw new Error('Failed to fetch'); });
  await relogio.passar();
  await relogio.passar();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA]);
  assert.deepStrictEqual(envio.situacao().estado, ESTADO.NA_FILA);

  conexao.voltar('/jobs/get');
  conexao.mudar({ status: 'completed', stage: 'completed' });
  await relogio.passar();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA, ESTADO.CONCLUIDO]);
}

async function largarIgnoraARespostaTardiaEPara() {
  const conexao = conexaoDeMentira();
  const { envio, relogio, estados } = acompanharNaMentira(conexao);
  await envio.tentarDeNovo();
  await vez();
  const soltar = conexao.segurar('/jobs/get');
  conexao.mudar({ status: 'completed', stage: 'completed' });
  await relogio.passar();
  envio.largar();
  soltar();
  await vez();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA]);
  assert.strictEqual(relogio.esperando(), 0);
}

async function largarComOPedidoNoArNaoComecaALer() {
  const conexao = conexaoDeMentira();
  const { envio, relogio, estados } = acompanharNaMentira(conexao);
  const soltar = conexao.segurar('/jobs/retry');
  const pedido = envio.tentarDeNovo();
  await vez();
  envio.largar();
  soltar();
  assert.deepStrictEqual(await pedido, { ok: true });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);
  assert.deepStrictEqual(estados(), []);
  assert.strictEqual(relogio.esperando(), 0);
}

async function tirarOOuvinteParaDeAvisar() {
  const conexao = conexaoDeMentira();
  const relogio = relogioManual();
  const envio = EnvioAcompanhado.acompanhar({ jobId: JOB }, { conversa: conexao.conversa, esperar: relogio.esperar });
  const vistas = [];
  const tirar = envio.aoMudar(situacao => vistas.push(situacao.estado));
  await envio.tentarDeNovo();
  await vez();
  tirar();
  conexao.mudar({ status: 'completed', stage: 'completed' });
  await relogio.passar();
  assert.deepStrictEqual(vistas, [ESTADO.NA_FILA]);
  assert.deepStrictEqual(envio.situacao(), { estado: ESTADO.CONCLUIDO });
}

async function tentarDeNovoDepoisDoFimAcompanhaOutraVez() {
  const conexao = conexaoDeMentira();
  const { envio, relogio, estados } = acompanharNaMentira(conexao);
  await envio.tentarDeNovo();
  await vez();
  conexao.mudar({ status: 'partial', stage: 'partial', lastError: 'cards_failed' });
  await relogio.passar();
  assert.strictEqual(relogio.esperando(), 0);

  assert.deepStrictEqual(await envio.tentarDeNovo(), { ok: true });
  await vez();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA, ESTADO.EM_PARTE, ESTADO.NA_FILA]);
  assert.strictEqual(relogio.esperando(), 1);
  envio.largar();
}

async function oSegundoAcompanhamentoComALeituraSemRespostaSegueLendo() {
  const conexao = conexaoDeMentira();
  const { envio, relogio, estados } = acompanharNaMentira(conexao);
  await envio.tentarDeNovo();
  await vez();
  conexao.mudar({ status: 'partial', stage: 'partial', lastError: 'cards_failed' });
  await relogio.passar();
  assert.strictEqual(relogio.esperando(), 0);

  conexao.responderSempre('/jobs/get', () => { throw new Error('Failed to fetch'); });
  assert.deepStrictEqual(await envio.tentarDeNovo(), { ok: true });
  await vez();
  assert.strictEqual(relogio.esperando(), 1, 'a situação do fim anterior não encerra o novo acompanhamento');

  conexao.voltar('/jobs/get');
  conexao.mudar({ status: 'completed', stage: 'completed' });
  await relogio.passar();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA, ESTADO.EM_PARTE, ESTADO.CONCLUIDO]);
  assert.strictEqual(relogio.esperando(), 0);
}

async function oPadraoLeACadaDoisSegundosPelaConversaDoPainel() {
  assert.strictEqual(EnvioAcompanhado.INTERVALO_MS, 2000);
  assert.throws(() => EnvioAcompanhado.acompanhar({}), /jobId/);
}

const ESPERANDO_O_PLANO = { status: 'running', stage: 'generate_cards', lastError: null, waiting: { reason: 'plan_limit' }, progress: { done: 3, total: 10 } };

async function usarAChaveSegueOEnvioPelaChaveEAcompanhaAteOFim() {
  const conexao = conexaoDeMentira();
  conexao.mudar(ESPERANDO_O_PLANO);
  const { envio, relogio, estados } = acompanharNaMentira(conexao);
  assert.deepStrictEqual(await envio.usarAChave(), { ok: true });
  await vez();
  assert.strictEqual(conexao.estado().usingKey, true);
  assert.strictEqual(conexao.estado().waiting, undefined);
  assert.deepStrictEqual(estados(), [ESTADO.ANDANDO]);

  conexao.mudar({ status: 'completed', stage: 'completed', progress: {} });
  await relogio.passar();
  assert.deepStrictEqual(estados(), [ESTADO.ANDANDO, ESTADO.CONCLUIDO]);
  assert.strictEqual(relogio.esperando(), 0);
  assert.strictEqual(conexao.pedidos('/jobs/retry'), 0);
}

async function doisCliquesEmUsarAChaveSaoUmPedidoSo() {
  const conexao = conexaoDeMentira();
  conexao.mudar(ESPERANDO_O_PLANO);
  const { envio } = acompanharNaMentira(conexao);
  const soltar = conexao.segurar('/jobs/usar-a-chave');
  const primeiro = envio.usarAChave();
  const segundo = envio.usarAChave();
  await vez();
  soltar();
  assert.deepStrictEqual([await primeiro, await segundo], [{ ok: true }, { ok: true }]);
  assert.strictEqual(conexao.pedidos('/jobs/usar-a-chave'), 1);
  envio.largar();
}

async function usarAChaveSemChaveNaConexaoDizSemChaveESemLeitura() {
  const conexao = conexaoDeMentira({ chave: false });
  conexao.mudar(ESPERANDO_O_PLANO);
  const { envio, relogio } = acompanharNaMentira(conexao);
  assert.deepStrictEqual(await envio.usarAChave(), { semChave: true });
  await vez();
  assert.deepStrictEqual(conexao.estado().waiting, { reason: 'plan_limit' });
  assert.strictEqual(conexao.estado().usingKey, undefined);
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);
  assert.strictEqual(relogio.esperando(), 0);
}

async function usarAChaveNumEnvioQueTerminouEFalhaComOPedidoEACausa() {
  const conexao = conexaoDeMentira();
  const { envio } = acompanharNaMentira(conexao);
  assert.deepStrictEqual(await envio.usarAChave(), { falha: `POST /jobs/usar-a-chave ${JOB} · HTTP 409 · job_finished` });

  conexao.responderSempre('/jobs/usar-a-chave', () => { throw new Error('Failed to fetch'); });
  assert.deepStrictEqual(await envio.usarAChave(), { falha: `POST /jobs/usar-a-chave ${JOB} · Failed to fetch` });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);
  assert.strictEqual(conexao.estado().usingKey, undefined);
}

async function largarComOUsarAChaveNoArNaoComecaALer() {
  const conexao = conexaoDeMentira();
  conexao.mudar(ESPERANDO_O_PLANO);
  const { envio, relogio, estados } = acompanharNaMentira(conexao);
  const soltar = conexao.segurar('/jobs/usar-a-chave');
  const pedido = envio.usarAChave();
  await vez();
  envio.largar();
  soltar();
  assert.deepStrictEqual(await pedido, { ok: true });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);
  assert.deepStrictEqual(estados(), []);
  assert.strictEqual(relogio.esperando(), 0);
}

async function quemLeSozinhoATelaOModuloSoPede() {
  const conexao = conexaoDeMentira();
  const { envio, relogio, estados } = acompanharNaMentira(conexao, { jobId: JOB }, { lerSozinho: false });
  assert.deepStrictEqual(await envio.tentarDeNovo(), { ok: true });
  conexao.mudar(ESPERANDO_O_PLANO);
  assert.deepStrictEqual(await envio.usarAChave(), { ok: true });
  await vez();
  assert.deepStrictEqual([conexao.pedidos('/jobs/retry'), conexao.pedidos('/jobs/usar-a-chave'), conexao.pedidos('/jobs/get')], [1, 1, 0]);
  assert.deepStrictEqual(estados(), []);
  assert.strictEqual(relogio.esperando(), 0);
  assert.strictEqual(envio.situacao(), null);
}

module.exports = { JOB, vez, conexaoDeMentira, acompanharNaMentira };

if (require.main === module) (async () => {
  await doisCliquesAntesDaRespostaSaoUmPedidoSo();
  await oEnvioJaNaFilaTambemEOk();
  await o409JobWipedViraApagadoESemLeitura();
  await aFalhaDizOPedidoEACausaESemLeitura();
  await acompanhaAteOFimEPara();
  await asFrasesApagadasNoMeioTerminamComoApagado();
  await oEnvioQueAConexaoNaoConheceEDesconhecidoEPara();
  await aLeituraSemRespostaNaoMudaNadaELeDeNovo();
  await largarIgnoraARespostaTardiaEPara();
  await largarComOPedidoNoArNaoComecaALer();
  await tirarOOuvinteParaDeAvisar();
  await tentarDeNovoDepoisDoFimAcompanhaOutraVez();
  await oSegundoAcompanhamentoComALeituraSemRespostaSegueLendo();
  await oPadraoLeACadaDoisSegundosPelaConversaDoPainel();
  await usarAChaveSegueOEnvioPelaChaveEAcompanhaAteOFim();
  await doisCliquesEmUsarAChaveSaoUmPedidoSo();
  await usarAChaveSemChaveNaConexaoDizSemChaveESemLeitura();
  await usarAChaveNumEnvioQueTerminouEFalhaComOPedidoEACausa();
  await largarComOUsarAChaveNoArNaoComecaALer();
  await quemLeSozinhoATelaOModuloSoPede();
  console.log('test_envio_acompanhado: ok');
})().catch(erro => {
  console.error(erro);
  process.exit(1);
});
