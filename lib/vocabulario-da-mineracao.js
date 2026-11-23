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

  function vocabularioVazio(disponivel = true) {
    return { available: disponivel, words: new Set(), terms: new Set(), wordInfo: new Map(), termInfo: new Map() };
  }

  function infosComOsVistos(infoGravada, nomes) {
    const info = new Map(Object.entries(infoGravada || {}));
    for (const nome of nomes || []) {
      if (!info.has(nome)) info.set(nome, { status: 'seen' });
    }
    return info;
  }

  function vocabularioDaLeitura(leitura) {
    return {
      available: true,
      words: new Set(leitura.words || []),
      terms: new Set(leitura.terms || []),
      wordInfo: infosComOsVistos(leitura.wordInfo, leitura.words),
      termInfo: infosComOsVistos(leitura.termInfo, leitura.terms),
    };
  }

  function infoDoItem(item) {
    return {
      status: String(item.status || 'seen'),
      cards: Number(item.cards || 0),
      new: Number(item.new || 0),
      recent: Number(item.recent || 0),
      mature: Number(item.mature || 0),
    };
  }

  function leituraNova(deckName, resposta) {
    const leitura = { cacheVersion: VERSAO, deckName, createdAt: Date.now(), words: [], terms: [], wordInfo: {}, termInfo: {} };
    for (const item of resposta?.words || []) {
      const texto = raiz.PalavraAutomatica.chaveDoTermo(item.word || '');
      if (!texto) continue;
      const [lista, infos] = item.type === 'term' ? [leitura.terms, leitura.termInfo] : [leitura.words, leitura.wordInfo];
      lista.push(texto);
      infos[texto] = infoDoItem(item);
    }
    return leitura;
  }

  async function lerGravada(chave) {
    const dados = await new Promise(resolve => chrome.storage.local.get({ [chave]: null }, resolve));
    return dados[chave];
  }

  async function perguntarAoAnki(deckName, lang, ultimaLeitura) {
    const { ConversaComOAnki, PedidoAoAnki } = raiz;
    const desfecho = await ConversaComOAnki.pedir(PedidoAoAnki.vocabulario(deckName, lang), ultimaLeitura ? { prazoMs: PRAZO_DA_RENOVACAO_MS } : {});
    return desfecho.ok ? desfecho.dados : null;
  }

  async function ler(lang = 'en') {
    const idioma = lang === 'ru' ? 'ru' : 'en';
    const deckName = (await raiz.AjustesDeEnvio.ler())[idioma].deckName;
    const chave = chaveDoIdioma(idioma);
    const ultimaLeitura = doBaralho(await lerGravada(chave), deckName);
    if (ultimaLeitura && estaEmDia(ultimaLeitura)) return vocabularioDaLeitura(ultimaLeitura);
    const resposta = await perguntarAoAnki(deckName, idioma, ultimaLeitura);
    if (!resposta) return ultimaLeitura ? vocabularioDaLeitura(ultimaLeitura) : vocabularioVazio(false);
    const nova = leituraNova(deckName, resposta);
    chrome.storage.local.set({ [chave]: nova });
    return vocabularioDaLeitura(nova);
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

  raiz.VocabularioDaMineracao = Object.freeze({
    VERSAO,
    CHAVES,
    chaveDoIdioma,
    doBaralho,
    estaEmDia,
    lerLeituras,
    ler,
    vocabularioDaLeitura,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
