'use strict';

const assert = require('assert');
const { criarLimiteDoPlano } = require('../e2e/fakes/limite-do-plano');
const { erroDoContrato } = require('../e2e/fakes/resposta-do-contrato');

const CAMINHO = '/jobs/usar-a-chave';
const ESPERANDO = { jobId: 'esperando', state: { status: 'waiting_for_plan', waiting: { motivo: 'limite' } } };

function limiteCom({ envios, chave }) {
  return criarLimiteDoPlano({ envios, chaveGuardada: () => chave, erro: erroDoContrato });
}

const recusa = motivo => erroDoContrato(CAMINHO, motivo);

function aRotaAlheiaNaoEhDele() {
  const limite = limiteCom({ envios: [ESPERANDO], chave: 'sk-guardada' });
  assert.strictEqual(limite.responder('GET', CAMINHO, { jobId: 'esperando' }), null);
  assert.strictEqual(limite.responder('POST', '/jobs/retry', { jobId: 'esperando' }), null);
}

function umIdQueNaoEhTextoEhRecusadoAntesDeTudo() {
  const limite = limiteCom({ envios: [], chave: null });
  for (const corpo of [null, undefined, {}, { jobId: 7 }, { jobId: null }]) {
    assert.deepStrictEqual(limite.responder('POST', CAMINHO, corpo), recusa('invalid_job_id'), JSON.stringify(corpo));
  }
}

function umEnvioQueAConexaoNaoTemEhRecusadoAntesDaChave() {
  const limite = limiteCom({ envios: [ESPERANDO], chave: null });
  assert.deepStrictEqual(limite.responder('POST', CAMINHO, { jobId: 'outro' }), recusa('job_not_found'));
}

function umEnvioQueTerminouEhRecusadoAntesDaChave() {
  const terminados = ['completed', 'partial', 'failed'].map(status => ({ jobId: status, state: { status } }));
  terminados.push({ jobId: 'apagado', state: { status: 'waiting_for_plan', wiped: true } });
  const limite = limiteCom({ envios: terminados, chave: null });
  for (const { jobId } of terminados) {
    assert.deepStrictEqual(limite.responder('POST', CAMINHO, { jobId }), recusa('job_finished'), jobId);
  }
}

function semChaveGuardadaOEnvioQueEsperaNaoSegue() {
  const envio = structuredClone(ESPERANDO);
  const limite = limiteCom({ envios: [envio], chave: null });
  assert.deepStrictEqual(limite.responder('POST', CAMINHO, { jobId: 'esperando' }), recusa('openai_key_missing'));
  assert.deepStrictEqual(envio, ESPERANDO, 'o pedido recusado não mexe no Envio');
}

function comAChaveOEnvioSeguePorElaESaiDaEspera() {
  const envio = structuredClone(ESPERANDO);
  const limite = limiteCom({ envios: [envio], chave: 'sk-guardada' });
  assert.deepStrictEqual(limite.responder('POST', CAMINHO, { jobId: 'esperando' }), { status: 200, json: { jobId: 'esperando', status: 'waiting_for_plan' } });
  assert.deepStrictEqual(envio.state, { status: 'waiting_for_plan', usingKey: true });
}

const CASOS = [
  ['uma rota que não é a dele passa adiante', aRotaAlheiaNaoEhDele],
  ['um id que não é texto é recusado antes de tudo', umIdQueNaoEhTextoEhRecusadoAntesDeTudo],
  ['um Envio que a Conexão não tem é recusado antes da chave', umEnvioQueAConexaoNaoTemEhRecusadoAntesDaChave],
  ['um Envio que terminou é recusado antes da chave', umEnvioQueTerminouEhRecusadoAntesDaChave],
  ['sem chave guardada o Envio que espera não segue', semChaveGuardadaOEnvioQueEsperaNaoSegue],
  ['com a chave o Envio segue por ela e sai da espera', comAChaveOEnvioSeguePorElaESaiDaEspera],
];

for (const [nome, caso] of CASOS) {
  caso();
  console.log(`ok - ${nome}`);
}
