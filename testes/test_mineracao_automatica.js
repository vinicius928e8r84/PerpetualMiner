'use strict';

const assert = require('assert');
const { MineracaoAutomatica, plano, AGORA, portas, eventos, pedido } = require('./apoio-da-decisao-automatica');

async function textoVazioPula() {
  const p = portas();
  const decisao = MineracaoAutomatica.criar(p);
  assert.deepStrictEqual(plano(await decisao.candidata({ texto: '   ', lang: 'ru' })), { action: 'skip', reason: 'empty' });
  assert.deepStrictEqual(p.chamadas.map(([nome]) => nome), ['registrar']);
  assert.deepStrictEqual(eventos(p.chamadas)[0], { at: AGORA, action: 'skip', reason: 'empty', texto: '', lang: 'ru', contexto: null, phraseId: null, evaluation: null });
}

async function idiomaDesligadoPulaSemLerOVocabulario() {
  const p = portas({ ligadas: ['ru'] });
  const resultado = await MineracaoAutomatica.criar(p).candidata(pedido);
  assert.strictEqual(resultado.reason, 'disabled');
  assert.ok(resultado.state, 'o estado do dia vai na resposta');
  assert.ok(!p.chamadas.some(([nome]) => nome === 'vocabulario'));
}

async function oLimiteDeHojePula() {
  const p = portas({ contagem: { en: 3 }, limite: 3 });
  const resultado = await MineracaoAutomatica.criar(p).candidata(pedido);
  assert.strictEqual(resultado.reason, 'daily_limit');
  assert.strictEqual(eventos(p.chamadas)[0].reason, 'daily_limit');
}

async function textoDeMaQualidadePulaSemLerOVocabulario() {
  const p = portas();
  const resultado = await MineracaoAutomatica.criar(p).candidata({ ...pedido, texto: 'skip intro' });
  assert.deepStrictEqual([resultado.action, resultado.reason, plano(resultado.evaluation)], ['skip', 'low_quality_text', { accept: false, reason: 'low_quality_text' }]);
  assert.ok(!p.chamadas.some(([nome]) => nome === 'vocabulario' || nome === 'salvarSeNova'));
}

async function semPalavraNovaPulaComOVocabularioLido() {
  const p = portas({ vocab: { en: { words: ['ferry', 'left', 'harbour'] } } });
  const resultado = await MineracaoAutomatica.criar(p).candidata(pedido);
  assert.strictEqual(resultado.reason, 'nada_novo');
  assert.ok(!p.chamadas.some(([nome]) => nome === 'salvarSeNova'));
}

async function umaPalavraNovaNoBaralhoAindaNaoFoiEstudadaEEntra() {
  const p = portas({ vocab: { en: { words: ['ferry', 'left'], status: { harbour: 'new' } } } });
  const resultado = await MineracaoAutomatica.criar(p).candidata(pedido);
  assert.strictEqual(resultado.action, 'saved');
  assert.deepStrictEqual(plano(resultado.evaluation.keywords), ['harbour@8']);
}

async function aMesmaPalavraRecenteMaduraOuMistaNaoEntra() {
  for (const situacao of ['recent', 'mature', 'mixed']) {
    const p = portas({ vocab: { en: { words: ['ferry', 'left'], status: { harbour: situacao } } } });
    const resultado = await MineracaoAutomatica.criar(p).candidata(pedido);
    assert.deepStrictEqual([resultado.action, resultado.reason], ['skip', 'nada_novo'], situacao);
    assert.ok(!p.chamadas.some(([nome]) => nome === 'salvarSeNova' || nome === 'contarMais'), situacao);
  }
}

async function duasPalavrasDesconhecidasNaoEntramEOMotivoVaiParaOUltimoEvento() {
  const p = portas({ vocab: { en: { words: ['ferry'] }, ru: { words: [] } } });
  const decisao = MineracaoAutomatica.criar(p);
  const resultado = await decisao.candidata(pedido);
  assert.deepStrictEqual([resultado.action, resultado.reason], ['skip', 'nao_e_i_mais_1']);
  assert.deepStrictEqual(plano(resultado.evaluation), { accept: false, reason: 'nao_e_i_mais_1', iaPerguntada: true });
  await decisao.candidata({ texto: 'Я вижу зебра лама', lang: 'ru' });
  const [en, ru] = eventos(p.chamadas);
  assert.deepStrictEqual([en.action, en.reason, en.evaluation], ['skip', 'nao_e_i_mais_1', { accept: false, reason: 'nao_e_i_mais_1', keywords: [], iaPerguntada: true }]);
  assert.deepStrictEqual([ru.evaluation], [{ accept: false, reason: 'nao_e_i_mais_1', keywords: [], iaPerguntada: false }]);
  assert.deepStrictEqual([ru.action, ru.reason, ru.lang], ['skip', 'nao_e_i_mais_1', 'ru']);
  assert.ok(!p.chamadas.some(([nome]) => nome === 'salvarSeNova' || nome === 'contarMais'));
}

async function comOAnkiFechadoNaoHaVocabularioENadaEntra() {
  const p = portas({ vocab: { en: { available: false }, ru: { available: false } } });
  const decisao = MineracaoAutomatica.criar(p);
  assert.strictEqual((await decisao.candidata(pedido)).reason, 'sem_vocabulario');
  assert.strictEqual((await decisao.candidata({ ...pedido, texto: 'Я улыбаюсь', lang: 'ru' })).reason, 'sem_vocabulario');
  assert.deepStrictEqual(eventos(p.chamadas).map(evento => evento.reason), ['sem_vocabulario', 'sem_vocabulario']);
  assert.ok(!p.chamadas.some(([nome]) => nome === 'salvarSeNova'));
}

async function legendaInglesaNovaEGravadaContadaPublicadaERegistrada() {
  const p = portas({ vocab: { en: { words: ['ferry', 'left'] } } });
  const resultado = await MineracaoAutomatica.criar(p).candidata(pedido);

  assert.strictEqual(resultado.action, 'saved');
  assert.strictEqual(resultado.frase.id, 77);
  assert.ok(resultado.evaluation.accept);
  assert.ok(resultado.evaluation.keywords.some(palavra => palavra.startsWith('harbour@')));
  const [, gravada] = p.chamadas.find(([nome]) => nome === 'salvarSeNova');
  assert.deepStrictEqual(plano(gravada), {
    texto: pedido.texto, origem: 'prime', contexto: pedido.contexto, idioma: 'Inglês',
    extras: { autoMiner: true, autoMinerReason: resultado.evaluation.reason, keywords: plano(resultado.evaluation.keywords), autoKeyword: true },
  });
  assert.deepStrictEqual(p.chamadas.map(([nome]) => nome), ['vocabulario', 'salvarSeNova', 'contarMais', 'publicar', 'registrar']);
  assert.deepStrictEqual(p.chamadas.find(([nome]) => nome === 'contarMais'), ['contarMais', 'en']);
  assert.deepStrictEqual(p.chamadas.find(([nome]) => nome === 'publicar'), ['publicar', 1, 0]);
  const evento = eventos(p.chamadas)[0];
  assert.deepStrictEqual([evento.at, evento.action, evento.reason, evento.phraseId, evento.lang], [AGORA, 'saved', resultado.evaluation.reason, 77, 'en']);
  assert.strictEqual(resultado.state.daily.en.count, 1);
}

async function legendaRussaNovaEGravadaSemPalavras() {
  const p = portas();
  const texto = 'Я улыбаюсь';
  const resultado = await MineracaoAutomatica.criar(p).candidata({ texto, origem: 'prime', contexto: null, lang: 'ru' });
  assert.strictEqual(resultado.action, 'saved');
  const [, gravada] = p.chamadas.find(([nome]) => nome === 'salvarSeNova');
  assert.deepStrictEqual(gravada.extras, { autoMiner: true, autoMinerReason: 'ru_i_plus_1' });
  assert.strictEqual(gravada.idioma, 'Russo');
  assert.strictEqual(gravada.origem, 'prime');
  assert.deepStrictEqual(p.chamadas.find(([nome]) => nome === 'contarMais'), ['contarMais', 'ru']);
}

async function aOrigemPadraoEAuto() {
  const p = portas();
  await MineracaoAutomatica.criar(p).candidata({ texto: pedido.texto, lang: 'en' });
  assert.strictEqual(p.chamadas.find(([nome]) => nome === 'salvarSeNova')[1].origem, 'auto');
}

async function aIdiomaDoPedidoVemDoTextoQuandoNaoVemNoPedido() {
  const p = portas();
  const resultado = await MineracaoAutomatica.criar(p).candidata({ texto: 'Я улыбаюсь' });
  assert.strictEqual(resultado.action, 'saved');
  assert.strictEqual(p.chamadas.find(([nome]) => nome === 'salvarSeNova')[1].idioma, 'Russo');
}

async function aDuplicataVemDoHistoricoENaoContaNemPublica() {
  const p = portas({ jaTem: repetida => repetida({ texto: '  THE ferry left   the harbour. ' }) });
  const resultado = await MineracaoAutomatica.criar(p).candidata(pedido);
  assert.deepStrictEqual([resultado.action, resultado.reason], ['skip', 'duplicate']);
  assert.ok(resultado.evaluation.accept);
  assert.ok(!p.chamadas.some(([nome]) => nome === 'contarMais' || nome === 'publicar'));
  assert.strictEqual(eventos(p.chamadas)[0].reason, 'duplicate');
}

async function aDuplicataSoValeParaOMesmoTexto() {
  let perguntou = null;
  const p = portas({ jaTem: repetida => { perguntou = repetida; return false; } });
  await MineracaoAutomatica.criar(p).candidata(pedido);
  assert.strictEqual(perguntou({ texto: 'The ferry left the harbour' }), false);
  assert.strictEqual(perguntou({ texto: 'the ferry left the HARBOUR.' }), true);
  assert.strictEqual(perguntou({}), false);
}

async function umTerceiroIdiomaEhUmaLinhaNaTabela() {
  const p = portas({ ligadas: ['es'] });
  const espanhol = {
    codigo: 'es',
    reconhece: valor => valor.includes('es'),
    rotulo: 'Espanhol',
    guardaPalavras: false,
    avaliar: async texto => ({ accept: texto.length > 3, reason: 'es_novo', keywords: ['hola@0'] }),
  };
  const decisao = MineracaoAutomatica.criar({ ...p, idiomas: [espanhol, ...MineracaoAutomatica.IDIOMAS] });
  const resultado = await decisao.candidata({ texto: 'Hola amigo', origem: 'x', lang: 'es' });
  assert.strictEqual(resultado.action, 'saved');
  const [, gravada] = p.chamadas.find(([nome]) => nome === 'salvarSeNova');
  assert.deepStrictEqual([gravada.idioma, gravada.extras], ['Espanhol', { autoMiner: true, autoMinerReason: 'es_novo' }]);
  assert.deepStrictEqual(p.chamadas.find(([nome]) => nome === 'contarMais'), ['contarMais', 'es']);
}

async function aTabelaPadraoTemInglesERusso() {
  assert.deepStrictEqual(plano(MineracaoAutomatica.IDIOMAS.map(idioma => idioma.codigo)), ['ru', 'en']);
}

async function avaliarSoAvaliaESoLeOVocabularioQuandoPrecisa() {
  const p = portas();
  const decisao = MineracaoAutomatica.criar(p);
  assert.strictEqual((await decisao.avaliar('abc', 'en')).reason, 'low_quality_text');
  assert.strictEqual(p.chamadas.length, 0);
  assert.strictEqual((await decisao.avaliar(pedido.texto, 'en')).accept, true);
  assert.deepStrictEqual(p.chamadas, [['vocabulario', 'en']]);
}

(async () => {
  const casos = [
    textoVazioPula, idiomaDesligadoPulaSemLerOVocabulario, oLimiteDeHojePula, textoDeMaQualidadePulaSemLerOVocabulario,
    semPalavraNovaPulaComOVocabularioLido, umaPalavraNovaNoBaralhoAindaNaoFoiEstudadaEEntra, aMesmaPalavraRecenteMaduraOuMistaNaoEntra,
    duasPalavrasDesconhecidasNaoEntramEOMotivoVaiParaOUltimoEvento, comOAnkiFechadoNaoHaVocabularioENadaEntra,
    legendaInglesaNovaEGravadaContadaPublicadaERegistrada, legendaRussaNovaEGravadaSemPalavras, aOrigemPadraoEAuto,
    aIdiomaDoPedidoVemDoTextoQuandoNaoVemNoPedido, aDuplicataVemDoHistoricoENaoContaNemPublica, aDuplicataSoValeParaOMesmoTexto,
    umTerceiroIdiomaEhUmaLinhaNaTabela, aTabelaPadraoTemInglesERusso, avaliarSoAvaliaESoLeOVocabularioQuandoPrecisa,
  ];
  let falhas = 0;
  for (const caso of casos) {
    try {
      await caso();
      console.log(`ok  ${caso.name}`);
    } catch (erro) {
      falhas++;
      console.log(`FALHOU  ${caso.name}\n${erro.stack || erro.message}`);
    }
  }
  if (falhas) process.exit(1);
  console.log('test_mineracao_automatica.js: tudo certo');
})();
