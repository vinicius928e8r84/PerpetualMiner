'use strict';

const fs = require('fs');
const path = require('path');

const semComentario = require('./sem-comentario');
const { arquivosDoRepositorio } = require('./comum');

function comentariosDe(raiz, filtro) {
  return arquivosDoRepositorio(raiz).filter(semComentario.seAplica).filter(arquivo => filtro.test(arquivo)).flatMap(arquivo => {
    const fonte = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
    const linhas = fonte.split('\n');
    return semComentario.verificar(arquivo, fonte).map(({ linha }) => ({ arquivo, linha, texto: linhas[linha - 1].trim() }));
  });
}

function formatar(comentarios) {
  const saida = [];
  let atual = null;
  for (const { arquivo, linha, texto } of comentarios) {
    if (arquivo !== atual) {
      atual = arquivo;
      saida.push(`\n=== ${arquivo} (${comentarios.filter(c => c.arquivo === arquivo).length})`);
    }
    saida.push(`${linha}: ${texto.slice(0, 220)}`);
  }
  return saida.join('\n');
}

if (require.main === module) {
  const comentarios = comentariosDe(process.cwd(), new RegExp(process.argv[2] || '.'));
  console.log(formatar(comentarios));
  console.error(`total: ${comentarios.length} linha(s) de comentário`);
}

module.exports = { comentariosDe, formatar };
