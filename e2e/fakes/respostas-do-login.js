'use strict';

function derrubarAPaginaDeLogin(url, req) {
  req.socket.destroy();
}

function deixarAJanelaDeLoginEsperando(url, req, res) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>Escolha uma conta</h1>');
}

function voltarSemOIdToken(url, req, res) {
  res.writeHead(302, { Location: `${url.searchParams.get('redirect_uri')}#access_token=access-token-teste` }).end();
}

function voltarParaAExtensaoComOsTokens(url, req, res) {
  const volta = `${url.searchParams.get('redirect_uri')}#id_token=id-token-teste&access_token=access-token-teste`;
  res.writeHead(302, { Location: volta }).end();
}

const RESPOSTAS_DO_LOGIN = new Map([
  ['falhar', derrubarAPaginaDeLogin],
  ['janela', deixarAJanelaDeLoginEsperando],
  ['sem-token', voltarSemOIdToken],
]);

const respostaDoLogin = modo => RESPOSTAS_DO_LOGIN.get(modo) || voltarParaAExtensaoComOsTokens;

module.exports = { respostaDoLogin };
