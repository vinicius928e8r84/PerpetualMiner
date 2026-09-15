'use strict';

// Fake do Gemini (generateContent). Cada chamada consome a próxima resposta da
// fila; sem fila, responde como uma foto sem marcações. Uma resposta é uma lista
// de trechos (o texto que o modelo devolveria, um por linha) ou uma falha da API.

const SENTINEL_VAZIO = 'NENHUM_TRECHO';

function criarFakeGemini() {
  const fila = [];
  const chamadas = [];

  async function tratar(route) {
    const req = route.request();
    chamadas.push({ chave: new URL(req.url()).searchParams.get('key') });

    const resposta = fila.length ? fila.shift() : [];
    if (!Array.isArray(resposta)) {
      return route.fulfill({
        status: resposta.status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: resposta.mensagem } }),
      });
    }
    const texto = resposta.length ? resposta.join('\n') : SENTINEL_VAZIO;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
    });
  }

  return {
    padrao: /^https:\/\/generativelanguage\.googleapis\.com\//,
    tratar,
    chamadas,
    /** Enfileira os trechos que a próxima foto lida vai devolver. */
    responderTrechos(trechos) { fila.push(trechos); },
    /** Enfileira uma falha da API para a próxima foto lida. */
    falhar(status = 500, mensagem = 'erro simulado') { fila.push({ status, mensagem }); },
  };
}

module.exports = { criarFakeGemini };
