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
// O abridor da Conexão com o Anki (#147) não é HTTP: é um host de Native Messaging, e o de
// mentira (fakes/abridor.js) fica registrado no próprio perfil de teste, onde o Chromium o procura.

const { test: base, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { criarFakeAbridor } = require('./fakes/abridor');
const { criarFakeAnki } = require('./fakes/anki');
const { criarFakeGemini } = require('./fakes/gemini');
const { criarFakeGoogle } = require('./fakes/google');
const { subirServidorDoLogin } = require('./fakes/login-google');
const { subirPortaDaConexaoDeTeste, regrasQueTiramAPortaDoComputador } = require('./fakes/porta-da-conexao');
const conexaoReal = require('./conexao-real');
const { parearNoServiceWorker } = require('./pareamento-de-teste');
const { pararRelogio } = require('./relogio-parado');

const RAIZ_DA_EXTENSAO = path.resolve(__dirname, '..');
const ID_DA_EXTENSAO = new URL(require('../complemento/contrato/exemplos.json').origemDaExtensao).host;
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

const { PASTAS_DA_EXTENSAO } = require('../scripts/arquivos-do-pacote');

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

/**
 * A aba que o Chrome abre ao instalar a extensão. Ela nasce em branco e só
 * depois navega, então o endereço é conferido até aparecer.
 */
async function esperarAbaDaInstalacao(context, id) {
  const painel = `chrome-extension://${id}/painel.html`;
  const limite = Date.now() + 10_000;
  while (Date.now() < limite) {
    const aba = context.pages().find(p => p.url().startsWith(painel));
    if (aba) return aba;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('A instalação não abriu a aba da Boas-vindas');
}

async function abrirPerfil({ fakes, paginas, servidorDoLogin, portaDaConexaoDeTeste, pastaDaExtensao, permissaoDoAbridor, conexaoDoTeste }) {
  servidorDoLogin.atender(fakes.google.responderLogin);
  servidorDoLogin.atenderChatGPT(fakes.chatgpt.responderAutorizacao);
  portaDaConexaoDeTeste.atender(fakes.anki.responderNaPortaDeTeste);
  const regrasDaPorta8766 = regrasQueTiramAPortaDoComputador(conexaoDoTeste ? conexaoDoTeste.porta : portaDaConexaoDeTeste.porta);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'));
  let context = null;
  let copiaComAPermissao = null;
  try {
    fakes.abridor.registrarNoPerfil(perfil);
    if (permissaoDoAbridor && process.platform !== 'linux') {
      // Mac/Windows: o `Secure Preferences` do Chromium reseta o que não tem a assinatura (MAC); a cópia traz
      // `nativeMessaging` no manifest, o estado de depois do Permitir.
      copiaComAPermissao = copiarComAPermissaoDoAbridor(pastaDaExtensao);
      pastaDaExtensao = copiaComAPermissao;
    } else if (permissaoDoAbridor) {
      const dada = { api: ['nativeMessaging'], explicit_host: [], manifest_permissions: [], scriptable_host: [] };
      fs.mkdirSync(path.join(perfil, 'Default'));
      fs.writeFileSync(path.join(perfil, 'Default', 'Preferences'), JSON.stringify({
        extensions: { settings: { [ID_DA_EXTENSAO]: { granted_permissions: dada, active_permissions: dada } } },
      }));
    }
    context = await chromium.launchPersistentContext(perfil, {
      channel: 'chromium',
      headless: !process.env.HEADED,
      env: { ...process.env, FONTCONFIG_FILE: path.join(__dirname, 'fontconfig', 'fonts.conf') },
      args: [
        `--disable-extensions-except=${pastaDaExtensao}`,
        `--load-extension=${pastaDaExtensao}`,
        `--host-resolver-rules=MAP accounts.google.com 127.0.0.1:${servidorDoLogin.porta}, MAP auth.openai.com 127.0.0.1:${servidorDoLogin.porta}, ${regrasDaPorta8766}`,
        // Só o servidor local do login usa HTTPS, com certificado autoassinado.
        '--ignore-certificate-errors',
        // A rede é toda falsificada ou bloqueada aqui: um proxy do ambiente
        // (HTTPS_PROXY) levaria a janela do login para fora do servidor local.
        '--no-proxy-server',
      ],
    });

    // A última rota registrada tem prioridade: o bloqueio geral vem primeiro.
    const origensLocais = [paginas.origem, paginas.origemCruzada];
    await context.route(url => /^https?:$/.test(url.protocol) && !origensLocais.includes(url.origin),
      route => route.abort('blockedbyclient'));
    for (const fake of Object.values(fakes)) if (fake.padrao) await context.route(fake.padrao, fake.tratar);
    if (conexaoDoTeste) await context.route(fakes.anki.padrao, conexaoReal.rotaComFalhasNaFrente(conexaoDoTeste, fakes.anki));
  } catch (erro) {
    await context?.close().catch(() => {});
    fs.rmSync(perfil, { recursive: true, force: true });
    if (copiaComAPermissao) fs.rmSync(copiaComAPermissao, { recursive: true, force: true });
    throw erro;
  }
  return {
    context,
    fechar: async () => {
      await context.close();
      fs.rmSync(perfil, { recursive: true, force: true });
      if (copiaComAPermissao) fs.rmSync(copiaComAPermissao, { recursive: true, force: true });
    },
  };
}

function copiarComAPermissaoDoAbridor(pastaDaExtensao) {
  const { arquivosDoPacote } = require('../scripts/arquivos-do-pacote');
  const copia = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ext-'));
  for (const arquivo of arquivosDoPacote(pastaDaExtensao)) {
    fs.mkdirSync(path.dirname(path.join(copia, arquivo)), { recursive: true });
    fs.copyFileSync(path.join(pastaDaExtensao, arquivo), path.join(copia, arquivo));
  }
  const arquivoDoManifest = path.join(copia, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(arquivoDoManifest, 'utf8'));
  manifest.optional_permissions = (manifest.optional_permissions || []).filter(p => p !== 'nativeMessaging');
  manifest.permissions = [...new Set([...(manifest.permissions || []), 'nativeMessaging'])];
  fs.writeFileSync(arquivoDoManifest, JSON.stringify(manifest, null, 2));
  return copia;
}

async function apagarPmBoasVindas(sw) {
  await sw.evaluate(() => chrome.storage.local.remove('pm_boas_vindas'));
}

async function prepararExtensao(context, { manterAbaDaInstalacao, lembreteDaConfiguracao, navegador }) {
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  if (navegador) await parearNoServiceWorker(sw, navegador);

  const abaDaInstalacao = await esperarAbaDaInstalacao(context, id);
  if (!manterAbaDaInstalacao) await abaDaInstalacao.close();

  const lerStorage = (chaves = null) => sw.evaluate(c => chrome.storage.local.get(c), chaves);
  const gravarStorage = valores => sw.evaluate(v => chrome.storage.local.set(v), valores);
  if (!lembreteDaConfiguracao) await apagarPmBoasVindas(sw);

  const sessaoDiretoNoIndexedDB = valor => sw.evaluate(valor => new Promise((resolve, reject) => {
    const req = indexedDB.open('pm-sessao', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sessao');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('sessao', valor === null ? 'readonly' : 'readwrite');
      const loja = tx.objectStore('sessao');
      if (valor !== null) loja.put(true, 'migrada');
      const pedido = valor === null ? loja.get('firebase') : loja.put(valor, 'firebase');
      tx.oncomplete = () => { db.close(); resolve(pedido.result || null); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), valor);

  return {
    id,
    serviceWorker: sw,
    abaDaInstalacao: manterAbaDaInstalacao ? abaDaInstalacao : null,
    url: caminho => `chrome-extension://${id}/${caminho}`,
    lerStorage,
    lerSessao: () => sessaoDiretoNoIndexedDB(null),
    gravarSessao: sessaoDiretoNoIndexedDB,
    gravarStorage,
    permissaoDoAbridor: () => sw.evaluate(() => chrome.permissions.contains({ permissions: ['nativeMessaging'] })),
    frases: async () => (await lerStorage({ frases: [] })).frases,
    semearSessao: async ({ uid = 'uid-teste', email = 'pessoa@teste.dev', displayName = 'Pessoa de Teste', expirada = false } = {}) => {
      await sessaoDiretoNoIndexedDB({ uid, idToken: 'token-teste', refreshToken: 'refresh-teste',
        expiresAt: expirada ? Date.now() - 60 * 1000 : Date.now() + 60 * 60 * 1000 });
      await gravarStorage({ pm_user_info: { uid, email, displayName, photoURL: '' } });
    },
  };
}

const test = base.extend({
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
    const origemCruzada = `http://localhost:${porta}`;
    await use({
      origem,
      origemCruzada,
      url: nome => `${origem}/${nome}`,
      urlCruzada: nome => `${origemCruzada}/${nome}`,
    });
    await new Promise(resolve => servidor.close(resolve));
  }, { scope: 'worker' }],

  servidorDoLogin: [async ({}, use) => {
    const servidor = await subirServidorDoLogin();
    await use(servidor);
    await servidor.fechar();
  }, { scope: 'worker' }],

  portaDaConexaoDeTeste: [async ({}, use) => {
    const porta = await subirPortaDaConexaoDeTeste();
    await use(porta);
    await porta.fechar();
  }, { scope: 'worker' }],

  fakes: async ({}, use) => {
    const anki = criarFakeAnki(), google = criarFakeGoogle();
    const abridor = criarFakeAbridor();
    anki.sincronizarCom(google);
    await use({ anki, gemini: criarFakeGemini(), google, abridor, chatgpt: anki.chatgpt });
    abridor.limpar();
  },

  conexaoDoTeste: async ({}, use) => {
    const conexao = conexaoReal.modoReal() ? await conexaoReal.subir() : null;
    await use(conexao);
    await conexao?.fechar();
  },

  // A permissão opcional `nativeMessaging` já dada, como o Chrome a guarda nas preferências do perfil
  // depois de a pessoa apertar Permitir no aviso dele: o aviso é do Chrome e o Playwright não o alcança.
  // Sem esta opção, a extensão chega como da loja: sem a permissão, e o pedido dela espera o aviso.
  permissaoDoAbridor: [false, { option: true }],

  pastaDaExtensao: async ({}, use) => {
    await use(RAIZ_DA_EXTENSAO);
  },

  conexaoDesligadaAoAbrir: [false, { option: true }],

  context: async ({ fakes, paginas, servidorDoLogin, portaDaConexaoDeTeste, pastaDaExtensao, permissaoDoAbridor, conexaoDoTeste, conexaoDesligadaAoAbrir }, use) => {
    if (conexaoDesligadaAoAbrir) fakes.anki.desligar();
    const perfil = await abrirPerfil({ fakes, paginas, servidorDoLogin, portaDaConexaoDeTeste, pastaDaExtensao, permissaoDoAbridor, conexaoDoTeste });
    await use(perfil.context);
    await perfil.fechar();
  },

  page: async ({ page, extensao }, use) => {
    await page.bringToFront();
    await use(page);
  },

  manterAbaDaInstalacao: [false, { option: true }],

  lembreteDaConfiguracao: [false, { option: true }],

  relogioParado: async ({ page }, use, testInfo) => {
    await use(({ page: alvo = page, em } = {}) => pararRelogio(alvo, { em, prazoDoTeste: testInfo.timeout }));
  },

  pareada: [true, { option: true }],

  extensao: async ({ context, fakes, conexaoDoTeste, manterAbaDaInstalacao, lembreteDaConfiguracao, pareada }, use) => {
    if (!pareada) {
      fakes.anki.pareamento.desconectar();
      await conexaoDoTeste?.enviar({ pareamento: 'desconectar' });
    }
    await use(await prepararExtensao(context, { manterAbaDaInstalacao, lembreteDaConfiguracao, navegador: pareada ? 'primeiro' : null }));
  },

  // Um segundo perfil do Chromium com a extensão, aberto como o primeiro (mesma rede falsificada, mesmo
  // abridor, mesma Conexão com o Anki): a cena de duas contas Google em dois perfis diante de uma Conexão só.
  // Não é uma segunda aba do mesmo perfil, que dividiria o armazenamento. `context` abre páginas dele;
  // `extensao` é o mesmo objeto que o teste já tem (semearSessao, lerStorage, …), mas do segundo perfil.
  segundoPerfil: async ({ extensao, fakes, paginas, servidorDoLogin, portaDaConexaoDeTeste, pastaDaExtensao, permissaoDoAbridor, conexaoDoTeste, manterAbaDaInstalacao, lembreteDaConfiguracao, pareada }, use) => {
    const perfil = await abrirPerfil({ fakes, paginas, servidorDoLogin, portaDaConexaoDeTeste, pastaDaExtensao, permissaoDoAbridor, conexaoDoTeste });
    if (pareada) fakes.anki.pareamento.parear('segundo');
    try {
      await use({ context: perfil.context, extensao: await prepararExtensao(perfil.context, { manterAbaDaInstalacao, lembreteDaConfiguracao, navegador: pareada ? 'segundo' : null }) });
    } finally {
      await perfil.fechar();
    }
  },
});

const SISTEMAS = Object.freeze({
  MAC: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  WINDOWS: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  LINUX: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
});

async function comOSistema(page, sistema) {
  await page.addInitScript(sistema => {
    Object.defineProperty(navigator, 'userAgent', { value: sistema });
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: /Mac/.test(sistema) ? 'macOS' : /Linux/.test(sistema) ? 'Linux' : 'Windows' },
    });
  }, sistema);
}

const botaoFlutuante = page => page.getByRole('button', { name: /^Minerar legenda/ });

async function tocarVideo(page) {
  await page.evaluate(async () => {
    const tela = document.createElement('canvas');
    tela.getContext('2d').fillRect(0, 0, 1, 1);
    const video = document.querySelector('video');
    video.srcObject = tela.captureStream();
    await video.play();
  });
}

module.exports = { test, expect, botaoFlutuante, tocarVideo, comOSistema, SISTEMAS };
