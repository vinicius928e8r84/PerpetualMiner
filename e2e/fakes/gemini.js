'use strict';

const { responderJson } = require('./http');

const SENTINEL_VAZIO = 'NENHUM_TRECHO';
const pedidoCancelado = () => {};

function criarFakeGemini() {
  const fila = [];
  const chamadas = [];

  function imagemDoPedido(pedido) {
    const corpo = pedido.postDataJSON() || {};
    return corpo.contents?.[0]?.parts?.find(parte => parte.inlineData)?.inlineData;
  }

  function registrarChamada(pedido) {
    chamadas.push({
      chave: pedido.headers()['x-goog-api-key'] ?? null,
      url: pedido.url(),
      mimeType: imagemDoPedido(pedido)?.mimeType ?? null,
    });
  }

  async function responderDepoisDaEspera(route, { espera, respondida, resposta }) {
    await espera;
    await responder(route, resposta).catch(pedidoCancelado);
    respondida();
  }

  async function tratar(route) {
    registrarChamada(route.request());
    const resposta = fila.length ? fila.shift() : [];
    if (resposta.espera) return responderDepoisDaEspera(route, resposta);
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
