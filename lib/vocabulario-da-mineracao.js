'use strict';

(function (raiz) {
  const VERSAO = 2;
  const RENOVAR_A_CADA_MS = 15 * 60 * 1000;
  const CHAVES = Object.freeze({ en: 'pm_auto_keyword_vocab_en', ru: 'pm_auto_keyword_vocab_ru' });
  const FONTE_ARQUIVO = 'collection.anki2';
  const STATUS_LIMITE_MS = 3000;

  function chaveDoIdioma(lang) {
    return lang === 'ru' ? CHAVES.ru : CHAVES.en;
  }

  function doBaralho(gravada, deckName) {
    return gravada && gravada.cacheVersion === VERSAO && gravada.deckName === deckName ? gravada : null;
  }

  function estaEmDia(gravada, agora = Date.now()) {
    return agora - Number(gravada?.createdAt || 0) < RENOVAR_A_CADA_MS;
  }

  function dadosDe(leitura) {
    return Number(leitura?.dadosDe) || Number(leitura?.createdAt) || null;
  }

  async function confirmarAnkiFechado(endereco) {
    try {
      const resposta = await fetch(`${endereco}/anki/status`, { signal: AbortSignal.timeout(STATUS_LIMITE_MS) });
      if (!resposta.ok) return false;
      return (await resposta.json()).processCount === 0;
    } catch {
      return false;
    }
  }

  async function marcaDaLeitura(anterior, source, endereco, agora = Date.now()) {
    if (source !== FONTE_ARQUIVO) return { source: String(source || 'ankiconnect'), dadosDe: agora, ankiFechado: false };
    return { source: FONTE_ARQUIVO, dadosDe: dadosDe(anterior) || agora, ankiFechado: await confirmarAnkiFechado(endereco) };
  }

  async function lerLeituras() {
    const ajustes = await raiz.AjustesDeEnvio.ler();
    const gravado = await new Promise((resolve, reject) => chrome.storage.local.get(
      { [CHAVES.en]: null, [CHAVES.ru]: null },
      dados => (chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(dados))));
    const leituraDe = lang => {
      const leitura = doBaralho(gravado[CHAVES[lang]], ajustes[lang].deckName);
      const quando = dadosDe(leitura);
      return quando ? { dadosDe: quando, ankiFechado: leitura.ankiFechado === true } : null;
    };
    return { en: leituraDe('en'), ru: leituraDe('ru') };
  }

  raiz.VocabularioDaMineracao = Object.freeze({
    VERSAO,
    CHAVES,
    FONTE_ARQUIVO,
    chaveDoIdioma,
    doBaralho,
    estaEmDia,
    marcaDaLeitura,
    lerLeituras,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
