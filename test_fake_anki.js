'use strict';

const assert = require('assert');
const http = require('http');
const { isDeepStrictEqual } = require('util');
const { criarFakeAnki, exemploDaExtensao, diferencaDoContrato } = require('./e2e/fakes/anki');
const { criarFakeGoogle } = require('./e2e/fakes/google');
const { cabecalhosAssinados } = require('./e2e/pareamento-de-teste');
const { PAGINA_DO_RETORNO } = require('./e2e/fakes/chatgpt');
const { subirPortaDaConexaoDeTeste, regrasQueTiramAPortaDoComputador } = require('./e2e/fakes/porta-da-conexao');

const fake = criarFakeAnki();
assert.deepStrictEqual(fake.respostaDoContrato('GET', '/health').json.perfil, 'Usuário 1');

fake.abrirPerfil('Perfil sem exemplo');
assert.throws(() => fake.respostaDoContrato('GET', '/health'), /não tem exemplo de GET \/health/);

const contrato = require('./complemento/contrato/carregar');

async function pedirAoFake(fakeDaConexao, metodo, caminho, corpo = null) {
  let entregue = null;
  const texto = corpo === undefined || corpo === null ? null : JSON.stringify(corpo);
  const aberto = (metodo === 'GET' && caminho === '/health') || caminho.startsWith('/pareamento/');
  const cabecalhos = aberto ? {} : Object.fromEntries(Object.entries(
    cabecalhosAssinados({ sessao: fakeDaConexao.pareamento.sessao(), metodo, caminho, corpo: texto ?? '' })).map(([nome, valor]) => [nome.toLowerCase(), valor]));
  await fakeDaConexao.tratar({
    request: () => ({ method: () => metodo, url: () => `http://127.0.0.1:8766${caminho}`, postData: () => texto, headers: () => cabecalhos }),
    fulfill: resposta => { entregue = { status: resposta.status, json: JSON.parse(resposta.body) }; },
    abort: () => { entregue = { abortado: true }; },
  });
  return entregue;
}

function fakeNoContextoDe(exemplo) {
  const fakeDoExemplo = criarFakeAnki();
  if (exemplo.contexto.perfil !== undefined) fakeDoExemplo.abrirPerfil(exemplo.contexto.perfil);
  if (exemplo.contexto.falhaNoPerfil) fakeDoExemplo.falharLeituraDoPerfil();
  if (exemplo.contexto.openai) fakeDoExemplo.responderOpenAI(exemplo.contexto.openai);
  if (exemplo.contexto.chaveNaConexao) fakeDoExemplo.guardarChaveNaConexao(exemplo.contexto.chaveNaConexao, exemplo.contexto.versaoNaConexao || 0,
    exemplo.contexto.contaNaConexao ?? null, exemplo.contexto.emNaConexao || 0, exemplo.contexto.naoEnviada ?? true);
  if (!exemplo.contexto.chaveNaConexao && exemplo.contexto.versaoNaConexao) fakeDoExemplo.guardarRemocaoNaConexao(exemplo.contexto.versaoNaConexao);
  if (exemplo.contexto.firebase) fakeDoExemplo.responderFirebase(exemplo.contexto.firebase);
  if (exemplo.contexto.cofre === 'sem_escrita') fakeDoExemplo.falharGravacaoDaChave();
  const google = criarFakeGoogle();
  fakeDoExemplo.sincronizarCom(google);
  if ('chaveNaNuvem' in exemplo.contexto) google.gravarChaveDaOpenAI('uid-teste', { chave: exemplo.contexto.chaveNaNuvem, em: exemplo.contexto.emNaNuvem });
  if ('colecao' in exemplo.contexto) fakeDoExemplo.abrirColecao(exemplo.contexto.colecao);
  if (exemplo.contexto.itemDeLogin) fakeDoExemplo.definirItemDeLogin(exemplo.contexto.itemDeLogin);
  if (exemplo.contexto.fila) fakeDoExemplo.definirFila(exemplo.contexto.fila);
  if (exemplo.contexto.chatgpt) fakeDoExemplo.chatgpt.definir(exemplo.contexto.chatgpt);
  if (exemplo.contexto.modelo) fakeDoExemplo.modelo.definir(exemplo.contexto.modelo);
  if (exemplo.contexto.voz) fakeDoExemplo.voz.definir(exemplo.contexto.voz);
  if (exemplo.contexto.atualizacao || exemplo.contexto.ankiweb) fakeDoExemplo.definirAtualizacao({ atualizacao: exemplo.contexto.atualizacao, ankiweb: exemplo.contexto.ankiweb });
  if (exemplo.contexto.hoje) fakeDoExemplo.teto.passarOTempoAte(exemplo.contexto.hoje);
  if (exemplo.contexto.tetoUsd) fakeDoExemplo.teto.definir({ limite: exemplo.contexto.tetoUsd });
  fakeDoExemplo.pareamento.definirContexto(exemplo.contexto);
  if (exemplo.contexto.perfis) fakeDoExemplo.definirPerfis(exemplo.contexto.perfis, { marcado: exemplo.contexto.perfilMarcado ?? null, aberto: exemplo.contexto.perfil });
  return { fakeDoExemplo, google };
}

function guardado({ fakeDoExemplo, google }) {
  return {
    chave: fakeDoExemplo.chaveNaConexao(), estadoDaChave: fakeDoExemplo.estadoDaChave(), item: fakeDoExemplo.itemDeLogin(),
    nuvem: google.chaveDaOpenAIDe('uid-teste'), envios: JSON.parse(JSON.stringify(fakeDoExemplo.envios)),
    chatgpt: fakeDoExemplo.chatgpt.situacao(), modelo: fakeDoExemplo.modelo.guardado(), teto: fakeDoExemplo.teto.guardado(),
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

async function conferirOsExemplos() {
  for (const exemplo of contrato.exemplos.filter(exemploDaExtensao)) {
    const { fakeDoExemplo } = fakeNoContextoDe(exemplo);
    if (exemplo.pedido.metodo === 'POST' && exemplo.resposta.status >= 200 && exemplo.resposta.status < 300) await conferirARepeticao(exemplo);
    const entregue = await pedirAoFake(fakeDoExemplo, exemplo.pedido.metodo, exemplo.pedido.caminho, exemplo.pedido.corpo);
    assert.strictEqual(entregue.status, exemplo.resposta.status, `O fake e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json).`);
    assert.strictEqual(diferencaDoContrato(entregue.json, exemplo.resposta.json), null,
      `O fake e o contrato se separaram no exemplo "${exemplo.nome}" (complemento/contrato/exemplos.json): ${diferencaDoContrato(entregue.json, exemplo.resposta.json)}`);
  }

  const dosTestes = criarFakeAnki();
  dosTestes.definirVocabulario('en', [{ word: 'gave up', type: 'term', maduros: 1 }, 'smoking']);
  dosTestes.definirBaralho('Inglês', { cartoes: 4, termos: 3, palavras: 11, porCartao: 2.75, novos: 1, aprendendo: 1, recentes: 1, maduros: 1 });
  const lido = async (caminho, corpo) => (await pedirAoFake(dosTestes, 'POST', caminho, corpo)).json;
  const exemploDe = nome => contrato.exemplos.find(e => e.nome === nome).resposta.json;
  const formas = (obtido, esperado, caminho = '') => {
    if (Array.isArray(esperado)) return esperado.length ? formas(obtido[0], esperado[0], `${caminho}[]`) : null;
    if (!esperado || typeof esperado !== 'object') return null;
    assert.deepStrictEqual(Object.keys(obtido).sort(), Object.keys(esperado).sort(), `a forma do fake não é a do contrato em ${caminho || '/'}`);
    for (const chave of Object.keys(esperado)) formas(obtido[chave], esperado[chave], `${caminho}/${chave}`);
    return null;
  };
  formas(await lido('/anki/vocabulary', { deck: 'Inglês', lang: 'en', limit: 10000 }), exemploDe('Vocabulário de um Baralho'));
  formas(await lido('/anki/stats/decks', { decks: [{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'en' }] }),
    exemploDe('Números de um Baralho que existe e de um que não existe'));
  dosTestes.definirCustos([{ jobId: 'job-en-1', createdAt: '2026-10-12T10:00:00-03:00', custos: { cartoes: 0.01 } }]);
  formas(await lido('/analytics/jobs', { lang: 'all' }), exemploDe('os custos de todo o período'));
  dosTestes.definirCustos([{ jobId: 'job-en-2', createdAt: '2026-10-12T10:00:00-03:00', plano: { cartoes: 2, economia: 0.009 } }]);
  formas(await lido('/analytics/jobs', { lang: 'all' }), exemploDe('os custos de um Envio feito pelo plano trazem os Cartões e o que a chave teria cobrado'));
  const criado = criarFakeAnki();
  const envio = contrato.exemplos.find(e => e.nome === 'criar um Envio entrega as Frases à Conexão').pedido.corpo;
  assert.strictEqual((await pedirAoFake(criado, 'POST', '/jobs', envio)).status, 201);
  const listado = (await pedirAoFake(criado, 'POST', '/jobs/list', {})).json.jobs[0];
  const daFila = exemploDe('listar os Envios traz o estado de cada um e de cada Cartão').jobs[0];
  assert.deepStrictEqual(Object.keys(listado).sort(), Object.keys(daFila).sort(), 'a forma do Envio do fake não é a do contrato');
  assert.deepStrictEqual(Object.keys(listado.state).sort(), Object.keys(daFila.state).sort(), 'a forma do estado do fake não é a do contrato');
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

conferirOsExemplos().then(conferirACopiaDaChave).then(conferirAPortaDeTeste).then(() => console.log('fake anki key tests passed')).catch(erro => { console.error(erro); process.exit(1); });
