'use strict';

const assert = require('assert');
const { FRASES, IDS, ESTADO, CONCLUIDO, assentar, montar, rodar } = require('./apoio-da-remessa.js');

async function enviarCriaUmEnvioPorIdiomaEGuardaOCorpoAntesDoPedido() {
  const t = montar();
  assert.strictEqual(t.visao().fase, 'parada');
  t.enviar(FRASES, IDS);
  assert.deepStrictEqual([t.visao().fase, t.visao().progressoAberto], ['criando', true]);
  assert.deepStrictEqual(t.estados(), { 'envio-en': ESTADO.CRIANDO, 'envio-ru': ESTADO.CRIANDO });
  await assentar();
  assert.deepStrictEqual(t.feitos.slice(0, 6), ['gravar envio-en', 'criar envio-en', 'gravar envio-en', 'gravar envio-en+envio-ru', 'criar envio-ru', 'gravar envio-en+envio-ru']);
  assert.deepStrictEqual([t.visao().fase, t.visao().passo], ['acompanhando', 'esperando']);
  assert.deepStrictEqual(t.estados(), { 'envio-en': ESTADO.ANDANDO, 'envio-ru': ESTADO.ANDANDO });
  assert.deepStrictEqual(t.mundo.guardado.envios.map(e => [e.id, e.jobId, e.corpo.deckName, e.corpo.entries]), [
    ['envio-en', 'envio-en', 'PM::Inglês', [{ phraseId: 1, line: 'the cat' }]],
    ['envio-ru', 'envio-ru', 'PM::Russo', [{ phraseId: 2, line: 'кот' }]],
  ]);
}

async function oAcompanhamentoLeAConexaoACadaDoisSegundosEParaDeLerQuandoTudoTerminou() {
  const t = montar();
  t.enviar(FRASES, IDS);
  await assentar();
  const lidas = () => t.feitos.filter(f => f === 'listar').length;
  assert.strictEqual(lidas(), 1);
  await t.passar(1_999);
  assert.strictEqual(lidas(), 1);
  await t.passar(1);
  assert.strictEqual(lidas(), 2);
  t.ator.send({ type: 'tela', livre: false });
  t.terminar('envio-en', CONCLUIDO([1]));
  t.terminar('envio-ru', CONCLUIDO([2]));
  await t.passar(2_000);
  assert.strictEqual(lidas(), 3);
  await t.passar(10_000);
  assert.strictEqual(lidas(), 3);
  assert.strictEqual(t.visao().fase, 'acompanhando');
}

async function oResumoAbreQuandoTodosTerminamEARespostaEsqueceARemessa() {
  const t = montar();
  const respondidas = [];
  t.ator.on('respondida', evento => respondidas.push(evento));
  t.enviar(FRASES, IDS);
  await assentar();
  t.terminar('envio-en', { status: 'partial', stage: 'partial', lastError: 'cards_failed', successfulPhraseIds: [1], duplicatePhraseIds: [1] });
  await t.passar(2_000);
  assert.strictEqual(t.visao().fase, 'acompanhando');
  t.terminar('envio-ru', CONCLUIDO([2]));
  await t.passar(2_000);
  assert.deepStrictEqual([t.visao().fase, t.visao().progressoAberto], ['resumo', false]);
  assert.deepStrictEqual([t.visao().resumo.enviadas, t.visao().resumo.duplicadas], [[2], [1]]);
  t.enviar([{ id: 3, lang: 'en', linha: 'x' }], { en: 'outro' });
  assert.strictEqual(t.visao().fase, 'resumo');
  t.ator.send({ type: 'responder', apagar: true });
  await assentar();
  assert.deepStrictEqual(respondidas, [{ type: 'respondida', apagar: true, enviadas: [2], duplicadas: [1] }]);
  assert.deepStrictEqual([t.visao().fase, t.visao().envios, t.mundo.guardado], ['parada', [], null]);
  const lidas = t.feitos.length;
  await t.passar(10_000);
  assert.strictEqual(t.feitos.length, lidas);
}

async function duploCliqueCriaUmEnvioPorIdiomaNaoDois() {
  const t = montar();
  t.enviar(FRASES, IDS);
  t.enviar(FRASES, { en: 'dobrado-en', ru: 'dobrado-ru' });
  await assentar();
  assert.deepStrictEqual(t.feitos.filter(f => f.startsWith('criar')), ['criar envio-en', 'criar envio-ru']);
  assert.deepStrictEqual(t.visao().envios.map(e => e.id), ['envio-en', 'envio-ru']);
}

async function enviarDeNovoAsMesmasFrasesSoReabreOProgresso() {
  const t = montar();
  t.enviar(FRASES, IDS);
  await assentar();
  t.ator.send({ type: 'fechouProgresso' });
  assert.deepStrictEqual([t.visao().fase, t.visao().progressoAberto], ['acompanhando', false]);
  t.enviar(FRASES, { en: 'de-novo-en', ru: 'de-novo-ru' });
  await assentar();
  assert.deepStrictEqual([t.visao().fase, t.visao().progressoAberto, t.visao().envios.length], ['acompanhando', true, 2]);
  assert.strictEqual(t.feitos.filter(f => f.startsWith('criar')).length, 2);
}

async function semNoticiaDaConexaoOEstadoDizEVoltaQuandoElaResponde() {
  const t = montar();
  t.enviar(FRASES, IDS);
  await assentar();
  const listar = t.mundo.listar;
  t.mundo.listar = async () => { throw new Error('rede'); };
  await t.passar(2_000);
  assert.deepStrictEqual([t.visao().fase, t.visao().semNoticia], ['acompanhando', true]);
  t.mundo.listar = async () => ({ semNoticia: true });
  await t.passar(2_000);
  assert.strictEqual(t.visao().semNoticia, true);
  t.mundo.listar = listar;
  await t.passar(2_000);
  assert.strictEqual(t.visao().semNoticia, false);
  assert.deepStrictEqual(t.estados(), { 'envio-en': ESTADO.ANDANDO, 'envio-ru': ESTADO.ANDANDO });
}

async function oPedidoQueCaiNaRedeNaoComecaEOResumoSoAbreDepoisDeFecharOProgresso() {
  const t = montar();
  const criar = t.mundo.criar;
  t.mundo.criar = async corpo => (corpo.lang === 'ru' ? { falha: { semResposta: true, causa: 'POST /jobs → rede' } } : criar(corpo));
  t.enviar(FRASES, IDS);
  await assentar();
  assert.deepStrictEqual(t.estados(), { 'envio-en': ESTADO.ANDANDO, 'envio-ru': ESTADO.NAO_COMECOU });
  assert.strictEqual(t.visao().situacoes['envio-ru'].causa, 'semResposta');
  t.terminar('envio-en', CONCLUIDO([1]));
  await t.passar(2_000);
  assert.deepStrictEqual([t.visao().fase, t.visao().progressoAberto], ['acompanhando', true]);
  t.ator.send({ type: 'fechouProgresso' });
  assert.deepStrictEqual([t.visao().fase, t.visao().resumo.enviadas], ['resumo', [1]]);
  assert.deepStrictEqual(t.visao().resumo.idiomas.map(i => [i.lang, i.falhas]), [['en', 0], ['ru', 1]]);
}

async function tentarDeNovoMandaOMesmoPedidoUmaVez() {
  const t = montar();
  const criar = t.mundo.criar;
  const corpos = [];
  t.mundo.criar = async corpo => { corpos.push(corpo); return { falha: { semResposta: true, causa: 'POST /jobs → rede' } }; };
  t.enviar([FRASES[0]], IDS);
  await assentar();
  assert.deepStrictEqual(t.estados(), { 'envio-en': ESTADO.NAO_COMECOU });
  t.mundo.criar = async corpo => { corpos.push(corpo); return criar(corpo); };
  t.ator.send({ type: 'tentarCriarDeNovo', id: 'envio-en' });
  t.ator.send({ type: 'tentarCriarDeNovo', id: 'envio-en' });
  await assentar();
  assert.strictEqual(corpos.length, 2);
  assert.deepStrictEqual(corpos[1], corpos[0]);
  assert.deepStrictEqual([t.visao().fase, t.estados()], ['acompanhando', { 'envio-en': ESTADO.ANDANDO }]);
}

async function seALeituraDosAjustesFalhaOEnvioNaoComecaETentarDeNovoOCria() {
  const t = montar();
  const ajustes = t.mundo.ajustes;
  t.mundo.ajustes = async () => { throw new Error('storage fora'); };
  t.enviar([FRASES[0]], IDS);
  await assentar();
  assert.deepStrictEqual(t.visao().situacoes['envio-en'], { estado: ESTADO.NAO_COMECOU, causa: 'ajustes' });
  assert.deepStrictEqual(t.feitos.filter(f => f.startsWith('criar')), []);
  t.mundo.ajustes = ajustes;
  t.ator.send({ type: 'tentarCriarDeNovo', id: 'envio-en' });
  await assentar();
  assert.deepStrictEqual(t.feitos.filter(f => f.startsWith('criar')), ['criar envio-en']);
  assert.deepStrictEqual(t.estados(), { 'envio-en': ESTADO.ANDANDO });
}

async function fecharOProgressoSemNenhumEnvioCriadoEsqueceARemessa() {
  const t = montar();
  t.mundo.criar = async () => ({ falha: { semResposta: false, causa: 'POST /jobs → HTTP 500' } });
  t.enviar(FRASES, IDS);
  await assentar();
  assert.deepStrictEqual([t.visao().fase, t.mundo.guardado.envios.length], ['acompanhando', 2]);
  t.ator.send({ type: 'fechouProgresso' });
  await assentar();
  assert.deepStrictEqual([t.visao().fase, t.visao().envios, t.mundo.guardado], ['parada', [], null]);
}

rodar('test_remessa', [
  enviarCriaUmEnvioPorIdiomaEGuardaOCorpoAntesDoPedido,
  oAcompanhamentoLeAConexaoACadaDoisSegundosEParaDeLerQuandoTudoTerminou,
  oResumoAbreQuandoTodosTerminamEARespostaEsqueceARemessa,
  duploCliqueCriaUmEnvioPorIdiomaNaoDois,
  enviarDeNovoAsMesmasFrasesSoReabreOProgresso,
  semNoticiaDaConexaoOEstadoDizEVoltaQuandoElaResponde,
  oPedidoQueCaiNaRedeNaoComecaEOResumoSoAbreDepoisDeFecharOProgresso,
  tentarDeNovoMandaOMesmoPedidoUmaVez,
  seALeituraDosAjustesFalhaOEnvioNaoComecaETentarDeNovoOCria,
  fecharOProgressoSemNenhumEnvioCriadoEsqueceARemessa,
]);
