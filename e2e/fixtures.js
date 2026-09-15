'use strict';

// O seam de teste: a extensão desempacotada rodando no Chromium.
//
// Cada teste ganha um perfil novo do Chromium com a extensão carregada da raiz
// do repositório, a rede falsificada na fronteira HTTP (Conexão com o Anki,
// Gemini, Firestore/Google) e as páginas-fixture servidas por um servidor local.
// Qualquer outra requisição externa é bloqueada, então nenhum teste sai para a
// internet.

const { test: base, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { criarFakeAnki } = require('./fakes/anki');
const { criarFakeGemini } = require('./fakes/gemini');
const { criarFakeGoogle } = require('./fakes/google');

const RAIZ_DA_EXTENSAO = path.resolve(__dirname, '..');
const PASTA_DAS_PAGINAS = path.join(__dirname, 'pages');

const test = base.extend({
  // Servidor das páginas-fixture (player falso, página com texto, página sem vídeo).
  paginas: [async ({}, use) => {
    const servidor = http.createServer((req, res) => {
      const nome = path.basename(new URL(req.url, 'http://x').pathname);
      const arquivo = path.join(PASTA_DAS_PAGINAS, nome);
      if (!nome.endsWith('.html') || !fs.existsSync(arquivo)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(arquivo).pipe(res);
    });
    await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
    const origem = `http://127.0.0.1:${servidor.address().port}`;
    await use({ origem, url: nome => `${origem}/${nome}` });
    await new Promise(resolve => servidor.close(resolve));
  }, { scope: 'worker' }],

  fakes: async ({}, use) => {
    await use({ anki: criarFakeAnki(), gemini: criarFakeGemini(), google: criarFakeGoogle() });
  },

  context: async ({ fakes, paginas }, use) => {
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'));
    const context = await chromium.launchPersistentContext(perfil, {
      channel: 'chromium',
      headless: !process.env.HEADED,
      args: [
        `--disable-extensions-except=${RAIZ_DA_EXTENSAO}`,
        `--load-extension=${RAIZ_DA_EXTENSAO}`,
      ],
    });

    // A última rota registrada tem prioridade: o bloqueio geral vem primeiro.
    await context.route(url => /^https?:$/.test(url.protocol) && url.origin !== paginas.origem,
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
      semearSessao: ({ uid = 'uid-teste', email = 'pessoa@teste.dev', displayName = 'Pessoa de Teste' } = {}) =>
        gravarStorage({
          pm_firebase_auth: { uid, idToken: 'token-teste', refreshToken: 'refresh-teste', expiresAt: Date.now() + 60 * 60 * 1000 },
          pm_user_info: { uid, email, displayName, photoURL: '' },
        }),
    });
  },
});

module.exports = { test, expect };
