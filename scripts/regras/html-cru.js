'use strict';

const { ehJsDaExtensao, linhaDe, semComentariosJs } = require('./comum');

const id = 'html-cru';

const guarda = 'o texto da página e da Frase entra como texto, nunca como HTML';

const conserto = 'Monte o DOM com nós (`Veio.criar`, `Veio.elemento` e os componentes de veio/componentes.js) e ponha o texto com '
  + '`textContent` ou `Veio.escreverFrase`: o texto da página ou da Frase nunca entra como HTML.';

const seAplica = ehJsDaExtensao;

const HTML_CRU = /\.(innerHTML|outerHTML)\s*\+?=(?!=)|\.(insertAdjacentHTML|createContextualFragment)\s*\(|\bdocument\.(write(?:ln)?)\s*\(/g;

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  return [...codigo.matchAll(HTML_CRU)].map(m => ({ linha: linhaDe(codigo, m.index), detalhe: `HTML montado como texto: ${m[1] || m[2] || `document.${m[3]}`}` }));
}

module.exports = { id, guarda, conserto, seAplica, verificar };
