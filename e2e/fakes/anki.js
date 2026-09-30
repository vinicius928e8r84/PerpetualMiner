'use strict';

const { responderJson } = require('./http');

// Fake da Conexão com o Anki: responde na porta local dela (127.0.0.1:8766).
// Por padrão está ligada, com vocabulário vazio. Um teste pode desligá-la
// (conexão recusada, como quando o programa não está rodando) ou responder
// uma rota específica com `responder`.
//
// Baralhos e termos (`GET /anki/stats/decks`) e Vocabulário (`GET /anki/vocabulary`)
// seguem `bridge/server.py`: os baralhos pedidos voltam na ordem pedida, um
// baralho que não existe no Anki volta `missing`, e o vocabulário do baralho vem
// inteiro, com os filtros (`status`, `type`, `q`) aplicados como lá.
//
// Ajustes de envio (`GET /anki/decks`) lista os nomes dos baralhos que o Anki tem
// (`{ decks: [...] }`); sem `definirBaralhosDoAnki` a lista não vem (503), como
// com o Anki sem responder, e a aba oferece o campo de texto.
//
// Os Envios seguem o contrato de `bridge/server.py`: `POST /jobs` cria um
// (`{ jobId }`, 201), `GET /jobs` lista cada um com o `state` dele, e
// `POST /jobs/<id>/retry` o põe na fila de novo. O teste move cada Envio
// (`moverEnvio`) e o termina (`concluirEnvio`) como a Conexão faria:
// `successfulPhraseIds` inclui as duplicadas, que também vão em
// `duplicatePhraseIds`, e o que não virou cartão vai em `failedPhraseIds`.

function criarFakeAnki() {
  const estado = {
    ligada: true,
    vocabulario: { en: [], ru: [] },
    rotas: new Map(),   // 'GET /caminho' → (req, url) => ({ status, json })
    recusas: new Map(), // lang → { status } | { rede: true }, para o próximo POST /jobs
    agora: () => new Date(),
    custos: [],         // as linhas de GET /analytics/jobs (o contrato de bridge/analytics.py)
    falhaDosCustos: null, // { status } | { rede: true }: GET /analytics/jobs falha
    baralhos: {},       // deckName → os números do baralho (definirBaralho)
    fonteDosBaralhos: 'ankiconnect', // 'collection.anki2': lidos do arquivo local (BRG-13)
    falhaDosBaralhos: null,     // { status } | { rede: true }: GET /anki/stats/decks falha
    falhaDoVocabulario: null,   // { status } | { rede: true }: GET /anki/vocabulary falha
    baralhosDoAnki: null,       // os nomes de GET /anki/decks; null: a lista não vem (definirBaralhosDoAnki)
  };
  const requisicoes = [];
  const envios = [];    // { jobId, lang, entries, deckName, state }

  function novoEstado(extra = {}) {
    return {
      status: 'queued',
      stage: 'queued',
      progress: {},
      successfulPhraseIds: [],
      failedPhraseIds: [],
      duplicatePhraseIds: [],
      lastError: null,
      updatedAt: estado.agora().toISOString(),
      ...extra,
    };
  }

  function acharEnvio(jobId) {
    const envio = envios.find(e => e.jobId === jobId);
    if (!envio) throw new Error(`O fake da Conexão não tem o envio ${jobId}`);
    return envio;
  }

  function criarEnvio(req) {
    const corpo = JSON.parse(req.postData() || '{}');
    const recusa = estado.recusas.get(corpo.lang);
    if (recusa?.rede) return { abortar: true };
    if (recusa) return { status: recusa.status, json: { error: recusa.erro || 'job_failed' } };
    const jobId = `job-${corpo.lang}-${envios.length + 1}`;
    envios.push({ jobId, lang: corpo.lang, entries: corpo.entries || [], corpo, state: novoEstado() });
    return { status: 201, json: { jobId, status: 'queued' } };
  }

  function listarEnvios() {
    return {
      jobs: envios.map(e => ({
        jobId: e.jobId,
        lang: e.lang,
        status: e.state.status,
        updatedAt: e.state.updatedAt,
        state: e.state,
      })),
    };
  }

  /** As linhas de Custos do período e do idioma pedidos, como `JobAnalytics.jobs`. */
  function linhasDosCustos(url) {
    const lang = url.searchParams.get('lang') || 'all';
    const de = url.searchParams.get('from');
    const ate = url.searchParams.get('to');
    return estado.custos.filter(linha => {
      const dia = String(linha.createdAt).slice(0, 10);
      return (lang === 'all' || linha.lang === lang) && (!de || dia >= de) && (!ate || dia <= ate);
    });
  }

  /** Uma linha do vocabulário como `front_vocabulary_rows_from_cards` (card_normalization.py). */
  function linhaDoVocabulario(item) {
    if (typeof item === 'string') return { word: item, type: 'word', cards: 1, new: 0, recent: 0, mature: 1, status: 'mature' };
    const { word, type = 'word', maduros = 0, recentes = 0, novos = 0 } = item;
    const cards = maduros + recentes + novos;
    const status = item.status
      || (maduros === cards ? 'mature' : recentes === cards ? 'recent' : novos === cards ? 'new' : 'mixed');
    return { word, type, cards, new: novos, recent: recentes, mature: maduros, status };
  }

  function vocabulario(url) {
    const lang = url.searchParams.get('lang') === 'ru' ? 'ru' : 'en';
    const status = url.searchParams.get('status') || 'all';
    const tipo = url.searchParams.get('type') || 'all';
    const busca = (url.searchParams.get('q') || '').toLowerCase();
    const words = estado.vocabulario[lang].map(linhaDoVocabulario)
      .filter(w => (status === 'all' || w.status === status) && (tipo === 'all' || w.type === tipo)
        && (!busca || w.word.toLowerCase().includes(busca)));
    return {
      generatedAt: estado.agora().toISOString(),
      deckName: url.searchParams.get('deck') || '',
      lang,
      source: 'ankiconnect',
      totalCards: words.reduce((soma, w) => soma + w.cards, 0),
      totalWords: words.length,
      words,
    };
  }

  /** Os baralhos pedidos (`deck` e `lang` repetidos, na ordem), como `_anki_deck_stats`. */
  function numerosDosBaralhos(url) {
    const nomes = url.searchParams.getAll('deck');
    const langs = url.searchParams.getAll('lang');
    const decks = nomes.map((deckName, i) => {
      const lang = langs[i] || 'en';
      const baralho = estado.baralhos[deckName];
      if (!baralho) return { deckName, lang, missing: true, notes: 0, cards: 0, uniqueTerms: 0, new: 0, learning: 0, young: 0, mature: 0, reviewed: 0, maturePct: 0, vocabulary: { targetTerms: 0, phraseVocabulary: 0, avgNewPhraseVocabularyPerCard: 0 } };
      const { palavras = 0, cartoes = 0, termos = 0, porCartao = 0, novos = 0, aprendendo = 0, recentes = 0, maduros = 0 } = baralho;
      const reviewed = aprendendo + recentes + maduros;
      return {
        deckName, lang, notes: cartoes, cards: cartoes, uniqueTerms: termos, uniqueTermTokens: palavras,
        vocabulary: { targetTerms: termos, phraseVocabulary: palavras, avgNewPhraseVocabularyPerCard: porCartao },
        new: novos, learning: aprendendo, young: recentes, mature: maduros, reviewed,
        maturePct: reviewed ? Math.round((maduros / reviewed) * 1000) / 10 : 0,
      };
    });
    const dados = { generatedAt: estado.agora().toISOString(), decks, totals: {}, source: estado.fonteDosBaralhos };
    if (estado.fonteDosBaralhos === 'collection.anki2') dados.sourceDetail = 'AnkiConnect indisponivel; lendo collection.anki2';
    return dados;
  }

  function retomarEnvio(jobId) {
    const linha = estado.custos.find(l => l.jobId === jobId);
    if (linha) {
      linha.status = 'queued';
      linha.stage = 'queued';
      return { status: 200, json: { jobId, status: 'queued' } };
    }
    const envio = envios.find(e => e.jobId === jobId);
    if (!envio) return { status: 404, json: { error: 'job_not_found' } };
    envio.state = { ...envio.state, status: 'queued', stage: 'queued', lastError: null, ankiError: null, updatedAt: estado.agora().toISOString() };
    return { status: 200, json: { jobId, status: 'queued' } };
  }

  async function tratar(route) {
    const req = route.request();
    const url = new URL(req.url());
    requisicoes.push({ metodo: req.method(), caminho: url.pathname, busca: url.search, corpo: req.postData() });

    if (!estado.ligada) return route.abort('connectionrefused');

    const personalizada = estado.rotas.get(`${req.method()} ${url.pathname}`);
    if (personalizada) {
      const { status = 200, json = {} } = await personalizada(req, url);
      return responderJson(route, status, json);
    }
    if (url.pathname === '/health') return responderJson(route, 200, { ok: true });
    if (url.pathname === '/anki/vocabulary') {
      const falha = estado.falhaDoVocabulario;
      if (falha?.rede) return route.abort('connectionrefused');
      if (falha) return responderJson(route, falha.status, { error: 'anki_vocabulary_unavailable', detail: 'AnkiConnect timeout' });
      return responderJson(route, 200, vocabulario(url));
    }
    if (url.pathname === '/anki/decks') {
      if (!estado.baralhosDoAnki) return responderJson(route, 503, { error: 'anki_decks_unavailable', detail: 'AnkiConnect timeout' });
      return responderJson(route, 200, { decks: estado.baralhosDoAnki });
    }
    if (url.pathname === '/anki/stats/decks') {
      const falha = estado.falhaDosBaralhos;
      if (falha?.rede) return route.abort('connectionrefused');
      if (falha) return responderJson(route, falha.status, { error: 'anki_stats_unavailable', detail: 'AnkiConnect timeout' });
      return responderJson(route, 200, numerosDosBaralhos(url));
    }
    if (url.pathname === '/anki/repair' && req.method() === 'POST') {
      return responderJson(route, 200, { ok: true, after: { collectionReady: true, connectAvailable: true } });
    }
    if (url.pathname === '/analytics/jobs') {
      const falha = estado.falhaDosCustos;
      if (falha?.rede) return route.abort('connectionrefused');
      if (falha) return responderJson(route, falha.status, { error: 'analytics_unavailable' });
      return responderJson(route, 200, { jobs: linhasDosCustos(url) });
    }
    const diagnostico = url.pathname.match(/^\/jobs\/([^/]+)\/debug-bundle$/);
    if (diagnostico) {
      const jobId = decodeURIComponent(diagnostico[1]);
      if (!estado.custos.some(l => l.jobId === jobId)) return responderJson(route, 404, { error: 'job_not_found' });
      return responderJson(route, 200, { jobId, state: { status: 'failed' }, bridgeLogTail: ['linha do log'] });
    }
    if (url.pathname === '/jobs' && req.method() === 'POST') {
      const resposta = criarEnvio(req);
      if (resposta.abortar) return route.abort('connectionrefused');
      return responderJson(route, resposta.status, resposta.json);
    }
    if (url.pathname === '/jobs' && req.method() === 'GET') return responderJson(route, 200, listarEnvios());
    const retomada = url.pathname.match(/^\/jobs\/([^/]+)\/retry$/);
    if (retomada && req.method() === 'POST') {
      const { status, json } = retomarEnvio(decodeURIComponent(retomada[1]));
      return responderJson(route, status, json);
    }
    return responderJson(route, 404, { error: 'not_found' });
  }

  return {
    padrao: /^http:\/\/(127\.0\.0\.1|localhost):8766\//,
    tratar,
    requisicoes,
    envios,
    desligar() { estado.ligada = false; },
    ligar() { estado.ligada = true; },
    /**
     * O vocabulário do baralho de um idioma: cada item é uma string (uma palavra
     * madura num cartão) ou `{ word, type: 'word'|'term', maduros, recentes, novos }`
     * (os cartões em que o item aparece, por maturidade).
     */
    definirVocabulario(lang, palavras) { estado.vocabulario[lang] = palavras; },
    /** GET /anki/vocabulary falha: `{ status: 503 }` responde com erro, `{ rede: true }` derruba. */
    falharVocabulario(falha = { status: 503 }) { estado.falhaDoVocabulario = falha; },
    voltarVocabulario() { estado.falhaDoVocabulario = null; },

    /**
     * Os números de um baralho do Anki, em termos de gente; um baralho pedido
     * que não foi definido não existe no Anki (`missing`).
     */
    definirBaralho(deckName, numeros) { estado.baralhos[deckName] = numeros; },
    /** Os baralhos que o Anki tem, como GET /anki/decks os lista (Ajustes de envio). */
    definirBaralhosDoAnki(nomes) { estado.baralhosDoAnki = nomes; },
    /** Os baralhos passam a vir do arquivo local do Anki (BRG-13), e não do AnkiConnect. */
    lerBaralhosDoArquivo() { estado.fonteDosBaralhos = 'collection.anki2'; },
    /** GET /anki/stats/decks falha: `{ status: 503 }` responde com erro, `{ rede: true }` derruba. */
    falharBaralhos(falha = { status: 503 }) { estado.falhaDosBaralhos = falha; },
    voltarBaralhos() { estado.falhaDosBaralhos = null; },
    responder(metodo, caminho, gerar) { estado.rotas.set(`${metodo} ${caminho}`, gerar); },
    pararDeResponder(metodo, caminho) { estado.rotas.delete(`${metodo} ${caminho}`); },

    /**
     * Os Envios que a aba Custos lê (GET /analytics/jobs), em termos de gente;
     * o fake os entrega no formato do bridge, com o total somado como lá
     * (`totalUsd` inclui o `otherUsd`).
     */
    definirCustos(lista) {
      estado.custos = lista.map(linhaDeCustos);
    },
    /** GET /analytics/jobs falha: `{ status: 503 }` responde com erro, `{ rede: true }` derruba. */
    falharCustos(falha = { status: 503 }) { estado.falhaDosCustos = falha; },
    voltarCustos() { estado.falhaDosCustos = null; },

    /** O relógio da Conexão, para o `updatedAt` (o painel diz “atualizado há …”). */
    usarRelogio(agora) { estado.agora = agora; },

    /**
     * O próximo `POST /jobs` desse idioma falha: `{ status: 500 }` responde com
     * erro, `{ rede: true }` derruba a conexão. Vale até `aceitarEnvios(lang)`.
     */
    recusarEnvios(lang, recusa = { status: 500 }) { estado.recusas.set(lang, recusa); },
    aceitarEnvios(lang) { estado.recusas.delete(lang); },

    /** Os Envios criados de um idioma, na ordem. */
    enviosEm(lang) { return envios.filter(e => e.lang === lang); },

    /** Põe o Envio numa etapa do bridge (`generate_cards`, `send_to_anki`…). */
    moverEnvio(jobId, { stage, progress = {}, atualizadoEm } = {}) {
      const envio = acharEnvio(jobId);
      envio.state = {
        ...envio.state,
        status: 'running',
        stage,
        progress,
        updatedAt: (atualizadoEm || estado.agora()).toISOString(),
      };
    },

    /**
     * Termina o Envio. Todas as frases dele viram cartão, menos as `falhas`;
     * as `duplicadas` já estavam no Anki. `erro` termina sem nenhuma (o job
     * quebrou antes de enviar); `ankiError` é o código que a Conexão junta a ele
     * (`repair_access_denied`: o Windows não deixou fechar o Anki travado).
     */
    concluirEnvio(jobId, { duplicadas = [], falhas = [], erro, ankiError = null } = {}) {
      const envio = acharEnvio(jobId);
      const pedidas = envio.entries.map(e => Number(e.phraseId));
      const anteriores = envio.state.successfulPhraseIds;
      const sucesso = erro ? anteriores : [...new Set([...anteriores, ...pedidas.filter(id => !falhas.includes(id))])];
      const falhou = erro ? pedidas.filter(id => !sucesso.includes(id)) : falhas;
      const status = falhou.length === 0 ? 'completed' : (sucesso.length ? 'partial' : 'failed');
      envio.state = {
        ...envio.state,
        status,
        stage: status,
        successfulPhraseIds: sucesso,
        failedPhraseIds: falhou,
        duplicatePhraseIds: [...new Set([...envio.state.duplicatePhraseIds, ...duplicadas])],
        lastError: status === 'completed' ? null : (erro || 'Falha ao enviar um ou mais cards ao Anki'),
        ankiError,
        updatedAt: estado.agora().toISOString(),
      };
    },
  };
}

/** Um Envio da aba Custos no formato de `JobAnalytics.jobs` (bridge/analytics.py). */
function linhaDeCustos({
  jobId, lang = 'en', createdAt, status = 'completed', stage, pedidas = 1, enviadas, lastError = null,
  custos = {}, imagens = {}, economia = 0, baralho = '',
}) {
  const costs = {
    cardUsd: custos.cartoes || 0,
    imageJudgeUsd: custos.escolha || 0,
    imageGuardUsd: custos.triagem || 0,
    imageGenerationUsd: custos.geradas || 0,
    otherUsd: custos.outros || 0,
  };
  costs.totalUsd = Object.values(costs).reduce((a, b) => a + b, 0);
  const images = {
    real: imagens.real || 0,
    generated: imagens.geradas || 0,
    skipped: imagens.sem || 0,
    failed: imagens.falhas || 0,
    savingsUsd: economia,
  };
  images.total = images.real + images.generated + images.skipped + images.failed;
  const successfulCards = enviadas ?? (status === 'completed' ? pedidas : 0);
  return {
    jobId,
    createdAt,
    updatedAt: createdAt,
    lang,
    deckName: baralho,
    imageSource: 'real',
    status,
    stage: stage || status,
    requestedCards: pedidas,
    successfulCards,
    failedCards: ['failed', 'partial'].includes(status) ? pedidas - successfulCards : 0,
    lastError,
    costs,
    images,
    matchedRecords: 1,
  };
}

module.exports = { criarFakeAnki };
