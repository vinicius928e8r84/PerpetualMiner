'use strict';

const { rota } = require('./rota');
const { ultimos4 } = require('./resposta-do-contrato');
const { legadoRecusado } = require('./legado-da-chave');

function criarRotasDaChave({ estado, respostaDoContrato }) {
  function naFilaDaChave(fazer) {
    const vez = estado.filaDaChave.then(fazer);
    estado.filaDaChave = vez.catch(() => {});
    return vez;
  }

  function mudarChave(chave, conta, em, naoEnviada = true) {
    estado.chaveDaOpenAI = chave || null;
    estado.contaDaChave = conta;
    estado.versaoDaChave += 1;
    estado.horaDaChave = em ?? Math.max(estado.agora().getTime(), estado.horaDaChave + 1);
    estado.chaveNaoEnviada = naoEnviada;
  }

  function guardarChave(req) {
    return naFilaDaChave(() => {
      const corpo = JSON.parse(req.postData());
      const versao = corpo.versao || 0, conta = corpo.conta || '', chave = corpo.chave.trim();
      if ((versao === estado.versaoDaChave - 1 || versao === estado.versaoDaChave)
        && chave === estado.chaveDaOpenAI && conta === estado.contaDaChave) {
        return { status: 200, json: { ok: true, ultimos4: ultimos4(chave) } };
      }
      if (versao !== estado.versaoDaChave) return { status: 409, json: { error: 'stale_key_version' } };
      const resposta = respostaDoContrato('POST', '/ia/openai/chave', corpo);
      if (resposta.status === 200) mudarChave(chave, conta);
      return resposta;
    });
  }

  function apagarChave(req) {
    return naFilaDaChave(() => {
      const corpo = JSON.parse(req.postData() || '{}');
      const versao = corpo.versao || 0, conta = corpo.conta || '';
      if (versao === estado.versaoDaChave - 1 && !estado.chaveDaOpenAI && conta === estado.contaDaChave) {
        return { status: 200, json: { ok: true } };
      }
      if (versao !== estado.versaoDaChave) return { status: 409, json: { error: 'stale_key_version' } };
      const resposta = respostaDoContrato('POST', '/ia/openai/chave/apagar', corpo);
      if (resposta.status === 200) mudarChave('', conta);
      return resposta;
    });
  }

  function sincronizarChave(req) {
    return naFilaDaChave(async () => {
      const { uid, token, versao = 0 } = JSON.parse(req.postData());
      if (versao !== estado.versaoDaChave) return { status: 409, json: { error: 'stale_key_version' } };
      if (estado.chaveDaOpenAI && !estado.contaDaChave) return { status: 409, json: { error: 'legacy_key_unbound' } };
      if (estado.contaDaChave && estado.contaDaChave !== uid && estado.chaveNaoEnviada) return { status: 409, json: { error: 'other_account_unsent' } };
      if (estado.contexto.cofre === 'sem_escrita') return { status: 500, json: { error: 'internal_error' } };
      if (estado.contexto.firebase) return { status: estado.contexto.firebase,
        json: { error: 'cloud_sync_failed', status: estado.contexto.firebase } };
      const remota = estado.google ? await estado.google.pedidoDaConexao('GET', uid, token) : { status: 404 };
      if (remota.status !== 200 && remota.status !== 404) return { status: remota.status, json: { error: 'cloud_sync_failed', status: remota.status } };
      const fields = remota.json?.fields;
      const chaveRemota = fields?.apagada?.booleanValue ? '' : fields?.chave?.stringValue || '';
      const horaRemota = Number(fields?.em?.integerValue) || (chaveRemota ? 1 : 0);
      let resultado = null;
      if (remota.status === 404 && !estado.chaveDaOpenAI && !estado.horaDaChave) {
        estado.chaveNaoEnviada = false;
        return { status: 200, json: { ok: true, resultado: null, versao: estado.versaoDaChave } };
      }
      const empate = remota.status === 200 && horaRemota === estado.horaDaChave && chaveRemota !== (estado.chaveDaOpenAI || '');
      if (estado.contaDaChave !== uid || horaRemota > estado.horaDaChave || (empate && !estado.chaveNaoEnviada)) {
        const anterior = estado.chaveDaOpenAI;
        mudarChave(chaveRemota, uid, horaRemota, false);
        resultado = chaveRemota ? 'chegou' : (anterior ? 'apagada' : null);
      } else if (estado.horaDaChave > horaRemota || (empate && estado.chaveNaoEnviada)) {
        const escrita = estado.google ? await estado.google.pedidoDaConexao('PATCH', uid, token,
          { chave: { stringValue: estado.chaveDaOpenAI || '' }, em: { integerValue: String(estado.horaDaChave) } }) : { status: 200 };
        if (escrita.status !== 200) return { status: escrita.status, json: { error: 'cloud_sync_failed', status: escrita.status } };
        resultado = 'subiu';
      }
      estado.chaveNaoEnviada = false;
      return { status: 200, json: { ok: true, resultado, versao: estado.versaoDaChave } };
    });
  }

  const rotas = [
    rota('POST', '/ia/openai/chave', async ({ req, responder }) => {
      const { status, json } = await guardarChave(req);
      return responder(status, json);
    }),
    rota('POST', '/ia/openai/chave/apagar', async ({ req, responder }) => {
      const { status, json } = await apagarChave(req);
      return responder(status, json);
    }),
    rota('POST', '/ia/openai/legado', ({ req, responder }) => {
      const { chave, conta, em, versao } = JSON.parse(req.postData());
      if (estado.contexto.cofre === 'sem_escrita') return responder(500, { error: 'internal_error' });
      if (legadoRecusado(estado, { chave, conta, versao })) return responder(409, { error: 'legacy_key_mismatch' });
      if ((estado.contaDaChave === null || estado.chaveDaOpenAI === null) && estado.contaDaChave !== conta) mudarChave(chave, conta, em);
      return responder(200, { ok: true });
    }),
    rota('POST', '/ia/openai/sincronizar', async ({ req, responder }) => {
      const { status, json } = await sincronizarChave(req);
      return responder(status, json);
    }),
  ];

  const paraAReal = documento => estado.paraAReal.push({ chave: documento });
  const api = {
    guardarChaveNaConexao(finalDaChave, versao = 0, conta = null, em = 0, naoEnviada = true) {
      estado.chaveDaOpenAI = `sk-proj-guardada-antes-${finalDaChave}`; estado.versaoDaChave = versao; estado.contaDaChave = conta; estado.horaDaChave = em; estado.chaveNaoEnviada = naoEnviada;
      paraAReal(conta !== null ? { chave: estado.chaveDaOpenAI, versao, conta, em, naoEnviada } : versao ? { versao, chave: estado.chaveDaOpenAI } : { chave: estado.chaveDaOpenAI });
    },
    esquecerAChave() { estado.chaveDaOpenAI = null; estado.versaoDaChave = 0; estado.contaDaChave = ''; estado.horaDaChave = 0; paraAReal(null); },
    guardarRemocaoNaConexao(versao) {
      estado.chaveDaOpenAI = null; estado.versaoDaChave = versao; estado.contaDaChave = ''; estado.horaDaChave = 0;
      paraAReal({ versao, chave: '' });
    },
    espelharChave(documento) {
      const { chave = null, versao = 0, conta = '', em = 0, naoEnviada = false } = documento || {};
      Object.assign(estado, { chaveDaOpenAI: chave || null, versaoDaChave: versao, contaDaChave: conta, horaDaChave: em, chaveNaoEnviada: naoEnviada });
    },
    sincronizarCom(google) { estado.google = google; },
    responderFirebase(status) { estado.contexto.firebase = status; },
    falharGravacaoDaChave() { estado.contexto.cofre = 'sem_escrita'; },
    /** @estado-guardado A única revisão/conta/hora que o dono guarda. */
    estadoDaChave() { return { versao: estado.versaoDaChave, conta: estado.contaDaChave, em: estado.horaDaChave, naoEnviada: estado.chaveNaoEnviada }; },
    /** @estado-guardado A cópia da chave da OpenAI que a Conexão guarda, ou null: o que o teste confere que chegou. */
    chaveNaConexao() { return estado.chaveDaOpenAI; },
  };

  return { rotas, api };
}

module.exports = { criarRotasDaChave };
