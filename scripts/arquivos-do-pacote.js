'use strict';

const fs = require('fs');
const path = require('path');

const PASTAS_DE_RUNTIME = ['lib', 'veio', 'conexao'];
const FORA_DO_PACOTE = [/^veio\/README\.md$/, /^test_.*\.js$/];

const PASTAS_QUE_NAO_SAO_RUNTIME = [
  '.claude', '.git', 'complemento', 'dist', 'docs', 'e2e', 'engine', 'node_modules', 'preview', 'scripts', 'test-results',
];

function listar(raiz, pasta) {
  return fs.readdirSync(path.join(raiz, pasta), { withFileTypes: true }).flatMap(entrada => {
    const relativo = `${pasta}/${entrada.name}`;
    return entrada.isDirectory() ? listar(raiz, relativo) : [relativo];
  });
}

function arquivosDoPacote(raiz) {
  const naRaiz = fs.readdirSync(raiz, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(js|html|css)$/.test(e.name))
    .map(e => e.name);
  const dasPastas = PASTAS_DE_RUNTIME.flatMap(pasta => listar(raiz, pasta));
  return [...naRaiz, 'manifest.json', ...dasPastas]
    .filter(arquivo => !FORA_DO_PACOTE.some(regra => regra.test(arquivo)))
    .sort();
}

module.exports = { arquivosDoPacote, PASTAS_QUE_NAO_SAO_RUNTIME };
