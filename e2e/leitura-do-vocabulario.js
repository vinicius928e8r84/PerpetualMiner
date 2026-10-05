'use strict';

// A última leitura do vocabulário como a Mineração automática a guarda em
// `pm_auto_keyword_vocab_en` / `_ru` (lib/vocabulario-da-mineracao.js), sem
// nenhuma palavra conhecida. `cacheVersion` é o formato de `VERSAO` lá: se ele
// mudar, os testes que semeiam por aqui precisam acompanhar.
//
// `extras` põe o que a Mineração automática grava a mais: `source` (o que a
// Conexão disse; 'collection.anki2' é o Anki fechado, lido do arquivo) e
// `dadosDe` (o momento dos dados, quando não é o da leitura).
function leituraDoVocabulario(deckName, createdAt, extras = {}) {
  return { cacheVersion: 2, deckName, createdAt, words: [], terms: [], wordInfo: {}, termInfo: {}, ...extras };
}

module.exports = { leituraDoVocabulario };
