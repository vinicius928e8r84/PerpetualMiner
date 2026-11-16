'use strict';

const { rota, rotaSe } = require('./rota');

function criarRotasDosServicos({ estado, chatgpt, voz, respostaDoContrato }) {
  function itemDeLogin(req, url) {
    const corpo = req.postData() ? JSON.parse(req.postData()) : undefined;
    const resposta = respostaDoContrato(req.method(), url.pathname, corpo);
    if (url.pathname === '/abrir-com-o-computador' && resposta.status === 200) {
      estado.contexto = { ...estado.contexto, itemDeLogin: resposta.json.ligado ? 'ligado' : 'desligado' };
    }
    return resposta;
  }

  const rotas = [
    rotaSe(({ req, url }) => (url.pathname.startsWith('/ia/chatgpt/') && req.method() === 'POST') || (url.pathname === '/auth/callback' && req.method() === 'GET'),
      ({ route, url }) => chatgpt.naConexao(route, url, respostaDoContrato)),
    rotaSe(({ req, url }) => url.pathname.startsWith('/voz/') && req.method() === 'POST', ({ dados, url, responder }) => {
      const { status, json } = voz.naConexao(dados || {}, respostaDoContrato, url.pathname);
      return responder(status, json);
    }),
    rota('POST', '/ia/estado', ({ responder }) => {
      const { status, json } = respostaDoContrato('POST', '/ia/estado', {});
      return responder(status, json);
    }),
    rotaSe(({ req, url }) => req.method() === 'POST' && (url.pathname === '/abrir-com-o-computador' || url.pathname === '/abrir-com-o-computador/estado'), ({ req, url, route, responder }) => {
      const perda = estado.perdaDaRespostaDoItem;
      if (perda && url.pathname === '/abrir-com-o-computador') {
        estado.perdaDaRespostaDoItem = null;
        if (perda.aplicada) itemDeLogin(req, url);
        return route.abort('connectionreset');
      }
      const { status, json } = itemDeLogin(req, url);
      return responder(status, json);
    }),
  ];

  const api = {
    definirItemDeLogin(situacao) { estado.contexto = { ...estado.contexto, itemDeLogin: situacao }; },
    /** @estado-guardado O item de login está escrito de verdade (só a situação `ligado`). */
    itemInstalado() { return estado.contexto.itemDeLogin === 'ligado'; },
    /** @estado-guardado O item de login agora: `ligado` ou `desligado` (ou a situação que o teste pôs). */
    itemDeLogin() { return estado.contexto.itemDeLogin; },
    perderARespostaDoItemDeLogin({ aplicada }) { estado.perdaDaRespostaDoItem = { aplicada }; },
  };

  return { rotas, api };
}

module.exports = { criarRotasDosServicos };
