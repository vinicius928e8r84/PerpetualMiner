'use strict';

function criarBaralhos({ estado, contrato, nomeDoExemploSemBaralho }) {
  function linhaDoVocabulario(item) {
    if (typeof item === 'string') return { word: item, type: 'word', cards: 1, new: 0, recent: 0, mature: 1, status: 'mature' };
    const { word, type = 'word', maduros = 0, recentes = 0, novos = 0 } = item;
    const cards = maduros + recentes + novos;
    const status = item.status
      || (maduros === cards ? 'mature' : recentes === cards ? 'recent' : novos === cards ? 'new' : 'mixed');
    return { word, type, cards, new: novos, recent: recentes, mature: maduros, status };
  }

  function vocabulario(corpo) {
    const lang = corpo.lang === 'ru' ? 'ru' : 'en';
    const status = corpo.status || 'all';
    const tipo = corpo.type || 'all';
    const busca = (corpo.q || '').toLowerCase();
    const words = estado.vocabulario[lang].map(linhaDoVocabulario)
      .filter(w => (status === 'all' || w.status === status) && (tipo === 'all' || w.type === tipo)
        && (!busca || w.word.toLowerCase().includes(busca)));
    return {
      generatedAt: estado.agora().toISOString(),
      deckName: corpo.deck || '',
      lang,
      source: 'colecao',
      totalCards: words.reduce((soma, w) => soma + w.cards, 0),
      filters: { status, type: tipo, q: busca, limit: corpo.limit || 1000, offset: corpo.offset || 0 },
      totalWords: words.length,
      words,
    };
  }

  function totaisDosBaralhos(linhas) {
    const soma = campo => linhas.reduce((total, linha) => total + (linha[campo] || 0), 0);
    const somaDoVocabulario = campo => linhas.reduce((total, linha) => total + (linha.vocabulary[campo] || 0), 0);
    const catalogados = somaDoVocabulario('catalogedCards');
    const novasPalavras = somaDoVocabulario('newPhraseVocabulary');
    const revisados = soma('learning') + soma('young') + soma('mature');
    return {
      decks: linhas.length, notes: soma('notes'), cards: soma('cards'), uniqueTerms: somaDoVocabulario('targetTerms'),
      uniqueFronts: soma('uniqueFronts'), uniqueTermTokens: somaDoVocabulario('phraseVocabulary'),
      vocabulary: {
        targetTerms: somaDoVocabulario('targetTerms'), phraseVocabulary: somaDoVocabulario('phraseVocabulary'),
        newPhraseVocabulary: novasPalavras, avgNewPhraseVocabularyPerCard: catalogados ? Math.round((novasPalavras / catalogados) * 100) / 100 : 0,
        singleNewVocabularyCards: somaDoVocabulario('singleNewVocabularyCards'), zeroNewVocabularyCards: somaDoVocabulario('zeroNewVocabularyCards'),
        catalogedCards: catalogados, targetMetric: 'anki_target_terms', phraseMetric: 'front_literal_words', usesAiCatalog: false,
      },
      termMetric: 'anki_target_terms', new: soma('new'), learning: soma('learning'), young: soma('young'), mature: soma('mature'),
      reviewed: revisados, maturePct: revisados ? Math.round((soma('mature') / revisados) * 1000) / 10 : 0,
    };
  }

  function linhaDoBaralhoQueNaoExiste(deckName, lang) {
    const exemplo = contrato.exemplos.find(e => e.nome === nomeDoExemploSemBaralho);
    return { ...exemplo.resposta.json.decks.find(baralho => baralho.missing), deckName, lang };
  }

  function numerosDosBaralhos(corpo) {
    const decks = (corpo.decks || []).map(({ deckName, lang = 'en' }) => {
      const baralho = estado.baralhos[deckName];
      if (!baralho) return linhaDoBaralhoQueNaoExiste(deckName, lang);
      const { palavras = 0, cartoes = 0, termos = 0, porCartao = 0, novos = 0, aprendendo = 0, recentes = 0, maduros = 0 } = baralho;
      const reviewed = aprendendo + recentes + maduros;
      return {
        deckName, lang, frontField: 'Frente', notes: cartoes, cards: cartoes, uniqueTerms: termos, uniqueFronts: cartoes, uniqueTermTokens: palavras,
        vocabulary: {
          targetTerms: termos, phraseVocabulary: palavras, newPhraseVocabulary: palavras, avgNewPhraseVocabularyPerCard: porCartao,
          singleNewVocabularyCards: 0, zeroNewVocabularyCards: 0, catalogedCards: cartoes,
          targetMetric: 'anki_target_terms', phraseMetric: 'front_literal_words', usesAiCatalog: false,
        },
        termMetric: 'anki_target_terms',
        new: novos, learning: aprendendo, young: recentes, mature: maduros, reviewed,
        maturePct: reviewed ? Math.round((maduros / reviewed) * 1000) / 10 : 0,
      };
    });
    return { generatedAt: estado.agora().toISOString(), decks, totals: totaisDosBaralhos(decks), source: 'colecao' };
  }

  return { vocabulario, numerosDosBaralhos };
}

const CARTAO = { maduro: { tipo: 2, intervalo: 30 }, recente: { tipo: 2, intervalo: 5 }, novo: { tipo: 0, intervalo: 0 } };
const POR_SITUACAO = { mature: { maduros: 1 }, recent: { recentes: 1 }, new: { novos: 1 } };

const notasDoVocabulario = palavras => palavras.map(item => {
  const { word, ...resto } = typeof item === 'string' ? { word: item } : item;
  const { maduros = 0, recentes = 0, novos = 0 } = resto.maduros || resto.recentes || resto.novos ? resto : POR_SITUACAO[resto.status] || { maduros: 1 };
  const cartoes = [...Array(maduros).fill(CARTAO.maduro), ...Array(recentes).fill(CARTAO.recente), ...Array(novos).fill(CARTAO.novo)];
  return { frente: word, verso: '', cartoes };
});

const colecaoDoVocabulario = baralhos => ({ baralhos: baralhos.map(([nome, palavras]) => ({ nome, notas: notasDoVocabulario(palavras) })) });

module.exports = { criarBaralhos, colecaoDoVocabulario };
