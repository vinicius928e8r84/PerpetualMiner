'use strict';

const { responderJson } = require('./http');

// Fake do Gemini (generateContent). Cada chamada consome a próxima resposta da
// fila; sem fila, responde como uma foto sem marcações. Uma resposta é a lista
// de frases que o modelo leu na foto (uma por linha) ou uma falha da API.

const SENTINEL_VAZIO = 'NENHUM_TRECHO';

function criarFakeGemini() {
  const fila = [];
  const chamadas = [];

  async function tratar(route) {
    chamadas.push({ chave: new URL(route.request().url()).searchParams.get('key') });

    const resposta = fila.length ? fila.shift() : [];
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
    /** Enfileira as frases que a próxima foto lida vai devolver. */
    responderFrases(frases) { fila.push(frases); },
    /** Enfileira uma falha da API para a próxima foto lida. */
    falhar(status = 500, mensagem = 'erro simulado') { fila.push({ status, mensagem }); },
  };
}

module.exports = { criarFakeGemini };
