'use strict';

const assert = require('assert');
const test = require('node:test');
const {
  preparar, rastro, lista, adiante, criado, criandoJobs, jobs, job, SEM_RESPOSTA, clicarEmEnviar, comUmEnvio,
} = require('./painel_do_envio_de_mentira.js');

const ABRE = ['montarCartao u1 criando', 'abrirModal modal-envio', 'lerAjustes'];
const FECHA = ['montarCartao u1 naoComecou', 'montarCartao u1 naoComecou', 'resumoTentarAbrir'];

test('usar liga os botões e as áreas, e uma segunda chamada não liga de novo', async () => {
  const mundo = await preparar();
  assert.deepStrictEqual(
    ['btn-send-anki', 'modal-envio-fechar', 'modal-resumo-fechar', 'btn-resumo-manter', 'btn-resumo-apagar'].map(id => Object.keys(mundo.porId(id).ouvintes)),
    [['click'], ['click'], ['click'], ['click'], ['click']],
  );
  assert.deepStrictEqual(rastro(mundo), ['aoEntrarNaArea frases function', 'aoEntrarNaArea anki function']);
  await mundo.raiz.Envio.usar({});
  assert.deepStrictEqual(rastro(mundo), ['aoEntrarNaArea frases function', 'aoEntrarNaArea anki function']);
});

test('a conexão desligada que nunca conectou bloqueia o botão e diz por quê; conectada antes ou ligada libera', async () => {
  const nunca = await preparar({ jaConectou: false });
  nunca.ouvinteDaConexao('desligada');
  assert.deepStrictEqual(nunca.porId('btn-send-anki').atributos, { 'aria-disabled': 'true', 'aria-describedby': 'envio-indisponivel' });
  assert.strictEqual(nunca.porId('envio-indisponivel').textContent, 'PAI-32.enviarIndisponivel');
  nunca.ouvinteDaConexao('ligada');
  assert.deepStrictEqual(nunca.porId('btn-send-anki').atributos, {});
  const antes = await preparar({ jaConectou: true });
  antes.ouvinteDaConexao('desligada');
  assert.deepStrictEqual(antes.porId('btn-send-anki').atributos, {});
});

test('uma Conexão que muda para ligada ou desligada pede de novo o apagar das Frases', async () => {
  const mundo = await preparar();
  mundo.log.length = 0;
  mundo.ouvinteDaConexao('ligada');
  mundo.ouvinteDaConexao('desligada');
  assert.deepStrictEqual(rastro(mundo), ['apagarFrasesPedir']);
});

test('enviar Frases em inglês e em russo cria um Envio por idioma, guarda cada passo, abre o progresso e passa a acompanhar', async () => {
  const mundo = await preparar({ selecionadas: [1, 2, 3], respostas: { 'POST /jobs': criandoJobs(), 'POST /jobs/list': jobs(job('j1', 'running', 'translate')) } });
  await clicarEmEnviar(mundo);
  assert.deepStrictEqual(rastro(mundo), [
    'montarCartao u1 criando', 'montarCartao u2 criando', 'abrirModal modal-envio',
    'lerAjustes', 'grava u1', 'POST /jobs [1,3]', 'grava u1:j1',
    'lerAjustes', 'grava u1:j1,u2', 'POST /jobs [2]', 'grava u1:j1,u2:j2',
    'montarCartao u1 naFila', 'montarCartao u2 naFila',
    'POST /jobs/list {}', 'tetoAtualizar', 'montarCartao u1 andando', 'montarCartao u2 desconhecido', 'resumoTentarAbrir',
  ]);
  assert.deepStrictEqual(mundo.guardado.pm_envio.envios.map(e => [e.id, e.lang, e.ids, e.jobId, e.baralho, e.criadoEm]), [
    ['u1', 'en', [1, 3], 'j1', 'EN', 1000], ['u2', 'ru', [2], 'j2', 'RU', 1000],
  ]);
  assert.deepStrictEqual(mundo.guardado.pm_envio.envios[1].corpo, {
    jobId: 'u2', lang: 'ru', deckName: 'RU', imageSource: 'openverse', voz: 'alloy', nivel: 'B1', entries: [{ phraseId: 2, line: 'linha 2' }],
  });
  assert.strictEqual(mundo.porId('modal-envio-detalhe').textContent, 'ENV-06.detalhe{"n":2,"idiomas":"inglês e russo"}');
  assert.deepStrictEqual(mundo.intervalos.map(i => i.ms), [2000]);
});

test('os Ajustes que não leem deixam o Envio sem criar, com o motivo guardado, e nenhum pedido sai', async () => {
  const mundo = await preparar({ selecionadas: [1], ajustes: new Error('sem preset') });
  await clicarEmEnviar(mundo);
  assert.deepStrictEqual(rastro(mundo), [...ABRE, 'grava u1:ENV-03.motivoAjustes', ...FECHA]);
  assert.deepStrictEqual(mundo.guardado.pm_envio.envios[0].falhaAoCriar, { motivo: 'ENV-03.motivoAjustes', causa: 'sem preset' });
});

test('a Conexão que recusa ou não devolve o jobId guarda a causa do pedido e não acompanha o Envio', async () => {
  const recusada = await preparar({ selecionadas: [1], respostas: { 'POST /jobs': { ok: false, status: 500, dados: { error: 'boom' } } } });
  await clicarEmEnviar(recusada);
  assert.deepStrictEqual(rastro(recusada), [...ABRE, 'grava u1', 'POST /jobs [1]', 'grava u1:POST /jobs → HTTP 500 · boom:false', ...FECHA]);
  const semJob = await preparar({ selecionadas: [1], respostas: { 'POST /jobs': { ok: true, status: 201, dados: {} } } });
  await clicarEmEnviar(semJob);
  assert.deepStrictEqual(semJob.guardado.pm_envio.envios[0].falhaAoCriar, { semResposta: false, causa: 'POST /jobs → HTTP 201 ·' });
});

test('sem resposta com a Conexão ligada guarda a falha e não pede o Anki; com o Anki fechado que já conectou, pede e espera', async () => {
  const ligada = await preparar({ selecionadas: [1], respostas: { 'POST /jobs': SEM_RESPOSTA } });
  await clicarEmEnviar(ligada);
  assert.deepStrictEqual(rastro(ligada), [...ABRE, 'grava u1', 'POST /jobs [1]', 'grava u1:POST /jobs → timeout:true', 'conferirConexao', ...FECHA]);
  const fechado = await preparar({ selecionadas: [1], respostas: { 'POST /jobs': SEM_RESPOSTA } });
  fechado.situacaoDoAnki = 'desligada';
  await clicarEmEnviar(fechado);
  assert.deepStrictEqual(rastro(fechado), [...ABRE, 'grava u1', 'POST /jobs [1]', 'grava u1:POST /jobs → timeout:true', 'conferirConexao', 'ankiFechadoPediu 1', ...FECHA]);
  fechado.respostas['POST /jobs'] = criado('jX');
  fechado.log.length = 0;
  await fechado.aoLigarOAnki(fechado.idsPedidos);
  await adiante();
  assert.deepStrictEqual(rastro(fechado), ['POST /jobs [1]', 'grava u1:jX', 'montarCartao u1 parado']);
  assert.deepStrictEqual(fechado.guardado.pm_envio.envios.map(e => e.jobId), ['jX']);
});

test('com a Conexão desligada, enviar pede o Anki se já conectou e não faz nada se nunca conectou', async () => {
  const conectou = await preparar({ selecionadas: [1] });
  conectou.ouvinteDaConexao('desligada');
  await clicarEmEnviar(conectou);
  assert.deepStrictEqual(rastro(conectou), ['ankiFechadoPediu 1']);
  const nunca = await preparar({ selecionadas: [1], jaConectou: false });
  nunca.ouvinteDaConexao('desligada');
  await clicarEmEnviar(nunca);
  assert.deepStrictEqual(rastro(nunca), []);
  assert.strictEqual(nunca.guardado.pm_envio, undefined);
});

test('sem Frases novas, enviar não faz nada sem remessa e só reabre o progresso com remessa; as já acompanhadas ficam de fora', async () => {
  const vazio = await preparar({ selecionadas: [] });
  await clicarEmEnviar(vazio);
  assert.deepStrictEqual(rastro(vazio), []);
  const mundo = await comUmEnvio();
  await clicarEmEnviar(mundo);
  assert.deepStrictEqual(rastro(mundo), ['montarCartao u1 andando']);
  mundo.selecionar(1, 2);
  await clicarEmEnviar(mundo);
  assert.deepStrictEqual(rastro(mundo), [
    'montarCartao u1 andando', 'montarCartao u2 criando', 'lerAjustes', 'grava u1:j1,u2', 'POST /jobs [2]', 'grava u1:j1,u2:j2', 'montarCartao u1 andando', 'montarCartao u2 naFila',
  ]);
  assert.deepStrictEqual(lista(mundo), ['u1|u1:andando:null', 'u2|u2:naFila:null']);
});
