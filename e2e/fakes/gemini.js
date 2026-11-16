'use strict';

const { responderJson } = require('./http');

const SENTINEL_VAZIO = 'NENHUM_TRECHO';

function criarFakeGemini() {
  const fila = [];
  const chamadas = [];

  async function tratar(route) {
    const pedido = route.request();
    const corpo = pedido.postDataJSON() || {};
    const imagem = corpo.contents?.[0]?.parts?.find(parte => parte.inlineData)?.inlineData;
    chamadas.push({
      chave: pedido.headers()['x-goog-api-key'] ?? null,
      url: pedido.url(),
      mimeType: imagem?.mimeType ?? null,
    });

    let resposta = fila.length ? fila.shift() : [];
    if (resposta.espera) {
      const { espera, respondida } = resposta;
      await espera;
      // A página pode ter desistido do pedido enquanto ele esperava
      // (Cancelar, Recomeçar): responder a um pedido cancelado falha, e isso
      // não é erro do teste.
      await responder(route, resposta.resposta).catch(() => {});
      respondida();
      return undefined;
    }
    return responder(route, resposta);
  }

  function responder(route, resposta) {
    if (resposta.semRede) return route.abort('internetdisconnected');
    if (resposta.bloqueada) {
      return responderJson(route, 200, { promptFeedback: { blockReason: resposta.bloqueada } });
    }
    if (!Array.isArray(resposta)) {
      return responderJson(route, resposta.status, { error: { message: resposta.mensagem } });
    }
    const texto = resposta.length ? resposta.join('\n') : SENTINEL_VAZIO;
    return responderJson(route, 200, { candidates: [{ content: { parts: [{ text: texto }] } }] });
  }

  return {
    padrao: /^https:\/\/generativelanguage\.googleapis\.com\//,
    tratar,
    chamadas,
    responderFrases(frases) { fila.push(frases); },
    falhar(status = 500, mensagem = 'erro simulado') { fila.push({ status, mensagem }); },
    ficarSemRede() { fila.push({ semRede: true }); },
    bloquear(motivo = 'OTHER') { fila.push({ bloqueada: motivo }); },
    segurarFrases(frases) {
      let soltar;
      let respondida;
      const espera = new Promise(resolve => { soltar = resolve; });
      const saiu = new Promise(resolve => { respondida = resolve; });
      fila.push({ espera, respondida, resposta: frases });
      return () => {
        soltar();
        return saiu;
      };
    },
  };
}

module.exports = { criarFakeGemini };
