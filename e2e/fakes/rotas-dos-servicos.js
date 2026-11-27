'use strict';

const { rota, rotaSe } = require('./rota');

const ehDoChatGPT = ({ req, url }) => (url.pathname.startsWith('/ia/chatgpt/') && req.method() === 'POST') || (url.pathname === '/auth/callback' && req.method() === 'GET');
const ehDaVoz = ({ req, url }) => url.pathname.startsWith('/voz/') && req.method() === 'POST';
const CAMINHOS_DO_ITEM_DE_LOGIN = ['/abrir-com-o-computador', '/abrir-com-o-computador/estado'];
const ehDoItemDeLogin = ({ req, url }) => req.method() === 'POST' && CAMINHOS_DO_ITEM_DE_LOGIN.includes(url.pathname);
const ehOPedidoPrincipalDoItem = url => url.pathname === '/abrir-com-o-computador';

function itemDeLogin({ estado, respostaDoContrato }, req, url) {
  const corpo = req.postData() ? JSON.parse(req.postData()) : undefined;
  const resposta = respostaDoContrato(req.method(), url.pathname, corpo);
  if (ehOPedidoPrincipalDoItem(url) && resposta.status === 200) {
    estado.contexto = { ...estado.contexto, itemDeLogin: resposta.json.ligado ? 'ligado' : 'desligado' };
  }
  return resposta;
}

function perderARespostaDoItem(servicos, { req, url, route }) {
  const { aplicada } = servicos.estado.perdaDaRespostaDoItem;
  servicos.estado.perdaDaRespostaDoItem = null;
  if (aplicada) itemDeLogin(servicos, req, url);
  return route.abort('connectionreset');
}

function responderOItemDeLogin(servicos, pedido) {
  if (servicos.estado.perdaDaRespostaDoItem && ehOPedidoPrincipalDoItem(pedido.url)) return perderARespostaDoItem(servicos, pedido);
  const { status, json } = itemDeLogin(servicos, pedido.req, pedido.url);
  return pedido.responder(status, json);
}

function responderAVoz({ voz, respostaDoContrato }, { dados, url, responder }) {
  const { status, json } = voz.naConexao(dados || {}, respostaDoContrato, url.pathname);
  return responder(status, json);
}

const LINHA_DOS_TERMOS_DO_CONTRATO = Object.freeze({ lang: 'en', texto: "She can't put up with him" });

const CUSTO_DE_UM_PEDIDO_DOS_TERMOS_PELA_CHAVE = 0.000081;

function anotarOCustoDosTermos({ estado }, lang, pagou) {
  const agora = estado.agora();
  const pasta = `termos-${lang}-${agora.toISOString().slice(0, 7)}`;
  const registro = { date: agora.toISOString(), type: 'terms_tokens', cost_usd: pagou === 'chave' ? CUSTO_DE_UM_PEDIDO_DOS_TERMOS_PELA_CHAVE : 0 };
  estado.registrosDeCusto.set(pasta, [...(estado.registrosDeCusto.get(pasta) || []), registro]);
}

function resposta200DosTermos(servicos, lang, json, responder) {
  anotarOCustoDosTermos(servicos, lang, json.pagou);
  return responder(200, json);
}

function responderOsTermos(servicos, { dados, responder }) {
  const corpo = dados || {};
  try {
    const { status, json } = servicos.respostaDoContrato('POST', '/ia/termos', corpo);
    return status === 200 ? resposta200DosTermos(servicos, corpo.lang, json, responder) : responder(status, json);
  } catch (semExemplo) {
    const { status, json } = servicos.respostaDoContrato('POST', '/ia/termos', LINHA_DOS_TERMOS_DO_CONTRATO);
    if (status === 200) throw semExemplo;
    return responder(status, json);
  }
}

function responderOEstadoDaIA({ respostaDoContrato }, { responder }) {
  const { status, json } = respostaDoContrato('POST', '/ia/estado', {});
  return responder(status, json);
}

function criarRotasDosServicos({ estado, chatgpt, voz, respostaDoContrato }) {
  const servicos = { estado, voz, respostaDoContrato };

  const rotas = [
    rotaSe(ehDoChatGPT, ({ route, url }) => chatgpt.naConexao(route, url, respostaDoContrato)),
    rotaSe(ehDaVoz, pedido => responderAVoz(servicos, pedido)),
    rota('POST', '/ia/estado', pedido => responderOEstadoDaIA(servicos, pedido)),
    rota('POST', '/ia/termos', pedido => responderOsTermos(servicos, pedido)),
    rotaSe(ehDoItemDeLogin, pedido => responderOItemDeLogin(servicos, pedido)),
  ];

  const api = {
    definirItemDeLogin(situacao) { estado.contexto = { ...estado.contexto, itemDeLogin: situacao }; },
    /** @estado-guardado O item de login está escrito de verdade (só a situação `ligado`). */
    itemInstalado() { return estado.contexto.itemDeLogin === 'ligado'; },
    /** @estado-guardado O item de login agora: `ligado` ou `desligado` (ou a situação que o teste pôs). */
    itemDeLogin() { return estado.contexto.itemDeLogin; },
    perderARespostaDoItemDeLogin({ aplicada }) { estado.perdaDaRespostaDoItem = { aplicada }; },
    /** @estado-guardado O custo que cada pedido dos Termos da linha anotou, por pasta de mês e idioma. */
    custosDosTermos() { return [...estado.registrosDeCusto].filter(([pasta]) => pasta.startsWith('termos-')); },
  };

  return { rotas, api };
}

module.exports = { criarRotasDosServicos };
