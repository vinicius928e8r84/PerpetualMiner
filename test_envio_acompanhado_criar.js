'use strict';

const assert = require('assert');
const { JOB, vez, conexaoDeMentira, acompanharNaMentira } = require('./test_envio_acompanhado.js');
const { ESTADO } = globalThis.PerpetualMiner.SituacaoDoEnvio;

const CORPO = Object.freeze({
  jobId: JOB,
  lang: 'en',
  deckName: 'Inglês',
  imageSource: 'none',
  entries: [{ phraseId: 1700000000000, line: 'give up : She gave up smoking last year.' }],
});

async function criarMandaOCorpoEAcompanhaAteOFim() {
  const conexao = conexaoDeMentira({ criado: false });
  const { envio, relogio, estados, lidos } = acompanharNaMentira(conexao, CORPO);
  assert.deepStrictEqual(await envio.criar(), { ok: true });
  await vez();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(conexao.corposDe('/jobs'))), [CORPO]);
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA]);

  conexao.mudar({ status: 'completed', stage: 'completed', cards: { '1700000000000-0': { status: 'added', guid: 'g1' } } });
  await relogio.passar();
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA, ESTADO.CONCLUIDO]);
  assert.strictEqual(lidos.at(-1).cards['1700000000000-0'].guid, 'g1', 'o ouvinte recebe o estado lido da Conexão');
  assert.strictEqual(relogio.esperando(), 0);
  assert.strictEqual(conexao.pedidos('/jobs/retry'), 0);
}

async function doisCriarAntesDaRespostaSaoUmPedidoSo() {
  const conexao = conexaoDeMentira({ criado: false });
  const { envio } = acompanharNaMentira(conexao, CORPO);
  const soltar = conexao.segurar('/jobs');
  const primeiro = envio.criar();
  const segundo = envio.criar();
  await vez();
  soltar();
  assert.deepStrictEqual(await primeiro, { ok: true });
  assert.deepStrictEqual(await segundo, { ok: true });
  assert.strictEqual(conexao.pedidos('/jobs'), 1);
  envio.largar();
}

async function criarDeNovoOEnvioQueTerminouSemChegarOTentaDeNovoSemMostrarOFimVelho() {
  const conexao = conexaoDeMentira({ status: 'failed', lastError: 'openai_key_rejected' });
  const { envio, estados } = acompanharNaMentira(conexao, CORPO);
  assert.deepStrictEqual(await envio.criar(), { ok: true });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs'), 1);
  assert.strictEqual(conexao.pedidos('/jobs/retry'), 1);
  assert.deepStrictEqual(estados(), [ESTADO.NA_FILA], 'o fim velho não chega à tela');
  envio.largar();
}

async function criarDeNovoOEnvioQueJaChegouSoLe() {
  const conexao = conexaoDeMentira({ status: 'completed', lastError: null });
  const { envio, relogio, estados } = acompanharNaMentira(conexao, CORPO);
  assert.deepStrictEqual(await envio.criar(), { ok: true });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/retry'), 0);
  assert.deepStrictEqual(estados(), [ESTADO.CONCLUIDO]);
  assert.strictEqual(relogio.esperando(), 0);
}

async function criarOEnvioComAsFrasesApagadasEApagadoESemLeitura() {
  const conexao = conexaoDeMentira({ status: 'failed', lastError: 'openai_key_rejected', wiped: true });
  const { envio, relogio } = acompanharNaMentira(conexao, CORPO);
  assert.deepStrictEqual(await envio.criar(), { apagado: true });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);
  assert.strictEqual(relogio.esperando(), 0);
}

async function aFalhaAoCriarDizOPedidoEQuemNaoRespondeuESemLeitura() {
  const conexao = conexaoDeMentira({ criado: false });
  const { envio } = acompanharNaMentira(conexao, CORPO);
  conexao.responderSempre('/jobs', () => { throw new Error('Failed to fetch'); });
  assert.deepStrictEqual(await envio.criar(), { falha: `POST /jobs ${JOB} · Failed to fetch`, semResposta: true, status: null });

  conexao.responderSempre('/jobs', () => ({ status: 500, texto: '{"error":"internal_error"}' }));
  assert.deepStrictEqual(await envio.criar(), { falha: `POST /jobs ${JOB} · HTTP 500 · internal_error`, semResposta: false, status: 500 });

  conexao.responderSempre('/jobs', () => ({ status: 400, texto: '{"error":"invalid_request"}' }));
  assert.deepStrictEqual(await envio.criar(), { falha: `POST /jobs ${JOB} · HTTP 400 · invalid_request`, semResposta: false, status: 400 });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);
}

async function aFalhaAoRepetirOEnvioQueJaTerminouDizOPedidoDoRetry() {
  const conexao = conexaoDeMentira({ status: 'partial', lastError: 'cards_failed' });
  conexao.responderSempre('/jobs/retry', () => { throw new Error('Failed to fetch'); });
  const { envio } = acompanharNaMentira(conexao, CORPO);
  assert.deepStrictEqual(await envio.criar(), { falha: `POST /jobs/retry ${JOB} · Failed to fetch`, semResposta: true, status: null });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);
}

async function criarSoComOJobIdNaoTemOQueMandar() {
  const conexao = conexaoDeMentira({ criado: false });
  const { envio } = acompanharNaMentira(conexao);
  assert.throws(() => envio.criar(), /corpo/);
  assert.strictEqual(conexao.pedidos('/jobs'), 0);
}

async function largarComOCriarNoArNaoComecaALer() {
  const conexao = conexaoDeMentira({ criado: false });
  const { envio, relogio, estados } = acompanharNaMentira(conexao, CORPO);
  const soltar = conexao.segurar('/jobs');
  const pedido = envio.criar();
  await vez();
  envio.largar();
  soltar();
  assert.deepStrictEqual(await pedido, { ok: true });
  await vez();
  assert.strictEqual(conexao.pedidos('/jobs/get'), 0);
  assert.deepStrictEqual(estados(), []);
  assert.strictEqual(relogio.esperando(), 0);
}

async function aLeituraQueFalhaAvisaQuemPediuESegueLendo() {
  const conexao = conexaoDeMentira({ criado: false });
  const { envio, relogio, estados } = acompanharNaMentira(conexao, CORPO);
  const naoLidas = [];
  envio.aoNaoLer(falha => naoLidas.push(falha));
  conexao.responderSempre('/jobs/get', () => ({ status: 500, texto: '{"error":"internal_error"}' }));
  await envio.criar();
  await vez();
  assert.deepStrictEqual(naoLidas, [{ falha: `POST /jobs/get ${JOB} · HTTP 500 · internal_error`, semResposta: false, status: 500 }]);
  assert.deepStrictEqual(estados(), []);
  assert.strictEqual(relogio.esperando(), 1, 'segue lendo');

  conexao.voltar('/jobs/get');
  conexao.esquecer();
  await relogio.passar();
  assert.strictEqual(naoLidas.length, 1, 'o 404 não é leitura que falhou: é o Envio desconhecido');
  assert.deepStrictEqual(estados(), [ESTADO.DESCONHECIDO]);
}

async function aTelaEscolheOIntervaloDaLeitura() {
  const conexao = conexaoDeMentira({ criado: false });
  const { envio, relogio } = acompanharNaMentira(conexao, CORPO, { intervaloMs: 1000 });
  await envio.criar();
  await vez();
  assert.deepStrictEqual(relogio.intervalos(), [1000]);
  envio.largar();
}

(async () => {
  await criarMandaOCorpoEAcompanhaAteOFim();
  await doisCriarAntesDaRespostaSaoUmPedidoSo();
  await criarDeNovoOEnvioQueTerminouSemChegarOTentaDeNovoSemMostrarOFimVelho();
  await criarDeNovoOEnvioQueJaChegouSoLe();
  await criarOEnvioComAsFrasesApagadasEApagadoESemLeitura();
  await aFalhaAoCriarDizOPedidoEQuemNaoRespondeuESemLeitura();
  await aFalhaAoRepetirOEnvioQueJaTerminouDizOPedidoDoRetry();
  await criarSoComOJobIdNaoTemOQueMandar();
  await largarComOCriarNoArNaoComecaALer();
  await aLeituraQueFalhaAvisaQuemPediuESegueLendo();
  await aTelaEscolheOIntervaloDaLeitura();
  console.log('test_envio_acompanhado_criar: ok');
})().catch(erro => {
  console.error(erro);
  process.exit(1);
});
