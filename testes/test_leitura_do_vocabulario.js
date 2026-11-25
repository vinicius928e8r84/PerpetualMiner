'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const fonte = path.resolve(__dirname, '..', 'lib', 'vocabulario-da-mineracao.js');
const caminhoDoAjudante = require.resolve('../e2e/leitura-do-vocabulario');

function carregarAjudanteCom(versao) {
  const lerOriginal = fs.readFileSync;
  fs.readFileSync = (arquivo, ...resto) => {
    const texto = lerOriginal(arquivo, ...resto);
    return path.resolve(String(arquivo)) === fonte ? texto.replace(/const VERSAO = \d+;/, `const VERSAO = ${versao};`) : texto;
  };
  delete require.cache[caminhoDoAjudante];
  try {
    return require(caminhoDoAjudante).leituraDoVocabulario;
  } finally {
    fs.readFileSync = lerOriginal;
    delete require.cache[caminhoDoAjudante];
  }
}

const leitura = carregarAjudanteCom(7)('Baralho', 1000);
assert.strictEqual(leitura.cacheVersion, 7, 'o ajudante usa a VERSAO do módulo, não um número seu');
assert.deepStrictEqual(leitura, { cacheVersion: 7, deckName: 'Baralho', createdAt: 1000, words: [], terms: [], wordInfo: {}, termInfo: {} });

globalThis.PerpetualMiner = {};
require('../lib/vocabulario-da-mineracao.js');
assert.strictEqual(require('../e2e/leitura-do-vocabulario').leituraDoVocabulario('B', 1).cacheVersion, globalThis.PerpetualMiner.VocabularioDaMineracao.VERSAO);

console.log('ok');
