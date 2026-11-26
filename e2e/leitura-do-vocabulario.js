'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ARQUIVO = path.resolve(__dirname, '..', 'lib', 'vocabulario-da-mineracao.js');
const modulo = { PerpetualMiner: {} };
vm.runInNewContext(fs.readFileSync(ARQUIVO, 'utf8'), modulo);
const { VERSAO } = modulo.PerpetualMiner.VocabularioDaMineracao;

function leituraDoVocabulario(deckName, createdAt) {
  return { cacheVersion: VERSAO, deckName, createdAt, words: [], terms: [], wordInfo: {}, termInfo: {} };
}

module.exports = { leituraDoVocabulario };
