'use strict';

const { responderJson } = require('./http');

// Fake da Conexão com o Anki: responde na porta local dela (127.0.0.1:8766).
// Por padrão está ligada, com vocabulário vazio. Um teste pode desligá-la
// (conexão recusada, como quando o programa não está rodando) ou responder
// uma rota específica com `responder`.

function criarFakeAnki() {
  const estado = {
    ligada: true,
    vocabulario: { en: [], ru: [] },
    rotas: new Map(),   // 'GET /caminho' → (req, url) => ({ status, json })
  };
  const requisicoes = [];

  async function tratar(route) {
    const req = route.request();
    const url = new URL(req.url());
    requisicoes.push({ metodo: req.method(), caminho: url.pathname, busca: url.search });

    if (!estado.ligada) return route.abort('connectionrefused');

    const personalizada = estado.rotas.get(`${req.method()} ${url.pathname}`);
    if (personalizada) {
      const { status = 200, json = {} } = await personalizada(req, url);
      return responderJson(route, status, json);
    }
    if (url.pathname === '/health') return responderJson(route, 200, { ok: true });
    if (url.pathname === '/anki/vocabulary') {
      const lang = url.searchParams.get('lang') === 'ru' ? 'ru' : 'en';
      const words = estado.vocabulario[lang].map(word => (typeof word === 'string' ? { word, status: 'mature' } : word));
      return responderJson(route, 200, { words });
    }
    return responderJson(route, 404, { error: 'not_found' });
  }

  return {
    padrao: /^http:\/\/(127\.0\.0\.1|localhost):8766\//,
    tratar,
    requisicoes,
    desligar() { estado.ligada = false; },
    ligar() { estado.ligada = true; },
    definirVocabulario(lang, palavras) { estado.vocabulario[lang] = palavras; },
    responder(metodo, caminho, gerar) { estado.rotas.set(`${metodo} ${caminho}`, gerar); },
  };
}

module.exports = { criarFakeAnki };
