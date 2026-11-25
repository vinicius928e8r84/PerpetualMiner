'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

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
