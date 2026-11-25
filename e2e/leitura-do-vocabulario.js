'use strict';

function leituraDoVocabulario(deckName, createdAt) {
  return { cacheVersion: 2, deckName, createdAt, words: [], terms: [], wordInfo: {}, termInfo: {} };
}

module.exports = { leituraDoVocabulario };
