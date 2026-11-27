'use strict';

(function (raiz) {
  const conjuntoDe = texto => new Set(texto.split(/\s+/).filter(Boolean));
  const LISTAS = Object.freeze(Object.fromEntries(Object.entries(raiz.ListasDeFrequentes || {}).map(([lang, texto]) => [lang, conjuntoDe(texto)])));

  function ehFrequente(lang, palavra) {
    const lista = LISTAS[lang];
    return Boolean(lista) && lista.has(String(palavra || '').toLowerCase());
  }

  raiz.PalavrasFrequentes = Object.freeze({ ehFrequente });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
