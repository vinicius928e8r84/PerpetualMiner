'use strict';

// O servidor que responde por accounts.google.com, a página de login do Google, e por auth.openai.com, a autorização do
// ChatGPT (#155): a aba que a extensão abre com `chrome.tabs.create` também escapa do `context.route` na primeira navegação, e
// o nome apontado para cá garante que nada sai para a internet.
//
// A janela de login do `chrome.identity.launchWebAuthFlow` carrega fora do
// roteamento do Playwright: o `context.route` não a alcança. O Chromium do teste
// aponta o nome accounts.google.com para este servidor HTTPS local
// (`--host-resolver-rules`), com um certificado autoassinado gerado na hora e
// aceito por `--ignore-certificate-errors`. Assim o login de verdade roda sem
// sair para a internet, e o teste escolhe o que a janela faz (fake do Google,
// `proximoLogin`).

const { execFileSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

/** Um certificado autoassinado, só para este processo de testes. */
function gerarCertificado() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-cert-'));
  const chave = path.join(pasta, 'chave.pem');
  const certificado = path.join(pasta, 'certificado.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', chave, '-out', certificado, '-subj', '/CN=accounts.google.com',
  ], { stdio: 'ignore' });
  const resultado = { key: fs.readFileSync(chave), cert: fs.readFileSync(certificado) };
  fs.rmSync(pasta, { recursive: true, force: true });
  return resultado;
}

/**
 * Sobe o servidor e devolve a porta e onde pendurar quem responde ao login.
 * Qualquer outro caminho (o Chromium consulta /ListAccounts sozinho) é 404.
 */
async function subirServidorDoLogin() {
  let responder = null;
  let responderChatGPT = null;
  const servidor = https.createServer(gerarCertificado(), (req, res) => {
    if (/^auth\.openai\.com(:\d+)?$/.test(req.headers.host || '')) {
      const url = new URL(req.url, 'https://auth.openai.com');
      if (!responderChatGPT) return res.writeHead(404).end();
      return responderChatGPT(url, req, res);
    }
    const url = new URL(req.url, 'https://accounts.google.com');
    if (url.pathname !== '/o/oauth2/v2/auth' || !responder) {
      res.writeHead(404).end();
      return;
    }
    responder(url, req, res);
  });
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  return {
    porta: servidor.address().port,
    atender(fn) { responder = fn; },
    atenderChatGPT(fn) { responderChatGPT = fn; },
    fechar: () => new Promise(resolve => servidor.close(resolve)),
  };
}

module.exports = { subirServidorDoLogin };
