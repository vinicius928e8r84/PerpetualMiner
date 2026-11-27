'use strict';

const assert = require('assert');
const http = require('http');
const { isDeepStrictEqual } = require('util');
const { criarFakeAnki, exemploDaExtensao, diferencaDoContrato } = require('../e2e/fakes/anki');
const { criarFakeGoogle } = require('../e2e/fakes/google');
const { cabecalhosAssinados } = require('../e2e/pareamento-de-teste');
const { PAGINA_DO_RETORNO } = require('../e2e/fakes/chatgpt');
const { subirPortaDaConexaoDeTeste, regrasQueTiramAPortaDoComputador } = require('../e2e/fakes/porta-da-conexao');

const fake = criarFakeAnki();
assert.deepStrictEqual(fake.respostaDoContrato('GET', '/health').json.perfil, 'Usuário 1');

fake.abrirPerfil('Perfil sem exemplo');
assert.throws(() => fake.respostaDoContrato('GET', '/health'), /não tem exemplo de GET \/health/);

const contrato = require('../complemento/contrato/carregar');

const semCorpo = corpo => corpo === undefined || corpo === null;
const ehOHealth = (metodo, caminho) => metodo === 'GET' && caminho === '/health';
const rotaSemAssinatura = (metodo, caminho) => ehOHealth(metodo, caminho) || caminho.startsWith('/pareamento/');

function cabecalhosDoPedido(fakeDaConexao, metodo, caminho, texto) {
  if (rotaSemAssinatura(metodo, caminho)) return {};
  const assinados = cabecalhosAssinados({ sessao: fakeDaConexao.pareamento.sessao(), metodo, caminho, corpo: texto ?? '' });
  return Object.fromEntries(Object.entries(assinados).map(([nome, valor]) => [nome.toLowerCase(), valor]));
}

async function pedirAoFake(fakeDaConexao, metodo, caminho, corpo = null) {
  let entregue = null;
  const texto = semCorpo(corpo) ? null : JSON.stringify(corpo);
  const cabecalhos = cabecalhosDoPedido(fakeDaConexao, metodo, caminho, texto);
  await fakeDaConexao.tratar({
    request: () => ({ method: () => metodo, url: () => `http://127.0.0.1:8766${caminho}`, postData: () => texto, headers: () => cabecalhos }),
    fulfill: resposta => { entregue = { status: resposta.status, json: JSON.parse(resposta.body) }; },
    abort: () => { entregue = { abortado: true }; },
  });
  return entregue;
}

const comO = (chave, preparar) => ({ quando: c => c[chave], preparar: (fake, c, google) => preparar(fake, c[chave], google) });
const sempre = preparar => ({ quando: () => true, preparar });

const guardarAChaveDoContexto = (fake, c) => fake.guardarChaveNaConexao(c.chaveNaConexao, {
  versao: c.versaoNaConexao || 0, conta: c.contaNaConexao ?? null, em: c.emNaConexao || 0, naoEnviada: c.naoEnviada ?? true });
const soARemocaoNaConexao = c => !c.chaveNaConexao && c.versaoNaConexao;

const PREPAROS_DO_CONTEXTO = [
  { quando: c => c.perfil !== undefined, preparar: (fake, c) => fake.abrirPerfil(c.perfil) },
  comO('falhaNoPerfil', fake => fake.falharLeituraDoPerfil()),
  comO('openai', (fake, openai) => fake.responderOpenAI(openai)),
  { quando: c => c.chaveNaConexao, preparar: guardarAChaveDoContexto },
  { quando: soARemocaoNaConexao, preparar: (fake, c) => fake.guardarRemocaoNaConexao(c.versaoNaConexao) },
  comO('firebase', (fake, firebase) => fake.responderFirebase(firebase)),
  { quando: c => c.cofre === 'sem_escrita', preparar: fake => fake.falharGravacaoDaChave() },
  sempre((fake, _c, google) => fake.sincronizarCom(google)),
  { quando: c => 'chaveNaNuvem' in c, preparar: (_fake, c, google) => google.gravarChaveDaOpenAI('uid-teste', { chave: c.chaveNaNuvem, em: c.emNaNuvem }) },
  { quando: c => 'colecao' in c, preparar: (fake, c) => fake.abrirColecao(c.colecao) },
  comO('itemDeLogin', (fake, item) => fake.definirItemDeLogin(item)),
  comO('fila', (fake, fila) => fake.definirFila(fila)),
  comO('chatgpt', (fake, chatgpt) => fake.chatgpt.definir(chatgpt)),
  comO('modelo', (fake, modelo) => fake.modelo.definir(modelo)),
  comO('voz', (fake, voz) => fake.voz.definir(voz)),
  { quando: c => c.atualizacao || c.ankiweb, preparar: (fake, c) => fake.definirAtualizacao({ atualizacao: c.atualizacao, ankiweb: c.ankiweb }) },
  comO('hoje', (fake, hoje) => fake.teto.passarOTempoAte(hoje)),
  comO('tetoUsd', (fake, limite) => fake.teto.definir({ limite })),
  sempre((fake, c) => fake.pareamento.definirContexto(c)),
  { quando: c => c.perfis, preparar: (fake, c) => fake.definirPerfis(c.perfis, { marcado: c.perfilMarcado ?? null, aberto: c.perfil }) },
];

function fakeNoContextoDe(exemplo) {
  const fakeDoExemplo = criarFakeAnki();
  const google = criarFakeGoogle();
  for (const { quando, preparar } of PREPAROS_DO_CONTEXTO) {
    if (quando(exemplo.contexto)) preparar(fakeDoExemplo, exemplo.contexto, google);
  }
  return { fakeDoExemplo, google };
}

function guardado({ fakeDoExemplo, google }) {
  return {
    chave: fakeDoExemplo.chaveNaConexao(), estadoDaChave: fakeDoExemplo.estadoDaChave(), item: fakeDoExemplo.itemDeLogin(),
    nuvem: google.chaveDaOpenAIDe('uid-teste'), envios: JSON.parse(JSON.stringify(fakeDoExemplo.envios)),
    chatgpt: fakeDoExemplo.chatgpt.situacao(), modelo: fakeDoExemplo.modelo.guardado(), teto: fakeDoExemplo.teto.guardado(),
    custosDosTermos: fakeDoExemplo.custosDosTermos(),
    perfilMarcado: fakeDoExemplo.perfilMarcado(), perfilAberto: fakeDoExemplo.perfilAberto(),
    pareados: [...fakeDoExemplo.pareamento.pareados()],
  };
}

async function conferirARepeticao(exemplo) {
  const contexto = fakeNoContextoDe(exemplo);
  const { metodo, caminho, corpo } = exemplo.pedido;
  const primeira = await pedirAoFake(contexto.fakeDoExemplo, metodo, caminho, corpo);
  const depoisDoPrimeiro = guardado(contexto);
  const segunda = await pedirAoFake(contexto.fakeDoExemplo, metodo, caminho, corpo);
  const igual = segunda.status === primeira.status && diferencaDoContrato(segunda.json, exemplo.resposta.json) === null;
  const intacto = isDeepStrictEqual(guardado(contexto), depoisDoPrimeiro);
  if (exemplo.repetivel === false) {
    assert.ok(exemplo.porque, `O exemplo "${exemplo.nome}" diz "repetivel": false sem o \`porque\`.`);
    assert.ok(!(igual && intacto), `O exemplo "${exemplo.nome}" diz "repetivel": false, mas o fake repetido dá a mesma resposta e o mesmo estado: tire a exceção.`);
    return;
  }
  const mensagem = `O mesmo POST de novo, no fake (e2e/fakes/anki.js), mudou a resposta ou o estado no exemplo "${exemplo.nome}": se é de propósito, `
    + 'declare `"repetivel": false, "porque": …` no exemplo (complemento/contrato/LEIA-ME.md).';
  assert.ok(igual, mensagem);
  assert.ok(intacto, mensagem);
}

const deuCerto = status => status >= 200 && status < 300;
const ehPostQueDeuCerto = exemplo => exemplo.pedido.metodo === 'POST' && deuCerto(exemplo.resposta.status);

async function conferirUmExemplo(exemplo) {
  const { fakeDoExemplo } = fakeNoContextoDe(exemplo);
  if (ehPostQueDeuCerto(exemplo)) await conferirARepeticao(exemplo);
  const entregue = await pedirAoFake(fakeDoExemplo, exemplo.pedido.metodo, exemplo.pedido.caminho, exemplo.pedido.corpo);
  assert.strictEqual(entregue.status, exemplo.resposta.status, `O fake e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json).`);
  assert.strictEqual(diferencaDoContrato(entregue.json, exemplo.resposta.json), null,
    `O fake e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json): ${diferencaDoContrato(entregue.json, exemplo.resposta.json)}`);
}

const exemploDe = nome => contrato.exemplos.find(e => e.nome === nome).resposta.json;
const ehFolha = esperado => !esperado || typeof esperado !== 'object';

function conferirAForma(obtido, esperado, caminho = '') {
  if (Array.isArray(esperado)) {
    if (esperado.length) conferirAForma(obtido[0], esperado[0], `${caminho}[]`);
    return;
  }
  if (ehFolha(esperado)) return;
  assert.deepStrictEqual(Object.keys(obtido).sort(), Object.keys(esperado).sort(), `a forma do fake não é a do contrato em ${caminho || '/'}`);
  for (const chave of Object.keys(esperado)) conferirAForma(obtido[chave], esperado[chave], `${caminho}/${chave}`);
}

async function conferirAsFormasDosNumeros() {
  const dosTestes = criarFakeAnki();
  dosTestes.definirVocabulario('en', [{ word: 'gave up', type: 'term', maduros: 1 }, 'smoking']);
  dosTestes.definirBaralho('Inglês', { cartoes: 4, termos: 3, palavras: 11, porCartao: 2.75, novos: 1, aprendendo: 1, recentes: 1, maduros: 1 });
  const lido = async (caminho, corpo) => (await pedirAoFake(dosTestes, 'POST', caminho, corpo)).json;
  conferirAForma(await lido('/anki/vocabulary', { deck: 'Inglês', lang: 'en', limit: 10000 }), exemploDe('Vocabulário de um Baralho'));
  conferirAForma(await lido('/anki/stats/decks', { decks: [{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'en' }] }),
    exemploDe('Números de um Baralho que existe e de um que não existe'));
  dosTestes.definirCustos([{ jobId: 'job-en-1', createdAt: '2026-10-12T10:00:00-03:00', custos: { cartoes: 0.01 } }]);
  conferirAForma(await lido('/analytics/jobs', { lang: 'all' }), exemploDe('os custos de todo o período'));
  dosTestes.definirCustos([{ jobId: 'job-en-2', createdAt: '2026-10-12T10:00:00-03:00', plano: { cartoes: 2, economia: 0.009 } }]);
  conferirAForma(await lido('/analytics/jobs', { lang: 'all' }), exemploDe('os custos de um Envio feito pelo plano trazem os Cartões e o que a chave teria cobrado'));
}

async function conferirAFormaDoEnvioListado() {
  const criado = criarFakeAnki();
  const envio = contrato.exemplos.find(e => e.nome === 'criar um Envio entrega as Frases à Conexão').pedido.corpo;
  assert.strictEqual((await pedirAoFake(criado, 'POST', '/jobs', envio)).status, 201);
  const listado = (await pedirAoFake(criado, 'POST', '/jobs/list', {})).json.jobs[0];
  const daFila = exemploDe('listar os Envios traz o estado de cada um e de cada Cartão').jobs[0];
  assert.deepStrictEqual(Object.keys(listado).sort(), Object.keys(daFila).sort(), 'a forma do Envio do fake não é a do contrato');
  assert.deepStrictEqual(Object.keys(listado.state).sort(), Object.keys(daFila.state).sort(), 'a forma do estado do fake não é a do contrato');
}

async function conferirOsExemplos() {
  for (const exemplo of contrato.exemplos.filter(exemploDaExtensao)) await conferirUmExemplo(exemplo);
  await conferirAsFormasDosNumeros();
  await conferirAFormaDoEnvioListado();
  console.log('fake anki tests passed');
}

async function conferirACopiaDaChave() {
  const pedir = (fakeDaChave, caminho, corpo) => pedirAoFake(fakeDaChave, 'POST', caminho, corpo);
  const chave = 'sk-proj-outra-chave-do-teste-7c2e';

  const aceita = criarFakeAnki();
  assert.deepStrictEqual((await pedir(aceita, '/ia/openai/chave', { chave })).json, { ok: true, ultimos4: '7c2e' });
  assert.strictEqual(aceita.chaveNaConexao(), chave);
  const estado = await pedir(aceita, '/ia/estado', {});
  assert.deepStrictEqual(estado.json, { openai: { configurada: true, ultimos4: '7c2e', conta: '', versao: 1, naoEnviada: true } });
  assert.ok(!JSON.stringify(estado).includes(chave));

  aceita.abrirPerfil(null);
  assert.deepStrictEqual(await pedir(aceita, '/ia/estado', {}), estado);
  assert.strictEqual(aceita.chaveNaConexao(), chave);
  const semPerfilNemChave = criarFakeAnki();
  semPerfilNemChave.abrirPerfil(null);
  assert.deepStrictEqual(await pedir(semPerfilNemChave, '/ia/estado', {}), {
    status: 200, json: { openai: { configurada: false, conta: '', versao: 0, naoEnviada: false } },
  });
  assert.strictEqual(semPerfilNemChave.chaveNaConexao(), null);

  const recusada = criarFakeAnki();
  recusada.responderOpenAI('recusa');
  assert.strictEqual((await pedir(recusada, '/ia/openai/chave', { chave })).status, 401);
  assert.strictEqual(recusada.chaveNaConexao(), null);
}

const pedirNaPortaDeTeste = (porta, metodo, caminho) => new Promise(resolve => {
  const pedido = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho, agent: false }, resposta => {
    let corpo = '';
    resposta.setEncoding('utf8').on('data', parte => { corpo += parte; }).on('end', () => resolve({ status: resposta.statusCode, corpo }));
  });
  pedido.on('error', () => resolve({ semResposta: true }));
  pedido.end();
});

async function conferirAPortaDeTeste() {
  const porta = await subirPortaDaConexaoDeTeste();
  try {
    assert.strictEqual(regrasQueTiramAPortaDoComputador(porta.porta), `MAP 127.0.0.1:8766 127.0.0.1:${porta.porta}, MAP localhost:8766 127.0.0.1:${porta.porta}`);
    assert.deepStrictEqual(await pedirNaPortaDeTeste(porta.porta, 'GET', '/auth/callback'), { semResposta: true });

    const entrando = criarFakeAnki();
    porta.atender(entrando.responderNaPortaDeTeste);
    const { json } = await pedirAoFake(entrando, 'POST', '/ia/chatgpt/entrar', {});
    const retorno = `/auth/callback?code=codigo&state=${new URL(json.url).searchParams.get('state')}`;
    assert.strictEqual(entrando.chatgpt.situacao(), 'entrando');

    assert.deepStrictEqual(await pedirNaPortaDeTeste(porta.porta, 'GET', '/health'), { semResposta: true });
    assert.deepStrictEqual(await pedirNaPortaDeTeste(porta.porta, 'POST', retorno), { semResposta: true });
    entrando.desligar();
    assert.deepStrictEqual(await pedirNaPortaDeTeste(porta.porta, 'GET', retorno), { semResposta: true });
    assert.strictEqual(entrando.chatgpt.situacao(), 'entrando');

    entrando.ligar();
    assert.deepStrictEqual(await pedirNaPortaDeTeste(porta.porta, 'GET', retorno), { status: 200, corpo: PAGINA_DO_RETORNO });
    assert.strictEqual(entrando.chatgpt.situacao(), 'conectada');
    assert.deepStrictEqual(entrando.chegaramNaPortaDeTeste, ['GET /health', `POST ${retorno}`, `GET ${retorno}`, `GET ${retorno}`]);
  } finally {
    await porta.fechar();
  }
}

function conferirOApagarTudoNaFrenteDaReal() {
  const pedido = (metodo, caminho) => ({ req: { method: () => metodo, postData: () => '{}' }, url: new URL(`http://127.0.0.1:8766${caminho}`) });
  const naFrente = (anki, metodo, caminho) => { const { req, url } = pedido(metodo, caminho); return anki.naFrente(req, url); };
  const apagando = criarFakeAnki();
  apagando.apagarAsFrases();
  assert.deepStrictEqual(naFrente(apagando, 'POST', '/jobs/list').fila, [{ apagarFrases: true }], 'apagarAsFrases chega à Conexão real no próximo pedido');
  assert.strictEqual(naFrente(apagando, 'POST', '/jobs/list').fila, undefined, 'e só uma vez');

  const semResposta = criarFakeAnki();
  semResposta.falharApagarFrases();
  assert.deepStrictEqual(naFrente(semResposta, 'POST', '/jobs/apagar-frases'), { recusar: true }, 'falharApagarFrases recusa na frente, nos dois modos');
  semResposta.voltarApagarFrases();
  assert.strictEqual(naFrente(semResposta, 'POST', '/jobs/apagar-frases').recusar, undefined);
}

function conferirAChaveGuardadaNaConexao() {
  const naFrente = anki => anki.naFrente(
    { method: () => 'POST', postData: () => '{}' }, new URL('http://127.0.0.1:8766/ia/estado')).fila;

  const padrao = criarFakeAnki();
  padrao.guardarChaveNaConexao('9f3a');
  assert.strictEqual(padrao.chaveNaConexao(), 'sk-proj-guardada-antes-9f3a');
  assert.deepStrictEqual(padrao.estadoDaChave(), { versao: 0, conta: null, em: 0, naoEnviada: true });
  assert.deepStrictEqual(naFrente(padrao), [{ chave: { chave: 'sk-proj-guardada-antes-9f3a' } }]);

  const completa = criarFakeAnki();
  completa.guardarChaveNaConexao('bbbb', { versao: 42, conta: 'B', em: 101, naoEnviada: false });
  assert.strictEqual(completa.chaveNaConexao(), 'sk-proj-guardada-antes-bbbb');
  assert.deepStrictEqual(completa.estadoDaChave(), { versao: 42, conta: 'B', em: 101, naoEnviada: false });
  assert.deepStrictEqual(naFrente(completa), [{ chave: { chave: 'sk-proj-guardada-antes-bbbb', versao: 42, conta: 'B', em: 101, naoEnviada: false } }]);

  const soComVersao = criarFakeAnki();
  soComVersao.guardarChaveNaConexao('wxyz', { versao: 7 });
  assert.deepStrictEqual(soComVersao.estadoDaChave(), { versao: 7, conta: null, em: 0, naoEnviada: true });
  assert.deepStrictEqual(naFrente(soComVersao), [{ chave: { versao: 7, chave: 'sk-proj-guardada-antes-wxyz' } }]);

  soComVersao.esquecerAChave();
  assert.deepStrictEqual([soComVersao.chaveNaConexao(), soComVersao.estadoDaChave().versao], [null, 0]);
}

conferirOsExemplos().then(conferirACopiaDaChave).then(conferirAChaveGuardadaNaConexao).then(conferirAPortaDeTeste).then(conferirOApagarTudoNaFrenteDaReal).then(() => console.log('fake anki key tests passed')).catch(erro => { console.error(erro); process.exit(1); });
