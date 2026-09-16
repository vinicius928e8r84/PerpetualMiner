'use strict';

// A detecção de idioma, num lugar só.
//
// A regra é a mesma de sempre: cirílico → Russo, o resto → Inglês. Ela estava
// copiada em background.js, content.js, popup.js, painel.js e bookreader.js, e
// as cópias podiam divergir — o mesmo texto minerado por entradas diferentes
// podia acabar gravado com idiomas diferentes.

(function (raiz) {
  const CIRILICO = /[Ѐ-ӿ]/;

  const IDIOMAS = {
    INGLES: 'Inglês',
    RUSSO: 'Russo',
  };

  /**
   * O idioma de um texto, como fica gravado na Frase.
   *
   * @param {string} texto
   * @returns {'Inglês'|'Russo'}
   */
  function detectarIdioma(texto) {
    return CIRILICO.test(String(texto ?? '')) ? IDIOMAS.RUSSO : IDIOMAS.INGLES;
  }

  raiz.IDIOMAS = IDIOMAS;
  raiz.detectarIdioma = detectarIdioma;
  if (typeof module !== 'undefined' && module.exports) module.exports = { IDIOMAS, detectarIdioma };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
