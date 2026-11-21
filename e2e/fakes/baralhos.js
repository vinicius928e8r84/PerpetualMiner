'use strict';

const SITUACAO_DE_QUEM_TEM_TODOS = [['maduros', 'mature'], ['recentes', 'recent'], ['novos', 'new']];
const METRICAS = { targetMetric: 'anki_target_terms', phraseMetric: 'front_literal_words', usesAiCatalog: false };

const percentual = (parte, todo) => (todo ? Math.round((parte / todo) * 1000) / 10 : 0);

function situacaoDasContagens(contagens, cards) {
  const unica = SITUACAO_DE_QUEM_TEM_TODOS.find(([campo]) => contagens[campo] === cards);
  return unica ? unica[1] : 'mixed';
}

function linhaDoVocabulario(item) {
  if (typeof item === 'string') return { word: item, type: 'word', cards: 1, new: 0, recent: 0, mature: 1, status: 'mature' };
  const { word, type = 'word', maduros = 0, recentes = 0, novos = 0 } = item;
  const cards = maduros + recentes + novos;
  const status = item.status || situacaoDasContagens({ maduros, recentes, novos }, cards);
  return { word, type, cards, new: novos, recent: recentes, mature: maduros, status };
}

function filtroDoVocabulario(corpo) {
  return { status: corpo.status || 'all', tipo: corpo.type || 'all', busca: (corpo.q || '').toLowerCase() };
}

const daSituacao = (linha, status) => status === 'all' || linha.status === status;
const doTipo = (linha, tipo) => tipo === 'all' || linha.type === tipo;
const daBusca = (linha, busca) => !busca || linha.word.toLowerCase().includes(busca);
const passaNoFiltro = (linha, { status, tipo, busca }) => daSituacao(linha, status) && doTipo(linha, tipo) && daBusca(linha, busca);

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
      catalogedCards: catalogados, ...METRICAS,
    },
    termMetric: 'anki_target_terms', new: soma('new'), learning: soma('learning'), young: soma('young'), mature: soma('mature'),
    reviewed: revisados, maturePct: percentual(soma('mature'), revisados),
  };
}

function linhaDoBaralho(deckName, lang, baralho) {
  const { palavras = 0, cartoes = 0, termos = 0, porCartao = 0, novos = 0, aprendendo = 0, recentes = 0, maduros = 0 } = baralho;
  const reviewed = aprendendo + recentes + maduros;
  return {
    deckName, lang, frontField: 'Frente', notes: cartoes, cards: cartoes, uniqueTerms: termos, uniqueFronts: cartoes, uniqueTermTokens: palavras,
    vocabulary: {
      targetTerms: termos, phraseVocabulary: palavras, newPhraseVocabulary: palavras, avgNewPhraseVocabularyPerCard: porCartao,
      singleNewVocabularyCards: 0, zeroNewVocabularyCards: 0, catalogedCards: cartoes, ...METRICAS,
    },
    termMetric: 'anki_target_terms',
    new: novos, learning: aprendendo, young: recentes, mature: maduros, reviewed,
    maturePct: percentual(maduros, reviewed),
  };
}

function criarBaralhos({ estado, contrato, nomeDoExemploSemBaralho }) {
  function vocabulario(corpo) {
    const lang = corpo.lang === 'ru' ? 'ru' : 'en';
    const filtro = filtroDoVocabulario(corpo);
    const words = estado.vocabulario[lang].map(linhaDoVocabulario).filter(linha => passaNoFiltro(linha, filtro));
    return {
      generatedAt: estado.agora().toISOString(),
      deckName: corpo.deck || '',
      lang,
      source: 'colecao',
      totalCards: words.reduce((soma, w) => soma + w.cards, 0),
      filters: { status: filtro.status, type: filtro.tipo, q: filtro.busca, limit: corpo.limit || 1000, offset: corpo.offset || 0 },
      totalWords: words.length,
      words,
    };
  }

  function linhaDoBaralhoQueNaoExiste(deckName, lang) {
    const exemplo = contrato.exemplos.find(e => e.nome === nomeDoExemploSemBaralho);
    return { ...exemplo.resposta.json.decks.find(baralho => baralho.missing), deckName, lang };
  }

  function linhaDoBaralhoPedido({ deckName, lang = 'en' }) {
    const baralho = estado.baralhos[deckName];
    return baralho ? linhaDoBaralho(deckName, lang, baralho) : linhaDoBaralhoQueNaoExiste(deckName, lang);
  }

  function numerosDosBaralhos(corpo) {
    const decks = (corpo.decks || []).map(linhaDoBaralhoPedido);
    return { generatedAt: estado.agora().toISOString(), decks, totals: totaisDosBaralhos(decks), source: 'colecao' };
  }

  return { vocabulario, numerosDosBaralhos };
}

const CARTAO = { maduro: { tipo: 2, intervalo: 30 }, recente: { tipo: 2, intervalo: 5 }, novo: { tipo: 0, intervalo: 0 } };
const POR_SITUACAO = { mature: { maduros: 1 }, recent: { recentes: 1 }, new: { novos: 1 } };

const temContagens = palavra => ['maduros', 'recentes', 'novos'].some(campo => palavra[campo]);
const contagensDaPalavra = palavra => (temContagens(palavra) ? palavra : POR_SITUACAO[palavra.status] || { maduros: 1 });

const notasDoVocabulario = palavras => palavras.map(item => {
  const { word, ...resto } = typeof item === 'string' ? { word: item } : item;
  const { maduros = 0, recentes = 0, novos = 0 } = contagensDaPalavra(resto);
  const cartoes = [...Array(maduros).fill(CARTAO.maduro), ...Array(recentes).fill(CARTAO.recente), ...Array(novos).fill(CARTAO.novo)];
  return { frente: word, verso: '', cartoes };
});

function colecaoDoMundo({ doContrato, baralhosDoAnki, vocabularios }) {
  const baralhos = JSON.parse(JSON.stringify(doContrato?.baralhos || []));
  const baralho = nome => baralhos.find(b => b.nome === nome) || baralhos[baralhos.push({ nome }) - 1];
  for (const nome of baralhosDoAnki || []) baralho(nome);
  for (const [nome, palavras] of vocabularios) {
    const destino = baralho(nome);
    destino.notas = [...(destino.notas || []), ...notasDoVocabulario(palavras)];
  }
  return { ...doContrato, baralhos };
}

module.exports = { criarBaralhos, colecaoDoMundo };
