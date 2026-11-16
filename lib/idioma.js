'use strict';

(function (raiz) {
  const CIRILICO = /[\u0400-\u04FF]/;

  const IDIOMAS = Object.freeze({
    INGLES: 'Inglês',
    RUSSO: 'Russo',
  });

  function detectarIdioma(texto) {
    return CIRILICO.test(String(texto ?? '')) ? IDIOMAS.RUSSO : IDIOMAS.INGLES;
  }

  function idiomaDe(codigo) {
    return codigo === 'ru' ? IDIOMAS.RUSSO : IDIOMAS.INGLES;
  }

  function ehRussa(frase) {
    return frase.idioma === IDIOMAS.RUSSO || detectarIdioma(frase.texto || '') === IDIOMAS.RUSSO;
  }

  raiz.IDIOMAS = IDIOMAS;
  raiz.detectarIdioma = detectarIdioma;
  raiz.idiomaDe = idiomaDe;
  raiz.ehRussa = ehRussa;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
