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

/**
 * Abre um perfil novo do Chromium com a extensão carregada e a rede falsificada. O primeiro perfil do
 * teste (`context`) e o segundo (`segundoPerfil`) abrem por aqui, então os dois têm o mesmo: `HEADED`, o
 * login do Google no servidor local, o abridor falso registrado, a permissão do abridor e as rotas dos fakes.
 * A pasta do perfil nasce antes e some se qualquer passo da abertura falha, em vez de ficar no disco.
 */
async function abrirPerfil({ fakes, paginas, servidorDoLogin, pastaDaExtensao, permissaoDoAbridor }) {
  servidorDoLogin.atender(fakes.google.responderLogin);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'));
  let context = null;
  try {
    // O abridor que a Conexão com o Anki registraria no computador (o de mentira).
    fakes.abridor.registrarNoPerfil(perfil);
    if (permissaoDoAbridor) {
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
        `--host-resolver-rules=MAP accounts.google.com 127.0.0.1:${servidorDoLogin.porta}`,
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
  } catch (erro) {
    await context?.close().catch(() => {});
    fs.rmSync(perfil, { recursive: true, force: true });
    throw erro;
  }
  return {
    context,
    fechar: async () => {
      await context.close();
      fs.rmSync(perfil, { recursive: true, force: true });
    },
  };
}

/**
 * O que um teste tem da extensão de um perfil já aberto: o service worker, o storage, a sessão semeada.
 * A instalação deixa a aba da Boas-vindas (fechada, salvo `manterAbaDaInstalacao`) e a configuração
 * começada (removida, salvo `lembreteDaConfiguracao`); veja as opções do fixture.
 */
async function prepararExtensao(context, { manterAbaDaInstalacao, lembreteDaConfiguracao }) {
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;

  const abaDaInstalacao = await esperarAbaDaInstalacao(context, id);
  if (!manterAbaDaInstalacao) await abaDaInstalacao.close();

  const lerStorage = (chaves = null) => sw.evaluate(c => chrome.storage.local.get(c), chaves);
  const gravarStorage = valores => sw.evaluate(v => chrome.storage.local.set(v), valores);
  if (!lembreteDaConfiguracao) await sw.evaluate(() => chrome.storage.local.remove('pm_boas_vindas'));

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
    /** Se a extensão tem a permissão do abridor (`nativeMessaging`), como o Chrome a guarda. */
    permissaoDoAbridor: () => sw.evaluate(() => chrome.permissions.contains({ permissions: ['nativeMessaging'] })),
    /** O histórico de frases como está gravado (mais nova primeiro). */
    frases: async () => (await lerStorage({ frases: [] })).frases,
    /** Semeia uma sessão da conta no armazenamento, sem passar pelo login real. */
    /** `expirada` grava um token já vencido: o painel precisa renová-lo antes de ir à nuvem. */
    semearSessao: async ({ uid = 'uid-teste', email = 'pessoa@teste.dev', displayName = 'Pessoa de Teste', expirada = false } = {}) => {
      await sessaoDiretoNoIndexedDB({ uid, idToken: 'token-teste', refreshToken: 'refresh-teste',
        expiresAt: expirada ? Date.now() - 60 * 1000 : Date.now() + 60 * 60 * 1000 });
      await gravarStorage({ pm_user_info: { uid, email, displayName, photoURL: '' } });
    },
  };
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
    const anki = criarFakeAnki(), google = criarFakeGoogle();
    const abridor = criarFakeAbridor();
    anki.sincronizarCom(google);
    await use({ anki, gemini: criarFakeGemini(), google, abridor });
    abridor.limpar();
  },

  // A permissão opcional `nativeMessaging` já dada, como o Chrome a guarda nas preferências do perfil
  // depois de a pessoa apertar Permitir no aviso dele: o aviso é do Chrome e o Playwright não o alcança.
  // Sem esta opção, a extensão chega como da loja: sem a permissão, e o pedido dela espera o aviso.
  permissaoDoAbridor: [false, { option: true }],

  // A pasta que o Chromium carrega como extensão: a raiz do repositório, salvo num
  // teste que precisa mexer nos arquivos (a atualização automática usa uma cópia).
  pastaDaExtensao: async ({}, use) => {
    await use(RAIZ_DA_EXTENSAO);
  },

  context: async ({ fakes, paginas, servidorDoLogin, pastaDaExtensao, permissaoDoAbridor }, use) => {
    const perfil = await abrirPerfil({ fakes, paginas, servidorDoLogin, pastaDaExtensao, permissaoDoAbridor });
    await use(perfil.context);
    await perfil.fechar();
  },

  // A página do teste passa pela `extensao`, que fecha a aba da instalação, e
  // volta para a frente: um teste que nem pede a `extensao` (o overlay no
  // player) começaria atrás da Boas-vindas, com a página em segundo plano.
  page: async ({ page, extensao }, use) => {
    await page.bringToFront();
    await use(page);
  },

  // A extensão chega instalada agora, então o Chrome já abriu a aba da
  // Boas-vindas (onInstalled, `install`). Ela é fechada antes do teste, que
  // começa como sempre começou; quem testa a Boas-vindas da instalação pede
  // `test.use({ manterAbaDaInstalacao: true })` e a recebe em `extensao.abaDaInstalacao`.
  manterAbaDaInstalacao: [false, { option: true }],

  // A instalação também deixa a configuração começada (`pm_boas_vindas`), o que
  // põe o lembrete “Configuração pela metade” no popup e em Frases. O teste
  // começa como quem já passou por ela, sem o lembrete; quem testa o lembrete
  // pede `test.use({ lembreteDaConfiguracao: true })`.
  lembreteDaConfiguracao: [false, { option: true }],

  extensao: async ({ context, manterAbaDaInstalacao, lembreteDaConfiguracao }, use) => {
    await use(await prepararExtensao(context, { manterAbaDaInstalacao, lembreteDaConfiguracao }));
  },

  // Um segundo perfil do Chromium com a extensão, aberto como o primeiro (mesma rede falsificada, mesmo
  // abridor, mesma Conexão com o Anki): a cena de duas contas Google em dois perfis diante de uma Conexão só.
  // Não é uma segunda aba do mesmo perfil, que dividiria o armazenamento. `context` abre páginas dele;
  // `extensao` é o mesmo objeto que o teste já tem (semearSessao, lerStorage, …), mas do segundo perfil.
  segundoPerfil: async ({ extensao, fakes, paginas, servidorDoLogin, pastaDaExtensao, permissaoDoAbridor, manterAbaDaInstalacao, lembreteDaConfiguracao }, use) => {
    const perfil = await abrirPerfil({ fakes, paginas, servidorDoLogin, pastaDaExtensao, permissaoDoAbridor });
    try {
      await use({ context: perfil.context, extensao: await prepararExtensao(perfil.context, { manterAbaDaInstalacao, lembreteDaConfiguracao }) });
    } finally {
      await perfil.fechar();
    }
  },
});

/** Os sistemas que o passo Ter o Anki (#146) distingue para escolher o instalador do Anki. */
const SISTEMAS = Object.freeze({
  MAC: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  WINDOWS: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
});

/**
 * O Chromium do teste como o de um sistema (`SISTEMAS.MAC` · `SISTEMAS.WINDOWS`): o `userAgent` e o
 * `userAgentData.platform` passam a ser os dele. Chame antes do `goto` da página que os lê.
 */
async function comOSistema(page, sistema) {
  await page.addInitScript(sistema => {
    Object.defineProperty(navigator, 'userAgent', { value: sistema });
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: /Mac/.test(sistema) ? 'macOS' : 'Windows' },
    });
  }, sistema);
}

/** O botão flutuante de minerar a legenda, sobre o player. */
const botaoFlutuante = page => page.getByRole('button', { name: /^Minerar legenda/ });

/** Põe o vídeo da página para tocar: a mineração automática só olha a legenda de um vídeo que está tocando. */
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
