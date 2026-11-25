'use strict';

const CAMINHO = '/jobs/usar-a-chave';
const FIM = ['completed', 'partial', 'failed'];

const pedidoDeOutraRota = (metodo, caminho) => metodo !== 'POST' || caminho !== CAMINHO;
const envioAcabou = envio => FIM.includes(envio.state.status) || Boolean(envio.state.wiped);
const idDoEnvio = corpo => corpo?.jobId;

const RECUSAS_NA_ORDEM = [
  ['invalid_job_id', ({ corpo }) => typeof idDoEnvio(corpo) !== 'string'],
  ['job_not_found', ({ envio }) => !envio],
  ['job_finished', ({ envio }) => envioAcabou(envio)],
  ['openai_key_missing', ({ chaveGuardada }) => !chaveGuardada()],
];

function motivoDaRecusa(pedido) {
  const recusa = RECUSAS_NA_ORDEM.find(([, vale]) => vale(pedido));
  return recusa ? recusa[0] : null;
}

function usarAChave(envio) {
  const { waiting, ...resto } = envio.state;
  envio.state = { ...resto, usingKey: true };
  return { status: 200, json: { jobId: envio.jobId, status: envio.state.status } };
}

function criarLimiteDoPlano({ envios, chaveGuardada, erro }) {
  function responder(metodo, caminho, corpo) {
    if (pedidoDeOutraRota(metodo, caminho)) return null;
    const envio = envios.find(e => e.jobId === idDoEnvio(corpo));
    const motivo = motivoDaRecusa({ envio, corpo, chaveGuardada });
    return motivo ? erro(CAMINHO, motivo) : usarAChave(envio);
  }

  return { responder };
}

module.exports = { criarLimiteDoPlano };
