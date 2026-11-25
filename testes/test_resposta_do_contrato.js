'use strict';

const assert = require('assert');
const contrato = require('../complemento/contrato/carregar');
const { criarRespostaDoContrato, erroDoContrato, exemploDaExtensao, ultimos4 } = require('../e2e/fakes/resposta-do-contrato');

const AGORA = new Date('2026-05-01T10:20:30.000Z');
const COLECAO = 'inglês com subbaralho';
const CASOS = [];
const caso = (nome, corpo) => CASOS.push({ nome, corpo });

function montar({ contexto = { perfil: 'Usuário 1' }, grupos = [], chave = {} } = {}) {
  const estado = {
    agora: () => AGORA, contexto, chaveDaOpenAI: null, contaDaChave: '', versaoDaChave: 0, chaveNaoEnviada: false, ...chave,
  };
  const chatgpt = { situacao: () => 'desconectada' };
  const voz = { situacao: () => 'ok' };
  return criarRespostaDoContrato({ estado, chatgpt, voz, grupos: () => grupos });
}

const PEDIDO_DOS_BARALHOS = { decks: [{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'ru' }] };

function marcasDeAgoraNo(valor) {
  return JSON.stringify(valor).includes('<agora>');
}

caso('ultimos4 dá os quatro últimos caracteres da chave e null sem chave', () => {
  assert.strictEqual(ultimos4('sk-proj-chave-9f3a'), '9f3a');
  assert.strictEqual(ultimos4(''), null);
  assert.strictEqual(ultimos4(null), null);
});

caso('exemploDaExtensao só aceita o exemplo marcado como da extensão', () => {
  assert.strictEqual(exemploDaExtensao({ daExtensao: true }), true);
  assert.strictEqual(exemploDaExtensao({ daExtensao: 'sim' }), false);
  assert.strictEqual(exemploDaExtensao({}), false);
});

caso('erroDoContrato devolve o status e o json do erro do contrato e recusa o que ele não tem', () => {
  const esperado = contrato.exemplos.find(e => e.pedido.caminho === '/ia/openai/chave' && e.resposta.json?.error === 'openai_key_rejected');
  assert.deepStrictEqual(erroDoContrato('/ia/openai/chave', 'openai_key_rejected'), { status: esperado.resposta.status, json: esperado.resposta.json });
  assert.throws(() => erroDoContrato('/ia/openai/chave', 'erro_que_nao_existe'), /O contrato não tem o erro erro_que_nao_existe de POST \/ia\/openai\/chave/);
});

caso('o contexto de agora traz a chave guardada pelos quatro últimos, a situação do ChatGPT e a da voz', () => {
  const { contextoDeAgora } = montar({ contexto: { perfil: 'Ana' }, chave: { chaveDaOpenAI: 'sk-proj-x-9f3a' } });
  assert.deepStrictEqual(contextoDeAgora(), { perfil: 'Ana', chaveNaConexao: '9f3a', chatgpt: 'desconectada', voz: 'ok' });
  assert.strictEqual(montar().contextoDeAgora().chaveNaConexao, null);
});

caso('o primeiro grupo que sabe responder ganha do contrato', () => {
  const chamadas = [];
  const grupo = resposta => ({ responder: (...pedido) => { chamadas.push(pedido); return resposta; } });
  const { respostaDoContrato } = montar({ grupos: [grupo(null), grupo({ status: 202, json: { do: 'segundo' } }), grupo({ status: 203, json: {} })] });
  assert.deepStrictEqual(respostaDoContrato('GET', '/health', undefined), { status: 202, json: { do: 'segundo' } });
  assert.deepStrictEqual(chamadas, [['GET', '/health', undefined], ['GET', '/health', undefined]]);
});

caso('o <agora> do exemplo vira o instante do relógio do fake, também dentro de listas e objetos', () => {
  const { respostaDoContrato } = montar({ contexto: { perfil: 'Usuário 1', colecao: COLECAO } });
  const { status, json } = respostaDoContrato('POST', '/anki/stats/decks', PEDIDO_DOS_BARALHOS);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.generatedAt, AGORA.toISOString());
  assert.strictEqual(marcasDeAgoraNo(json), false);
});

caso('a chave enviada dá os quatro últimos da resposta, sem os espaços das pontas', () => {
  const { respostaDoContrato } = montar({ contexto: { perfil: 'Usuário 1', openai: 'aceita' } });
  const resposta = respostaDoContrato('POST', '/ia/openai/chave', { chave: '  sk-proj-outra-chave-ab12  ', versao: 0, conta: '' });
  assert.deepStrictEqual(resposta, { status: 200, json: { ok: true, ultimos4: 'ab12' } });
});

caso('o pedido da chave sem exemplo de corpo igual cai no primeiro exemplo do caminho', () => {
  const { respostaDoContrato } = montar({ contexto: { perfil: 'Usuário 1', openai: 'recusa' } });
  const { status, json } = respostaDoContrato('POST', '/ia/openai/chave', { chave: 'sk-proj-qualquer-0000', versao: 3, conta: 'x' });
  assert.strictEqual(status, erroDoContrato('/ia/openai/chave', 'openai_key_rejected').status);
  assert.deepStrictEqual(json, { error: 'openai_key_rejected' });
});

caso('o estado da chave vem do que o fake guardou, e não do exemplo', () => {
  const guardada = montar({ chave: { chaveDaOpenAI: 'sk-proj-x-9f3a', contaDaChave: 'conta-a', versaoDaChave: 2, chaveNaoEnviada: true } });
  assert.deepStrictEqual(guardada.respostaDoContrato('POST', '/ia/estado', {}).json, {
    openai: { configurada: true, ultimos4: '9f3a', conta: 'conta-a', versao: 2, naoEnviada: true },
  });
  const vazia = montar({ chave: { versaoDaChave: 4 } });
  assert.deepStrictEqual(vazia.respostaDoContrato('POST', '/ia/estado', {}).json, { openai: { configurada: false, conta: '', versao: 4, naoEnviada: false } });
});

caso('o exemplo que pede outro perfil, outro estado do OpenAI ou outro corpo não serve', () => {
  const { respostaDoContrato } = montar({ contexto: { perfil: 'Perfil sem exemplo' } });
  assert.throws(() => respostaDoContrato('GET', '/health'), /não tem exemplo de GET \/health com o contexto/);
  const { respostaDoContrato: semCorpoIgual } = montar({ contexto: { perfil: 'Usuário 1', colecao: COLECAO } });
  assert.throws(() => semCorpoIgual('POST', '/anki/vocabulary', { deck: 'Nenhum', lang: 'en', limit: 1 }), /com o corpo \{"deck":"Nenhum","lang":"en","limit":1\}/);
});

caso('a falha no perfil escolhe o exemplo da falha, e sem ela o do perfil sem falha', () => {
  const comFalha = montar({ contexto: { perfil: 'Usuário 1', falhaNoPerfil: true } }).respostaDoContrato('GET', '/health');
  const semFalha = montar({ contexto: { perfil: 'Usuário 1', falhaNoPerfil: false } }).respostaDoContrato('GET', '/health');
  assert.notDeepStrictEqual(comFalha, semFalha);
  assert.strictEqual(semFalha.json.perfil, 'Usuário 1');
});

caso('o /health e o /atualizacao/ só servem quando a atualização e o AnkiWeb do contexto são os do exemplo', () => {
  const exemplo = contrato.exemplos.find(e => e.pedido.metodo === 'GET' && e.pedido.caminho === '/health' && e.contexto.atualizacao !== undefined && exemploDaExtensao(e));
  assert.ok(exemplo, 'o contrato devia ter um GET /health com atualização');
  const contexto = { perfil: 'Usuário 1', ...exemplo.contexto };
  assert.strictEqual(montar({ contexto }).respostaDoContrato('GET', '/health').status, exemplo.resposta.status);
  assert.throws(() => montar({ contexto: { ...contexto, atualizacao: 'outra' } }).respostaDoContrato('GET', '/health'), /não tem exemplo de GET \/health/);
});

for (const { nome, corpo } of CASOS) {
  try {
    corpo();
  } catch (erro) {
    erro.message = `${nome}: ${erro.message}`;
    throw erro;
  }
}
console.log(`test_resposta_do_contrato: ${CASOS.length} casos ok`);
