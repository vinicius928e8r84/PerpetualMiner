'use strict';

(function () {
  if (window.chrome?.storage?.local) return;

  const HOJE = new Date();
  const dia = deslocamento => {
    const data = new Date(HOJE);
    data.setDate(data.getDate() - deslocamento);
    return data.toLocaleDateString('pt-BR');
  };

  const fraseDeExemplo = ([id, texto, contexto, streaming, idioma, deslocamento, extras]) => (
    { id, texto, contexto, streaming, idioma, data: dia(deslocamento), ...extras }
  );

  const FRASES = [
    [1001, "I'm not saying it's your fault, I'm saying it's your responsibility.", 'The Bear · T2 · E7', 'netflix', 'Inglês', 0, { keywords: ['responsibility'], autoKeyword: 'responsibility' }],
    [1002, 'Мы с тобой одной крови — ты и я.', 'Маугли · cap. 3', 'livro', 'Russo', 0, { keywords: ['крови'], autoKeyword: 'крови' }],
    [1003, 'The devil is in the details.', 'The Atlantic', 'web', 'Inglês', 1, { status: 'exported', keywords: ['details'] }],
    [1004, 'Не всё то золото, что блестит.', 'Редакция · canal', 'youtube', 'Russo', 1, { status: 'exported', keywords: ['золото'] }],
    [1005, 'All that glitters is not gold.', 'Shakespeare · O Mercador de Veneza', 'livro', 'Inglês', 2, { keywords: ['glitters'] }],
    [1006, 'Тихая гавань проснулась раньше чаек.', 'Página fotografada · p. 42', 'manual', 'Russo', 3],
  ].map(fraseDeExemplo);

  const ESTADO_AUTO_MINER = {
    settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } },
    daily: { date: new Date().toISOString().slice(0, 10), en: { count: 7 }, ru: { count: 8 } },
  };

  const dados = {
    frases: FRASES,
    pm_atalho: { type: 'mouse', button: 3, code: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Botão voltar' },
    pm_deleted_ids: [],
    pm_migrated: true,
    pm_auto_miner_state_view: { ...ESTADO_AUTO_MINER, updatedAt: Date.now() },
    pm_auto_miner_settings: ESTADO_AUTO_MINER.settings,
    geminiApiKey: '',
    ankiBridgePresets: [],
    pm_boas_vindas: { agoraNao: [], concluida: false },
  };

  const copiar = valor => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)));

  function chavesEPadroes(pedido) {
    if (Array.isArray(pedido)) return { chaves: pedido, padroes: {} };
    if (typeof pedido === 'string') return { chaves: [pedido], padroes: {} };
    return { chaves: Object.keys(pedido), padroes: pedido };
  }

  function resolver(pedido) {
    if (pedido === null || pedido === undefined) {
      return Object.fromEntries(Object.keys(dados).map(chave => [chave, copiar(dados[chave])]));
    }
    const { chaves, padroes } = chavesEPadroes(pedido);
    const saida = {};
    for (const chave of chaves) {
      saida[chave] = chave in dados ? copiar(dados[chave]) : copiar(padroes[chave]);
    }
    return saida;
  }

  const ouvintesDeMudanca = [];

  const talvezPromessa = (valor, callback) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(valor), 0);
      return undefined;
    }
    return Promise.resolve(valor);
  };

  const metodoDoChrome = resposta => (entrada, callback) => talvezPromessa(resposta(entrada), callback);

  const apagarDosDados = chaves => {
    for (const chave of chaves) delete dados[chave];
  };

  function gravarNosDados(valores) {
    const mudancas = {};
    for (const [chave, valor] of Object.entries(valores)) {
      mudancas[chave] = { oldValue: copiar(dados[chave]), newValue: copiar(valor) };
      dados[chave] = copiar(valor);
    }
    ouvintesDeMudanca.forEach(ouvinte => setTimeout(() => ouvinte(mudancas, 'local'), 0));
  }

  function criarArea() {
    return {
      get: metodoDoChrome(resolver),
      set: metodoDoChrome(gravarNosDados),
      remove: metodoDoChrome(chaves => apagarDosDados([].concat(chaves))),
      clear: callback => talvezPromessa(apagarDosDados(Object.keys(dados)), callback),
    };
  }

  const area = criarArea();

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

  const semPermissao = metodoDoChrome(() => false);
  const semResposta = metodoDoChrome(() => undefined);

  const abrirAba = (id, ir) => metodoDoChrome(({ url } = {}) => {
    if (url) ir(url);
    return { id };
  });
  const abrirEmOutraAba = abrirAba(2, url => window.open(url, '_blank', 'noopener'));
  const irNaAbaAtual = abrirAba(1, url => { window.location.href = url; });

  const atualizarPeloId = metodo => (_id, info, callback) => metodo(info, callback);

  const semEfeito = () => {};

  const ouvintesQueNaoFazemNada = () => ({ addListener: semEfeito, removeListener: semEfeito });

  window.chrome = {
    storage: {
      local: area,
      sync: area,
      onChanged: { ...ouvintesQueNaoFazemNada(), addListener: ouvinte => ouvintesDeMudanca.push(ouvinte) },
    },
    runtime: {
      id: 'preview',
      lastError: undefined,
      getManifest: () => ({ version: 'preview', manifest_version: 3 }),
      getURL: caminho => new URL(String(caminho).replace(/^\//, ''), document.baseURI).href,
      sendMessage: metodoDoChrome(responderMensagem),
      onMessage: ouvintesQueNaoFazemNada(),
    },
    tabs: {
      query: metodoDoChrome(() => [{ id: 1, url: 'https://exemplo.dev', active: true }]),
      create: abrirEmOutraAba,
      update: atualizarPeloId(irNaAbaAtual),
    },
    windows: { update: atualizarPeloId(semResposta) },
    permissions: { contains: semPermissao, request: semPermissao },
    identity: {
      getRedirectURL: () => document.baseURI,
      launchWebAuthFlow: (opcoes, callback) => { semResposta(opcoes, callback); },
    },
    action: { setBadgeText: semEfeito, setBadgeBackgroundColor: semEfeito, setIcon: semEfeito },
  };

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
