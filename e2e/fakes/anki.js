'use strict';

const { isDeepStrictEqual } = require('util');
const { responderJson } = require('./http');
const { criarFakeChatGPT } = require('./chatgpt');
const { criarPerfis } = require('./perfis');
const { diferencaDoContrato } = require('./diferenca-do-contrato');
const contrato = require('../../complemento/contrato/carregar');

// Fake da Conexão com o Anki: responde na porta local dela (127.0.0.1:8766). Por padrão está ligada, com vocabulário vazio.
// Um teste pode desligá-la (conexão recusada) ou responder uma rota específica com `responder`.
//
// O que o complemento responde (a saúde, os Baralhos, os números, o vocabulário, a chave da OpenAI e o item de login) vem de
// `complemento/contrato/exemplos.json` (e dos `exemplos-*.json` ao lado, juntos por `carregar.js`), o mesmo que os testes do
// complemento leem: o fake responde o exemplo do pedido no contexto em que a Conexão está (`abrirPerfil`, `abrirColecao`,
// `responderOpenAI`, `guardarChaveNaConexao`, `definirItemDeLogin`). Os testes de tela montam os Baralhos em termos de gente
// (`definirVocabulario`, `definirBaralho`); `abrirColecao(nome)` passa a responder o contrato inteiro. Uma rota nova entra nesse
// arquivo (`complemento/contrato/LEIA-ME.md`). O perfil fixo (#149) mora em `perfis.js`; o login do ChatGPT (#155), em `chatgpt.js` (`fakes.anki.chatgpt`).
//
// Baralhos e termos, Vocabulário e Ajustes de envio (`POST /anki/decks`, sem `definirBaralhosDoAnki` é 503): voltam na ordem pedida,
// o que o Anki não tem volta `missing`, e os filtros (`status`, `type`, `q`) valem como no complemento.
//
// A chave da OpenAI: `POST /ia/openai/chave` responde pelo exemplo do contexto (`responderOpenAI(...)`) e, aceita, o fake guarda a
// cópia (`chaveNaConexao()`); `POST /ia/estado` devolve só os 4 últimos caracteres.
//
// Os Envios (`/jobs…`, `/analytics/jobs`, todas POST): `POST /jobs` cria um pelo `jobId` do painel (o mesmo corpo é o mesmo Envio;
// outro corpo, o `409`), `/jobs/list` lista com o `state` de cada um, `/jobs/retry` o põe na fila. O teste move (`moverEnvio`) e
// termina (`concluirEnvio`) cada Envio como a Conexão faria; `definirFila(nome)` põe uma fila do contrato. Os custos são os de
// `definirCustos` ou, sem eles, os dos Envios da fila (`custos.py`, só os de texto: imagens são do #144).

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
    custos: null,       // as linhas de POST /analytics/jobs que o teste definiu (definirCustos); null: as dos Envios da fila
    registrosDeCusto: new Map(), // jobId → os registros de custo do Envio (os da fila do contrato)
    falhaDosCustos: null, // { status } | { rede: true }: POST /analytics/jobs falha
    falhaDoApagarFrases: null, // { rede: true }: POST /jobs/apagar-frases não tem resposta
    baralhos: {},       // deckName → os números do baralho (definirBaralho)
    fonteDosBaralhos: 'colecao',        // 'collection.anki2': lidos do arquivo local (BRG-13)
    lidoDoArquivo: false,       // a Conexão responde lendo o arquivo do Anki: baralhos e vocabulário vêm de `collection.anki2`
    processosDoAnki: 1,         // GET /anki/status: quantos processos do Anki a Conexão vê (0: o Anki está fechado)
    falhaDosBaralhos: null,     // { status } | { rede: true }: POST /anki/stats/decks falha
    falhaDoVocabulario: null,   // { status } | { rede: true }: POST /anki/vocabulary falha
    baralhosDoAnki: null,       // os nomes de POST /anki/decks; null: a lista não vem (definirBaralhosDoAnki)
    contexto: { perfil: 'Usuário 1', falhaNoPerfil: false, openai: 'aceita', itemDeLogin: 'desligado', firebase: 0 }, // em que situação o complemento está (os `contexto` dos exemplos); `colecao` só existe depois de `abrirColecao`
    versaoDaChave: 0,
    contaDaChave: '',
    horaDaChave: 0,
    chaveNaoEnviada: false,
    google: null,
    filaDaChave: Promise.resolve(),
    chaveDaOpenAI: null,        // a cópia da chave que a Conexão guarda (a inteira: só o teste a vê)
  };
  const perfis = criarPerfis(() => estado.contexto);
  const requisicoes = [];
  const envios = [];    // { jobId, lang, entries, corpo, createdAt, state }
  const chatgpt = criarFakeChatGPT(); // o login do ChatGPT (#155): as rotas dele aqui e a página do auth.openai.com (fakes.chatgpt)

  function novoEstado(extra = {}) {
    return {
      status: 'queued',
      stage: 'queued',
      completedStages: [],
      progress: {},
      successfulPhraseIds: [],
      failedPhraseIds: [],
      duplicatePhraseIds: [],
      lastError: null,
      updatedAt: estado.agora().toISOString(),
      cards: {},
      ...extra,
    };
  }

  /** A resposta de erro que o contrato dá a uma rota do Envio (o exemplo `daExtensao` com esse `error`, ou o que não é da extensão). */
  function erroDoContrato(caminho, erro) {
    const exemplo = contrato.exemplos.find(e => e.pedido.caminho === caminho && e.resposta.json?.error === erro);
    if (!exemplo) throw new Error(`O contrato não tem o erro ${erro} de POST ${caminho}; escreva o exemplo antes de o fake responder.`);
    return { status: exemplo.resposta.status, json: exemplo.resposta.json };
  }

  const ID_DO_ENVIO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const semHora = ({ createdAt, ...pedido }) => pedido;

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
    if (!ID_DO_ENVIO.test(corpo.jobId || '')) return erroDoContrato('/jobs', 'invalid_job_id');
    const { jobId } = corpo;
    const existente = envios.find(e => e.jobId === jobId);
    if (existente) {
      if (!isDeepStrictEqual(semHora(existente.corpo), corpo)) return erroDoContrato('/jobs', 'job_conflict');
      return { status: 201, json: { jobId, status: existente.state.status } };
    }
    envios.push({ jobId, lang: corpo.lang, entries: corpo.entries || [], corpo, createdAt: estado.agora().toISOString(), state: novoEstado({ jobId }) });
    return { status: 201, json: { jobId, status: 'queued' } };
  }

  function listarEnvios() {
    return {
      jobs: envios.map(e => ({
        jobId: e.jobId,
        lang: e.lang,
        status: e.state.status,
        createdAt: e.createdAt,
        updatedAt: e.state.updatedAt,
        state: e.state,
      })),
    };
  }

  /**
   * `POST /jobs/apagar-frases`: de todo Envio somem as linhas das Frases (ficam os `phraseId`); um Envio na fila ou andando vai a
   * `failed` com `wiped`. Repetido, não muda nada.
   */
  function apagarAsFrases() {
    for (const envio of envios) {
      envio.corpo = { ...envio.corpo, entries: envio.corpo.entries.map(({ line, ...entrada }) => entrada) };
      envio.entries = envio.corpo.entries;
      if (envio.state.wiped) continue;
      const parou = ['queued', 'running'].includes(envio.state.status);
      envio.state = { ...envio.state, wiped: true, ...(parou ? { status: 'failed', stage: 'failed', lastError: 'frases_apagadas', progress: {} } : {}), updatedAt: estado.agora().toISOString() };
    }
  }

  /** O pacote de diagnóstico não leva as linhas das Frases: só os `phraseId` (a Palavra e a Frase não saem do Envio). */
  const semAsLinhas = pedido => ({ ...pedido, entries: pedido.entries.map(({ line, ...entrada }) => entrada) });

  /** O pedido de um Envio como a Conexão o guarda (o corpo, mais `createdAt`). */
  const pedidoGuardado = envio => ({ ...envio.corpo, createdAt: envio.createdAt });

  /** O resumo dos registros de custo de um Envio, como `custos.resumir` do complemento (só os registros de texto). */
  function resumoDosCustos(registros, de, ate) {
    const custos = { cardUsd: 0, imageJudgeUsd: 0, imageGuardUsd: 0, imageGenerationUsd: 0, otherUsd: 0, totalUsd: 0 };
    let contados = 0;
    for (const registro of registros) {
      const dia = String(registro.date || '').slice(0, 10);
      if ((de && dia < de) || (ate && dia > ate)) continue;
      contados += 1;
      const palavra = String(registro.keyword || '');
      const campo = palavra.startsWith('[image_judge]') ? 'imageJudgeUsd' : palavra.startsWith('[image_guard]') ? 'imageGuardUsd' : 'cardUsd';
      if (registro.type === 'tokens') custos[campo] += registro.cost_usd || 0;
    }
    custos.totalUsd = custos.cardUsd + custos.imageJudgeUsd + custos.imageGuardUsd + custos.imageGenerationUsd + custos.otherUsd;
    const arredondados = Object.fromEntries(Object.entries(custos).map(([chave, valor]) => [chave, Math.round(valor * 1e6) / 1e6]));
    return { costs: arredondados, images: imagensZeradas(), matchedRecords: contados };
  }

  /** As linhas de Custos do período e do idioma pedidos (`POST /analytics/jobs`), como `JobAnalytics.jobs`. */
  function linhasDosCustos(corpo) {
    const { lang = 'all', from: de, to: ate } = corpo || {};
    const doIdioma = linha => lang === 'all' || linha.lang === lang;
    if (estado.custos) {
      return estado.custos.filter(linha => {
        const dia = String(linha.createdAt).slice(0, 10);
        return doIdioma(linha) && (!de || dia >= de) && (!ate || dia <= ate);
      });
    }
    return envios.filter(envio => {
      const dia = String(envio.createdAt).slice(0, 10);
      return doIdioma(envio) && (!de || dia >= de) && (!ate || dia <= ate);
    }).map(envio => {
      const resumo = resumoDosCustos(estado.registrosDeCusto.get(envio.jobId) || [], de, ate);
      const pedidas = new Set(envio.entries.map(e => e.phraseId)).size;
      const enviadas = envio.state.successfulPhraseIds.length;
      const falharam = ['failed', 'partial'].includes(envio.state.status) ? Math.max(envio.state.failedPhraseIds.length, pedidas - enviadas) : envio.state.failedPhraseIds.length;
      return {
        jobId: envio.jobId, createdAt: envio.createdAt, updatedAt: envio.state.updatedAt, lang: envio.lang,
        deckName: envio.corpo.deckName || '', imageSource: envio.corpo.imageSource || '', status: envio.state.status, stage: envio.state.stage,
        requestedCards: pedidas, successfulCards: enviadas, failedCards: falharam, lastError: envio.state.lastError,
        costs: resumo.costs, images: resumo.images, matchedRecords: resumo.matchedRecords,
      };
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  /** `POST /jobs/debug-bundle`: o pacote de diagnóstico como o complemento o monta (o fake não tem arquivos nem log). */
  function pacoteDeDiagnostico(jobId) {
    const envio = envios.find(e => e.jobId === jobId);
    const linha = estado.custos?.find(l => l.jobId === jobId);
    if (!envio && !linha) return erroDoContrato('/jobs/debug-bundle', 'job_not_found');
    const registros = envio ? (estado.registrosDeCusto.get(jobId) || []) : [];
    return {
      status: 200,
      json: {
        generatedAt: estado.agora().toISOString(), jobId, versao: contrato.exemplos.find(e => e.pedido.caminho === '/health').resposta.json.versao,
        job: envio ? semAsLinhas(pedidoGuardado(envio)) : null, state: envio ? envio.state : { status: linha.status },
        queueItem: envio ? { jobId, lang: envio.lang, createdAt: envio.createdAt } : null,
        costs: registros, costSummary: resumoDosCustos(registros), artifacts: [], logTail: [],
      },
    };
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
    const linha = estado.custos?.find(l => l.jobId === jobId);
    if (linha) {
      linha.status = 'queued';
      linha.stage = 'queued';
      return { status: 200, json: { jobId, status: 'queued' } };
    }
    const envio = envios.find(e => e.jobId === jobId);
    if (!envio) return erroDoContrato('/jobs/retry', 'job_not_found');
    // Na fila ou andando, ou com as Frases apagadas, a Conexão só diz o estado: nada muda.
    if (['queued', 'running'].includes(envio.state.status) || envio.state.wiped) return { status: 200, json: { jobId, status: envio.state.status } };
    const cards = Object.fromEntries(Object.entries(envio.state.cards || {}).map(([stem, cartao]) =>
      [stem, cartao.status === 'failed' ? { ...cartao, status: 'pending', error: null } : cartao]));
    envio.state = { ...envio.state, status: 'queued', stage: 'queued', progress: {}, lastError: null, cards, updatedAt: estado.agora().toISOString() };
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
    return { ...estado.contexto, chaveNaConexao: ultimos4(estado.chaveDaOpenAI), chatgpt: chatgpt.situacao() };
  }

  /**
   * `perfil` (com `falhaNoPerfil`: um exemplo que não o diz é o da saúde sem falha), `itemDeLogin`, `colecao`, `openai` e
   * `chaveNaConexao` só contam nos exemplos que os dizem. Da chave só conta ter ou não ter: a resposta leva os 4 últimos da guardada.
   */
  function exemploServe(exemplo, contexto) {
    const doExemplo = exemplo.contexto;
    return (doExemplo.perfil === undefined
        || (doExemplo.perfil === contexto.perfil && Boolean(doExemplo.falhaNoPerfil) === Boolean(contexto.falhaNoPerfil)))
      && (doExemplo.itemDeLogin === undefined || doExemplo.itemDeLogin === contexto.itemDeLogin)
      && (!('colecao' in doExemplo) || doExemplo.colecao === contexto.colecao)
      && (!('openai' in doExemplo) || doExemplo.openai === contexto.openai)
      && (!('chaveNaConexao' in doExemplo) || (doExemplo.chaveNaConexao === null) === (contexto.chaveNaConexao === null))
      && (!('firebase' in doExemplo) || doExemplo.firebase === contexto.firebase)
      && (!('cofre' in doExemplo) || doExemplo.cofre === contexto.cofre)
      && (!('chatgpt' in doExemplo) || doExemplo.chatgpt === contexto.chatgpt);
  }

  /**
   * A resposta que o contrato dá ao pedido da extensão, no contexto de agora. O exemplo que cita `corpo` só
   * vale para esse corpo, salvo na chave da OpenAI, onde o exemplo do contexto vale para qualquer chave
   * (a resposta leva os 4 últimos da que o teste mandou); o que cita `colecao` só vale com essa coleção aberta (`abrirColecao`).
   */
  function respostaDoContrato(metodo, caminho, corpo) {
    const doPerfil = perfis.responder(metodo, caminho, corpo); // o perfil fixo responde pelo estado dele (perfis.js)
    if (doPerfil) return doPerfil;
    const contexto = contextoDeAgora();
    const candidatos = contrato.exemplos.filter(e =>
      exemploDaExtensao(e) && e.pedido.metodo === metodo && e.pedido.caminho === caminho && exemploServe(e, contexto));
    const exato = candidatos.find(e => e.pedido.corpo === undefined || isDeepStrictEqual(e.pedido.corpo, corpo));
    const exemplo = exato || (['/ia/openai/chave', '/ia/openai/chave/apagar', '/ia/openai/sincronizar'].includes(caminho) ? candidatos[0] : undefined);
    if (!exemplo) {
      throw new Error(`O contrato (complemento/contrato/exemplos.json) não tem exemplo de ${metodo} ${caminho}`
        + `${corpo === undefined ? '' : ` com o corpo ${JSON.stringify(corpo)}`} `
        + `com o contexto ${JSON.stringify(contexto)}; escreva-o lá antes de o fake responder.`);
    }
    const json = comOAgora(exemplo.resposta.json);
    // Os exemplos dizem os 4 últimos da chave deles; a resposta leva os da chave que o teste mandou ou que a Conexão guarda.
    if (json.ultimos4 && typeof corpo?.chave === 'string') json.ultimos4 = ultimos4(corpo.chave.trim());
    if (json.openai) json.openai = { configurada: !!estado.chaveDaOpenAI,
      ...(estado.chaveDaOpenAI && { ultimos4: ultimos4(estado.chaveDaOpenAI) }),
      conta: estado.contaDaChave, versao: estado.versaoDaChave, naoEnviada: estado.chaveNaoEnviada };
    return { status: exemplo.resposta.status, json };
  }

  /** `POST /ia/openai/chave`: a resposta do contrato e, aceita a chave, a cópia que a Conexão passa a ter. */
  function naFilaDaChave(fazer) {
    const vez = estado.filaDaChave.then(fazer);
    estado.filaDaChave = vez.catch(() => {});
    return vez;
  }

  function mudarChave(chave, conta, em, naoEnviada = true) {
    estado.chaveDaOpenAI = chave || null;
    estado.contaDaChave = conta;
    estado.versaoDaChave += 1;
    estado.horaDaChave = em ?? Math.max(estado.agora().getTime(), estado.horaDaChave + 1);
    estado.chaveNaoEnviada = naoEnviada;
  }

  function guardarChave(req) {
    return naFilaDaChave(() => {
      const corpo = JSON.parse(req.postData());
      const versao = corpo.versao || 0, conta = corpo.conta || '', chave = corpo.chave.trim();
      if ((versao === estado.versaoDaChave - 1 || versao === estado.versaoDaChave)
        && chave === estado.chaveDaOpenAI && conta === estado.contaDaChave) {
        return { status: 200, json: { ok: true, ultimos4: ultimos4(chave) } };
      }
      if (versao !== estado.versaoDaChave) return { status: 409, json: { error: 'stale_key_version' } };
      const resposta = respostaDoContrato('POST', '/ia/openai/chave', corpo);
      if (resposta.status === 200) mudarChave(chave, conta);
      return resposta;
    });
  }

  function apagarChave(req) {
    return naFilaDaChave(() => {
      const corpo = JSON.parse(req.postData() || '{}');
      const versao = corpo.versao || 0, conta = corpo.conta || '';
      if (versao === estado.versaoDaChave - 1 && !estado.chaveDaOpenAI && conta === estado.contaDaChave) {
        return { status: 200, json: { ok: true } };
      }
      if (versao !== estado.versaoDaChave) return { status: 409, json: { error: 'stale_key_version' } };
      const resposta = respostaDoContrato('POST', '/ia/openai/chave/apagar', corpo);
      if (resposta.status === 200) mudarChave('', conta);
      return resposta;
    });
  }

  function sincronizarChave(req) {
    return naFilaDaChave(async () => {
      const { uid, token, versao = 0 } = JSON.parse(req.postData());
      if (versao !== estado.versaoDaChave) return { status: 409, json: { error: 'stale_key_version' } };
      if (estado.chaveDaOpenAI && !estado.contaDaChave) return { status: 409, json: { error: 'legacy_key_unbound' } };
      if (estado.contaDaChave && estado.contaDaChave !== uid && estado.chaveNaoEnviada) return { status: 409, json: { error: 'other_account_unsent' } };
      if (estado.contexto.cofre === 'sem_escrita') return { status: 500, json: { error: 'internal_error' } };
      if (estado.contexto.firebase) return { status: estado.contexto.firebase,
        json: { error: 'cloud_sync_failed', status: estado.contexto.firebase } };
      const remota = estado.google ? await estado.google.pedidoDaConexao('GET', uid, token) : { status: 404 };
      if (remota.status !== 200 && remota.status !== 404) return { status: remota.status, json: { error: 'cloud_sync_failed', status: remota.status } };
      const fields = remota.json?.fields;
      const chaveRemota = fields?.apagada?.booleanValue ? '' : fields?.chave?.stringValue || '';
      const horaRemota = Number(fields?.em?.integerValue) || (chaveRemota ? 1 : 0);
      let resultado = null;
      if (remota.status === 404 && !estado.chaveDaOpenAI && !estado.horaDaChave) {
        estado.chaveNaoEnviada = false;
        return { status: 200, json: { ok: true, resultado: null, versao: estado.versaoDaChave } };
      }
      const empate = remota.status === 200 && horaRemota === estado.horaDaChave && chaveRemota !== (estado.chaveDaOpenAI || '');
      if (estado.contaDaChave !== uid || horaRemota > estado.horaDaChave || (empate && !estado.chaveNaoEnviada)) {
        const anterior = estado.chaveDaOpenAI;
        mudarChave(chaveRemota, uid, horaRemota, false);
        resultado = chaveRemota ? 'chegou' : (anterior ? 'apagada' : null);
      } else if (estado.horaDaChave > horaRemota || (empate && estado.chaveNaoEnviada)) {
        const escrita = estado.google ? await estado.google.pedidoDaConexao('PATCH', uid, token,
          { chave: { stringValue: estado.chaveDaOpenAI || '' }, em: { integerValue: String(estado.horaDaChave) } }) : { status: 200 };
        if (escrita.status !== 200) return { status: escrita.status, json: { error: 'cloud_sync_failed', status: escrita.status } };
        resultado = 'subiu';
      }
      estado.chaveNaoEnviada = false;
      return { status: 200, json: { ok: true, resultado, versao: estado.versaoDaChave } };
    });
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
      const { status, json } = perfis.saudeCom(respostaDoContrato(req.method(), '/health'));
      return responderJson(route, status, json);
    }
    if (url.pathname === '/ia/openai/chave' && req.method() === 'POST') {
      const { status, json } = await guardarChave(req);
      return responderJson(route, status, json);
    }
    if (url.pathname === '/ia/openai/chave/apagar' && req.method() === 'POST') {
      const { status, json } = await apagarChave(req);
      return responderJson(route, status, json);
    }
    if (url.pathname === '/ia/openai/legado' && req.method() === 'POST') {
      const { chave, conta, em, versao } = JSON.parse(req.postData());
      if (estado.contexto.cofre === 'sem_escrita') return responderJson(route, 500, { error: 'internal_error' });
      if ((estado.chaveDaOpenAI || '') !== chave || (estado.contaDaChave && estado.contaDaChave !== conta)
        || (versao !== estado.versaoDaChave && !(versao === estado.versaoDaChave - 1 && estado.contaDaChave === conta))) {
        return responderJson(route, 409, { error: 'legacy_key_mismatch' });
      }
      // Já vinculado a esta conta é o mesmo pedido de novo (ou o replay da base anterior): 200 sem avançar a revisão.
      if ((estado.contaDaChave === null || estado.chaveDaOpenAI === null) && estado.contaDaChave !== conta) mudarChave(chave, conta, em);
      return responderJson(route, 200, { ok: true });
    }
    if (url.pathname === '/ia/openai/sincronizar' && req.method() === 'POST') {
      const { status, json } = await sincronizarChave(req);
      return responderJson(route, status, json);
    }
    if ((url.pathname.startsWith('/ia/chatgpt/') && req.method() === 'POST') || (url.pathname === '/auth/callback' && req.method() === 'GET')) {
      return chatgpt.naConexao(route, url, respostaDoContrato);
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
    const doPerfil = perfis.responder(req.method(), url.pathname, dadosDoCorpo(corpoDoPedido));
    if (doPerfil) return responderJson(route, doPerfil.status, doPerfil.json);
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
    // O Envio e os custos: só POST, como no complemento (o GET de antes não existe mais).
    const doEnvio = ['/jobs', '/jobs/list', '/jobs/get', '/jobs/retry', '/jobs/debug-bundle', '/jobs/apagar-frases', '/analytics/jobs'].includes(url.pathname);
    if (doEnvio && req.method() !== 'POST') return responderJson(route, 404, { error: 'not_found' });
    const pedidoDoEnvio = doEnvio ? dadosDoCorpo(corpoDoPedido) || {} : null;
    if (url.pathname === '/analytics/jobs') {
      const falha = estado.falhaDosCustos;
      if (falha?.rede) return route.abort('connectionrefused');
      if (falha) return responderJson(route, falha.status, { error: 'analytics_unavailable' });
      return responderJson(route, 200, { jobs: linhasDosCustos(pedidoDoEnvio) });
    }
    if (url.pathname === '/jobs') {
      const resposta = criarEnvio(req);
      if (resposta.abortar) return route.abort('connectionrefused');
      // A Conexão criou o Envio e a resposta se perdeu no caminho (a conexão caiu).
      if (estado.perdaDoEnvio) {
        estado.perdaDoEnvio = false;
        return route.abort('connectionreset');
      }
      return responderJson(route, resposta.status, resposta.json);
    }
    if (url.pathname === '/jobs/list') return responderJson(route, 200, listarEnvios());
    if (url.pathname === '/jobs/apagar-frases') {
      if (estado.falhaDoApagarFrases?.rede) return route.abort('connectionrefused');
      apagarAsFrases();
      return responderJson(route, 200, { ok: true });
    }
    if (doEnvio && url.pathname !== '/jobs/apagar-frases' && typeof pedidoDoEnvio.jobId !== 'string') {
      const { status, json } = erroDoContrato(url.pathname, 'invalid_job_id');
      return responderJson(route, status, json);
    }
    if (url.pathname === '/jobs/get') {
      const envio = envios.find(e => e.jobId === pedidoDoEnvio.jobId);
      if (!envio) {
        const { status, json } = erroDoContrato('/jobs/get', 'job_not_found');
        return responderJson(route, status, json);
      }
      return responderJson(route, 200, { job: pedidoGuardado(envio), state: envio.state });
    }
    if (url.pathname === '/jobs/retry') {
      const { status, json } = retomarEnvio(pedidoDoEnvio.jobId);
      return responderJson(route, status, json);
    }
    if (url.pathname === '/jobs/debug-bundle') {
      const { status, json } = pacoteDeDiagnostico(pedidoDoEnvio.jobId);
      return responderJson(route, status, json);
    }
    return responderJson(route, 404, { error: 'not_found' });
  }

  return {
    padrao: /^http:\/\/(127\.0\.0\.1|localhost):8766\//,
    tratar,
    requisicoes,
    chatgpt,
    /** @estado-guardado Os Envios que a Conexão guardou (um por `POST /jobs`), não o pedido que chegou. */
    envios,
    desligar() { estado.ligada = false; },
    ligar() { estado.ligada = true; },
    /** O perfil que o Anki tem aberto (`null`: a tela de perfis); precisa de exemplo no contrato. */
    abrirPerfil(perfil) { estado.contexto = { ...estado.contexto, perfil }; },
    /** O perfil fixo (#149, `perfis.js`): os perfis do Anki, o `marcado` e o `aberto`. */
    definirPerfis: perfis.definir,
    /** @estado-guardado O perfil que a Conexão tem marcado (`null`: nenhum ainda). */
    perfilMarcado: perfis.marcado,
    /** @estado-guardado O perfil que o Anki tem aberto (`null`: a tela de perfis). */
    perfilAberto: perfis.aberto,
    /** A Conexão não consegue marcar o perfil que a tela escolheu: `POST /anki/profile` responde o erro interno. */
    falharAEscolhaDoPerfil: perfis.falharAEscolha,
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
    /** @estado-guardado O item de login está escrito de verdade (só a situação `ligado`). */
    itemInstalado() { return estado.contexto.itemDeLogin === 'ligado'; },
    /** @estado-guardado O item de login agora: `ligado` ou `desligado` (ou a situação que o teste pôs). */
    itemDeLogin() { return estado.contexto.itemDeLogin; },
    /**
     * O próximo pedido de ligar ou desligar o item perde a resposta (a conexão cai): com `aplicada` a Conexão chegou a
     * escrever ou apagar o item antes, sem `aplicada` não mexeu em nada. A extensão não tem como saber qual dos dois.
     */
    perderARespostaDoItemDeLogin({ aplicada }) { estado.perdaDaRespostaDoItem = { aplicada }; },
    falharLeituraDoPerfil() { estado.contexto = { ...estado.contexto, falhaNoPerfil: true }; },
    /** Como a OpenAI responde à conferência de uma chave: o `openai` dos exemplos (aceita, recusa, sem_credito, limite_de_uso…). */
    responderOpenAI(comportamento) { estado.contexto = { ...estado.contexto, openai: comportamento }; },
    /** A Conexão já guardava uma chave (os 4 últimos caracteres dos exemplos), de antes de o teste começar. */
    guardarChaveNaConexao(finalDaChave, versao = 0, conta = null, em = 0, naoEnviada = true) { estado.chaveDaOpenAI = `sk-proj-guardada-antes-${finalDaChave}`; estado.versaoDaChave = versao; estado.contaDaChave = conta; estado.horaDaChave = em; estado.chaveNaoEnviada = naoEnviada; },
    /** A Conexão voltou sem a chave (o Anki foi reinstalado, a pasta de dados foi apagada). */
    esquecerAChave() { estado.chaveDaOpenAI = null; estado.versaoDaChave = 0; estado.contaDaChave = ''; estado.horaDaChave = 0; },
    guardarRemocaoNaConexao(versao) { estado.chaveDaOpenAI = null; estado.versaoDaChave = versao; estado.contaDaChave = ''; estado.horaDaChave = 0; },
    sincronizarCom(google) { estado.google = google; },
    responderFirebase(status) { estado.contexto.firebase = status; },
    falharGravacaoDaChave() { estado.contexto.cofre = 'sem_escrita'; },
    /** @estado-guardado A única revisão/conta/hora que o dono guarda. */
    estadoDaChave() { return { versao: estado.versaoDaChave, conta: estado.contaDaChave, em: estado.horaDaChave, naoEnviada: estado.chaveNaoEnviada }; },
    /** @estado-guardado A cópia da chave da OpenAI que a Conexão guarda, ou null: o que o teste confere que chegou. */
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
    /** O Anki fecha com a Conexão ligada: baralhos e vocabulário vêm do arquivo, e não há processo do Anki. */
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
     * Os Envios que a aba Custos lê (POST /analytics/jobs), em termos de gente;
     * o fake os entrega no formato do contrato, com o total somado como lá
     * (`totalUsd` inclui o `otherUsd`).
     */
    definirCustos(lista) {
      estado.custos = lista.map(linhaDeCustos);
    },
    /**
     * A fila que a Conexão já tinha: a de `filas` do contrato pelo nome, com os registros de custo de cada Envio
     * (o `contexto.fila` dos exemplos).
     */
    definirFila(nome) {
      const fila = contrato.filas[nome];
      if (!fila) throw new Error(`O contrato não tem a fila "${nome}" em filas (complemento/contrato/exemplos.json).`);
      envios.length = 0;
      for (const { job, state, custos } of fila) {
        const { createdAt, ...corpo } = JSON.parse(JSON.stringify(job));
        envios.push({ jobId: job.jobId, lang: job.lang, entries: job.entries, corpo, createdAt, state: JSON.parse(JSON.stringify(state)) });
        estado.registrosDeCusto.set(job.jobId, custos);
      }
    },
    /** POST /analytics/jobs falha: `{ status: 503 }` responde com erro, `{ rede: true }` derruba. */
    falharCustos(falha = { status: 503 }) { estado.falhaDosCustos = falha; },
    voltarCustos() { estado.falhaDosCustos = null; },
    /** POST /jobs/apagar-frases sem resposta (`{ rede: true }`); `voltarApagarFrases()` o faz responder de novo. */
    falharApagarFrases(falha = { rede: true }) { estado.falhaDoApagarFrases = falha; },
    voltarApagarFrases() { estado.falhaDoApagarFrases = null; },

    /** O relógio da Conexão, para o `updatedAt` (o painel diz “atualizado há …”). */
    usarRelogio(agora) { estado.agora = agora; },

    /**
     * O próximo `POST /jobs` desse idioma falha: `{ status: 500 }` responde com
     * erro, `{ rede: true }` derruba a conexão. Vale até `aceitarEnvios(lang)`.
     */
    recusarEnvios(lang, recusa = { status: 500 }) { estado.recusas.set(lang, recusa); },
    /** O próximo `POST /jobs` cria o Envio na Conexão e a resposta se perde: o painel não sabe que ele existe. */
    perderARespostaDoEnvio() { estado.perdaDoEnvio = true; },
    /** A Conexão recebeu este pedido de Envio antes de o teste começar (o painel fechou sem ver a resposta). */
    receberEnvio(corpo) {
      envios.push({ jobId: corpo.jobId, lang: corpo.lang, entries: corpo.entries, corpo, createdAt: estado.agora().toISOString(), state: novoEstado({ jobId: corpo.jobId }) });
    },
    aceitarEnvios(lang) { estado.recusas.delete(lang); },

    /** @estado-guardado Os Envios criados de um idioma, na ordem. */
    enviosEm(lang) { return envios.filter(e => e.lang === lang); },

    /** Põe o Envio numa etapa (`generate_cards`…); `cartoes`: `{ '<phraseId>-<n>': 'added' | 'pending' | 'failed'… }` (o `cards` do estado). */
    moverEnvio(jobId, { stage, progress = {}, atualizadoEm, esperando, cartoes } = {}) {
      const envio = acharEnvio(jobId);
      envio.state = {
        ...envio.state,
        status: 'running',
        stage,
        progress,
        waiting: esperando, // o Envio espera o perfil (#149): `{ reason, profile, marked }`
        ...(cartoes && { cards: Object.fromEntries(Object.entries(cartoes).map(([id, status]) => [id, { phraseId: Number(id.split('-')[0]), status, error: null }])) }),
        updatedAt: (atualizadoEm || estado.agora()).toISOString(),
      };
    },

    /**
     * Termina o Envio. Todas as frases dele viram cartão, menos as `falhas`;
     * as `duplicadas` já estavam no Anki. `erro` termina sem nenhuma (o job
     * quebrou antes de enviar); `ankiError` é o código que a Conexão junta a ele.
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

/** As imagens de uma linha de Custos sem nenhuma imagem (as chaves do contrato). */
function imagensZeradas() {
  return {
    total: 0, real: 0, generated: 0, skipped: 0, failed: 0, generatedAttempted: 0, savingsUsd: 0,
    realPct: 0, generatedPct: 0, skippedPct: 0, failedPct: 0, generatedAttemptPct: 0,
  };
}

/** Um Envio da aba Custos no formato de `JobAnalytics.jobs` (bridge/analytics.py), o das linhas do contrato. */
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
    ...imagensZeradas(),
    real: imagens.real || 0,
    generated: imagens.geradas || 0,
    skipped: imagens.sem || 0,
    failed: imagens.falhas || 0,
    savingsUsd: economia,
  };
  images.total = images.real + images.generated + images.skipped + images.failed;
  const pct = parte => (images.total ? Math.round((parte / images.total) * 1000) / 10 : 0);
  Object.assign(images, { realPct: pct(images.real), generatedPct: pct(images.generated), skippedPct: pct(images.skipped), failedPct: pct(images.failed) });
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

module.exports = { criarFakeAnki, exemploDaExtensao, diferencaDoContrato };
