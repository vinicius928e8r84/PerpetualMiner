'use strict';

// O idioma da Frase tem um dono: lib/idioma.js (CODING_STANDARDS.md regra 5). A
// regra "cirílico → Russo" já esteve copiada em cinco arquivos e as cópias
// divergiram (bf640d9); `ehRussa` foi copiada de novo e voltou para lá em
// 7b7c475; a C1 (#129) ainda achou entradas gravando idiomas diferentes para o
// mesmo texto. Esta regra acusa o nome solto e o detector copiado.

const { ehJsDaExtensao, linhaDe, semComentariosJs } = require('./comum');

const id = 'idioma-solto';

const conserto = 'Use lib/idioma.js: `PerpetualMiner.IDIOMAS.RUSSO` / `.INGLES` para o nome gravado, '
  + '`PerpetualMiner.detectarIdioma(texto)` para detectar e `PerpetualMiner.ehRussa(frase)` para decidir; '
  + 'não escreva \'Russo\'/\'Inglês\' nem um /[\\u0400-\\u04FF]/ novo (CODING_STANDARDS.md regra 5).';

const seAplica = arquivo => ehJsDaExtensao(arquivo) && arquivo !== 'lib/idioma.js';

const NOME_SOLTO = /(['"`])(Russo|Inglês|Ingles)\1/g;
const CIRILICO = /\\u0400|\\u04[fF]{2}|[а-яА-ЯёЁ]-[а-яА-ЯёЁ]/g;

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  const achados = [];
  for (const m of codigo.matchAll(NOME_SOLTO)) {
    achados.push({ linha: linhaDe(codigo, m.index), detalhe: `nome de idioma solto ${m[0]}` });
  }
  const linhasComCirilico = new Set();
  for (const m of codigo.matchAll(CIRILICO)) linhasComCirilico.add(linhaDe(codigo, m.index));
  for (const linha of linhasComCirilico) achados.push({ linha, detalhe: 'faixa do cirílico copiada' });
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
