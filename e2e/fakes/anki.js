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
const NAO_ACHADO = { status: 404, json: { error: 'not_found' } };
const SEM_ASSINATURA = ['/health', '/auth/callback'];
const FALHAS_DA_LEITURA = new Map([
  ['/anki/vocabulary', ['falhaDoVocabulario', 'anki_vocabulary_unavailable']],
  ['/anki/stats/decks', ['falhaDosBaralhos', 'anki_stats_unavailable']],
]);

function estadoInicial() {
  return {
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
    paraAReal: [],
  };
}

function criarPartes(estado) {
  const pareamento = criarPareamento({ agora: () => estado.agora() });
  pareamento.parear('primeiro');
  const chatgpt = criarFakeChatGPT({ paraAReal: comando => estado.paraAReal.push(comando) });
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
  const envio = criarRotasDoEnvio({ estado, modelo });
  const limite = criarLimiteDoPlano({ envios: envio.envios, chaveGuardada: () => estado.chaveDaOpenAI, erro: erroDoContrato });
  return {
    pareamento, chatgpt, voz, perfis, teto, mudarContexto, atualizacao, previa, frente, respostaDoContrato, modelo, envio, limite,
    chave: criarRotasDaChave({ estado, respostaDoContrato }),
    servicos: criarRotasDosServicos({ estado, chatgpt, voz, respostaDoContrato }),
    leitura: criarRotasDaLeitura({ estado, contrato, respostaDoContrato }),
  };
}

const chaveDaRota = (req, url) => `${req.method()} ${url.pathname}`;

const rotaPersonalizada = estado => rotaSe(({ req, url }) => Boolean(estado.rotas.get(chaveDaRota(req, url))), async ({ req, url, route }) => {
  const { status = 200, json = {} } = await estado.rotas.get(chaveDaRota(req, url))(req, url);
  return responderJson(route, status, json);
});

const rotaDosGrupos = grupos => ({ req, url, dados, responder }) => {
  const doGrupo = grupos.reduce((achou, rotas) => achou || rotas.responder(req.method(), url.pathname, dados), null);
  return doGrupo ? { feito: responder(doGrupo.status, doGrupo.json) } : undefined;
};

function criarTabelaDeRotas(estado, partes) {
  const { atualizacao, perfis, respostaDoContrato, limite, modelo, teto, previa, frente } = partes;
  return [
    rotaPersonalizada(estado),
    ...criarRotasDaSaude({ atualizacao, perfis, respostaDoContrato }),
    ...partes.chave.rotas,
    ...partes.servicos.rotas,
    rotaDosGrupos([perfis, limite, modelo, teto, previa, frente]),
    ...partes.leitura.rotas,
    ...partes.envio.rotas,
  ];
}

const recusar = () => ({ recusar: true });
const ehDoPareamento = caminho => caminho.startsWith('/pareamento/');
const ehCriacaoDeEnvio = ({ metodo, caminho }) => metodo === 'POST' && caminho === '/jobs';
const ehPedidoDoVocabulario = ({ metodo, caminho }) => metodo === 'POST' && caminho === '/anki/vocabulary';

function pedidoDe(req, url) {
  const corpo = req.postData();
  return { metodo: req.method(), caminho: url.pathname, busca: url.search, corpo, dados: dadosDoCorpo(corpo) };
}

function paradaDaFalha(falha, roteiro) {
  if (!falha) return null;
  return falha.rede ? recusar() : { roteiro };
}

const desligada = estado => (estado.ligada ? null : recusar());
const calada = (estado, { caminho }) => (estado.muda === true || estado.muda === caminho ? { calar: true } : null);

function roteiroDoTeste(estado, { metodo, caminho }) {
  const roteiro = estado.rotas.get(`${metodo} ${caminho}`);
  return roteiro ? { roteiro } : null;
}

function falhaDaLeitura(estado, { caminho }) {
  if (!FALHAS_DA_LEITURA.has(caminho)) return null;
  const [campo, codigo] = FALHAS_DA_LEITURA.get(caminho);
  const falha = estado[campo];
  return paradaDaFalha(falha, () => ({ status: falha.status, json: { error: codigo, detail: 'collection_not_open' } }));
}

const apagarFrasesSemRede = (estado, { caminho }) => caminho === '/jobs/apagar-frases' && Boolean(estado.falhaDoApagarFrases?.rede);
const falhaDoApagarFrases = (estado, pedido) => (apagarFrasesSemRede(estado, pedido) ? recusar() : null);

function recusaDoEnvio(estado, pedido) {
  if (!ehCriacaoDeEnvio(pedido)) return null;
  const recusa = estado.recusas.get((pedido.dados || {}).lang);
  return paradaDaFalha(recusa, () => ({ status: recusa.status, json: { error: recusa.erro || 'job_failed' } }));
}

const PARADAS_NA_FRENTE = [desligada, calada, roteiroDoTeste, falhaDaLeitura, falhaDoApagarFrases, recusaDoEnvio];
const paradaNaFrente = (estado, pedido) => PARADAS_NA_FRENTE.reduce((parada, parar) => parada || parar(estado, pedido), null);

function anotarODeckDoVocabulario(estado, pedido) {
  if (!estado.vocabularioDefinido || !ehPedidoDoVocabulario(pedido)) return;
  const { deck = '', lang } = pedido.dados || {};
  estado.decksDoVocabulario.set(deck, lang === 'ru' ? 'ru' : 'en');
}

const colecaoDeSempre = (estado, colecao) => !estado.vocabularioDefinido && !estado.baralhosDoAnki && colecao === undefined;
const perfilDeSempre = (perfil, daLista) => perfil === PERFIL_DE_SEMPRE && !daLista;

function colecaoParaAReal(estado) {
  const { colecao } = estado.contexto;
  return colecaoDoMundo({
    doContrato: colecao === undefined ? null : contrato.colecoes[colecao], baralhosDoAnki: estado.baralhosDoAnki,
    vocabularios: [...estado.decksDoVocabulario].map(([nome, idioma]) => [nome, estado.vocabulario[idioma]]),
  });
}

function mundoAindaNaoEnviado(estado, mundo) {
  const descrito = JSON.stringify(mundo);
  if (descrito === estado.mundoNaReal) return null;
  estado.mundoNaReal = descrito;
  return mundo;
}

function mundoDaReal(estado, perfis) {
  const perfil = perfis.aberto() ?? null;
  const daLista = perfis.paraAReal();
  if (colecaoDeSempre(estado, estado.contexto.colecao) && perfilDeSempre(perfil, daLista)) return null;
  return mundoAindaNaoEnviado(estado, { perfil, ...(daLista && { perfis: daLista }), colecao: colecaoParaAReal(estado) });
}

function oQueVaiParaAReal(estado, perfis, pedido) {
  const mundo = mundoDaReal(estado, perfis);
  const perder = Boolean(estado.perdaDoEnvio) && ehCriacaoDeEnvio(pedido);
  const fila = estado.paraAReal.splice(0, estado.paraAReal.length);
  return { ...(mundo && { mundo }), ...(perder && { perder }), ...(fila.length && { fila }) };
}

function naFrenteDoFake({ estado, perfis, requisicoes }, req, url) {
  const pedido = pedidoDe(req, url);
  if (!ehDoPareamento(pedido.caminho)) requisicoes.push({ ...pedido });
  const parada = paradaNaFrente(estado, pedido);
  if (parada) return parada;
  anotarODeckDoVocabulario(estado, pedido);
  return oQueVaiParaAReal(estado, perfis, pedido);
}

const precisaDeAssinatura = (req, url) => req.method() !== 'GET' || !SEM_ASSINATURA.includes(url.pathname);

function responderOPareamento(pareamento, daPorta, req, url) {
  const { status, json } = pareamento.responder(req.method(), url.pathname, dadosDoCorpo(req.postData())) || NAO_ACHADO;
  return responderJson(daPorta, status, json);
}

function rotaAssinada(pareamento, daPorta, req, url) {
  if (!precisaDeAssinatura(req, url)) return { route: daPorta };
  const assinou = pareamento.verificar(req, url.pathname);
  return assinou.erro ? { erro: assinou.erro } : { route: pareamento.comProva(daPorta, assinou) };
}

function responderPelaTabela(tabelaDeRotas, pedido) {
  for (const tentar of tabelaDeRotas) {
    const resposta = tentar(pedido);
    if (resposta) return resposta.feito;
  }
  return pedido.responder(NAO_ACHADO.status, NAO_ACHADO.json);
}

async function tratarNaPorta({ pareamento, naFrente, tabelaDeRotas }, daPorta) {
  const req = daPorta.request();
  const url = new URL(req.url());
  const doPareamento = ehDoPareamento(url.pathname);
  if (doPareamento) pareamento.tentou(url.pathname);

  const frente = naFrente(req, url);
  if (frente.recusar) return daPorta.abort('connectionrefused');
  if (frente.calar) return new Promise(() => {});
  if (doPareamento) return responderOPareamento(pareamento, daPorta, req, url);
  const { erro, route } = rotaAssinada(pareamento, daPorta, req, url);
  if (erro) return responderJson(daPorta, 401, { error: erro });

  const corpoDoPedido = req.postData();
  const pedido = { req, url, route, corpoDoPedido, dados: dadosDoCorpo(corpoDoPedido), responder: (status, json) => responderJson(route, status, json) };
  return responderPelaTabela(tabelaDeRotas, pedido);
}

function responderNaPortaDeTesteDoFake({ estado, requisicoes, chegaramNaPortaDeTeste, chatgpt }, url, req, res) {
  chegaramNaPortaDeTeste.push(`${req.method} ${url.pathname}${url.search}`);
  if (req.method !== 'GET' || url.pathname !== '/auth/callback') return false;
  requisicoes.push({ metodo: req.method, caminho: url.pathname, busca: url.search, corpo: null, dados: null });
  if (!estado.ligada) return false;
  chatgpt.responderRetornoNaPortaDeTeste(url, res);
  return true;
}

function controlesDoContexto(estado, { perfis, mudarContexto }) {
  return {
    definirAtualizacao({ atualizacao: guardada, ankiweb } = {}) { mudarContexto({ atualizacao: guardada, ankiweb }); },
    desligar() { estado.ligada = false; },
    ligar() { estado.ligada = true; },
    abrirPerfil(perfil) { mudarContexto({ perfil }); },
    definirPerfis: perfis.definir,
    espelharPerfis: perfis.espelhar,
    /** @estado-guardado O perfil que a Conexão tem marcado (`null`: nenhum ainda). */
    perfilMarcado: perfis.marcado,
    /** @estado-guardado O perfil que o Anki tem aberto (`null`: a tela de perfis). */
    perfilAberto: perfis.aberto,
    falharAEscolhaDoPerfil: perfis.falharAEscolha,
    abrirColecao(nome) { mudarContexto({ colecao: nome }); },
    falharLeituraDoPerfil() { mudarContexto({ falhaNoPerfil: true }); },
    responderOpenAI(comportamento) { mudarContexto({ openai: comportamento }); },
  };
}

function controlesDasRotas(estado) {
  return {
    silenciar(caminho = true) { estado.muda = caminho; },
    voltarAFalar() { estado.muda = false; },
    responder(metodo, caminho, gerar) { estado.rotas.set(`${metodo} ${caminho}`, gerar); },
    pararDeResponder(metodo, caminho) { estado.rotas.delete(`${metodo} ${caminho}`); },
    usarRelogio(agora) { estado.agora = agora; },
  };
}

function criarFakeAnki() {
  const estado = estadoInicial();
  const partes = criarPartes(estado);
  const { pareamento, chatgpt, perfis, previa } = partes;
  const requisicoes = [];
  const chegaramNaPortaDeTeste = [];
  const naFrente = (req, url) => naFrenteDoFake({ estado, perfis, requisicoes }, req, url);
  const tabelaDeRotas = criarTabelaDeRotas(estado, partes);

  return {
    padrao: /^http:\/\/(127\.0\.0\.1|localhost):8766\//,
    tratar: daPorta => tratarNaPorta({ pareamento, naFrente, tabelaDeRotas }, daPorta),
    naFrente,
    responderNaPortaDeTeste: (url, req, res) => responderNaPortaDeTesteDoFake({ estado, requisicoes, chegaramNaPortaDeTeste, chatgpt }, url, req, res),
    chegaramNaPortaDeTeste,
    requisicoes,
    pareamento,
    chatgpt,
    modelo: partes.modelo,
    teto: partes.teto,
    atualizacao: partes.atualizacao,
    voz: partes.voz,
    previa,
    frente: partes.frente,
    /** @estado-guardado Os Envios que a Conexão guardou (um por `POST /jobs`), não o pedido que chegou. */
    envios: partes.envio.envios,
    ...partes.envio.api,
    ...partes.chave.api,
    ...partes.servicos.api,
    ...partes.leitura.api,
    ...controlesDoContexto(estado, partes),
    respostaDoContrato: partes.respostaDoContrato,
    ...controlesDasRotas(estado),

    /** @estado-guardado Os `guid` abertos no Anki (#173). */
    abertosNoAnki() { return [...previa.abertos]; },
  };
}

module.exports = { criarFakeAnki, exemploDaExtensao, diferencaDoContrato };
