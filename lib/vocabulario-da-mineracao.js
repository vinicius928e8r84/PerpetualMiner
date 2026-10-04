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
// O Anki fechado tem duas formas. Com a Conexão muda, não há leitura nova. Com a
// Conexão ligada e o Anki fechado (a de hoje no Windows), ela responde lendo o
// arquivo do Anki (`source: 'collection.anki2'`): a leitura é nova, mas os dados
// não. Por isso cada leitura guarda `source` e `dadosDe`, o momento dos dados:
// o da leitura quando o Anki respondeu, e o da última leitura com o Anki aberto
// enquanto ele só é lido do arquivo. É esse momento que o popup diz.
//
// Carregado pelo service worker e pelo popup, depois de lib/ajustes-de-envio.js.

(function (raiz) {
  const VERSAO = 2;
  const RENOVAR_A_CADA_MS = 15 * 60 * 1000;
  const CHAVES = Object.freeze({ en: 'pm_auto_keyword_vocab_en', ru: 'pm_auto_keyword_vocab_ru' });
  // O `source` que a Conexão manda quando lê o arquivo do Anki, com o Anki fechado.
  const FONTE_ARQUIVO = 'collection.anki2';

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

  /** Se a leitura veio do arquivo do Anki (o Anki estava fechado quando a Conexão a fez). */
  function veioDoArquivo(leitura) {
    return leitura?.source === FONTE_ARQUIVO;
  }

  /** O momento dos dados de uma leitura (ms); as gravadas antes de `dadosDe` valem o momento em que foram feitas. */
  function dadosDe(leitura) {
    return Number(leitura?.dadosDe) || Number(leitura?.createdAt) || null;
  }

  /**
   * O `source` e o `dadosDe` de uma leitura nova, a partir da leitura anterior do
   * mesmo Baralho (ou null). Lida do Anki aberto, os dados são de agora; lida do
   * arquivo, ficam os da leitura anterior: o arquivo é o que o Anki deixou ao fechar.
   */
  function marcaDaLeitura(anterior, source, agora = Date.now()) {
    if (source !== FONTE_ARQUIVO) return { source: String(source || 'ankiconnect'), dadosDe: agora };
    return { source: FONTE_ARQUIVO, dadosDe: dadosDe(anterior) || agora };
  }

  /**
   * Cada idioma, no Baralho que os Ajustes de envio têm agora:
   * `{ en, ru }`, cada um `{ dadosDe: ms, doArquivo: boolean }` ou null (nenhuma
   * leitura desse Baralho).
   */
  async function lerLeituras() {
    const ajustes = await raiz.AjustesDeEnvio.ler();
    const gravado = await new Promise((resolve, reject) => chrome.storage.local.get(
      { [CHAVES.en]: null, [CHAVES.ru]: null },
      dados => (chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(dados))));
    const leituraDe = lang => {
      const leitura = doBaralho(gravado[CHAVES[lang]], ajustes[lang].deckName);
      const quando = dadosDe(leitura);
      return quando ? { dadosDe: quando, doArquivo: veioDoArquivo(leitura) } : null;
    };
    return { en: leituraDe('en'), ru: leituraDe('ru') };
  }

  raiz.VocabularioDaMineracao = Object.freeze({
    VERSAO,
    RENOVAR_A_CADA_MS,
    CHAVES,
    FONTE_ARQUIVO,
    chaveDoIdioma,
    doBaralho,
    estaEmDia,
    veioDoArquivo,
    marcaDaLeitura,
    lerLeituras,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
