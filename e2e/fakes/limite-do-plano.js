'use strict';

const FIM = ['completed', 'partial', 'failed'];

function criarLimiteDoPlano({ envios, chaveGuardada, erro }) {
  const CAMINHO = '/jobs/usar-a-chave';

  function responder(metodo, caminho, corpo) {
    if (metodo !== 'POST' || caminho !== CAMINHO) return null;
    if (typeof corpo?.jobId !== 'string') return erro(CAMINHO, 'invalid_job_id');
    const envio = envios.find(e => e.jobId === corpo.jobId);
    if (!envio) return erro(CAMINHO, 'job_not_found');
    if (FIM.includes(envio.state.status) || envio.state.wiped) return erro(CAMINHO, 'job_finished');
    if (!chaveGuardada()) return erro(CAMINHO, 'openai_key_missing');
    const { waiting, ...resto } = envio.state;
    envio.state = { ...resto, usingKey: true };
    return { status: 200, json: { jobId: envio.jobId, status: envio.state.status } };
  }

  return { responder };
}

module.exports = { criarLimiteDoPlano };
