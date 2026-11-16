'use strict';

const PAGINA_DO_RETORNO = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>PerpetualMiner</title>'
  + '<p>Pode fechar esta aba e voltar ao PerpetualMiner.</p></html>';
const AUTORIZAR = 'https://auth.openai.com/api/accounts/authorize';

function criarFakeChatGPT() {
  const estado = { situacao: 'desconectada', acabado: false, state: null, tentativas: 0, autorizacao: 'aceita', abertas: [], urlDaConexao: null };

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

  function naConexao(route, url, respostaDoContrato) {
    if (url.pathname === '/auth/callback') {
      const state = url.searchParams.get('state');
      if (state && state === estado.state && estado.situacao === 'entrando') {
        estado.state = null;
        estado.situacao = !url.searchParams.get('error') ? 'conectada' : estado.acabado ? 'acabou' : 'recusou';
        estado.acabado = false;
      }
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGINA_DO_RETORNO });
    }
    const { status, json } = respostaDoContrato('POST', url.pathname, {});
    if (url.pathname === '/ia/chatgpt/entrar' && status === 200) {
      json.url = estado.urlDaConexao || urlDeAutorizacao();
      if (!estado.urlDaConexao) [estado.acabado, estado.situacao] = [estado.acabado || estado.situacao === 'acabou', 'entrando'];
    }
    if (url.pathname === '/ia/chatgpt/sair' && status === 200) {
      estado.situacao = 'desconectada';
      estado.acabado = false;
      estado.state = null;
    }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  }

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
    definir(situacao) { [estado.situacao, estado.acabado] = [situacao, false]; },
    /** @estado-guardado O login que a Conexão guarda agora (`conectada` é o arquivo dos tokens na Conexão de verdade). */
    situacao() { return estado.situacao; },
    responderNaAutorizacao(como) { estado.autorizacao = como; },
    responderAoEntrarComAUrl(url) { estado.urlDaConexao = url; },
    abertas: estado.abertas,
  };
}

module.exports = { criarFakeChatGPT, PAGINA_DO_RETORNO };
