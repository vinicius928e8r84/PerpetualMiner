'use strict';

const { responderJson } = require('./http');

// Fake da Conexão com o Anki: responde na porta local dela (127.0.0.1:8766).
// Por padrão está ligada, com vocabulário vazio. Um teste pode desligá-la
// (conexão recusada, como quando o programa não está rodando) ou responder
// uma rota específica com `responder`.
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

  function retomarEnvio(jobId) {
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
      const lang = url.searchParams.get('lang') === 'ru' ? 'ru' : 'en';
      const words = estado.vocabulario[lang].map(word => (typeof word === 'string' ? { word, status: 'mature' } : word));
      return responderJson(route, 200, { words });
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
    definirVocabulario(lang, palavras) { estado.vocabulario[lang] = palavras; },
    responder(metodo, caminho, gerar) { estado.rotas.set(`${metodo} ${caminho}`, gerar); },
    pararDeResponder(metodo, caminho) { estado.rotas.delete(`${metodo} ${caminho}`); },

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

module.exports = { criarFakeAnki };
