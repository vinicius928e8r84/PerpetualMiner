'use strict';

// A última leitura do vocabulário como a Mineração automática a guarda em
// `pm_auto_keyword_vocab_en` / `_ru` (lib/vocabulario-da-mineracao.js), sem
// nenhuma palavra conhecida. `cacheVersion` é o formato de `VERSAO` lá: se ele
// mudar, os testes que semeiam por aqui precisam acompanhar.
function leituraDoVocabulario(deckName, createdAt) {
  return { cacheVersion: 2, deckName, createdAt, words: [], terms: [], wordInfo: {}, termInfo: {} };
}

module.exports = { leituraDoVocabulario };
