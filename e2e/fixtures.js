'use strict';

// O seam de teste: a extensão desempacotada rodando no Chromium.
//
// Cada teste ganha um perfil novo do Chromium com a extensão carregada da raiz
// do repositório, a rede falsificada na fronteira HTTP (Conexão com o Anki,
// Gemini, Firestore/Google) e as páginas-fixture servidas por um servidor local.
// Qualquer outra requisição externa é bloqueada, então nenhum teste sai para a
// internet. A página de login do Google é a exceção de mecanismo, não de regra:
// a janela do `chrome.identity` não passa pelo roteamento do Playwright, então o
// nome accounts.google.com aponta para um servidor HTTPS local (fakes/login-google.js).

const { test: base, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { criarFakeAnki } = require('./fakes/anki');
const { criarFakeGemini } = require('./fakes/gemini');
const { criarFakeGoogle } = require('./fakes/google');
const { subirServidorDoLogin } = require('./fakes/login-google');

const RAIZ_DA_EXTENSAO = path.resolve(__dirname, '..');
const PASTA_DAS_PAGINAS = path.join(__dirname, 'pages');
const PASTA_DA_VITRINE = path.join(__dirname, 'vitrine');

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** As pastas da extensão que a vitrine carrega direto, como a extensão carrega. */
const PASTAS_DA_EXTENSAO = ['veio', 'lib'];

/**
 * O arquivo que responde por um caminho, ou null.
 *
 * As páginas-fixture e a vitrine vêm pelo nome; `/veio/…` e `/lib/…` saem da
 * própria extensão, para a vitrine carregar os mesmos tokens, as mesmas
 * fontes empacotadas, os mesmos componentes e o mesmo catálogo da Voz que as
 * páginas da extensão carregam.
 */
function arquivoDoPedido(caminhoPedido) {
  const limpo = path.posix.normalize(decodeURIComponent(caminhoPedido));

  for (const pasta of PASTAS_DA_EXTENSAO) {
    if (!limpo.startsWith(`/${pasta}/`)) continue;
    const alvo = path.join(RAIZ_DA_EXTENSAO, limpo.slice(1));
    return alvo.startsWith(path.join(RAIZ_DA_EXTENSAO, pasta) + path.sep) ? alvo : null;
  }

  const nome = path.basename(limpo);
  if (!/\.(html|js|css)$/.test(nome)) return null;
  return [PASTA_DAS_PAGINAS, PASTA_DA_VITRINE]
    .map(pasta => path.join(pasta, nome))
    .find(fs.existsSync) || null;
}

const test = base.extend({
  // Servidor das páginas-fixture (player falso, página com texto, página sem
  // vídeo), da vitrine da Base Veio e dos arquivos de `veio/`.
  paginas: [async ({}, use) => {
    const servidor = http.createServer((req, res) => {
      const arquivo = arquivoDoPedido(new URL(req.url, 'http://x').pathname);
      if (!arquivo || !fs.existsSync(arquivo)) {
        res.writeHead(404).end();
        return;
      }
      const tipo = TIPOS_MIME[path.extname(arquivo)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': tipo });
      fs.createReadStream(arquivo).pipe(res);
    });
    await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
    const porta = servidor.address().port;
    const origem = `http://127.0.0.1:${porta}`;
    // O mesmo servidor sob outro nome é outra origem, para o player em iframe de outra origem.
    const origemCruzada = `http://localhost:${porta}`;
    await use({
      origem,
      origemCruzada,
      url: nome => `${origem}/${nome}`,
      urlCruzada: nome => `${origemCruzada}/${nome}`,
    });
    await new Promise(resolve => servidor.close(resolve));
  }, { scope: 'worker' }],

  // A página de login do Google, um servidor por worker; cada teste diz, pelo
  // fake do Google, o que a janela de login faz.
  servidorDoLogin: [async ({}, use) => {
    const servidor = await subirServidorDoLogin();
    await use(servidor);
    await servidor.fechar();
  }, { scope: 'worker' }],

  fakes: async ({}, use) => {
    await use({ anki: criarFakeAnki(), gemini: criarFakeGemini(), google: criarFakeGoogle() });
  },

  context: async ({ fakes, paginas, servidorDoLogin }, use) => {
    servidorDoLogin.atender(fakes.google.responderLogin);
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'));
    const context = await chromium.launchPersistentContext(perfil, {
      channel: 'chromium',
      headless: !process.env.HEADED,
      args: [
        `--disable-extensions-except=${RAIZ_DA_EXTENSAO}`,
        `--load-extension=${RAIZ_DA_EXTENSAO}`,
        `--host-resolver-rules=MAP accounts.google.com 127.0.0.1:${servidorDoLogin.porta}`,
        // Só o servidor local do login usa HTTPS, com certificado autoassinado.
        '--ignore-certificate-errors',
      ],
    });

    // A última rota registrada tem prioridade: o bloqueio geral vem primeiro.
    const origensLocais = [paginas.origem, paginas.origemCruzada];
    await context.route(url => /^https?:$/.test(url.protocol) && !origensLocais.includes(url.origin),
      route => route.abort('blockedbyclient'));
    for (const fake of Object.values(fakes)) await context.route(fake.padrao, fake.tratar);

    await use(context);
    await context.close();
    fs.rmSync(perfil, { recursive: true, force: true });
  },

  extensao: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;

    const lerStorage = (chaves = null) => sw.evaluate(c => chrome.storage.local.get(c), chaves);
    const gravarStorage = valores => sw.evaluate(v => chrome.storage.local.set(v), valores);

    await use({
      id,
      serviceWorker: sw,
      url: caminho => `chrome-extension://${id}/${caminho}`,
      lerStorage,
      gravarStorage,
      /** O histórico de frases como está gravado (mais nova primeiro). */
      frases: async () => (await lerStorage({ frases: [] })).frases,
      /** Semeia uma sessão da conta no armazenamento, sem passar pelo login real. */
      /** `expirada` grava um token já vencido: o painel precisa renová-lo antes de ir à nuvem. */
      semearSessao: ({ uid = 'uid-teste', email = 'pessoa@teste.dev', displayName = 'Pessoa de Teste', expirada = false } = {}) =>
        gravarStorage({
          pm_firebase_auth: {
            uid, idToken: 'token-teste', refreshToken: 'refresh-teste',
            expiresAt: expirada ? Date.now() - 60 * 1000 : Date.now() + 60 * 60 * 1000,
          },
          pm_user_info: { uid, email, displayName, photoURL: '' },
        }),
    });
  },
});

module.exports = { test, expect };
