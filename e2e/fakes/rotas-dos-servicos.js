'use strict';

const { rota, rotaSe } = require('./rota');

const ehDoChatGPT = ({ req, url }) => (url.pathname.startsWith('/ia/chatgpt/') && req.method() === 'POST') || (url.pathname === '/auth/callback' && req.method() === 'GET');
const ehDaVoz = ({ req, url }) => url.pathname.startsWith('/voz/') && req.method() === 'POST';
const CAMINHOS_DO_ITEM_DE_LOGIN = ['/abrir-com-o-computador', '/abrir-com-o-computador/estado'];
const ehDoItemDeLogin = ({ req, url }) => req.method() === 'POST' && CAMINHOS_DO_ITEM_DE_LOGIN.includes(url.pathname);

function criarRotasDosServicos({ estado, chatgpt, voz, respostaDoContrato }) {
  function itemDeLogin(req, url) {
    const corpo = req.postData() ? JSON.parse(req.postData()) : undefined;
    const resposta = respostaDoContrato(req.method(), url.pathname, corpo);
    if (url.pathname === '/abrir-com-o-computador' && resposta.status === 200) {
      estado.contexto = { ...estado.contexto, itemDeLogin: resposta.json.ligado ? 'ligado' : 'desligado' };
    }
    return resposta;
  }

  function perderARespostaDoItem({ req, url, route }) {
    const { aplicada } = estado.perdaDaRespostaDoItem;
    estado.perdaDaRespostaDoItem = null;
    if (aplicada) itemDeLogin(req, url);
    return route.abort('connectionreset');
  }

  const respostaPerdida = url => Boolean(estado.perdaDaRespostaDoItem) && url.pathname === '/abrir-com-o-computador';

  const rotas = [
    rotaSe(ehDoChatGPT, ({ route, url }) => chatgpt.naConexao(route, url, respostaDoContrato)),
    rotaSe(ehDaVoz, ({ dados, url, responder }) => {
      const { status, json } = voz.naConexao(dados || {}, respostaDoContrato, url.pathname);
      return responder(status, json);
    }),
    rota('POST', '/ia/estado', ({ responder }) => {
      const { status, json } = respostaDoContrato('POST', '/ia/estado', {});
      return responder(status, json);
    }),
    rotaSe(ehDoItemDeLogin, pedido => {
      if (respostaPerdida(pedido.url)) return perderARespostaDoItem(pedido);
      const { status, json } = itemDeLogin(pedido.req, pedido.url);
      return pedido.responder(status, json);
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
