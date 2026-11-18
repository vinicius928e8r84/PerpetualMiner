'use strict';

const assert = require('assert');
const { FRASES, IDS, ESTADO, CONCLUIDO, assentar, montar, rodar } = require('./apoio-da-remessa.js');
const { RemessaXState } = require('./apoio-da-remessa.js');
const { transition, initialTransition } = globalThis.XState;

async function fecharOProgressoDuranteACriacaoSemNadaCriadoVoltaAParada() {
  const t = montar();
  t.mundo.criar = async () => ({ falha: { semResposta: true, causa: 'rede' } });
  t.enviar([FRASES[0]], IDS);
  t.ator.send({ type: 'fechouProgresso' });
  await assentar();
  assert.deepStrictEqual([t.visao().fase, t.mundo.guardado], ['parada', null]);
}

async function oEnvioQueAConexaoNaoConheceSaiComEsquecerENaoAbreResumo() {
  const t = montar();
  t.enviar(FRASES, IDS);
  await assentar();
  t.naConexao.delete('envio-ru');
  t.terminar('envio-en', CONCLUIDO([1]));
  await t.passar(2_000);
  assert.deepStrictEqual(t.estados(), { 'envio-en': ESTADO.CONCLUIDO, 'envio-ru': ESTADO.DESCONHECIDO });
  assert.deepStrictEqual([t.visao().fase, t.visao().progressoAberto], ['acompanhando', true]);
  t.ator.send({ type: 'esquecerOEnvio', id: 'envio-ru' });
  await assentar();
  assert.deepStrictEqual([t.visao().fase, t.visao().resumo.enviadas, t.mundo.guardado.envios.map(e => e.id)], ['resumo', [1], ['envio-en']]);

  const so = montar();
  so.enviar([FRASES[1]], IDS);
  await assentar();
  so.naConexao.clear();
  await so.passar(2_000);
  assert.deepStrictEqual(so.estados(), { 'envio-ru': ESTADO.DESCONHECIDO });
  so.ator.send({ type: 'fechouProgresso' });
  await so.passar(4_000);
  assert.deepStrictEqual([so.visao().fase, so.visao().progressoAberto, so.visao().desistiu], ['acompanhando', false, true]);
  so.ator.send({ type: 'esquecerOEnvio', id: 'envio-ru' });
  await assentar();
  assert.deepStrictEqual([so.visao().fase, so.mundo.guardado], ['parada', null]);
}

async function apagarTudoNoMeioDaCriacaoAbortaOPedidoEARespostaAtrasadaNaoTrazOEnvioDeVolta() {
  const t = montar();
  let responder;
  let sinal;
  t.mundo.criar = (corpo, { signal }) => { sinal = signal; return new Promise(resolver => { responder = () => resolver({ jobId: corpo.jobId }); }); };
  t.enviar(FRASES, IDS);
  await assentar();
  assert.deepStrictEqual([t.visao().fase, t.visao().passo, sinal.aborted], ['criando', 'pedindo', false]);
  t.ator.send({ type: 'apagarTudo' });
  assert.deepStrictEqual([t.visao().fase, t.visao().envios, sinal.aborted], ['parada', [], true]);
  responder();
  await assentar();
  await t.passar(10_000);
  assert.deepStrictEqual([t.visao().fase, t.visao().envios, t.visao().jobs], ['parada', [], {}]);
  assert.deepStrictEqual(t.mundo.guardado, { envios: [], apagarFrases: true });
  assert.deepStrictEqual(t.feitos.filter(f => f.startsWith('criar') || f === 'listar'), ['criar envio-en']);
}

async function apagarTudoValeEmQualquerFase() {
  for (const ate of ['acompanhando', 'resumo']) {
    const t = montar();
    t.enviar(FRASES, IDS);
    await assentar();
    if (ate === 'resumo') {
      t.terminar('envio-en', CONCLUIDO([1]));
      t.terminar('envio-ru', CONCLUIDO([2]));
      await t.passar(2_000);
    }
    assert.strictEqual(t.visao().fase, ate);
    t.ator.send({ type: 'apagarTudo' });
    await assentar();
    const antes = t.feitos.length;
    await t.passar(10_000);
    assert.deepStrictEqual([t.visao().fase, t.visao().envios, t.visao().resumo, t.feitos.length], ['parada', [], null, antes], ate);
  }
}

async function tentarDeNovoNoIdiomaDoResumoRetomaSoAqueleEnvio() {
  const t = montar();
  t.enviar(FRASES, IDS);
  await assentar();
  t.terminar('envio-en', { status: 'failed', stage: 'failed', lastError: 'openai_key_rejected' });
  t.terminar('envio-ru', CONCLUIDO([2]));
  await t.passar(2_000);
  assert.strictEqual(t.visao().fase, 'resumo');
  t.mundo.retomar = async jobId => { t.terminar(jobId, { status: 'running', stage: 'generate_cards' }); return { desfecho: 'retomado' }; };
  t.ator.send({ type: 'responder', tentar: 'en' });
  assert.deepStrictEqual([t.visao().fase, t.visao().passo, t.visao().progressoAberto], ['criando', 'retomando', true]);
  await assentar();
  assert.deepStrictEqual(t.feitos.filter(f => f.startsWith('retomar')), ['retomar envio-en']);
  assert.deepStrictEqual([t.visao().fase, t.estados()], ['acompanhando', { 'envio-en': ESTADO.ANDANDO, 'envio-ru': ESTADO.CONCLUIDO }]);
  t.terminar('envio-en', CONCLUIDO([1]));
  await t.passar(2_000);
  assert.deepStrictEqual([t.visao().fase, t.visao().resumo.enviadas], ['resumo', [1, 2]]);
}

async function continuarEnvioPedeUmaVezPorEnvioEDizOQueAConexaoRespondeu() {
  const t = montar();
  const retomados = [];
  t.ator.on('retomado', evento => retomados.push(evento.jobId));
  t.enviar(FRASES, IDS);
  await assentar();
  t.ator.send({ type: 'tela', livre: false });
  t.terminar('envio-en', { status: 'failed', stage: 'failed', lastError: 'anki_write_failed' });
  t.terminar('envio-ru', { status: 'partial', stage: 'partial', lastError: 'cards_failed' });
  await t.passar(2_000);
  const desfechos = { 'envio-en': { desfecho: 'falhou', causa: 'POST /jobs/retry envio-en → HTTP 500' }, 'envio-ru': { desfecho: 'apagadas' } };
  t.mundo.retomar = async jobId => desfechos[jobId];
  t.ator.send({ type: 'continuar', jobId: 'envio-en' });
  t.ator.send({ type: 'continuar', jobId: 'envio-en' });
  t.ator.send({ type: 'continuar', jobId: 'envio-ru' });
  await assentar();
  assert.deepStrictEqual(t.feitos.filter(f => f.startsWith('retomar')), ['retomar envio-en', 'retomar envio-ru']);
  assert.deepStrictEqual(t.visao().falhasAoRetomar, { 'envio-en': 'POST /jobs/retry envio-en → HTTP 500' });
  assert.deepStrictEqual(t.visao().situacoes['envio-ru'], { estado: ESTADO.EM_PARTE, motivo: 'cards_failed', apagadas: true });
  assert.deepStrictEqual(retomados, []);
  desfechos['envio-en'] = { desfecho: 'retomado' };
  t.ator.send({ type: 'continuar', jobId: 'envio-en' });
  await assentar();
  assert.deepStrictEqual([retomados, t.visao().falhasAoRetomar, t.estados()['envio-en']], [['envio-en'], {}, ESTADO.NA_FILA]);
}

async function recarregarComUmEnvioSemRespostaMandaOMesmoPedidoEAcompanha() {
  const primeira = montar();
  primeira.mundo.criar = () => new Promise(() => {});
  primeira.enviar([FRASES[0]], IDS);
  await assentar();
  const { guardado } = primeira.mundo;
  assert.deepStrictEqual(guardado.envios.map(e => [e.id, e.jobId, Boolean(e.corpo)]), [['envio-en', null, true]]);
  primeira.ator.stop();

  const segunda = montar({ guardada: guardado });
  assert.deepStrictEqual([segunda.visao().fase, segunda.visao().passo], ['criando', 'pedindo']);
  await assentar();
  assert.deepStrictEqual(segunda.feitos.filter(f => f.startsWith('criar')), ['criar envio-en']);
  assert.deepStrictEqual([segunda.visao().fase, segunda.estados()], ['acompanhando', { 'envio-en': ESTADO.ANDANDO }]);

  const comJob = montar({
    guardada: { envios: [{ id: 'a', lang: 'en', ids: [1], linhas: ['x'], jobId: 'a', corpo: {}, falhaAoCriar: null }] },
    jaNaConexao: [{ jobId: 'a', status: 'running', state: { status: 'running', stage: 'generate_audio', progress: { done: 1, total: 4 } } }],
  });
  await assentar();
  assert.deepStrictEqual(comJob.feitos.filter(f => f.startsWith('criar')), []);
  assert.deepStrictEqual(comJob.visao().situacoes.a, { estado: ESTADO.ANDANDO, etapa: 'generate_audio', feitos: 1, total: 4 });

  assert.strictEqual(montar({ guardada: { envios: [], apagarFrases: true } }).visao().fase, 'parada');
}

async function oResumoEsperaATelaFicarLivre() {
  const t = montar();
  t.enviar(FRASES, IDS);
  await assentar();
  t.ator.send({ type: 'tela', livre: false });
  t.terminar('envio-en', CONCLUIDO([1]));
  t.terminar('envio-ru', CONCLUIDO([2]));
  await t.passar(2_000);
  assert.deepStrictEqual([t.visao().fase, t.estados()['envio-en']], ['acompanhando', ESTADO.CONCLUIDO]);
  t.ator.send({ type: 'tela', livre: true });
  assert.strictEqual(t.visao().fase, 'resumo');
}

async function comOAnkiFechadoOEnvioQueAndaFicaParado() {
  const t = montar();
  t.enviar([FRASES[0]], IDS);
  await assentar();
  t.ator.send({ type: 'conexao', ankiFechado: true });
  assert.deepStrictEqual(t.estados(), { 'envio-en': ESTADO.PARADO });
  t.ator.send({ type: 'conexao', ankiFechado: false });
  assert.deepStrictEqual(t.estados(), { 'envio-en': ESTADO.ANDANDO });
}

function aTransicaoPuraDizOProximoEstadoSemRodarNada() {
  const feitos = [];
  const recusar = nome => () => { feitos.push(nome); throw new Error(`${nome} não devia rodar`); };
  const maquina = RemessaXState.criarMaquina({
    conexao: { criar: recusar('criar'), listar: recusar('listar'), retomar: recusar('retomar') },
    ajustes: { ler: recusar('ajustes') },
    guardar: { gravar: recusar('gravar'), esquecer: recusar('esquecer'), apagarTudo: recusar('apagarTudo') },
  });
  const [parada] = initialTransition(maquina);
  assert.strictEqual(parada.value, 'parada');
  assert.deepStrictEqual([parada.can({ type: 'enviar', frases: FRASES, ids: IDS, agora: 1 }), parada.can({ type: 'responder' }), parada.can({ type: 'fechouProgresso' })], [true, false, false]);
  const [criando, efeitos] = transition(maquina, parada, { type: 'enviar', frases: FRASES, ids: IDS, agora: 1 });
  assert.deepStrictEqual(criando.value, { criando: 'preparando' });
  assert.deepStrictEqual(criando.context.fila, ['envio-en', 'envio-ru']);
  assert.ok(efeitos.length > 0);
  const [semFrases] = transition(maquina, parada, { type: 'enviar', frases: [], ids: IDS, agora: 1 });
  assert.strictEqual(semFrases.value, 'parada');
  const [apagada] = transition(maquina, criando, { type: 'apagarTudo' });
  assert.deepStrictEqual([apagada.value, apagada.context.envios], ['parada', []]);
  assert.deepStrictEqual(feitos, []);
}

rodar('test_remessa_falhas', [
  fecharOProgressoDuranteACriacaoSemNadaCriadoVoltaAParada,
  oEnvioQueAConexaoNaoConheceSaiComEsquecerENaoAbreResumo,
  apagarTudoNoMeioDaCriacaoAbortaOPedidoEARespostaAtrasadaNaoTrazOEnvioDeVolta,
  apagarTudoValeEmQualquerFase,
  tentarDeNovoNoIdiomaDoResumoRetomaSoAqueleEnvio,
  continuarEnvioPedeUmaVezPorEnvioEDizOQueAConexaoRespondeu,
  recarregarComUmEnvioSemRespostaMandaOMesmoPedidoEAcompanha,
  oResumoEsperaATelaFicarLivre,
  comOAnkiFechadoOEnvioQueAndaFicaParado,
  aTransicaoPuraDizOProximoEstadoSemRodarNada,
]);
