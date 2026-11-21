'use strict';

const { isDeepStrictEqual } = require('util');
const contrato = require('../../complemento/contrato/carregar');
const { rota, rotaSe } = require('./rota');
const { erroDoContrato } = require('./resposta-do-contrato');
const { resumoDosCustos, linhaDeCustos, linhasDosCustosDaFila } = require('./custos');
const { cartoesDoEstado } = require('./navegador');

const ID_DO_ENVIO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIVEIS = ['iniciante', 'intermediario', 'avancado'];
const ANDANDO = ['queued', 'running'];
const FALHA_NO_ANKI = 'Falha ao enviar um ou mais cards ao Anki';
const DO_ENVIO = ['/jobs', '/jobs/list', '/jobs/get', '/jobs/retry', '/jobs/debug-bundle', '/jobs/apagar-frases', '/analytics/jobs'];

const semHora = ({ createdAt, ...pedido }) => pedido;

const semAsLinhas = pedido => ({ ...pedido, entries: pedido.entries.map(({ line, ...entrada }) => entrada) });

const pedidoGuardado = envio => ({ ...envio.corpo, createdAt: envio.createdAt });

const pedidoDoEnvio = dados => dados || {};

const responderCom = (responder, { status, json }) => responder(status, json);

const andando = estadoDoEnvio => ANDANDO.includes(estadoDoEnvio.status);

const versaoDoContrato = () => contrato.exemplos.find(e => e.pedido.caminho === '/health').resposta.json.versao;

const comoNaFila = () => ({ status: 'queued', stage: 'queued' });

const nivelInvalido = corpo => 'nivel' in corpo && !NIVEIS.includes(corpo.nivel);

function estadoNovo(agora, extra) {
  return {
    ...comoNaFila(),
    completedStages: [],
    progress: {},
    successfulPhraseIds: [],
    failedPhraseIds: [],
    duplicatePhraseIds: [],
    lastError: null,
    updatedAt: agora,
    cards: {},
    ...extra,
  };
}

function respostaDaRecusa(recusa) {
  if (recusa.rede) return { abortar: true };
  return { status: recusa.status, json: { error: recusa.erro || 'job_failed' } };
}

function recusaDoPedido(corpo) {
  if (!ID_DO_ENVIO.test(corpo.jobId || '')) return erroDoContrato('/jobs', 'invalid_job_id');
  if (nivelInvalido(corpo)) return erroDoContrato('/jobs', 'invalid_level');
  return null;
}

function reenvio(existente, corpo) {
  if (!isDeepStrictEqual(existente.criadoCom || semHora(existente.corpo), corpo)) return erroDoContrato('/jobs', 'job_conflict');
  return { status: 201, json: { jobId: corpo.jobId, status: existente.state.status } };
}

function estadoApagado(estadoDoEnvio, agora) {
  const parou = andando(estadoDoEnvio) ? { status: 'failed', stage: 'failed', lastError: 'frases_apagadas', progress: {} } : {};
  return { ...estadoDoEnvio, wiped: true, ...parou, updatedAt: agora };
}

const cartaoRetomado = cartao => (cartao.status === 'failed' ? { ...cartao, status: 'pending', error: null } : cartao);

const cartoesRetomados = cards => Object.fromEntries(Object.entries(cards || {}).map(([stem, cartao]) => [stem, cartaoRetomado(cartao)]));

function estadoRetomado(estadoDoEnvio, agora) {
  return { ...estadoDoEnvio, ...comoNaFila(), progress: {}, lastError: null, cards: cartoesRetomados(estadoDoEnvio.cards), updatedAt: agora };
}

function recusaDaRetomada(envio) {
  if (!envio) return erroDoContrato('/jobs/retry', 'job_not_found');
  if (envio.state.wiped) return erroDoContrato('/jobs/retry', 'job_wiped');
  return null;
}

function partesDoEnvio(envio, registros) {
  return {
    job: semAsLinhas(pedidoGuardado(envio)), state: envio.state,
    queueItem: { jobId: envio.jobId, lang: envio.lang, createdAt: envio.createdAt },
    costs: registros, costSummary: resumoDosCustos(registros),
  };
}

const partesDaLinhaDeCustos = linha => ({ job: null, state: { status: linha.status }, queueItem: null, costs: [], costSummary: resumoDosCustos([]) });

const resumoDaLista = e => ({ jobId: e.jobId, lang: e.lang, status: e.state.status, createdAt: e.createdAt, updatedAt: e.state.updatedAt, state: e.state });

function desfechoComErro(pedidas, anteriores) {
  return { sucesso: anteriores, falhou: pedidas.filter(id => !anteriores.includes(id)) };
}

function desfechoSemErro(pedidas, anteriores, falhas) {
  return { sucesso: [...new Set([...anteriores, ...pedidas.filter(id => !falhas.includes(id))])], falhou: falhas };
}

function desfechoDoEnvio(envio, { falhas, erro }) {
  const pedidas = envio.entries.map(e => Number(e.phraseId));
  const anteriores = envio.state.successfulPhraseIds;
  return erro ? desfechoComErro(pedidas, anteriores) : desfechoSemErro(pedidas, anteriores, falhas);
}

function statusDoDesfecho({ sucesso, falhou }) {
  if (falhou.length === 0) return 'completed';
  return sucesso.length ? 'partial' : 'failed';
}

function estadoConcluido(envio, conclusao, agora) {
  const desfecho = desfechoDoEnvio(envio, conclusao);
  const status = statusDoDesfecho(desfecho);
  return {
    ...envio.state,
    status,
    stage: status,
    successfulPhraseIds: desfecho.sucesso,
    failedPhraseIds: desfecho.falhou,
    duplicatePhraseIds: [...new Set([...envio.state.duplicatePhraseIds, ...conclusao.duplicadas])],
    lastError: status === 'completed' ? null : (conclusao.erro || FALHA_NO_ANKI),
    waiting: undefined,
    ankiError: conclusao.ankiError,
    updatedAt: agora,
  };
}

function estadoEmAndamento(envio, { stage, progress = {}, atualizadoEm, esperando, cartoes }, relogio) {
  return {
    ...envio.state,
    status: 'running',
    stage,
    progress,
    waiting: esperando,
    ...(cartoes && { cards: cartoesDoEstado(envio.jobId, cartoes) }),
    updatedAt: (atualizadoEm || relogio()).toISOString(),
  };
}

const envioDaFila = ({ job, state }) => {
  const { createdAt, ...corpo } = JSON.parse(JSON.stringify(job));
  return { jobId: job.jobId, lang: job.lang, entries: job.entries, corpo, createdAt, state: JSON.parse(JSON.stringify(state)) };
};

const envioEspelhado = ({ jobId, lang, corpo, createdAt, state }) => ({ jobId, lang, entries: corpo.entries, corpo, createdAt, state });

function criarRotasDoEnvio({ estado, modelo }) {
  const envios = [];
  const paraAFila = estado.paraAReal;
  const agora = () => estado.agora().toISOString();
  const mudou = envio => paraAFila.push({ mudar: { jobId: envio.jobId, state: envio.state } });
  const comecou = (envio, stage) => paraAFila.push({ mudar: { jobId: envio.jobId, state: { ...envio.state, status: 'running', stage } } });
  const doJob = jobId => envios.find(e => e.jobId === jobId);
  const linhaDeCustosDo = jobId => estado.custos?.find(l => l.jobId === jobId);

  function acharEnvio(jobId) {
    const envio = doJob(jobId);
    if (!envio) throw new Error(`O fake da Conexão não tem o envio ${jobId}`);
    return envio;
  }

  function guardarEnvioNovo(corpo) {
    modelo.aoComecarUmEnvio();
    const { jobId } = corpo;
    envios.push({ jobId, lang: corpo.lang, entries: corpo.entries || [], corpo, criadoCom: corpo, createdAt: agora(), state: estadoNovo(agora(), { jobId }) });
    return { status: 201, json: { jobId, status: 'queued' } };
  }

  function criarEnvio(req) {
    const corpo = JSON.parse(req.postData() || '{}');
    const recusa = estado.recusas.get(corpo.lang);
    if (recusa) return respostaDaRecusa(recusa);
    const invalido = recusaDoPedido(corpo);
    if (invalido) return invalido;
    const existente = doJob(corpo.jobId);
    return existente ? reenvio(existente, corpo) : guardarEnvioNovo(corpo);
  }

  function apagarAsFrases() {
    for (const envio of envios) {
      envio.corpo = semAsLinhas(envio.corpo);
      envio.entries = envio.corpo.entries;
      if (!envio.state.wiped) envio.state = estadoApagado(envio.state, agora());
    }
  }

  const linhasDosCustos = corpo => linhasDosCustosDaFila({ definidas: estado.custos, envios, registrosDeCusto: estado.registrosDeCusto }, corpo);

  function pacoteDeDiagnostico(jobId) {
    const envio = doJob(jobId);
    const linha = linhaDeCustosDo(jobId);
    if (!envio && !linha) return erroDoContrato('/jobs/debug-bundle', 'job_not_found');
    const partes = envio ? partesDoEnvio(envio, estado.registrosDeCusto.get(jobId) || []) : partesDaLinhaDeCustos(linha);
    return { status: 200, json: { generatedAt: agora(), jobId, versao: versaoDoContrato(), ...partes, artifacts: [], logTail: [] } };
  }

  function retomarEnvio(jobId) {
    const linha = linhaDeCustosDo(jobId);
    if (linha) {
      Object.assign(linha, comoNaFila());
      return { status: 200, json: { jobId, status: 'queued' } };
    }
    const envio = doJob(jobId);
    const recusa = recusaDaRetomada(envio);
    if (recusa) return recusa;
    if (andando(envio.state)) return { status: 200, json: { jobId, status: envio.state.status } };
    envio.state = estadoRetomado(envio.state, agora());
    return { status: 200, json: { jobId, status: 'queued' } };
  }

  function oEnvio(jobId) {
    const envio = doJob(jobId);
    if (!envio) return erroDoContrato('/jobs/get', 'job_not_found');
    return { status: 200, json: { job: pedidoGuardado(envio), state: envio.state } };
  }

  function osCustos({ dados, route, responder }) {
    const falha = estado.falhaDosCustos;
    if (falha?.rede) return route.abort('connectionrefused');
    if (falha) return responder(falha.status, { error: 'analytics_unavailable' });
    return responder(200, { jobs: linhasDosCustos(pedidoDoEnvio(dados)) });
  }

  function aoCriar({ req, route, responder }) {
    const resposta = criarEnvio(req);
    if (resposta.abortar) return route.abort('connectionrefused');
    if (estado.perdaDoEnvio) {
      estado.perdaDoEnvio = false;
      return route.abort('connectionreset');
    }
    return responderCom(responder, resposta);
  }

  const semJobId = ({ url, dados }) => DO_ENVIO.includes(url.pathname) && typeof pedidoDoEnvio(dados).jobId !== 'string';
  const peloJobId = tratar => ({ dados, responder }) => responderCom(responder, tratar(pedidoDoEnvio(dados).jobId));

  const rotas = [
    rotaSe(({ req, url }) => DO_ENVIO.includes(url.pathname) && req.method() !== 'POST', ({ responder }) => responder(404, { error: 'not_found' })),
    rota('*', '/analytics/jobs', osCustos),
    rota('*', '/jobs', aoCriar),
    rota('*', '/jobs/list', ({ responder }) => responder(200, { jobs: envios.map(resumoDaLista) })),
    rota('*', '/jobs/apagar-frases', ({ responder }) => {
      apagarAsFrases();
      return responder(200, { ok: true });
    }),
    rotaSe(semJobId, ({ url, responder }) => responderCom(responder, erroDoContrato(url.pathname, 'invalid_job_id'))),
    rota('*', '/jobs/get', peloJobId(oEnvio)),
    rota('*', '/jobs/retry', peloJobId(retomarEnvio)),
    rota('*', '/jobs/debug-bundle', peloJobId(pacoteDeDiagnostico)),
  ];

  const api = {
    apagarAsFrases() {
      apagarAsFrases();
      paraAFila.push({ apagarFrases: true });
    },
    definirCustos(lista) {
      estado.custos = lista.map(linhaDeCustos);
    },
    definirFila(nome) {
      const fila = contrato.filas[nome];
      if (!fila) throw new Error(`O contrato não tem a fila "${nome}" em filas (complemento/contrato/exemplos.json).`);
      envios.length = 0;
      paraAFila.push({ fila: nome });
      for (const daFila of fila) {
        envios.push(envioDaFila(daFila));
        estado.registrosDeCusto.set(daFila.job.jobId, daFila.custos);
      }
    },
    falharCustos(falha = { status: 503 }) { estado.falhaDosCustos = falha; },
    voltarCustos() { estado.falhaDosCustos = null; },
    falharApagarFrases(falha = { rede: true }) { estado.falhaDoApagarFrases = falha; },
    voltarApagarFrases() { estado.falhaDoApagarFrases = null; },

    recusarEnvios(lang, recusa = { status: 500 }) { estado.recusas.set(lang, recusa); },
    perderARespostaDoEnvio() { estado.perdaDoEnvio = true; },
    receberEnvio(corpo) {
      envios.push({ jobId: corpo.jobId, lang: corpo.lang, entries: corpo.entries, corpo, createdAt: agora(), state: estadoNovo(agora(), { jobId: corpo.jobId }) });
      paraAFila.push({ criar: corpo });
    },
    aceitarEnvios(lang) { estado.recusas.delete(lang); },
    perdeuAResposta() { estado.perdaDoEnvio = false; },
    espelharEnvios(daReal) {
      envios.splice(0, envios.length, ...daReal.map(envioEspelhado));
    },

    /** @estado-guardado Os Envios criados de um idioma, na ordem. */
    enviosEm(lang) { return envios.filter(e => e.lang === lang); },

    moverEnvio(jobId, movimento = {}) {
      const envio = acharEnvio(jobId);
      if (envio.state.status === 'queued' && movimento.esperando) comecou(envio, movimento.stage);
      envio.state = estadoEmAndamento(envio, movimento, estado.agora);
      mudou(envio);
    },

    concluirEnvio(jobId, { duplicadas = [], falhas = [], erro, ankiError = null } = {}) {
      const envio = acharEnvio(jobId);
      if (envio.state.status === 'queued') comecou(envio, 'generate_cards');
      envio.state = estadoConcluido(envio, { duplicadas, falhas, erro, ankiError }, agora());
      mudou(envio);
    },
  };

  return { envios, rotas, api };
}

module.exports = { criarRotasDoEnvio };
