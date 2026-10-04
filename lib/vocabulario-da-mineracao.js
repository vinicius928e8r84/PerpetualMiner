'use strict';

// A última leitura do vocabulário que a Mineração automática usa: o que é
// gravado, de que Baralho vale e quando foi lida. Quem lê (o service worker, ao
// escolher a Palavra) e quem mostra a idade (o popup) falam daqui, então a
// chave e a versão do formato moram num lugar só.
//
// A leitura não tem prazo: ela vale enquanto for do Baralho dos Ajustes de
// envio. `RENOVAR_A_CADA_MS` só diz de quanto em quanto tempo o service worker
// tenta lê-la de novo enquanto a Conexão com o Anki responde; com a Conexão
// muda, a última leitura continua valendo.
//
// Carregado pelo service worker e pelo popup, depois de lib/ajustes-de-envio.js.

(function (raiz) {
  const VERSAO = 2;
  const RENOVAR_A_CADA_MS = 15 * 60 * 1000;
  const CHAVES = Object.freeze({ en: 'pm_auto_keyword_vocab_en', ru: 'pm_auto_keyword_vocab_ru' });

  /** A chave de um idioma; o que não é russo é inglês, como na Mineração automática. */
  function chaveDoIdioma(lang) {
    return lang === 'ru' ? CHAVES.ru : CHAVES.en;
  }

  /** A leitura gravada, se for deste formato e do `deckName`; senão, null. */
  function doBaralho(gravada, deckName) {
    return gravada && gravada.cacheVersion === VERSAO && gravada.deckName === deckName ? gravada : null;
  }

  /** Se a leitura ainda não precisa ser renovada (ela continua valendo depois disso). */
  function estaEmDia(gravada, agora = Date.now()) {
    return agora - Number(gravada?.createdAt || 0) < RENOVAR_A_CADA_MS;
  }

  /**
   * Quando cada idioma foi lido, no Baralho que os Ajustes de envio têm agora:
   * `{ en: ms | null, ru: ms | null }`. Null é “nenhuma leitura desse Baralho”.
   */
  async function lerQuandos() {
    const ajustes = await raiz.AjustesDeEnvio.ler();
    const gravado = await new Promise((resolve, reject) => chrome.storage.local.get(
      { [CHAVES.en]: null, [CHAVES.ru]: null },
      dados => (chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(dados))));
    const quando = lang => {
      const leitura = doBaralho(gravado[CHAVES[lang]], ajustes[lang].deckName);
      return leitura ? Number(leitura.createdAt) || null : null;
    };
    return { en: quando('en'), ru: quando('ru') };
  }

  raiz.VocabularioDaMineracao = Object.freeze({
    VERSAO,
    RENOVAR_A_CADA_MS,
    CHAVES,
    chaveDoIdioma,
    doBaralho,
    estaEmDia,
    lerQuandos,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
