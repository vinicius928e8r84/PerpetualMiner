'use strict';

const { isDeepStrictEqual } = require('util');
const { responderJson } = require('./http');
const contrato = require('../../complemento/contrato/exemplos.json');

// Fake da Conexão com o Anki: responde na porta local dela (127.0.0.1:8766).
// Por padrão está ligada, com vocabulário vazio. Um teste pode desligá-la
// (conexão recusada, como quando o programa não está rodando) ou responder
// uma rota específica com `responder`.
//
// Baralhos e termos (`POST /anki/stats/decks`) e Vocabulário (`POST /anki/vocabulary`)
// seguem o contrato do complemento: os baralhos pedidos voltam na ordem pedida, um
// baralho que não existe no Anki volta `missing`, e o vocabulário do baralho vem
// inteiro, com os filtros (`status`, `type`, `q`) aplicados como lá.
//
// Ajustes de envio (`POST /anki/decks`) lista os nomes dos baralhos que o Anki tem
// (`{ decks: [...] }`); sem `definirBaralhosDoAnki` a lista não vem (503), como
// com o Anki sem responder, e a aba oferece o campo de texto.
//
// O que o complemento do Anki responde (a saúde, os Baralhos, os números, o vocabulário, a chave da OpenAI e o item de login de “Abrir o Anki com o computador”) vem de
// `complemento/contrato/exemplos.json`, o mesmo arquivo que os testes do
// complemento leem: o fake responde o exemplo do pedido no contexto em que a
// Conexão está (`abrirPerfil`, `abrirColecao`, `responderOpenAI`, `guardarChaveNaConexao`, `definirItemDeLogin`). Os testes de tela montam os Baralhos
// em termos de gente (`definirVocabulario`, `definirBaralho`) e o fake os entrega no
// formato do contrato; `abrirColecao(nome)` passa a responder o contrato inteiro, para quem confere o
// fake contra ele. Uma rota nova do complemento entra nesse arquivo
// (veja `complemento/contrato/LEIA-ME.md`) e o fake passa a respondê-la daqui.
//
// A chave da OpenAI: `POST /ia/openai/chave` responde pelo exemplo do contexto em que a
// OpenAI está (`responderOpenAI('aceita' | 'recusa' | …`) e, aceita, o fake guarda a cópia
// como a Conexão faria: `chaveNaConexao()` é o que o teste confere, e `POST /ia/estado`
// devolve só os 4 últimos caracteres dela. A chave inteira nunca sai numa resposta.
//
// Os Envios seguem o contrato de `bridge/server.py`: `POST /jobs` cria um
// (`{ jobId }`, 201), `GET /jobs` lista cada um com o `state` dele, e
// `POST /jobs/<id>/retry` o põe na fila de novo. O teste move cada Envio
// (`moverEnvio`) e o termina (`concluirEnvio`) como a Conexão faria:
// `successfulPhraseIds` inclui as duplicadas, que também vão em
// `duplicatePhraseIds`, e o que não virou cartão vai em `failedPhraseIds`.

// O exemplo do contrato de onde o fake tira a linha de um Baralho que o Anki não tem.
const EXEMPLO_DO_BARALHO_QUE_NAO_EXISTE = 'Números de um Baralho que existe e de um que não existe';

/**
 * O exemplo é um pedido que a extensão faz de verdade (`daExtensao`): o GET de uma página dela
 * vai sem `Origin` e só a saúde o aceita; o POST leva a origem dela. Os outros exemplos (outro
 * site, outra extensão, uma rota sem origem) só o lado do complemento confere.
 */
function exemploDaExtensao(exemplo) {
  return exemplo.daExtensao === true;
}

function dadosDoCorpo(corpo) {
  try {
    return corpo ? JSON.parse(corpo) : null;
  } catch {
    return null;
  }
}

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
    fonteDosBaralhos: 'colecao',        // 'collection.anki2': lidos do arquivo local (BRG-13)
    lidoDoArquivo: false,       // a Conexão responde lendo o arquivo do Anki: baralhos e vocabulário vêm de `collection.anki2`
    processosDoAnki: 1,         // GET /anki/status: quantos processos do Anki a Conexão vê (0: o Anki está fechado)
    falhaDosBaralhos: null,     // { status } | { rede: true }: POST /anki/stats/decks falha
    falhaDoVocabulario: null,   // { status } | { rede: true }: POST /anki/vocabulary falha
    baralhosDoAnki: null,       // os nomes de POST /anki/decks; null: a lista não vem (definirBaralhosDoAnki)
    contexto: { perfil: 'Usuário 1', falhaNoPerfil: false, openai: 'aceita', itemDeLogin: 'desligado' }, // em que situação o complemento está (os `contexto` dos exemplos); `colecao` só existe depois de `abrirColecao`
    chaveDaOpenAI: null,        // a cópia da chave que a Conexão guarda (a inteira: só o teste a vê)
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
      // Com o Anki fechado a Conexão responde lendo o arquivo (`_local_vocabulary`, bridge/server.py).
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
    const exemplo = contrato.exemplos.find(e => e.nome === EXEMPLO_DO_BARALHO_QUE_NAO_EXISTE);
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

  const ultimos4 = chave => (chave ? chave.slice(-4) : null);

  /** `"<agora>"` no contrato é o instante em que a Conexão responde: o relógio do fake. */
  function comOAgora(valor) {
    if (valor === '<agora>') return estado.agora().toISOString();
    if (Array.isArray(valor)) return valor.map(comOAgora);
    if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, comOAgora(item)]));
    return valor;
  }

  /** O contexto de agora como os exemplos o descrevem: a chave guardada aparece só pelos 4 últimos. */
  function contextoDeAgora() {
    return { ...estado.contexto, chaveNaConexao: ultimos4(estado.chaveDaOpenAI) };
  }

  /**
   * `perfil` (com `falhaNoPerfil`: um exemplo que não o diz é o da saúde sem falha), `itemDeLogin`, `colecao`, `openai` e
   * `chaveNaConexao` só contam nos exemplos que os dizem: a saúde responde igual com qualquer coleção, chave ou item, e o item
   * responde com o Anki em qualquer perfil.
   * Da chave só conta ter ou não ter: os 4 últimos caracteres do exemplo são os da chave do exemplo, e a resposta leva os da guardada.
   */
  function exemploServe(exemplo, contexto) {
    const doExemplo = exemplo.contexto;
    return (doExemplo.perfil === undefined
        || (doExemplo.perfil === contexto.perfil && Boolean(doExemplo.falhaNoPerfil) === Boolean(contexto.falhaNoPerfil)))
      && (doExemplo.itemDeLogin === undefined || doExemplo.itemDeLogin === contexto.itemDeLogin)
      && (!('colecao' in doExemplo) || doExemplo.colecao === contexto.colecao)
      && (!('openai' in doExemplo) || doExemplo.openai === contexto.openai)
      && (!('chaveNaConexao' in doExemplo) || (doExemplo.chaveNaConexao === null) === (contexto.chaveNaConexao === null));
  }

  /**
   * A resposta que o contrato dá ao pedido da extensão, no contexto de agora. O exemplo que cita `corpo` só
   * vale para esse corpo, salvo na chave da OpenAI, onde o exemplo do contexto vale para qualquer chave
   * (a resposta leva os 4 últimos da que o teste mandou); o que cita `colecao` só vale com essa coleção aberta (`abrirColecao`).
   */
  function respostaDoContrato(metodo, caminho, corpo) {
    const contexto = contextoDeAgora();
    const candidatos = contrato.exemplos.filter(e =>
      exemploDaExtensao(e) && e.pedido.metodo === metodo && e.pedido.caminho === caminho && exemploServe(e, contexto));
    const exato = candidatos.find(e => e.pedido.corpo === undefined || isDeepStrictEqual(e.pedido.corpo, corpo));
    const exemplo = exato || (caminho === '/ia/openai/chave' ? candidatos[0] : undefined);
    if (!exemplo) {
      throw new Error(`O contrato (complemento/contrato/exemplos.json) não tem exemplo de ${metodo} ${caminho}`
        + `${corpo === undefined ? '' : ` com o corpo ${JSON.stringify(corpo)}`} `
        + `com o contexto ${JSON.stringify(contexto)}; escreva-o lá antes de o fake responder.`);
    }
    const json = comOAgora(exemplo.resposta.json);
    // Os exemplos dizem os 4 últimos da chave deles; a resposta leva os da chave que o teste mandou ou que a Conexão guarda.
    if (json.ultimos4 && typeof corpo?.chave === 'string') json.ultimos4 = ultimos4(corpo.chave.trim());
    if (json.openai?.ultimos4) json.openai.ultimos4 = contexto.chaveNaConexao;
    return { status: exemplo.resposta.status, json };
  }

  /** `POST /ia/openai/chave`: a resposta do contrato e, aceita a chave, a cópia que a Conexão passa a ter. */
  function guardarChave(req) {
    let corpo = null;
    try { corpo = JSON.parse(req.postData() || 'null'); } catch { /* o contrato diz o que responder */ }
    const resposta = respostaDoContrato('POST', '/ia/openai/chave', corpo);
    if (resposta.status === 200) estado.chaveDaOpenAI = corpo.chave.trim();
    return resposta;
  }

  /** “Abrir o Anki com o computador”: o item de login, como a Conexão o escreve e o apaga. */
  function itemDeLogin(req, url) {
    const corpo = req.postData() ? JSON.parse(req.postData()) : undefined;
    const resposta = respostaDoContrato(req.method(), url.pathname, corpo);
    if (url.pathname === '/abrir-com-o-computador' && resposta.status === 200) {
      estado.contexto = { ...estado.contexto, itemDeLogin: resposta.json.ligado ? 'ligado' : 'desligado' };
    }
    return resposta;
  }

  async function tratar(route) {
    const req = route.request();
    const url = new URL(req.url());
    const corpoDoPedido = req.postData();
    // `dados`: o corpo JSON que a extensão mandou (null sem corpo ou se não é JSON).
    requisicoes.push({ metodo: req.method(), caminho: url.pathname, busca: url.search, corpo: corpoDoPedido, dados: dadosDoCorpo(corpoDoPedido) });

    if (!estado.ligada) return route.abort('connectionrefused');
    // A porta aceita e não responde: o pedido fica no ar até a página desistir.
    if (estado.muda) return new Promise(() => {});

    const personalizada = estado.rotas.get(`${req.method()} ${url.pathname}`);
    if (personalizada) {
      const { status = 200, json = {} } = await personalizada(req, url);
      return responderJson(route, status, json);
    }
    if (url.pathname === '/health') {
      const { status, json } = respostaDoContrato(req.method(), '/health');
      return responderJson(route, status, json);
    }
    if (url.pathname === '/ia/openai/chave' && req.method() === 'POST') {
      const { status, json } = guardarChave(req);
      return responderJson(route, status, json);
    }
    if (url.pathname === '/ia/estado' && req.method() === 'POST') {
      const { status, json } = respostaDoContrato('POST', '/ia/estado', {});
      return responderJson(route, status, json);
    }
    if (req.method() === 'POST' && (url.pathname === '/abrir-com-o-computador' || url.pathname === '/abrir-com-o-computador/estado')) {
      const perda = estado.perdaDaRespostaDoItem;
      if (perda && url.pathname === '/abrir-com-o-computador') {
        estado.perdaDaRespostaDoItem = null;
        if (perda.aplicada) itemDeLogin(req, url);
        return route.abort('connectionreset');
      }
      const { status, json } = itemDeLogin(req, url);
      return responderJson(route, status, json);
    }
    // O que lê o Anki da pessoa é POST (contrato/LEIA-ME.md): por GET a Conexão não tem a rota.
    const leituraDoAnki = ['/anki/vocabulary', '/anki/decks', '/anki/stats/decks'].includes(url.pathname);
    if (leituraDoAnki && req.method() !== 'POST') return responderJson(route, 404, { error: 'not_found' });
    const corpo = leituraDoAnki ? JSON.parse(req.postData() || '{}') : undefined;
    if (leituraDoAnki && estado.contexto.colecao !== undefined) {
      const { status, json } = respostaDoContrato('POST', url.pathname, corpo);
      return responderJson(route, status, json);
    }
    if (url.pathname === '/anki/status') {
      const processos = Array.from({ length: estado.processosDoAnki }, (_, i) => ({ pid: 4000 + i, visibleWindow: true }));
      return responderJson(route, 200, {
        generatedAt: estado.agora().toISOString(), connectAvailable: !estado.lidoDoArquivo, collectionReady: true,
        processes: processos, processCount: processos.length, visibleWindow: processos.length > 0, healthy: true,
      });
    }
    if (url.pathname === '/anki/vocabulary') {
      const falha = estado.falhaDoVocabulario;
      if (falha?.rede) return route.abort('connectionrefused');
      if (falha) return responderJson(route, falha.status, { error: 'anki_vocabulary_unavailable', detail: 'AnkiConnect timeout' });
      return responderJson(route, 200, vocabulario(corpo));
    }
    if (url.pathname === '/anki/decks') {
      if (!estado.baralhosDoAnki) return responderJson(route, 503, { error: 'anki_decks_unavailable', detail: 'AnkiConnect timeout' });
      return responderJson(route, 200, { decks: estado.baralhosDoAnki });
    }
    if (url.pathname === '/anki/stats/decks') {
      const falha = estado.falhaDosBaralhos;
      if (falha?.rede) return route.abort('connectionrefused');
      if (falha) return responderJson(route, falha.status, { error: 'anki_stats_unavailable', detail: 'AnkiConnect timeout' });
      return responderJson(route, 200, numerosDosBaralhos(corpo));
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
    /** O perfil que o Anki tem aberto (`null`: a tela de perfis); precisa de exemplo no contrato. */
    abrirPerfil(perfil) { estado.contexto = { ...estado.contexto, perfil }; },
    /**
     * A coleção que o Anki tem aberta, por nome em `colecoes` do contrato (`null`: nenhuma, o Anki na tela de
     * perfis): os Baralhos, os números e o vocabulário passam a vir dos exemplos do contrato.
     */
    abrirColecao(nome) { estado.contexto = { ...estado.contexto, colecao: nome }; },
    /** O complemento não consegue ler o perfil: a saúde responde o erro interno do contrato. */
    /**
     * O item de login de “Abrir o Anki com o computador” (`itemDeLogin` dos exemplos): `desligado` (o padrão), `ligado`,
     * `sem_anki` (a Conexão não sabe onde o Anki está), `falha` (não deu para escrever o item) ou `indisponivel`
     * (o sistema não tem item). Pedir ligar ou desligar o muda, como a Conexão faria.
     */
    definirItemDeLogin(situacao) { estado.contexto = { ...estado.contexto, itemDeLogin: situacao }; },
    /** O item de login está escrito de verdade (só a situação `ligado`): o que a Conexão deixou no computador. */
    itemInstalado() { return estado.contexto.itemDeLogin === 'ligado'; },
    /** O item de login agora: `ligado` ou `desligado` (ou a situação que o teste pôs). */
    itemDeLogin() { return estado.contexto.itemDeLogin; },
    /**
     * O próximo pedido de ligar ou desligar o item perde a resposta (a conexão cai): com `aplicada` a Conexão chegou a
     * escrever ou apagar o item antes, sem `aplicada` não mexeu em nada. A extensão não tem como saber qual dos dois.
     */
    perderARespostaDoItemDeLogin({ aplicada }) { estado.perdaDaRespostaDoItem = { aplicada }; },
    falharLeituraDoPerfil() { estado.contexto = { ...estado.contexto, falhaNoPerfil: true }; },
    /** Como a OpenAI responde à conferência de uma chave: o `openai` dos exemplos (aceita, recusa, sem_credito, org_nao_verificada, limite_de_uso, limite_so_no_pago, fora_do_ar). */
    responderOpenAI(comportamento) { estado.contexto = { ...estado.contexto, openai: comportamento }; },
    /** A Conexão já guardava uma chave (os 4 últimos caracteres dos exemplos), de antes de o teste começar. */
    guardarChaveNaConexao(finalDaChave) { estado.chaveDaOpenAI = `sk-proj-guardada-antes-${finalDaChave}`; },
    /** A Conexão voltou sem a chave (o Anki foi reinstalado, a pasta de dados foi apagada). */
    esquecerAChave() { estado.chaveDaOpenAI = null; },
    /** A cópia da chave da OpenAI que a Conexão guarda, ou null: o que o teste confere que chegou. */
    chaveNaConexao() { return estado.chaveDaOpenAI; },
    /** As respostas do contrato a um pedido (com o corpo, se tiver), para o teste que confere o fake contra os exemplos. */
    respostaDoContrato,
    /** A porta aceita a conexão e nunca responde (o /health do bridge travado). */
    silenciar() { estado.muda = true; },
    voltarAFalar() { estado.muda = false; },
    /**
     * O vocabulário do baralho de um idioma: cada item é uma string (uma palavra
     * madura num cartão) ou `{ word, type: 'word'|'term', maduros, recentes, novos }`
     * (os cartões em que o item aparece, por maturidade).
     */
    definirVocabulario(lang, palavras) { estado.vocabulario[lang] = palavras; },
    /** POST /anki/vocabulary falha: `{ status: 503 }` responde com erro, `{ rede: true }` derruba. */
    falharVocabulario(falha = { status: 503 }) { estado.falhaDoVocabulario = falha; },
    voltarVocabulario() { estado.falhaDoVocabulario = null; },

    /**
     * Os números de um baralho do Anki, em termos de gente; um baralho pedido
     * que não foi definido não existe no Anki (`missing`).
     */
    definirBaralho(deckName, numeros) { estado.baralhos[deckName] = numeros; },
    /** Os baralhos que o Anki tem, como POST /anki/decks os lista (Ajustes de envio). */
    definirBaralhosDoAnki(nomes) { estado.baralhosDoAnki = nomes; },
    /** Os baralhos passam a vir do arquivo local do Anki (BRG-13), e não do AnkiConnect. */
    lerBaralhosDoArquivo() { estado.fonteDosBaralhos = 'collection.anki2'; },
    /** O Anki fecha com a Conexão ligada: baralhos e vocabulário passam a vir do arquivo, como no bridge, e não há processo do Anki. */
    fecharOAnki() { estado.lidoDoArquivo = true; estado.processosDoAnki = 0; estado.fonteDosBaralhos = 'collection.anki2'; },
    /** O Anki está aberto, mas o AnkiConnect não responde: a Conexão também lê o arquivo, e o processo do Anki existe. */
    ankiAbertoSemAnkiConnect() { estado.lidoDoArquivo = true; estado.processosDoAnki = 1; estado.fonteDosBaralhos = 'collection.anki2'; },
    abrirOAnki() { estado.lidoDoArquivo = false; estado.processosDoAnki = 1; estado.fonteDosBaralhos = 'colecao'; },
    /** POST /anki/stats/decks falha: `{ status: 503 }` responde com erro, `{ rede: true }` derruba. */
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

/**
 * O JSON obtido é o do contrato; `"<agora>"` no contrato é qualquer instante ISO 8601 (o que o complemento
 * escreve é UTC com `Z`). Devolve o que difere, para a mensagem do teste, ou null se iguais.
 */
function diferencaDoContrato(obtido, esperado, caminho = '') {
  if (esperado === '<agora>') {
    return typeof obtido === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(obtido) ? null : `${caminho || '/'}: ${JSON.stringify(obtido)} não é um instante`;
  }
  if (Array.isArray(esperado) || (esperado && typeof esperado === 'object')) {
    if (!obtido || typeof obtido !== 'object' || Array.isArray(obtido) !== Array.isArray(esperado)) return `${caminho || '/'}: ${JSON.stringify(obtido)} não é ${JSON.stringify(esperado)}`;
    const chaves = new Set([...Object.keys(esperado), ...Object.keys(obtido)]);
    for (const chave of chaves) {
      if (!(chave in esperado) || !(chave in obtido)) return `${caminho}/${chave}: ${chave in obtido ? 'sobra' : 'falta'}`;
      const diferenca = diferencaDoContrato(obtido[chave], esperado[chave], `${caminho}/${chave}`);
      if (diferenca) return diferenca;
    }
    return null;
  }
  return obtido === esperado ? null : `${caminho || '/'}: ${JSON.stringify(obtido)} em vez de ${JSON.stringify(esperado)}`;
}

module.exports = { criarFakeAnki, exemploDaExtensao, diferencaDoContrato };
