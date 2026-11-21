'use strict';

(function (raiz) {
  const VERSAO = 2;
  const RENOVAR_A_CADA_MS = 15 * 60 * 1000;
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

  raiz.VocabularioDaMineracao = Object.freeze({
    VERSAO,
    CHAVES,
    chaveDoIdioma,
    doBaralho,
    estaEmDia,
    lerLeituras,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
