'use strict';

// O limite do plano do ChatGPT na Conexão de mentira (#158): `POST /jobs/usar-a-chave` põe o que falta do Envio na chave da OpenAI.
// A espera do plano (`waiting: { reason: 'plan_limit' }`) é do Envio que o teste move (`fakes.anki.moverEnvio(..., { esperando })`) e o
// Tentar de novo (`/jobs/retry`) só diz o estado, como na Conexão. `test_fake_anki.js` e `contrato-da-conexao.spec.js` conferem as
// respostas contra `complemento/contrato/exemplos-do-limite.json`.

const FIM = ['completed', 'partial', 'failed'];

/**
 * `envios`: os Envios do fake (cada um com `state`); `chaveGuardada()`: a chave da OpenAI que a Conexão guarda (ou null);
 * `erro(caminho, codigo)`: a resposta de erro que o contrato dá à rota.
 */
function criarLimiteDoPlano({ envios, chaveGuardada, erro }) {
  const CAMINHO = '/jobs/usar-a-chave';

  /** O pedido da extensão a `POST /jobs/usar-a-chave`; `null` para qualquer outra rota. */
  function responder(metodo, caminho, corpo) {
    if (metodo !== 'POST' || caminho !== CAMINHO) return null;
    if (typeof corpo?.jobId !== 'string') return erro(CAMINHO, 'invalid_job_id');
    const envio = envios.find(e => e.jobId === corpo.jobId);
    if (!envio) return erro(CAMINHO, 'job_not_found');
    if (FIM.includes(envio.state.status) || envio.state.wiped) return erro(CAMINHO, 'job_finished');
    if (!chaveGuardada()) return erro(CAMINHO, 'openai_key_missing');
    // A Conexão marca o Envio e a espera acaba: o que falta segue pela chave.
    const { waiting, ...resto } = envio.state;
    envio.state = { ...resto, usingKey: true };
    return { status: 200, json: { jobId: envio.jobId, status: envio.state.status } };
  }

  return { responder };
}

module.exports = { criarLimiteDoPlano };
