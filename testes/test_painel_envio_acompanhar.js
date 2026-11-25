'use strict';

const assert = require('assert');
const test = require('node:test');
const {
  preparar, rastro, lista, adiante, criado, criandoJobs, jobs, job, SEM_RESPOSTA, clicarEmEnviar, comUmEnvio, girar,
} = require('./painel_do_envio_de_mentira.js');

test('a cada volta o relógio lê os Envios: o que a Conexão não conhece vira desconhecido e sem notícia mostra o aviso e confere a Conexão', async () => {
  const mundo = await preparar({ selecionadas: [1, 2], respostas: { 'POST /jobs': criandoJobs(), 'POST /jobs/list': jobs(job('j1', 'running', 'translate'), job('j2', 'queued')) } });
  await clicarEmEnviar(mundo);
  assert.deepStrictEqual(lista(mundo), ['u1|u1:andando:null', 'u2|u2:naFila:null']);
  mundo.respostas['POST /jobs/list'] = jobs(job('j1', 'running', 'translate'));
  await girar(mundo);
  assert.deepStrictEqual(rastro(mundo), ['POST /jobs/list {}', 'tetoAtualizar', 'montarCartao u1 andando', 'montarCartao u2 desconhecido', 'resumoTentarAbrir']);
  mundo.respostas['POST /jobs/list'] = SEM_RESPOSTA;
  await girar(mundo);
  assert.deepStrictEqual(rastro(mundo), ['POST /jobs/list {}', 'tetoAtualizar', 'conferirConexao', 'montarCartao u1 andando', 'montarCartao u2 desconhecido', 'resumoTentarAbrir']);
  assert.strictEqual(mundo.porId('modal-envio-sem-noticia').hidden, false);
  mundo.respostas['POST /jobs/list'] = jobs(job('j1', 'running', 'translate'), job('j2', 'queued'));
  await girar(mundo);
  assert.strictEqual(mundo.porId('modal-envio-sem-noticia').hidden, true);
  assert.deepStrictEqual(lista(mundo), ['u1|u1:andando:null', 'u2|u2:naFila:null']);
});

test('com a Conexão desligada o relógio confere a Conexão mesmo quando a leitura dos Envios responde', async () => {
  const mundo = await comUmEnvio();
  mundo.ouvinteDaConexao('desligada');
  await girar(mundo);
  assert.deepStrictEqual(rastro(mundo), ['POST /jobs/list {}', 'tetoAtualizar', 'conferirConexao', 'montarCartao u1 andando', 'resumoTentarAbrir']);
  assert.strictEqual(mundo.porId('modal-envio-sem-noticia').hidden, true);
});

test('um cartão com a mesma assinatura fica onde está; com outra, é trocado e o foco volta ao mesmo botão', async () => {
  const mundo = await comUmEnvio({ 'POST /jobs/list': jobs(job('j1', 'queued')) });
  await girar(mundo);
  const doCartao = mundo.porId('modal-envio-lista').filhos[0];
  mundo.documento.activeElement = doCartao.filhos[0];
  await girar(mundo);
  assert.strictEqual(mundo.porId('modal-envio-lista').filhos[0], doCartao);
  mundo.respostas['POST /jobs/list'] = jobs(job('j1', 'running', 'translate'));
  await girar(mundo);
  const novo = mundo.porId('modal-envio-lista').filhos[0];
  assert.notStrictEqual(novo, doCartao);
  assert.strictEqual(mundo.documento.activeElement, novo.filhos[0]);
  assert.deepStrictEqual(lista(mundo), ['u1|u1:andando:null']);
});

test('uma remessa guardada é retomada ao abrir o painel: o que tem corpo e não tem job é criado, o resto só é acompanhado', async () => {
  const guardado = { envios: [
    { id: 'a', lang: 'en', ids: [1], jobId: 'ja', criadoEm: 1, falhaAoCriar: null, baralho: 'EN' },
    { id: 'b', lang: 'ru', ids: [2], jobId: null, criadoEm: 1, falhaAoCriar: null, baralho: 'RU', corpo: { jobId: 'b', lang: 'ru', entries: [{ phraseId: 2, line: 'x' }] } },
    { id: 'c', lang: 'en', ids: [3], jobId: null, criadoEm: 1, falhaAoCriar: { semResposta: false, causa: 'c' }, corpo: { jobId: 'c', entries: [] } },
  ] };
  const mundo = await preparar({ guardado, respostas: { 'POST /jobs': criado('jB'), 'POST /jobs/list': jobs(job('ja', 'running', 'translate')) } });
  assert.deepStrictEqual(rastro(mundo), [
    'aoEntrarNaArea frases function', 'aoEntrarNaArea anki function',
    'POST /jobs [2]', 'grava a:ja,b:jB,c:c:false', 'POST /jobs/list {}', 'tetoAtualizar', 'resumoTentarAbrir',
  ]);
  const sem = await preparar({ guardado: { envios: [{ id: 'z', lang: 'en', ids: [1], jobId: null, criadoEm: 1, falhaAoCriar: null }] } });
  assert.deepStrictEqual(rastro(sem), ['aoEntrarNaArea frases function', 'aoEntrarNaArea anki function']);
});

test('o apagar das Frases pedido de outro lugar encerra o acompanhamento só quando não resta Envio e é na área local', async () => {
  const mundo = await comUmEnvio();
  mundo.log.length = 0;
  mundo.aoMudarOArmazenamento({ pm_envio: { newValue: { apagarFrases: true, envios: [{}] } } }, 'local');
  mundo.aoMudarOArmazenamento({ pm_envio: { newValue: { apagarFrases: true, envios: [] } } }, 'sync');
  assert.deepStrictEqual(rastro(mundo), []);
  mundo.aoMudarOArmazenamento({ pm_envio: { newValue: { apagarFrases: true, envios: [] } } }, 'local');
  await adiante();
  assert.deepStrictEqual(rastro(mundo), ['clearInterval 1', 'fecharModal modal-envio', 'resumoDescartar']);
});

test('apagarTudo encerra, grava só a marca e pede o apagar das Frases', async () => {
  const mundo = await comUmEnvio();
  mundo.log.length = 0;
  await mundo.raiz.Envio.apagarTudo();
  assert.deepStrictEqual(rastro(mundo), ['clearInterval 1', 'fecharModal modal-envio', 'resumoDescartar', 'grava  +marca', 'apagarFrasesPedir']);
  assert.deepStrictEqual(mundo.guardado.pm_envio, { envios: [], apagarFrases: true });
});

test('fechar o progresso: com Envio andando só fecha; sem nenhum job esquece a remessa', async () => {
  const andando = await comUmEnvio();
  andando.log.length = 0;
  await andando.porId('modal-envio-fechar').clicar();
  await adiante();
  assert.deepStrictEqual(rastro(andando), ['fecharModal modal-envio']);
  assert.strictEqual(andando.guardado.pm_envio.envios[0].jobId, 'j1');
  const semJob = await comUmEnvio({ 'POST /jobs': { ok: false, status: 500, dados: { error: 'x' } } });
  semJob.log.length = 0;
  await semJob.porId('modal-envio-fechar').clicar();
  await adiante();
  assert.deepStrictEqual(rastro(semJob), ['fecharModal modal-envio', 'clearInterval 1', 'remove']);
  assert.strictEqual(semJob.guardado.pm_envio, undefined);
});

test('esquecer um Envio de dois guarda o outro; esquecer o último fecha o progresso e esquece a remessa', async () => {
  const mundo = await preparar({ selecionadas: [1, 2], respostas: { 'POST /jobs': criandoJobs(), 'POST /jobs/list': jobs(job('j1', 'running', 'translate'), job('j2', 'running', 'translate')) } });
  await clicarEmEnviar(mundo);
  mundo.log.length = 0;
  await mundo.dadosDoCartao.esquecerOEnvio(mundo.resumo.estado.remessa().envios[0]);
  await adiante();
  assert.deepStrictEqual(rastro(mundo), ['grava u2:j2', 'montarCartao u2 andando', 'resumoTentarAbrir']);
  mundo.log.length = 0;
  await mundo.dadosDoCartao.esquecerOEnvio(mundo.resumo.estado.remessa().envios[0]);
  await adiante();
  assert.deepStrictEqual(rastro(mundo), ['fecharModal modal-envio', 'clearInterval 1', 'remove']);
  assert.strictEqual(mundo.guardado.pm_envio, undefined);
});

test('continuar um Envio que falhou pede de novo, avisa e volta a acompanhar', async () => {
  const mundo = await comUmEnvio({
    'POST /jobs/list': jobs(job('j1', 'failed', 'translate', { lastError: { code: 'x', message: 'x' } })),
    'POST /jobs/j1/retry': { ok: true, status: 200, dados: { jobId: 'j1', status: 'queued' } },
  });
  await girar(mundo);
  const envio = mundo.resumo.estado.remessa().envios[0];
  assert.strictEqual(mundo.dadosDoCartao.situacaoDe(envio).estado, 'naoConcluido');
  mundo.log.length = 0;
  await mundo.dadosDoCartao.continuarEnvio(envio);
  await adiante();
  assert.deepStrictEqual(rastro(mundo), ['POST /jobs/retry {"jobId":"j1"}', 'toast ENV-14.sucesso', 'montarCartao u1 naFila']);
  assert.strictEqual(mundo.dadosDoCartao.situacaoDe(envio).estado, 'naFila');
});

test('nomeDaEtapa traduz a etapa conhecida e devolve nulo para a que não conhece', async () => {
  const { Envio } = (await preparar()).raiz;
  assert.deepStrictEqual([Envio.nomeDaEtapa('translate'), Envio.nomeDaEtapa('queued'), Envio.nomeDaEtapa('x')], ['Traduzindo', 'Na fila', null]);
});
