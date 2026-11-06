'use strict';

// O que o fake da Conexão responde de Baralhos e de vocabulário (`POST /anki/vocabulary` e `/anki/stats/decks`), a partir do que o teste pôs em `estado`
// (`definirBaralho`, `definirVocabulario`). As formas são as de `complemento/normalizacao.py`; `anki.js` monta este módulo com o seu `estado`.

function criarBaralhos({ estado, contrato, nomeDoExemploSemBaralho }) {
  /** Uma linha do vocabulário como `front_vocabulary_rows_from_cards` (card_normalization.py). */
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
      // Uma Conexão que lê o arquivo do Anki fechado diz `collection.anki2`.
      source: estado.lidoDoArquivo ? 'collection.anki2' : 'colecao',
      ...(estado.lidoDoArquivo && { sourceDetail: 'AnkiConnect indisponivel; lendo collection.anki2' }),
      totalCards: words.reduce((soma, w) => soma + w.cards, 0),
      filters: { status, type: tipo, q: busca, limit: corpo.limit || 1000, offset: corpo.offset || 0 },
      totalWords: words.length,
      words,
    };
  }

  /** Os totais de uma leitura de Baralhos, como `deck_stats_totals` (complemento/normalizacao.py). */
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

  /** A linha de um Baralho que o Anki não tem: a que o contrato dá (`missing`, tudo zerado). */
  function linhaDoBaralhoQueNaoExiste(deckName, lang) {
    const exemplo = contrato.exemplos.find(e => e.nome === nomeDoExemploSemBaralho);
    return { ...exemplo.resposta.json.decks.find(baralho => baralho.missing), deckName, lang };
  }

  /** Os baralhos pedidos (`decks`, na ordem), como `numeros_dos_baralhos` do complemento. */
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
    const dados = { generatedAt: estado.agora().toISOString(), decks, totals: totaisDosBaralhos(decks), source: estado.fonteDosBaralhos };
    if (estado.fonteDosBaralhos === 'collection.anki2') dados.sourceDetail = 'AnkiConnect indisponivel; lendo collection.anki2';
    return dados;
  }

  return { vocabulario, numerosDosBaralhos };
}

module.exports = { criarBaralhos };
