'use strict';

const { isDeepStrictEqual } = require('util');
const contrato = require('../../complemento/contrato/carregar');
const { rota, rotaSe } = require('./rota');
const { erroDoContrato } = require('./resposta-do-contrato');
const { resumoDosCustos, linhaDeCustos, linhasDosCustosDaFila } = require('./custos');
const { cartoesDoEstado } = require('./navegador');

const ID_DO_ENVIO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const semHora = ({ createdAt, ...pedido }) => pedido;

const semAsLinhas = pedido => ({ ...pedido, entries: pedido.entries.map(({ line, ...entrada }) => entrada) });

const pedidoGuardado = envio => ({ ...envio.corpo, createdAt: envio.createdAt });

function criarRotasDoEnvio({ estado, modelo }) {
  const envios = [];
  const paraAFila = [];
  const mudou = envio => paraAFila.push({ mudar: { jobId: envio.jobId, state: envio.state } });

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
    if ('nivel' in corpo && !['iniciante', 'intermediario', 'avancado'].includes(corpo.nivel)) return erroDoContrato('/jobs', 'invalid_level');
    const { jobId } = corpo;
    const existente = envios.find(e => e.jobId === jobId);
    if (existente) {
      if (!isDeepStrictEqual(existente.criadoCom || semHora(existente.corpo), corpo)) return erroDoContrato('/jobs', 'job_conflict');
      return { status: 201, json: { jobId, status: existente.state.status } };
    }
    modelo.aoComecarUmEnvio();
    envios.push({ jobId, lang: corpo.lang, entries: corpo.entries || [], corpo, criadoCom: corpo, createdAt: estado.agora().toISOString(), state: novoEstado({ jobId }) });
    return { status: 201, json: { jobId, status: 'queued' } };
  }

  const listarEnvios = () => ({ jobs: envios.map(e => ({ jobId: e.jobId, lang: e.lang, status: e.state.status, createdAt: e.createdAt, updatedAt: e.state.updatedAt, state: e.state })) });

  function apagarAsFrases() {
    for (const envio of envios) {
      envio.corpo = { ...envio.corpo, entries: envio.corpo.entries.map(({ line, ...entrada }) => entrada) };
      envio.entries = envio.corpo.entries;
      if (envio.state.wiped) continue;
      const parou = ['queued', 'running'].includes(envio.state.status);
      envio.state = { ...envio.state, wiped: true, ...(parou ? { status: 'failed', stage: 'failed', lastError: 'frases_apagadas', progress: {} } : {}), updatedAt: estado.agora().toISOString() };
    }
  }

  const linhasDosCustos = corpo => linhasDosCustosDaFila({ definidas: estado.custos, envios, registrosDeCusto: estado.registrosDeCusto }, corpo);

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

  function retomarEnvio(jobId) {
    const linha = estado.custos?.find(l => l.jobId === jobId);
    if (linha) {
      linha.status = 'queued';
      linha.stage = 'queued';
      return { status: 200, json: { jobId, status: 'queued' } };
    }
    const envio = envios.find(e => e.jobId === jobId);
    if (!envio) return erroDoContrato('/jobs/retry', 'job_not_found');
    if (envio.state.wiped) return erroDoContrato('/jobs/retry', 'job_wiped');
    if (['queued', 'running'].includes(envio.state.status)) return { status: 200, json: { jobId, status: envio.state.status } };
    const cards = Object.fromEntries(Object.entries(envio.state.cards || {}).map(([stem, cartao]) =>
      [stem, cartao.status === 'failed' ? { ...cartao, status: 'pending', error: null } : cartao]));
    envio.state = { ...envio.state, status: 'queued', stage: 'queued', progress: {}, lastError: null, cards, updatedAt: estado.agora().toISOString() };
    return { status: 200, json: { jobId, status: 'queued' } };
  }

  const doEnvio = ['/jobs', '/jobs/list', '/jobs/get', '/jobs/retry', '/jobs/debug-bundle', '/jobs/apagar-frases', '/analytics/jobs'];
  const pedidoDoEnvio = dados => dados || {};

  const rotas = [
    rotaSe(({ req, url }) => doEnvio.includes(url.pathname) && req.method() !== 'POST', ({ responder }) => responder(404, { error: 'not_found' })),
    rota('*', '/analytics/jobs', ({ dados, route, responder }) => {
      const falha = estado.falhaDosCustos;
      if (falha?.rede) return route.abort('connectionrefused');
      if (falha) return responder(falha.status, { error: 'analytics_unavailable' });
      return responder(200, { jobs: linhasDosCustos(pedidoDoEnvio(dados)) });
    }),
    rota('*', '/jobs', ({ req, route, responder }) => {
      const resposta = criarEnvio(req);
      if (resposta.abortar) return route.abort('connectionrefused');
      if (estado.perdaDoEnvio) {
        estado.perdaDoEnvio = false;
        return route.abort('connectionreset');
      }
      return responder(resposta.status, resposta.json);
    }),
    rota('*', '/jobs/list', ({ responder }) => responder(200, listarEnvios())),
    rota('*', '/jobs/apagar-frases', ({ responder }) => {
      apagarAsFrases();
      return responder(200, { ok: true });
    }),
    rotaSe(({ url, dados }) => doEnvio.includes(url.pathname) && typeof pedidoDoEnvio(dados).jobId !== 'string', ({ url, responder }) => {
      const { status, json } = erroDoContrato(url.pathname, 'invalid_job_id');
      return responder(status, json);
    }),
    rota('*', '/jobs/get', ({ dados, responder }) => {
      const envio = envios.find(e => e.jobId === pedidoDoEnvio(dados).jobId);
      if (!envio) {
        const { status, json } = erroDoContrato('/jobs/get', 'job_not_found');
        return responder(status, json);
      }
      return responder(200, { job: pedidoGuardado(envio), state: envio.state });
    }),
    rota('*', '/jobs/retry', ({ dados, responder }) => {
      const { status, json } = retomarEnvio(pedidoDoEnvio(dados).jobId);
      return responder(status, json);
    }),
    rota('*', '/jobs/debug-bundle', ({ dados, responder }) => {
      const { status, json } = pacoteDeDiagnostico(pedidoDoEnvio(dados).jobId);
      return responder(status, json);
    }),
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
      for (const { job, state, custos } of fila) {
        const { createdAt, ...corpo } = JSON.parse(JSON.stringify(job));
        envios.push({ jobId: job.jobId, lang: job.lang, entries: job.entries, corpo, createdAt, state: JSON.parse(JSON.stringify(state)) });
        estado.registrosDeCusto.set(job.jobId, custos);
      }
    },
    falharCustos(falha = { status: 503 }) { estado.falhaDosCustos = falha; },
    voltarCustos() { estado.falhaDosCustos = null; },
    falharApagarFrases(falha = { rede: true }) { estado.falhaDoApagarFrases = falha; },
    voltarApagarFrases() { estado.falhaDoApagarFrases = null; },

    recusarEnvios(lang, recusa = { status: 500 }) { estado.recusas.set(lang, recusa); },
    perderARespostaDoEnvio() { estado.perdaDoEnvio = true; },
    receberEnvio(corpo) {
      envios.push({ jobId: corpo.jobId, lang: corpo.lang, entries: corpo.entries, corpo, createdAt: estado.agora().toISOString(), state: novoEstado({ jobId: corpo.jobId }) });
      paraAFila.push({ criar: corpo });
    },
    mudancasParaAFila() { return paraAFila.splice(0, paraAFila.length); },
    aceitarEnvios(lang) { estado.recusas.delete(lang); },
    perdeuAResposta() { estado.perdaDoEnvio = false; },
    espelharEnvios(daReal) {
      envios.splice(0, envios.length, ...daReal.map(({ jobId, lang, corpo, createdAt, state }) => ({ jobId, lang, entries: corpo.entries, corpo, createdAt, state })));
    },

    /** @estado-guardado Os Envios criados de um idioma, na ordem. */
    enviosEm(lang) { return envios.filter(e => e.lang === lang); },

    moverEnvio(jobId, { stage, progress = {}, atualizadoEm, esperando, cartoes } = {}) {
      const envio = acharEnvio(jobId);
      if (envio.state.status === 'queued' && esperando) paraAFila.push({ mudar: { jobId, state: { ...envio.state, status: 'running', stage } } });
      envio.state = {
        ...envio.state,
        status: 'running',
        stage,
        progress,
        waiting: esperando,
        ...(cartoes && { cards: cartoesDoEstado(jobId, cartoes) }),
        updatedAt: (atualizadoEm || estado.agora()).toISOString(),
      };
      mudou(envio);
    },

    concluirEnvio(jobId, { duplicadas = [], falhas = [], erro, ankiError = null } = {}) {
      const envio = acharEnvio(jobId);
      if (envio.state.status === 'queued') paraAFila.push({ mudar: { jobId, state: { ...envio.state, status: 'running', stage: 'generate_cards' } } });
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
        waiting: undefined,
        ankiError,
        updatedAt: estado.agora().toISOString(),
      };
      mudou(envio);
    },
  };

  return { envios, rotas, api };
}

module.exports = { criarRotasDoEnvio };
