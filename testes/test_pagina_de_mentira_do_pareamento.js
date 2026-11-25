'use strict';

const assert = require('assert');
const { cabecalhosAssinados } = require('../e2e/pareamento-de-teste');
const { ENDERECO, criarConexao, comoValores } = require('../e2e/pagina-de-mentira-do-pareamento');

const CASOS = [];
const caso = (nome, corpo) => CASOS.push({ nome, corpo });
const lerResposta = async resposta => ({ status: resposta.status, json: await resposta.json() });
const assinado = (conexao, metodo, caminho, opcoes = {}) => ({
  method: metodo,
  headers: cabecalhosAssinados({ sessao: conexao.sessao, metodo, caminho, corpo: opcoes.body ?? '', navegador: opcoes.navegador }),
  ...(opcoes.body === undefined ? {} : { body: opcoes.body }),
});

caso('a conexão nasce desconectada, parea os navegadores pedidos e guarda a sessão', () => {
  const conexao = criarConexao({ navegadores: ['primeiro', 'segundo'] });
  assert.match(conexao.sessao, /^[0-9a-f]{32}$/);
  assert.deepStrictEqual([conexao.vistos, conexao.privadas, conexao.reiniciar], [[], 0, null]);
  assert.strictEqual(conexao.sessao, conexao.pareamento.sessao());
});

caso('cada pedido fica anotado com método (GET se não vier), caminho, cabeçalhos em minúsculas e corpo', async () => {
  const conexao = criarConexao();
  await conexao.fetch(`${ENDERECO}/health`);
  await conexao.fetch(`${ENDERECO}/x?a=1`, { method: 'POST', headers: { 'X-Um': '1', Outro: '2' }, body: '{"a":1}' });
  assert.deepStrictEqual(comoValores(conexao.vistos), [
    { metodo: 'GET', caminho: '/health', cabecalhos: {} },
    { metodo: 'POST', caminho: '/x', cabecalhos: { 'x-um': '1', outro: '2' }, corpo: '{"a":1}' },
  ]);
});

caso('o impostor responde no lugar de tudo, depois de o pedido ser anotado', async () => {
  const pedidos = [];
  const conexao = criarConexao({ impostor: pedido => { pedidos.push(pedido); return new Response('falso', { status: 418 }); } });
  const resposta = await conexao.fetch(`${ENDERECO}/health`, { method: 'POST', body: 'x' });
  assert.deepStrictEqual([resposta.status, await resposta.text()], [418, 'falso']);
  assert.deepStrictEqual(pedidos, [{ metodo: 'POST', caminho: '/health', cabecalhos: {}, corpo: 'x' }]);
  assert.strictEqual(conexao.vistos.length, 1);
});

caso('a Conexão antiga não conhece o pareamento e responde 200 instalada ao resto', async () => {
  const conexao = criarConexao({ antiga: true });
  assert.deepStrictEqual(await lerResposta(await conexao.fetch(`${ENDERECO}/pareamento/comecar`, { method: 'POST', body: '{}' })), { status: 404, json: { error: 'not_found' } });
  assert.deepStrictEqual(await lerResposta(await conexao.fetch(`${ENDERECO}/health`)), { status: 200, json: { estado: 'instalada' } });
  assert.deepStrictEqual(await lerResposta(await conexao.fetch(`${ENDERECO}/ia/estado`, { method: 'POST', body: '{}' })), { status: 200, json: { estado: 'instalada' } });
  assert.strictEqual(conexao.privadas, 0);
});

caso('o pareamento responde primeiro, com o corpo lido como JSON (ou nulo)', async () => {
  const conexao = criarConexao();
  conexao.pareamento.sortearCodigo('K7M4PX');
  const comeco = await lerResposta(await conexao.fetch(`${ENDERECO}/pareamento/comecar`, { method: 'POST', body: '{}' }));
  assert.deepStrictEqual(comeco, { status: 200, json: { ok: true } });
  assert.strictEqual(conexao.pareamento.codigoNoAnki(), 'K7M-4PX');
  assert.strictEqual(conexao.privadas, 0);
  const sem = await lerResposta(await conexao.fetch(`${ENDERECO}/pareamento/conferir`, { method: 'POST' }));
  assert.strictEqual(sem.status >= 400, true);
});

caso('GET /health responde a saúde sem assinatura', async () => {
  const conexao = criarConexao();
  assert.deepStrictEqual(await lerResposta(await conexao.fetch(`${ENDERECO}/health`)), { status: 200, json: { ok: true, versao: '0.4.25', perfil: 'Usuário 1' } });
  assert.strictEqual(conexao.privadas, 0);
});

caso('o pedido privado sem assinatura vira 401 com o erro do pareamento, e não conta como privado', async () => {
  const conexao = criarConexao();
  const resposta = await lerResposta(await conexao.fetch(`${ENDERECO}/ia/estado`, { method: 'POST', body: '{}' }));
  assert.strictEqual(resposta.status, 401);
  assert.strictEqual(typeof resposta.json.error, 'string');
  assert.strictEqual(conexao.privadas, 0);
});

caso('o pedido privado assinado conta, devolve o caminho e traz a prova da resposta nos cabeçalhos', async () => {
  const conexao = criarConexao();
  const resposta = await conexao.fetch(`${ENDERECO}/ia/estado`, assinado(conexao, 'POST', '/ia/estado', { body: '{}' }));
  assert.deepStrictEqual(await lerResposta(resposta.clone()), { status: 200, json: { ok: true, caminho: '/ia/estado' } });
  assert.strictEqual(conexao.privadas, 1);
  assert.match(resposta.headers.get('x-perpetualminer-prova'), /^[A-Za-z0-9+/]{43}=$/);
  await conexao.fetch(`${ENDERECO}/jobs`, assinado(conexao, 'GET', '/jobs'));
  assert.strictEqual(conexao.privadas, 2);
});

caso('a sessão velha ou o navegador não pareado também voltam 401', async () => {
  const conexao = criarConexao({ navegadores: ['primeiro'] });
  const velha = { method: 'GET', headers: cabecalhosAssinados({ sessao: 'a'.repeat(32), metodo: 'GET', caminho: '/jobs' }) };
  assert.deepStrictEqual(await lerResposta(await conexao.fetch(`${ENDERECO}/jobs`, velha)), { status: 401, json: { error: 'session_expired' } });
  const desconhecido = await conexao.fetch(`${ENDERECO}/jobs`, assinado(conexao, 'GET', '/jobs', { navegador: 'segundo' }));
  assert.strictEqual(desconhecido.status, 401);
  assert.strictEqual(conexao.privadas, 0);
});

(async () => {
  for (const { nome, corpo } of CASOS) {
    try {
      await corpo();
    } catch (erro) {
      console.error(`falhou: ${nome}`);
      throw erro;
    }
  }
  console.log(`test_pagina_de_mentira_do_pareamento: ${CASOS.length} casos ok`);
})().catch(erro => { console.error(erro); process.exit(1); });
