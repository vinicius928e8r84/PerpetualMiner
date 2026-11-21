'use strict';

const PAGINA_DO_RETORNO = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>PerpetualMiner</title>'
  + '<p>Pode fechar esta aba e voltar ao PerpetualMiner.</p></html>';
const AUTORIZAR = 'https://auth.openai.com/api/accounts/authorize';
const ESPERANDO = '<!doctype html><title>ChatGPT</title><p>Entrar</p>';
const HTML = 'text/html; charset=utf-8';

function parametrosDaAutorizacao(state) {
  return new URLSearchParams({
    client_id: 'dynamic_agent_client', agent_name_hint: 'PerpetualMiner', ext_agent_host_id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
    response_type: 'code', redirect_uri: 'http://127.0.0.1:8766/auth/callback',
    scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: 'https://api.openai.com/v1',
    state, nonce: 'nonce-do-fake', code_challenge: 'desafio-do-fake', code_challenge_method: 'S256',
  });
}

function parametrosDaVolta(como, state) {
  if (como === 'recusa') return new URLSearchParams({ error: 'access_denied', state });
  return new URLSearchParams({ code: 'codigo-do-fake', state, client_id: 'oaiapp_fake' });
}

const ehAAutorizacao = url => url.origin + url.pathname === AUTORIZAR;

function situacaoDepoisDoRetorno(url, acabado) {
  if (!url.searchParams.get('error')) return 'conectada';
  return acabado ? 'acabou' : 'recusou';
}

const paginaQueLevaAoRetorno = volta => `<!doctype html><meta http-equiv="refresh" content="0;url=${volta.replace(/&/g, '&amp;')}">`;

function criarFakeChatGPT({ paraAReal = () => {} } = {}) {
  const estado = { situacao: 'desconectada', acabado: false, state: null, tentativas: 0, autorizacao: 'aceita', abertas: [], urlDaConexao: null };

  function urlDeAutorizacao() {
    estado.tentativas += 1;
    estado.state = `state-da-tentativa-${estado.tentativas}`;
    return `${AUTORIZAR}?${parametrosDaAutorizacao(estado.state)}`;
  }

  const ehOStateDaTentativa = state => Boolean(state) && state === estado.state;
  const entrando = () => estado.situacao === 'entrando';

  function receberRetorno(url) {
    if (!ehOStateDaTentativa(url.searchParams.get('state'))) return;
    if (!entrando()) return;
    estado.state = null;
    estado.situacao = situacaoDepoisDoRetorno(url, estado.acabado);
    estado.acabado = false;
  }

  function responderRetornoNaPortaDeTeste(url, res) {
    receberRetorno(url);
    res.writeHead(200, { 'Content-Type': HTML }).end(PAGINA_DO_RETORNO);
  }

  function entrar(json) {
    if (estado.urlDaConexao) {
      json.url = estado.urlDaConexao;
      return;
    }
    json.url = urlDeAutorizacao();
    estado.acabado = estado.acabado || estado.situacao === 'acabou';
    estado.situacao = 'entrando';
  }

  function sair() {
    estado.situacao = 'desconectada';
    estado.acabado = false;
    estado.state = null;
  }

  const DEPOIS_DO_CONTRATO = new Map([['/ia/chatgpt/entrar', entrar], ['/ia/chatgpt/sair', sair]]);

  function naConexao(route, url, respostaDoContrato) {
    if (url.pathname === '/auth/callback') {
      receberRetorno(url);
      return route.fulfill({ status: 200, contentType: HTML, body: PAGINA_DO_RETORNO });
    }
    const { status, json } = respostaDoContrato('POST', url.pathname, {});
    if (status === 200) DEPOIS_DO_CONTRATO.get(url.pathname)?.(json);
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  }

  function autorizacao(url) {
    estado.abertas.push(Object.fromEntries(url.searchParams));
    const voltar = url.searchParams.get('redirect_uri');
    if (!ehAAutorizacao(url) || !voltar) return null;
    if (estado.autorizacao === 'espera') return null;
    return `${voltar}?${parametrosDaVolta(estado.autorizacao, url.searchParams.get('state'))}`;
  }

  function responderAutorizacao(url, req, res) {
    const volta = autorizacao(url);
    if (!volta) return res.writeHead(200, { 'Content-Type': HTML }).end(ESPERANDO);
    return res.writeHead(302, { Location: volta }).end();
  }

  async function tratar(route) {
    const volta = autorizacao(new URL(route.request().url()));
    const corpo = volta ? paginaQueLevaAoRetorno(volta) : ESPERANDO;
    return route.fulfill({ status: 200, contentType: HTML, body: corpo });
  }

  return {
    padrao: /^https:\/\/auth\.openai\.com\//,
    tratar,
    responderAutorizacao,
    naConexao,
    responderRetornoNaPortaDeTeste,
    definir(situacao) { [estado.situacao, estado.acabado] = [situacao, false]; paraAReal({ login: situacao }); },
    espelhar(situacao) { estado.situacao = situacao; },
    /** @estado-guardado O login que a Conexão guarda agora (`conectada` é o arquivo dos tokens na Conexão de verdade). */
    situacao() { return estado.situacao; },
    responderNaAutorizacao(como) { estado.autorizacao = como; },
    responderAoEntrarComAUrl(url) { estado.urlDaConexao = url; },
    abertas: estado.abertas,
  };
}

module.exports = { criarFakeChatGPT, PAGINA_DO_RETORNO };
