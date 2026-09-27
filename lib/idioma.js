'use strict';

// A detecção de idioma, num lugar só.
//
// A regra é a mesma de sempre: cirílico → Russo, o resto → Inglês. Ela estava
// copiada em background.js, content.js, popup.js, painel.js e bookreader.js, e
// as cópias podiam divergir — o mesmo texto minerado por entradas diferentes
// podia acabar gravado com idiomas diferentes.

(function (raiz) {
  const CIRILICO = /[\u0400-\u04FF]/;

  // Os nomes como ficam gravados na Frase. Quem compara idioma usa estes, e não
  // uma string solta, para os nomes não voltarem a divergir entre as cópias.
  const IDIOMAS = Object.freeze({
    INGLES: 'Inglês',
    RUSSO: 'Russo',
  });

  /**
   * O idioma de um texto, como fica gravado na Frase.
   *
   * @param {string} texto
   * @returns {'Inglês'|'Russo'}
   */
  function detectarIdioma(texto) {
    return CIRILICO.test(String(texto ?? '')) ? IDIOMAS.RUSSO : IDIOMAS.INGLES;
  }

  /**
   * Se a Frase é russa: pelo idioma gravado, ou pelo texto quando ele falta.
   * A lista e o Envio ao Anki usam a mesma regra, para a frase mostrada em
   * russo não ir no Envio em inglês.
   *
   * @param {{ idioma?: string, texto?: string }} frase
   * @returns {boolean}
   */
  function ehRussa(frase) {
    return frase.idioma === IDIOMAS.RUSSO || detectarIdioma(frase.texto || '') === IDIOMAS.RUSSO;
  }

  raiz.IDIOMAS = IDIOMAS;
  raiz.detectarIdioma = detectarIdioma;
  raiz.ehRussa = ehRussa;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
