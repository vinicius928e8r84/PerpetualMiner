'use strict';

const id = 'glossario-so-linguagem';

const conserto = 'O glossary.md fala só de linguagem: tire a crase (escreva o nome entre aspas, ou sem marca), apague a linha '
  + '`_Nome no código_` (o nome antigo vira issue de renomeação, e o nome novo segue o glossário: docs/adr/0001) e deixe '
  + 'cada definição com no máximo duas frases, sobre o que a coisa é.';

const seAplica = arquivo => arquivo === 'glossary.md';

const MAXIMO_DE_FRASES = 2;
const NOME_NO_CODIGO = /^\s*_Nome no c[óo]digo_/i;
const TERMO = /^\*\*[^*\n]+\*\*:\s*$/;
const FIM_DA_DEFINICAO = /^\s*(_Avoid_|#)/;
const FIM_DE_FRASE = /[.!?]+["”')\]]*(?=\s|$)/g;

function frasesDe(texto) {
  return (texto.match(FIM_DE_FRASE) || []).length;
}

const acabaADefinicao = linha => !linha.trim() || FIM_DA_DEFINICAO.test(linha) || TERMO.test(linha);

function definicaoApos(linhas, indice) {
  const texto = [];
  for (let i = indice + 1; i < linhas.length; i++) {
    if (acabaADefinicao(linhas[i])) break;
    texto.push(linhas[i].trim());
  }
  return texto.join(' ');
}

function achadosDeLinha(texto, i, linhas) {
  const achados = [];
  if (texto.includes('`')) achados.push({ linha: i + 1, detalhe: 'crase no glossário' });
  if (NOME_NO_CODIGO.test(texto)) achados.push({ linha: i + 1, detalhe: 'linha "_Nome no código_" no glossário' });
  if (TERMO.test(texto)) {
    const frases = frasesDe(definicaoApos(linhas, i));
    if (frases > MAXIMO_DE_FRASES) achados.push({ linha: i + 1, detalhe: `definição com ${frases} frases (o máximo é ${MAXIMO_DE_FRASES}): ${texto.trim()}` });
  }
  return achados;
}

function verificar(arquivo, fonte) {
  const linhas = fonte.replace(/\r\n/g, '\n').split('\n');
  return linhas.flatMap((texto, i) => achadosDeLinha(texto, i, linhas));
}

module.exports = { id, conserto, seAplica, verificar };
