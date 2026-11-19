'use strict';

const fs = require('fs');
const path = require('path');

const PASTAS_DA_EXTENSAO = ['lib', 'veio', 'popup', 'bookreader', 'overlay'];
const PASTAS_DE_RUNTIME = [...PASTAS_DA_EXTENSAO, 'conexao'];
const FORA_DO_PACOTE = [/^veio\/README\.md$/, /^test_.*\.js$/];

const PASTAS_QUE_NAO_SAO_RUNTIME = [
  '.claude', '.git', 'complemento', 'dist', 'docs', 'e2e', 'engine', 'node_modules', 'preview', 'scripts', 'test-results',
];

function ehDaExtensao(caminho) {
  const partes = caminho.split('/');
  return partes.length === 1 || PASTAS_DA_EXTENSAO.includes(partes[0]);
}

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

module.exports = { arquivosDoPacote, ehDaExtensao, PASTAS_DA_EXTENSAO, PASTAS_DE_RUNTIME, PASTAS_QUE_NAO_SAO_RUNTIME };
