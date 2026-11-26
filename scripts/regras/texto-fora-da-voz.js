'use strict';

const { linhaDe, semComentariosJs } = require('./comum');

const id = 'texto-fora-da-voz';

const guarda = 'o texto que o JS põe na tela (textContent, innerText, title, placeholder, ariaLabel, aria-label) vem do catálogo da Voz por `textoDaVoz(\'<ID>\')`, nunca de um literal';

const conserto = 'Ponha o texto no catálogo da Voz (docs/design/voz/catalogo-textos.json) e leia-o com `textoDaVoz(\'<ID>\')`. '
  + 'Os únicos literais aceitos são `palavra:`, `auto:` e `Detalhes`, que os componentes base de veio/componentes.js escrevem.';

const PASTAS = /^(?:popup|painel|bookreader|overlay|lib|veio)\/.+\.js$/;

const seAplica = arquivo => (PASTAS.test(arquivo) || arquivo === 'content.js') && !/(?:^|\/)test_[^/]*$/.test(arquivo);

const LITERAIS_DOS_COMPONENTES = new Set(['palavra:', 'auto:', 'Detalhes']);

const ATRIBUICAO = /\.(textContent|innerText|title|placeholder|ariaLabel)\s*\+?=(?!=)\s*(['"`])(\p{L}(?:\\[\s\S]|(?!\2)[^\\])*)(\2)?/gu;
const ATRIBUTO = /\.setAttribute\(\s*(['"`])(aria-label|title|placeholder)\1\s*,\s*(['"`])(\p{L}(?:\\[\s\S]|(?!\3)[^\\])*)(\3)?/gu;

const resumo = corpo => (corpo.length > 30 ? `${corpo.slice(0, 30)}…` : corpo);

const ehLiteralDoComponente = ({ corpo, fechou }) => Boolean(fechou) && LITERAIS_DOS_COMPONENTES.has(corpo);

function literaisNaTela(codigo) {
  const atribuicoes = [...codigo.matchAll(ATRIBUICAO)].map(m => ({ indice: m.index, onde: `.${m[1]}`, corpo: m[3], fechou: m[4] }));
  const atributos = [...codigo.matchAll(ATRIBUTO)].map(m => ({ indice: m.index, onde: `setAttribute('${m[2]}')`, corpo: m[4], fechou: m[5] }));
  return [...atribuicoes, ...atributos];
}

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  return literaisNaTela(codigo)
    .filter(literal => !ehLiteralDoComponente(literal))
    .map(({ indice, onde, corpo }) => ({ linha: linhaDe(codigo, indice), detalhe: `${onde} recebe o literal "${resumo(corpo)}": o texto vem de textoDaVoz('<ID>')` }))
    .sort((a, b) => a.linha - b.linha);
}

module.exports = { id, guarda, conserto, seAplica, verificar };
