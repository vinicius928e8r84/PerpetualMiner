'use strict';

const { responderJson } = require('./http');
const { criarFakeChatGPT } = require('./chatgpt');
const { criarFakeVoz } = require('./voz');
const { criarFakeFrente } = require('./frente');
const { rotaSe } = require('./rota');
const { criarPerfis } = require('./perfis');
const { criarLimiteDoPlano } = require('./limite-do-plano');
const { criarModelo } = require('./modelo-dos-cartoes');
const { criarTeto } = require('./teto');
const { criarAtualizacao } = require('./atualizacao');
const { criarPrevia } = require('./previa');
const { diferencaDoContrato } = require('./diferenca-do-contrato');
const { criarPareamento } = require('./pareamento');
const contrato = require('../../complemento/contrato/carregar');
const { criarRespostaDoContrato, erroDoContrato, exemploDaExtensao } = require('./resposta-do-contrato');
const { criarRotasDaSaude } = require('./rotas-da-saude');
const { criarRotasDaChave } = require('./rotas-da-chave');
const { criarRotasDosServicos } = require('./rotas-dos-servicos');
const { criarRotasDaLeitura } = require('./rotas-da-leitura');
const { colecaoDoMundo } = require('./baralhos');
const { criarRotasDoEnvio } = require('./rotas-do-envio');

// Fake da Conexão com o Anki: responde na porta dela (127.0.0.1:8766), ligada e com vocabulário vazio. Um teste a desliga ou responde uma rota com `responder`.
//
// O que o complemento responde vem de `complemento/contrato/exemplos.json` (e dos `exemplos-*.json`), o mesmo que os testes do complemento leem: o
// fake responde o exemplo do pedido no contexto em que a Conexão está (`abrirPerfil`, `abrirColecao`, `responderOpenAI`…). Os testes de tela montam os
// Baralhos em termos de gente. Rota nova: `contrato/LEIA-ME.md`. À parte: o
// perfil fixo (`perfis.js`), o login do ChatGPT (`chatgpt.js`), o limite do plano (`limite-do-plano.js`), o modelo (`modelo-dos-cartoes.js`), o teto
// (`teto.js`) e a prévia do Cartão e o Abrir no Anki (`previa.js`).
//
// Os Baralhos pedidos voltam na ordem pedida; o que o Anki não tem, `missing`. A chave da OpenAI aceita fica em `chaveNaConexao()`.

function dadosDoCorpo(corpo) {
  try {
    return corpo ? JSON.parse(corpo) : null;
  } catch {
    return null;
  }
}

const PERFIL_DE_SEMPRE = 'Usuário 1';

function criarFakeAnki() {
  const estado = {
    ligada: true,
    vocabulario: { en: [], ru: [] },
    decksDoVocabulario: new Map(),
    rotas: new Map(),
    recusas: new Map(),
    agora: () => new Date(),
    custos: null,
    registrosDeCusto: new Map(),
    falhaDosCustos: null,
    falhaDoApagarFrases: null,
    baralhos: {},
    falhaDosBaralhos: null,
    falhaDoVocabulario: null,
    baralhosDoAnki: null,
    contexto: { perfil: PERFIL_DE_SEMPRE, falhaNoPerfil: false, openai: 'aceita', itemDeLogin: 'desligado', firebase: 0 },
    versaoDaChave: 0,
    contaDaChave: '',
    horaDaChave: 0,
    chaveNaoEnviada: false,
    google: null,
    filaDaChave: Promise.resolve(),
    chaveDaOpenAI: null,
  };
  const pareamento = criarPareamento({ agora: () => estado.agora() });
  pareamento.parear('primeiro');
  const requisicoes = [];
  const chatgpt = criarFakeChatGPT();
  const voz = criarFakeVoz();
  const perfis = criarPerfis(() => estado.contexto);
  const teto = criarTeto({ registros: () => [...estado.registrosDeCusto.values()].flat(), linhas: () => estado.custos, agora: () => estado.agora() });
  const mudarContexto = campos => { estado.contexto = { ...estado.contexto, ...campos }; };
  const atualizacao = criarAtualizacao({
    contextoDeAgora: () => estado.contexto, mudarContexto, desligar: () => { estado.ligada = false; }, ligar: () => { estado.ligada = true; },
  });
  const previa = criarPrevia({ contexto: () => estado.contexto, exemplos: () => contrato.exemplos });
  const frente = criarFakeFrente({ contrato, erro: erroDoContrato, colecao: () => estado.contexto.colecao });
  const { contextoDeAgora, respostaDoContrato } = criarRespostaDoContrato({ estado, chatgpt, voz, grupos: () => [perfis, modelo, teto, previa, frente] });
  const modelo = criarModelo(() => contextoDeAgora());
  const { envios, rotas: rotasDoEnvio, api: apiDoEnvio } = criarRotasDoEnvio({ estado, modelo });
  const limite = criarLimiteDoPlano({ envios, chaveGuardada: () => estado.chaveDaOpenAI, erro: erroDoContrato });
  const { rotas: rotasDaChave, api: apiDaChave } = criarRotasDaChave({ estado, respostaDoContrato });
  const { rotas: rotasDosServicos, api: apiDosServicos } = criarRotasDosServicos({ estado, chatgpt, voz, respostaDoContrato });
  const { rotas: rotasDaLeitura, api: apiDaLeitura } = criarRotasDaLeitura({ estado, contrato, respostaDoContrato });

  const rotaPersonalizada = rotaSe(({ req, url }) => Boolean(estado.rotas.get(`${req.method()} ${url.pathname}`)), async ({ req, url, route }) => {
    const { status = 200, json = {} } = await estado.rotas.get(`${req.method()} ${url.pathname}`)(req, url);
    return responderJson(route, status, json);
  });

  const rotaDosGrupos = ({ req, url, dados, responder }) => {
    const doGrupo = [perfis, limite, modelo, teto, previa, frente].reduce((achou, rotas) => achou || rotas.responder(req.method(), url.pathname, dados), null);
    return doGrupo ? { feito: responder(doGrupo.status, doGrupo.json) } : undefined;
  };

  const tabelaDeRotas = [
    rotaPersonalizada,
    ...criarRotasDaSaude({ atualizacao, perfis, respostaDoContrato }),
    ...rotasDaChave,
    ...rotasDosServicos,
    rotaDosGrupos,
    ...rotasDaLeitura,
    ...rotasDoEnvio,
  ];

  function naFrente(req, url) {
    const corpoDoPedido = req.postData();
    if (!url.pathname.startsWith('/pareamento/')) requisicoes.push({ metodo: req.method(), caminho: url.pathname, busca: url.search, corpo: corpoDoPedido, dados: dadosDoCorpo(corpoDoPedido) });
    if (!estado.ligada) return { recusar: true };
    if (estado.muda === true || estado.muda === url.pathname) return { calar: true };
    const roteiro = estado.rotas.get(`${req.method()} ${url.pathname}`);
    if (roteiro) return { roteiro };
    const [falha, codigo] = { '/anki/vocabulary': [estado.falhaDoVocabulario, 'anki_vocabulary_unavailable'], '/anki/stats/decks': [estado.falhaDosBaralhos, 'anki_stats_unavailable'] }[url.pathname] || [];
    if (falha?.rede) return { recusar: true };
    if (falha) return { roteiro: () => ({ status: falha.status, json: { error: codigo, detail: 'collection_not_open' } }) };
    if (url.pathname === '/jobs/apagar-frases' && estado.falhaDoApagarFrases?.rede) return { recusar: true };
    if (req.method() === 'POST' && url.pathname === '/jobs') {
      const recusa = estado.recusas.get((dadosDoCorpo(corpoDoPedido) || {}).lang);
      if (recusa?.rede) return { recusar: true };
      if (recusa) return { roteiro: () => ({ status: recusa.status, json: { error: recusa.erro || 'job_failed' } }) };
    }
    if (estado.vocabularioDefinido && req.method() === 'POST' && url.pathname === '/anki/vocabulary') {
      const { deck = '', lang } = dadosDoCorpo(corpoDoPedido) || {};
      estado.decksDoVocabulario.set(deck, lang === 'ru' ? 'ru' : 'en');
    }
    const mundo = mundoDaReal();
    const perder = Boolean(estado.perdaDoEnvio) && req.method() === 'POST' && url.pathname === '/jobs';
    const fila = apiDoEnvio.mudancasParaAFila();
    return { ...(mundo && { mundo }), ...(perder && { perder }), ...(fila.length && { fila }) };
  }

  function mundoDaReal() {
    const { colecao } = estado.contexto;
    const perfil = perfis.aberto() ?? null;
    const daLista = perfis.paraAReal();
    if (!estado.vocabularioDefinido && !estado.baralhosDoAnki && colecao === undefined && perfil === PERFIL_DE_SEMPRE && !daLista) return null;
    const mundo = {
      perfil,
      ...(daLista && { perfis: daLista }),
      colecao: colecaoDoMundo({
        doContrato: colecao === undefined ? null : contrato.colecoes[colecao], baralhosDoAnki: estado.baralhosDoAnki,
        vocabularios: [...estado.decksDoVocabulario].map(([nome, idioma]) => [nome, estado.vocabulario[idioma]]),
      }),
    };
    const descrito = JSON.stringify(mundo);
    if (descrito === estado.mundoNaReal) return null;
    estado.mundoNaReal = descrito;
    return mundo;
  }

  async function tratar(daPorta) {
    const req = daPorta.request();
    const url = new URL(req.url());
    const corpoDoPedido = req.postData();
    const doPareamento = url.pathname.startsWith('/pareamento/');
    if (doPareamento) pareamento.tentou(url.pathname);

    const frente = naFrente(req, url);
    if (frente.recusar) return daPorta.abort('connectionrefused');
    if (frente.calar) return new Promise(() => {});
    if (doPareamento) {
      const { status, json } = pareamento.responder(req.method(), url.pathname, dadosDoCorpo(corpoDoPedido)) || { status: 404, json: { error: 'not_found' } };
      return responderJson(daPorta, status, json);
    }
    let route = daPorta;
    if (req.method() !== 'GET' || !['/health', '/auth/callback'].includes(url.pathname)) {
      const assinou = pareamento.verificar(req, url.pathname);
      if (assinou.erro) return responderJson(daPorta, 401, { error: assinou.erro });
      route = pareamento.comProva(daPorta, assinou);
    }

    const pedido = { req, url, route, corpoDoPedido, dados: dadosDoCorpo(corpoDoPedido), responder: (status, json) => responderJson(route, status, json) };
    for (const tentar of tabelaDeRotas) {
      const resposta = tentar(pedido);
      if (resposta) return resposta.feito;
    }
    return responderJson(route, 404, { error: 'not_found' });
  }

  const chegaramNaPortaDeTeste = [];

  function responderNaPortaDeTeste(url, req, res) {
    chegaramNaPortaDeTeste.push(`${req.method} ${url.pathname}${url.search}`);
    if (req.method !== 'GET' || url.pathname !== '/auth/callback') return false;
    requisicoes.push({ metodo: req.method, caminho: url.pathname, busca: url.search, corpo: null, dados: null });
    if (!estado.ligada) return false;
    chatgpt.responderRetornoNaPortaDeTeste(url, res);
    return true;
  }

  return {
    padrao: /^http:\/\/(127\.0\.0\.1|localhost):8766\//,
    tratar,
    naFrente,
    responderNaPortaDeTeste,
    chegaramNaPortaDeTeste,
    requisicoes,
    pareamento,
    chatgpt,
    modelo,
    teto,
    atualizacao,
    voz,
    previa,
    frente,
    /** @estado-guardado Os Envios que a Conexão guardou (um por `POST /jobs`), não o pedido que chegou. */
    envios,
    ...apiDoEnvio,
    ...apiDaChave,
    ...apiDosServicos,
    ...apiDaLeitura,
    definirAtualizacao({ atualizacao: guardada, ankiweb } = {}) { mudarContexto({ atualizacao: guardada, ankiweb }); },
    desligar() { estado.ligada = false; },
    ligar() { estado.ligada = true; },
    abrirPerfil(perfil) { estado.contexto = { ...estado.contexto, perfil }; },
    definirPerfis: perfis.definir,
    espelharPerfis: perfis.espelhar,
    /** @estado-guardado O perfil que a Conexão tem marcado (`null`: nenhum ainda). */
    perfilMarcado: perfis.marcado,
    /** @estado-guardado O perfil que o Anki tem aberto (`null`: a tela de perfis). */
    perfilAberto: perfis.aberto,
    falharAEscolhaDoPerfil: perfis.falharAEscolha,
    abrirColecao(nome) { estado.contexto = { ...estado.contexto, colecao: nome }; },
    /** O complemento não consegue ler o perfil: a saúde responde o erro interno do contrato. */
    falharLeituraDoPerfil() { estado.contexto = { ...estado.contexto, falhaNoPerfil: true }; },
    responderOpenAI(comportamento) { estado.contexto = { ...estado.contexto, openai: comportamento }; },
    respostaDoContrato,
    silenciar(caminho = true) { estado.muda = caminho; },
    voltarAFalar() { estado.muda = false; },
    responder(metodo, caminho, gerar) { estado.rotas.set(`${metodo} ${caminho}`, gerar); },
    pararDeResponder(metodo, caminho) { estado.rotas.delete(`${metodo} ${caminho}`); },

    usarRelogio(agora) { estado.agora = agora; },

    /** @estado-guardado Os `guid` abertos no Anki (#173). */
    abertosNoAnki() { return [...previa.abertos]; },
  };
}

module.exports = { criarFakeAnki, exemploDaExtensao, diferencaDoContrato };
