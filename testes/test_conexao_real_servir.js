'use strict';

const assert = require('assert');
const fs = require('fs');
const { subir } = require('../e2e/conexao-real');
const contrato = require('../complemento/contrato/exemplos.json');

const COLECAO = contrato.colecoes['inglês com subbaralho'];
const UM_ENVIO = contrato.filas['um Envio na fila'][0];
const JOB = UM_ENVIO.job.jobId;
const ESTADO_DA_FILA = UM_ENVIO.state;

const { createdAt: _, ...PEDIDO_DO_ENVIO } = UM_ENVIO.job;
const CASOS = [];
const caso = (nome, corpo) => CASOS.push({ nome, corpo });

caso('a Conexão sobe com a OpenAI aceitando e o comando desconhecido volta o erro', async c => {
  assert.ok(c.porta > 0);
  assert.deepStrictEqual(await c.enviar({ nada: 1 }), { erro: 'comando desconhecido' });
  assert.deepStrictEqual(await c.enviar({ openai: 'recusa' }), { ok: true });
});

caso('os perfis chegam como a Conexão os tem: o fixo do mundo e o aberto da coleção', async c => {
  assert.deepStrictEqual(await c.enviar({ colecao: COLECAO }), { ok: true });
  const { perfis } = await c.enviar({ perfis: true });
  assert.deepStrictEqual(perfis, { lista: ['Usuário 1'], marcado: null, aberto: 'Usuário 1' });
});

caso('o mundo com o Anki na tela de perfis fecha a coleção e marca o perfil', async c => {
  const mundo = { colecao: COLECAO, perfil: null, perfis: { lista: ['Ana', 'Beto'], marcado: 'Beto' } };
  assert.deepStrictEqual(await c.enviar({ mundo }), { ok: true });
  assert.deepStrictEqual((await c.enviar({ perfis: true })).perfis, { lista: ['Ana', 'Beto'], marcado: 'Beto', aberto: null });
});

caso('o mundo com o perfil aberto e sem perfil marcado tira o marcado que havia', async c => {
  await c.enviar({ mundo: { colecao: COLECAO, perfil: 'Ana', perfis: { lista: ['Ana', 'Beto'], marcado: 'Beto' } } });
  assert.deepStrictEqual(await c.enviar({ mundo: { colecao: COLECAO, perfil: 'Ana', perfis: { lista: ['Ana', 'Beto'], marcado: null } } }), { ok: true });
  assert.deepStrictEqual((await c.enviar({ perfis: true })).perfis, { lista: ['Ana', 'Beto'], marcado: null, aberto: 'Ana' });
});

caso('o mundo sem perfis dá a lista de um perfil só', async c => {
  await c.enviar({ mundo: { colecao: COLECAO, perfil: 'Usuário 1' } });
  assert.deepStrictEqual((await c.enviar({ perfis: true })).perfis, { lista: ['Usuário 1'], marcado: null, aberto: 'Usuário 1' });
});

caso('a chave dada à Conexão aparece no cofre e a remoção a apaga', async c => {
  assert.strictEqual((await c.enviar({ estado: true })).cofre, null);
  const chave = { chave: 'sk-x', versao: 2 };
  assert.deepStrictEqual(await c.enviar({ chave }), { ok: true });
  assert.deepStrictEqual((await c.enviar({ estado: true })).cofre, chave);
  assert.deepStrictEqual(await c.enviar({ chave: null }), { ok: true });
  assert.strictEqual((await c.enviar({ estado: true })).cofre, null);
  assert.deepStrictEqual(await c.enviar({ chave: null }), { ok: true });
});

caso('o estado guarda o que a Conexão ouviu de fora, e a pasta de dados existe', async c => {
  const estado = await c.enviar({ estado: true });
  assert.deepStrictEqual({ ...estado, pasta: typeof estado.pasta }, { cofre: null, nuvem: {}, pedidosAOpenAI: [], falas: [], pasta: 'string' });
  assert.ok(fs.existsSync(estado.pasta));
});

caso('o login do ChatGPT: desconectada, conectada e o arquivo apagado', async c => {
  assert.strictEqual((await c.enviar({ login: true })).login, 'desconectada');
  assert.deepStrictEqual(await c.enviar({ login: 'conectada' }), { ok: true });
  assert.strictEqual((await c.enviar({ login: true })).login, 'conectada');
  assert.deepStrictEqual(await c.enviar({ login: 'desconectada' }), { ok: true });
  assert.strictEqual((await c.enviar({ login: true })).login, 'desconectada');
});

for (const situacao of ['entrando', 'recusou', 'nao_serve', 'acabou']) {
  caso(`o login do ChatGPT na situação ${situacao} do contrato volta com o mesmo nome`, async c => {
    assert.deepStrictEqual(await c.enviar({ login: situacao }), { ok: true });
    assert.strictEqual((await c.enviar({ login: true })).login, situacao);
  });
}

caso('a fila do contrato mostra os Envios na ordem, com o pedido como as rotas o mostram', async c => {
  assert.deepStrictEqual((await c.enviar({ envios: true })).envios, []);
  assert.deepStrictEqual(await c.enviar({ fila: 'um Envio na fila' }), { ok: true });
  const { envios } = await c.enviar({ envios: true });
  assert.strictEqual(envios.length, 1);
  assert.deepStrictEqual(
    { jobId: envios[0].jobId, lang: envios[0].lang, createdAt: envios[0].createdAt, state: envios[0].state, corpo: envios[0].corpo },
    { jobId: JOB, lang: 'en', createdAt: UM_ENVIO.job.createdAt, state: ESTADO_DA_FILA, corpo: PEDIDO_DO_ENVIO },
  );
});

caso('mudar o estado do Envio pelo portão: o aceito grava e a transição recusada volta o erro', async c => {
  await c.enviar({ fila: 'um Envio na fila' });
  const andando = { ...ESTADO_DA_FILA, status: 'running', stage: 'images' };
  assert.deepStrictEqual(await c.enviar({ mudar: { jobId: JOB, state: andando } }), { ok: true });
  assert.strictEqual((await c.enviar({ envios: true })).envios[0].state.status, 'running');
  const { erro } = await c.enviar({ mudar: { jobId: JOB, state: { ...ESTADO_DA_FILA, status: 'completed', stage: 'queued' } } });
  assert.match(erro, /não pode ficar na etapa queued/);
  assert.strictEqual((await c.enviar({ envios: true })).envios[0].state.status, 'running');
});

caso('criar um Envio que chega sem a extensão responde ok ou o erro, e o Apagar tudo esvazia a fila', async c => {
  const pedido = { jobId: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', lang: 'en', deckName: 'Inglês', imageSource: '1', tts: { wordTld: 'com', phraseTld: 'co.uk' },
    entries: [{ phraseId: 1, line: 'give up : She gave up smoking [Context: x]' }] };
  const criado = await c.enviar({ criar: pedido });
  assert.strictEqual(criado.status, 201, JSON.stringify(criado));
  assert.strictEqual((await c.enviar({ envios: true })).envios.length, 1);
  const recusado = await c.enviar({ criar: { jobId: 'sem-o-resto' } });
  assert.strictEqual(typeof recusado.erro, 'string');
  assert.deepStrictEqual(await c.enviar({ apagarFrases: true }), { ok: true });
});

const comecarOPareamento = porta => fetch(`http://127.0.0.1:${porta}/pareamento/comecar`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: contrato.origemDaExtensao }, body: '{}',
});

caso('o pareamento mostra o código da janela, o Cancelar a fecha e Desconectar tira os navegadores', async c => {
  assert.deepStrictEqual(await c.enviar({ pareamento: 'estado' }), { codigo: null, navegadores: 2 });
  assert.strictEqual((await comecarOPareamento(c.porta)).status, 200);
  const aberta = await c.enviar({ pareamento: 'estado' });
  assert.match(aberta.codigo, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  assert.strictEqual(aberta.navegadores, 2);
  assert.deepStrictEqual(await c.enviar({ pareamento: 'cancelar' }), { codigo: null, navegadores: 2 });
  assert.deepStrictEqual(await c.enviar({ pareamento: 'desconectar' }), { codigo: null, navegadores: 0 });
});

async function rodar() {
  for (const { nome, corpo } of CASOS) {
    const conexao = await subir();
    try {
      await corpo(conexao);
    } catch (erro) {
      erro.message = `${nome}: ${erro.message}`;
      throw erro;
    } finally {
      await conexao.fechar();
    }
  }
}

rodar().then(() => console.log(`test_conexao_real_servir: ${CASOS.length} casos ok`), erro => { console.error(erro); process.exit(1); });
