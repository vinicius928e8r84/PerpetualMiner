'use strict';

const { responderJson } = require('./http');

// Fake do Gemini (generateContent). Cada chamada consome a próxima resposta da
// fila; sem fila, responde como uma foto sem marcações. Uma resposta é a lista
// de frases que o modelo leu na foto (uma por linha), uma falha da API ou a
// rede fora do ar. Qualquer uma delas pode ficar segura até o teste soltar,
// para a tela ser vista no meio da leitura.

const SENTINEL_VAZIO = 'NENHUM_TRECHO';

function criarFakeGemini() {
  const fila = [];
  const chamadas = [];

  async function tratar(route) {
    const pedido = route.request();
    const corpo = pedido.postDataJSON() || {};
    const imagem = corpo.contents?.[0]?.parts?.find(parte => parte.inlineData)?.inlineData;
    chamadas.push({
      chave: new URL(pedido.url()).searchParams.get('key'),
      mimeType: imagem?.mimeType ?? null,
    });

    let resposta = fila.length ? fila.shift() : [];
    if (resposta.espera) {
      await resposta.espera;
      resposta = resposta.resposta;
    }
    if (resposta.semRede) return route.abort('internetdisconnected');
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
    /** A próxima foto lida encontra a rede fora do ar. */
    ficarSemRede() { fila.push({ semRede: true }); },
    /**
     * A próxima foto lida só recebe `frases` quando o teste chamar a função
     * devolvida: até lá, ela fica em “Lendo…”.
     */
    segurarFrases(frases) {
      let soltar;
      const espera = new Promise(resolve => { soltar = resolve; });
      fila.push({ espera, resposta: frases });
      return soltar;
    },
  };
}

module.exports = { criarFakeGemini };
