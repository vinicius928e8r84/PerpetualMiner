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

function criarFakeAnki() {
  const estado = {
    ligada: true,
    vocabulario: { en: [], ru: [] },
    rotas: new Map(), // 'GET /caminho' → (req, url) => ({ status, json })
    recusas: new Map(), // lang → { status } | { rede: true }, para o próximo POST /jobs
    agora: () => new Date(),
    custos: null, // as linhas de POST /analytics/jobs que o teste definiu (definirCustos); null: as dos Envios da fila
    registrosDeCusto: new Map(), // jobId → os registros de custo do Envio (os da fila do contrato)
    falhaDosCustos: null, // { status } | { rede: true }: POST /analytics/jobs falha
    falhaDoApagarFrases: null, // { rede: true }: POST /jobs/apagar-frases não tem resposta
    baralhos: {}, // deckName → os números do baralho (definirBaralho)
    fonteDosBaralhos: 'colecao', // 'collection.anki2': lidos do arquivo local (BRG-13)
    lidoDoArquivo: false, // a Conexão responde lendo o arquivo do Anki: baralhos e vocabulário vêm de `collection.anki2`
    processosDoAnki: 1, // GET /anki/status: quantos processos do Anki a Conexão vê (0: o Anki está fechado)
    falhaDosBaralhos: null, // { status } | { rede: true }: POST /anki/stats/decks falha
    falhaDoVocabulario: null, // { status } | { rede: true }: POST /anki/vocabulary falha
    baralhosDoAnki: null, // os nomes de POST /anki/decks; null: a lista não vem (definirBaralhosDoAnki)
    contexto: { perfil: 'Usuário 1', falhaNoPerfil: false, openai: 'aceita', itemDeLogin: 'desligado', firebase: 0 }, // o `contexto` dos exemplos; `colecao` só existe depois de `abrirColecao`
    versaoDaChave: 0,
    contaDaChave: '',
    horaDaChave: 0,
    chaveNaoEnviada: false,
    google: null,
    filaDaChave: Promise.resolve(),
    chaveDaOpenAI: null, // a cópia da chave que a Conexão guarda (a inteira: só o teste a vê)
  };
  const pareamento = criarPareamento({ agora: () => estado.agora() }); // os navegadores pareados e o código que o Anki mostra (#192)
  pareamento.parear('primeiro'); // a Conexão do teste já conhece o primeiro navegador de teste; `pareamento.desconectar()` a deixa como a de quem nunca se pareou
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
  const frente = criarFakeFrente({ contrato, erro: erroDoContrato, colecao: () => estado.contexto.colecao }); // a frente do Cartão (#166)
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

  async function tratar(daPorta) {
    const req = daPorta.request();
    const url = new URL(req.url());
    const corpoDoPedido = req.postData();
    // `dados`: o corpo JSON enviado, ou null; o pareamento (#192) tem o registro dele.
    const doPareamento = url.pathname.startsWith('/pareamento/');
    if (doPareamento) pareamento.tentou(url.pathname); else requisicoes.push({ metodo: req.method(), caminho: url.pathname, busca: url.search, corpo: corpoDoPedido, dados: dadosDoCorpo(corpoDoPedido) });

    if (!estado.ligada) return daPorta.abort('connectionrefused');
    // A porta aceita e não responde: o pedido fica no ar até a página desistir.
    if (estado.muda === true || estado.muda === url.pathname) return new Promise(() => {});
    if (doPareamento) {
      const { status, json } = pareamento.responder(req.method(), url.pathname, dadosDoCorpo(corpoDoPedido)) || { status: 404, json: { error: 'not_found' } };
      return responderJson(daPorta, status, json);
    }
    // O porteiro (#192): abertos, a saúde, o login e o `/anki/status` da ponte antiga; o resto, assinado, e a resposta leva a prova.
    let route = daPorta;
    if (req.method() !== 'GET' || !['/health', '/auth/callback', '/anki/status'].includes(url.pathname)) {
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

  return {
    padrao: /^http:\/\/(127\.0\.0\.1|localhost):8766\//,
    tratar,
    requisicoes,
    /** O pareamento (#192, `pareamento.js`): `codigoNoAnki()`, `desconectar()`, `vencerOCodigo()`, `recebidos()`, `pareados()`. */
    pareamento,
    chatgpt,
    /** O modelo dos cartões (#157, `modelo-dos-cartoes.js`): `definir(cenario)`, `passarOTempoAte(dia)`, `guardado()`. */
    modelo,
    /** O teto do mês (#160): `definir({ limite, gasto })`, `passarOTempoAte(dia)`, `guardado()`. */
    teto,
    /** A atualização da Conexão pelo AnkiWeb (#177, `atualizacao.js`): `definir({ versao, versaoNova })`, `reinicios()`; o contexto: `definirAtualizacao`. */
    atualizacao,
    voz,
    previa,
    /** A frente do Cartão (#166, `frente.js`): `mexerNoTipoDeNota(lang)`, `guardadas()`. */
    frente,
    /** @estado-guardado Os Envios que a Conexão guardou (um por `POST /jobs`), não o pedido que chegou. */
    envios,
    ...apiDoEnvio,
    ...apiDaChave,
    ...apiDosServicos,
    ...apiDaLeitura,
    /** O que a Conexão tem guardado da atualização (`instalada`, `falhou`, `atualizada`) e como o AnkiWeb responde ao Atualizar agora (`com_versao_nova`, `sem_versao_nova`, `recusa`), como no contexto dos exemplos. */
    definirAtualizacao({ atualizacao: guardada, ankiweb } = {}) { mudarContexto({ atualizacao: guardada, ankiweb }); },
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
    falharLeituraDoPerfil() { estado.contexto = { ...estado.contexto, falhaNoPerfil: true }; },
    /** Como a OpenAI responde à conferência de uma chave: o `openai` dos exemplos (aceita, recusa, sem_credito, limite_de_uso…). */
    responderOpenAI(comportamento) { estado.contexto = { ...estado.contexto, openai: comportamento }; },
    /** As respostas do contrato a um pedido (com o corpo, se tiver), para o teste que confere o fake contra os exemplos. */
    respostaDoContrato,
    /** A porta aceita e não responde; com `caminho`, só nele. */
    silenciar(caminho = true) { estado.muda = caminho; },
    voltarAFalar() { estado.muda = false; },
    responder(metodo, caminho, gerar) { estado.rotas.set(`${metodo} ${caminho}`, gerar); },
    pararDeResponder(metodo, caminho) { estado.rotas.delete(`${metodo} ${caminho}`); },

    /** O relógio da Conexão, para o `updatedAt`. */
    usarRelogio(agora) { estado.agora = agora; },

    /** @estado-guardado Os `guid` abertos no Anki (#173). */
    abertosNoAnki() { return [...previa.abertos]; },
  };
}

module.exports = { criarFakeAnki, exemploDaExtensao, diferencaDoContrato };
