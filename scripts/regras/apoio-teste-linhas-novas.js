'use strict';

const fs = require('fs');
const path = require('path');
const { raizTemporaria } = require('./apoio-sem-comentario');

function achadosDaMudanca(regra, { antes = {}, depois, arquivo }) {
  const { raiz, git, gravar, commit } = raizTemporaria();
  try {
    gravar({ 'LEIAME.md': 'x\n', ...antes });
    const base = commit('base');
    git('checkout', '-q', '-b', 'mudanca');
    gravar(depois);
    commit('mudanca');
    return regra.verificar(arquivo, fs.readFileSync(path.join(raiz, arquivo)).toString('latin1'), raiz, base);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}

const juntar = (...linhas) => `${linhas.join('\n')}\n`;

module.exports = { achadosDaMudanca, juntar };
