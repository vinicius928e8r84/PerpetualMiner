'use strict';

const CAMINHO = '/jobs/usar-a-chave';
const FIM = ['completed', 'partial', 'failed'];

const pedidoDeOutraRota = (metodo, caminho) => metodo !== 'POST' || caminho !== CAMINHO;
const envioAcabou = envio => FIM.includes(envio.state.status) || Boolean(envio.state.wiped);

function usarAChave(envio) {
  const { waiting, ...resto } = envio.state;
  envio.state = { ...resto, usingKey: true };
  return { status: 200, json: { jobId: envio.jobId, status: envio.state.status } };
}

function criarLimiteDoPlano({ envios, chaveGuardada, erro }) {
  function motivoDaRecusa(envio, corpo) {
    if (typeof corpo?.jobId !== 'string') return 'invalid_job_id';
    if (!envio) return 'job_not_found';
    if (envioAcabou(envio)) return 'job_finished';
    return chaveGuardada() ? null : 'openai_key_missing';
  }

  function responder(metodo, caminho, corpo) {
    if (pedidoDeOutraRota(metodo, caminho)) return null;
    const envio = envios.find(e => e.jobId === corpo?.jobId);
    const motivo = motivoDaRecusa(envio, corpo);
    return motivo ? erro(CAMINHO, motivo) : usarAChave(envio);
  }

  return { responder };
}

module.exports = { criarLimiteDoPlano };
