'use strict';

// Fake do login do ChatGPT (#155), nos dois lados que o e2e vê: o login que a Conexão com o Anki guarda (as rotas
// `/ia/chatgpt/*` e o retorno `/auth/callback`, que o fake da Conexão entrega a `naConexao`) e a página de autorização do
// `auth.openai.com`, que a extensão abre numa aba (`padrao`/`tratar`, registrados pela fixture como os outros fakes).
// As rotas da extensão respondem pelos exemplos do contrato (`complemento/contrato/exemplos-do-chatgpt.json`), no contexto
// `chatgpt` de agora: `desconectada`, `entrando`, `conectada` ou `recusou`. Nenhum token existe aqui: como na Conexão de verdade,
// nenhuma resposta leva um, e o teste confere o que a Conexão guardou por `situacao()`.

// A página do retorno, a mesma da Conexão (`complemento/rotas_do_chatgpt.py`).
const PAGINA_DO_RETORNO = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>PerpetualMiner</title>'
  + '<p>Pode fechar esta aba e voltar ao PerpetualMiner.</p></html>';
const AUTORIZAR = 'https://auth.openai.com/api/accounts/authorize';

function criarFakeChatGPT() {
  const estado = { situacao: 'desconectada', state: null, tentativas: 0, autorizacao: 'aceita', abertas: [], urlDaConexao: null };

  /** A URL que a Conexão daria (os parâmetros da doc oficial), com o `state` desta tentativa. */
  function urlDeAutorizacao() {
    estado.tentativas += 1;
    estado.state = `state-da-tentativa-${estado.tentativas}`;
    const parametros = new URLSearchParams({
      client_id: 'dynamic_agent_client', agent_name_hint: 'PerpetualMiner', ext_agent_host_id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
      response_type: 'code', redirect_uri: 'http://127.0.0.1:8766/auth/callback',
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: 'https://api.openai.com/v1',
      state: estado.state, nonce: 'nonce-do-fake', code_challenge: 'desafio-do-fake', code_challenge_method: 'S256',
    });
    return `${AUTORIZAR}?${parametros}`;
  }

  /** A Conexão: `/ia/chatgpt/estado|entrar|sair` pelo contrato e o retorno `/auth/callback`, que só aceita o `state` da tentativa. */
  function naConexao(route, url, respostaDoContrato) {
    if (url.pathname === '/auth/callback') {
      const state = url.searchParams.get('state');
      if (state && state === estado.state && estado.situacao === 'entrando') {
        estado.state = null;
        estado.situacao = url.searchParams.get('error') ? 'recusou' : 'conectada';
      }
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGINA_DO_RETORNO });
    }
    const { status, json } = respostaDoContrato('POST', url.pathname, {});
    if (url.pathname === '/ia/chatgpt/entrar' && status === 200) {
      json.url = estado.urlDaConexao || urlDeAutorizacao();
      if (!estado.urlDaConexao) estado.situacao = 'entrando';
    }
    if (url.pathname === '/ia/chatgpt/sair' && status === 200) {
      estado.situacao = 'desconectada';
      estado.state = null;
    }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  }

  /**
   * O `auth.openai.com`: a pessoa entra e autoriza (o retorno à 8766 com o código), recusa, ou ainda não respondeu (`espera`).
   * Devolve a URL do retorno, ou null quando a página fica esperando. Chega aqui pelo servidor local para onde o Chromium do
   * teste aponta o nome (`responderAutorizacao`) ou pelo `context.route` (`tratar`), o que pegar o pedido primeiro.
   */
  function autorizacao(url) {
    estado.abertas.push(Object.fromEntries(url.searchParams));
    const voltar = url.searchParams.get('redirect_uri');
    if (url.origin + url.pathname !== AUTORIZAR || !voltar || estado.autorizacao === 'espera') return null;
    const retorno = new URLSearchParams(estado.autorizacao === 'recusa'
      ? { error: 'access_denied', state: url.searchParams.get('state') }
      : { code: 'codigo-do-fake', state: url.searchParams.get('state'), client_id: 'oaiapp_fake' });
    return `${voltar}?${retorno}`;
  }

  const ESPERANDO = '<!doctype html><title>ChatGPT</title><p>Entrar</p>';

  function responderAutorizacao(url, req, res) {
    const volta = autorizacao(url);
    if (!volta) return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(ESPERANDO);
    return res.writeHead(302, { Location: volta }).end();
  }

  async function tratar(route) {
    const volta = autorizacao(new URL(route.request().url()));
    // Pelo `context.route`, a volta é uma página que leva ao retorno (um 302 entregue pelo Playwright não é seguido numa navegação).
    const corpo = volta ? `<!doctype html><meta http-equiv="refresh" content="0;url=${volta.replace(/&/g, '&amp;')}">` : ESPERANDO;
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: corpo });
  }

  return {
    padrao: /^https:\/\/auth\.openai\.com\//,
    tratar,
    responderAutorizacao,
    naConexao,
    /** O contexto `chatgpt` dos exemplos do contrato: `desconectada`, `entrando`, `conectada` ou `recusou`. */
    definir(situacao) { estado.situacao = situacao; },
    /** @estado-guardado O login que a Conexão guarda agora (`conectada` é o arquivo dos tokens na Conexão de verdade). */
    situacao() { return estado.situacao; },
    /** Na página do ChatGPT, a pessoa recusa (`recusa`), ou ainda não respondeu (`espera`); o padrão é autorizar. */
    responderNaAutorizacao(como) { estado.autorizacao = como; },
    /** A Conexão passa a responder ao entrar com esta URL, em vez da oficial (uma Conexão trocada ou adulterada); não inicia tentativa. */
    responderAoEntrarComAUrl(url) { estado.urlDaConexao = url; },
    /** As URLs de autorização que a extensão abriu, como parâmetros. */
    abertas: estado.abertas,
  };
}

module.exports = { criarFakeChatGPT, PAGINA_DO_RETORNO };
