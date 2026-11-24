'use strict';

(function (raiz) {
  const VERSAO = 2;
  const RENOVAR_A_CADA_MS = 15 * 60 * 1000;
  const PRAZO_DA_RENOVACAO_MS = 8000;
  const CHAVES = Object.freeze({ en: 'pm_auto_keyword_vocab_en', ru: 'pm_auto_keyword_vocab_ru' });

  function chaveDoIdioma(lang) {
    return lang === 'ru' ? CHAVES.ru : CHAVES.en;
  }

  function doBaralho(gravada, deckName) {
    return gravada?.cacheVersion === VERSAO && gravada.deckName === deckName ? gravada : null;
  }

  function estaEmDia(gravada, agora = Date.now()) {
    return agora - Number(gravada?.createdAt || 0) < RENOVAR_A_CADA_MS;
  }

  async function lerLeituras() {
    const ajustes = await raiz.AjustesDeEnvio.ler();
    const gravado = await new Promise((resolve, reject) => chrome.storage.local.get(
      { [CHAVES.en]: null, [CHAVES.ru]: null },
      dados => (chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(dados))));
    const leituraDe = lang => {
      const leitura = doBaralho(gravado[CHAVES[lang]], ajustes[lang].deckName);
      const createdAt = Number(leitura?.createdAt) || null;
      return createdAt ? { createdAt } : null;
    };
    return { en: leituraDe('en'), ru: leituraDe('ru') };
  }

  const lerDoStorage = padroes => new Promise(resolve => chrome.storage.local.get(padroes, resolve));

  const vocabularioVazio = (disponivel = true) => ({ available: disponivel, words: new Set(), terms: new Set(), wordInfo: new Map(), termInfo: new Map() });

  function informacaoDeCadaUm(lista, informacoes) {
    const mapa = new Map(Object.entries(informacoes || {}));
    for (const item of lista || []) {
      if (!mapa.has(item)) mapa.set(item, { status: 'seen' });
    }
    return mapa;
  }

  function vocabularioDaLeitura(leitura) {
    return {
      available: true,
      words: new Set(leitura.words || []),
      terms: new Set(leitura.terms || []),
      wordInfo: informacaoDeCadaUm(leitura.words, leitura.wordInfo),
      termInfo: informacaoDeCadaUm(leitura.terms, leitura.termInfo),
    };
  }

  const informacaoDoItem = item => ({
    status: String(item.status || 'seen'),
    cards: Number(item.cards || 0),
    new: Number(item.new || 0),
    recent: Number(item.recent || 0),
    mature: Number(item.mature || 0),
  });

  function leituraNova(deckName, dados) {
    const palavras = [];
    const termos = [];
    const wordInfo = {};
    const termInfo = {};
    for (const item of dados?.words || []) {
      const texto = raiz.PalavraAutomatica.chaveDoTermo(item.word || '');
      if (!texto) continue;
      const [lista, informacoes] = item.type === 'term' ? [termos, termInfo] : [palavras, wordInfo];
      lista.push(texto);
      informacoes[texto] = informacaoDoItem(item);
    }
    return { cacheVersion: VERSAO, deckName, createdAt: Date.now(), words: palavras, terms: termos, wordInfo, termInfo };
  }

  async function nomeDoBaralho(lang) {
    return (await raiz.AjustesDeEnvio.ler())[lang].deckName;
  }

  async function leituraGuardada(lang, deckName) {
    const chave = chaveDoIdioma(lang);
    const guardado = await lerDoStorage({ [chave]: null });
    return { chave, ultima: doBaralho(guardado[chave], deckName) };
  }

  async function lerDoAnki(lang, deckName, ultima) {
    const desfecho = await raiz.ConversaComOAnki.pedir(raiz.PedidoAoAnki.vocabulario(deckName, lang), ultima ? { prazoMs: PRAZO_DA_RENOVACAO_MS } : {});
    return desfecho.ok ? desfecho.dados : null;
  }

  async function vocabulario(idioma = 'en') {
    const lang = idioma === 'ru' ? 'ru' : 'en';
    const deckName = await nomeDoBaralho(lang);
    const { chave, ultima } = await leituraGuardada(lang, deckName);
    if (ultima && estaEmDia(ultima)) return vocabularioDaLeitura(ultima);
    const dados = await lerDoAnki(lang, deckName, ultima);
    if (!dados) return ultima ? vocabularioDaLeitura(ultima) : vocabularioVazio(false);
    const nova = leituraNova(deckName, dados);
    chrome.storage.local.set({ [chave]: nova });
    return vocabularioDaLeitura(nova);
  }

  raiz.VocabularioDaMineracao = Object.freeze({
    VERSAO,
    CHAVES,
    chaveDoIdioma,
    doBaralho,
    estaEmDia,
    lerLeituras,
    vocabulario,
    vocabularioDaLeitura,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
