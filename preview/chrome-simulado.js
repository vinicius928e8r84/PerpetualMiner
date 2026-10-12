'use strict';

// O `chrome.*` que a extensão espera, simulado para o preview do navegador.
//
// As páginas da extensão (popup, painel, foto) só rodam dentro do Chrome, com
// as APIs da extensão. Fora dele elas quebram na primeira chamada e a pessoa
// não vê nada. Este arquivo põe no lugar um `chrome` de mentira, com dados de
// exemplo já semeados, para o preview mostrar as telas cheias — o visual de
// verdade, com conteúdo plausível.
//
// Ele é injetado apenas nas cópias que vão para o preview; a extensão de
// verdade nunca o carrega. Nada aqui fala com a rede: o que some ao recarregar
// a página, some mesmo.

(function () {
  if (window.chrome && chrome.storage && chrome.storage.local) return;

  const HOJE = new Date();
  const dia = deslocamento => {
    const data = new Date(HOJE);
    data.setDate(data.getDate() - deslocamento);
    return data.toLocaleDateString('pt-BR');
  };

  const FRASES = [
    {
      id: 1001, texto: "I'm not saying it's your fault, I'm saying it's your responsibility.",
      contexto: 'The Bear · T2 · E7', streaming: 'netflix', idioma: 'Inglês', data: dia(0),
      keywords: ['responsibility'], autoKeyword: 'responsibility',
    },
    {
      id: 1002, texto: 'Мы с тобой одной крови — ты и я.',
      contexto: 'Маугли · cap. 3', streaming: 'livro', idioma: 'Russo', data: dia(0),
      keywords: ['крови'], autoKeyword: 'крови',
    },
    {
      id: 1003, texto: 'The devil is in the details.',
      contexto: 'The Atlantic', streaming: 'web', idioma: 'Inglês', data: dia(1),
      status: 'exported', keywords: ['details'],
    },
    {
      id: 1004, texto: 'Не всё то золото, что блестит.',
      contexto: 'Редакция · canal', streaming: 'youtube', idioma: 'Russo', data: dia(1),
      status: 'exported', keywords: ['золото'],
    },
    {
      id: 1005, texto: 'All that glitters is not gold.',
      contexto: 'Shakespeare · O Mercador de Veneza', streaming: 'livro', idioma: 'Inglês', data: dia(2),
      keywords: ['glitters'],
    },
    {
      id: 1006, texto: 'Тихая гавань проснулась раньше чаек.',
      contexto: 'Página fotografada · p. 42', streaming: 'manual', idioma: 'Russo', data: dia(3),
    },
  ];

  const ESTADO_AUTO_MINER = {
    settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } },
    daily: { date: new Date().toISOString().slice(0, 10), en: { count: 7 }, ru: { count: 8 } },
  };

  const dados = {
    frases: FRASES,
    pm_atalho: { type: 'mouse', button: 3, code: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Botão voltar' },
    pm_deleted_ids: [],
    pm_pending_sync: [],
    pm_migrated: true,
    pm_auto_miner_state_view: { ...ESTADO_AUTO_MINER, updatedAt: Date.now() },
    pm_auto_miner_settings: ESTADO_AUTO_MINER.settings,
    // Sem sessão de conta: logado, o painel iria buscar as frases no Firestore
    // e ficaria em "Carregando…" para sempre. Deslogado, ele lê as locais daqui.
    geminiApiKey: '',
    ankiBridgePresets: [],
    // A configuração começada na instalação e ainda não em Tudo pronto: o popup
    // e Frases mostram o lembrete “Configuração pela metade” (ONB-14, ONB-15).
    pm_boas_vindas: { agoraNao: [], concluida: false },
  };

  /** Copia o valor, como o storage do Chrome faz ao devolver o que guardou. */
  const copiar = valor => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)));

  /** As chaves pedidas, no formato que `chrome.storage.get` aceita. */
  function resolver(pedido) {
    if (pedido === null || pedido === undefined) {
      return Object.fromEntries(Object.keys(dados).map(chave => [chave, copiar(dados[chave])]));
    }
    const chaves = Array.isArray(pedido) ? pedido : typeof pedido === 'string' ? [pedido] : Object.keys(pedido);
    const padroes = Array.isArray(pedido) || typeof pedido === 'string' ? {} : pedido;
    const saida = {};
    for (const chave of chaves) {
      saida[chave] = chave in dados ? copiar(dados[chave]) : copiar(padroes[chave]);
    }
    return saida;
  }

  const ouvintesDeMudanca = [];

  /** Uma API que aceita callback ou devolve Promise, como o Chrome faz. */
  const talvezPromessa = (valor, callback) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(valor), 0);
      return undefined;
    }
    return Promise.resolve(valor);
  };

  function criarArea() {
    return {
      get: (pedido, callback) => talvezPromessa(resolver(pedido), callback),
      set: (valores, callback) => {
        const mudancas = {};
        for (const [chave, valor] of Object.entries(valores)) {
          mudancas[chave] = { oldValue: copiar(dados[chave]), newValue: copiar(valor) };
          dados[chave] = copiar(valor);
        }
        ouvintesDeMudanca.forEach(ouvinte => setTimeout(() => ouvinte(mudancas, 'local'), 0));
        return talvezPromessa(undefined, callback);
      },
      remove: (chaves, callback) => {
        for (const chave of [].concat(chaves)) delete dados[chave];
        return talvezPromessa(undefined, callback);
      },
      clear: callback => {
        for (const chave of Object.keys(dados)) delete dados[chave];
        return talvezPromessa(undefined, callback);
      },
    };
  }

  const area = criarArea();

  /** As mensagens que as telas mandam ao service worker. */
  function responderMensagem(mensagem) {
    switch (mensagem && mensagem.type) {
      case 'AUTO_MINER_GET_STATE':
        return { ok: true, state: copiar(ESTADO_AUTO_MINER) };
      case 'AUTO_MINER_SET_SETTINGS': {
        Object.assign(ESTADO_AUTO_MINER.settings, mensagem.settings || {});
        return { ok: true, state: copiar(ESTADO_AUTO_MINER) };
      }
      default:
        return { ok: true };
    }
  }

  window.chrome = {
    storage: {
      local: area,
      sync: area,
      onChanged: { addListener: ouvinte => ouvintesDeMudanca.push(ouvinte), removeListener: () => {} },
    },
    runtime: {
      id: 'preview',
      lastError: undefined,
      getManifest: () => ({ version: 'preview', manifest_version: 3 }),
      getURL: caminho => new URL(String(caminho).replace(/^\//, ''), document.baseURI).href,
      sendMessage: (mensagem, callback) => talvezPromessa(responderMensagem(mensagem), callback),
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
    tabs: {
      query: (_consulta, callback) => talvezPromessa([{ id: 1, url: 'https://exemplo.dev', active: true }], callback),
      create: ({ url } = {}, callback) => {
        if (url) window.open(url, '_blank', 'noopener');
        return talvezPromessa({ id: 2 }, callback);
      },
      update: (_id, { url } = {}, callback) => {
        if (url) window.location.href = url;
        return talvezPromessa({ id: 1 }, callback);
      },
    },
    windows: { update: (_id, _info, callback) => talvezPromessa(undefined, callback) },
    // A permissão opcional do abridor (Abrir o Anki sozinho): o preview nunca a tem, e o aviso do Chrome não existe.
    permissions: {
      contains: (_permissoes, callback) => talvezPromessa(false, callback),
      request: (_permissoes, callback) => talvezPromessa(false, callback),
    },
    identity: {
      getRedirectURL: () => document.baseURI,
      launchWebAuthFlow: (_opcoes, callback) =>
        talvezPromessa(undefined, callback) && undefined,
    },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setIcon: () => {} },
  };

  // Uma faixa discreta, para ninguém confundir preview com a extensão rodando.
  document.addEventListener('DOMContentLoaded', () => {
    const faixa = document.createElement('div');
    faixa.textContent = 'Preview: dados de exemplo, fora do Chrome. Botões que dependem do navegador não funcionam.';
    faixa.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'left:0', 'right:0', 'bottom:0',
      'padding:6px 12px', 'font:600 11px/1.4 system-ui,sans-serif', 'text-align:center',
      'background:#F5B83D', 'color:#1A1204',
    ].join(';');
    document.body.appendChild(faixa);
  });
})();
