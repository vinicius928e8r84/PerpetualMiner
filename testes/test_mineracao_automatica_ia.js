'use strict';

const assert = require('assert');
const { MineracaoAutomatica, plano, portas, eventos, pedido } = require('./apoio-da-decisao-automatica');

const ELA = "She can't put up with him";
const TUDO_CONHECIDO = { en: { words: ['she', "can't", 'put', 'up', 'with', 'him'] } };
const INICIANTE_QUE_JA_LE_LINHAS_LONGAS = { en: { words: [...TUDO_CONHECIDO.en.words, ...Array.from({ length: 200 }, (_, i) => `conhecida${i}`)] } };
const PUT_UP_WITH = [{ posicoes: [2, 3, 4], tipo: 'phrasal_verb', comum: true }];
const perguntas = chamadas => chamadas.filter(([nome]) => nome === 'termos');

async function aIAPerguntaOsTermosDaLinhaQuandoTudoEConhecidoEOPhrasalVerbEntraInteiro() {
  const p = portas({ vocab: TUDO_CONHECIDO, termos: PUT_UP_WITH });
  const resultado = await MineracaoAutomatica.criar(p).candidata({ ...pedido, texto: ELA });
  assert.strictEqual(resultado.action, 'saved');
  assert.deepStrictEqual(plano(resultado.evaluation.keywords), ['put@4', 'up@6', 'with@8']);
  assert.deepStrictEqual(perguntas(p.chamadas), [['termos', 'en', ELA]]);
  assert.strictEqual(eventos(p.chamadas)[0].evaluation.iaPerguntada, true);
  assert.deepStrictEqual(p.chamadas.find(([nome]) => nome === 'salvarSeNova')[1].extras.keywords, ['put@4', 'up@6', 'with@8']);
}

async function oPhrasalVerbRecenteNoVocabularioNaoEntra() {
  const vocab = { en: { ...TUDO_CONHECIDO.en, terms: ['put up with'], termStatus: { 'put up with': 'recent' } } };
  const p = portas({ vocab, termos: PUT_UP_WITH });
  const resultado = await MineracaoAutomatica.criar(p).candidata({ ...pedido, texto: ELA });
  assert.deepStrictEqual([resultado.action, resultado.reason], ['skip', 'nada_novo']);
  assert.strictEqual(perguntas(p.chamadas).length, 1);
  assert.ok(!p.chamadas.some(([nome]) => nome === 'salvarSeNova' || nome === 'contarMais'));
}

async function oNomeQueAIAReconheceNaoEntraNemEGrifado() {
  const texto = "Tell Walter I'm here";
  const p = portas({ vocab: { en: { words: ['tell', "i'm", 'here', 'walter'] } }, termos: [{ posicoes: [1], tipo: 'nome', comum: false }] });
  const resultado = await MineracaoAutomatica.criar(p).candidata({ ...pedido, texto });
  assert.deepStrictEqual([resultado.action, resultado.reason], ['skip', 'nada_novo']);
  assert.deepStrictEqual(plano(resultado.evaluation.keywords || []), []);
}

async function duasDesconhecidasProximasEntramSeAIADizUmTermoSoESaoDuasCoisasSeNao() {
  const umTermo = portas({ vocab: { en: { words: ['he', 'money'] } }, termos: [{ posicoes: [2, 3], tipo: 'phrasal_verb', comum: true }] });
  const entrou = await MineracaoAutomatica.criar(umTermo).candidata({ ...pedido, texto: 'He will fritter away money' });
  assert.deepStrictEqual([entrou.action, plano(entrou.evaluation.keywords)], ['saved', ['fritter@4', 'away@6']]);

  const duasCoisas = portas({ vocab: { en: { words: ['ferry'] } }, termos: [{ posicoes: [2], tipo: 'palavra', comum: true }, { posicoes: [4], tipo: 'palavra', comum: true }] });
  const recusada = await MineracaoAutomatica.criar(duasCoisas).candidata(pedido);
  assert.deepStrictEqual([recusada.action, recusada.reason], ['skip', 'nao_e_i_mais_1']);
  assert.strictEqual(perguntas(duasCoisas.chamadas).length, 1);
}

async function aIANuncaEChamadaQuandoOCodigoJaTemCerteza() {
  const cenarios = {
    'uma palavra desconhecida so': { vocab: { en: { words: ['ferry', 'left'] } } },
    'tres ou mais desconhecidas': { texto: 'zebra yak llama', vocab: { en: { words: [] } } },
    'duas longe uma da outra': { texto: 'Zebra and the old man saw llama', vocab: { en: { words: ['old', 'man', 'saw'] } } },
    'no Iniciante, em dúvida': { nivel: 'iniciante', texto: ELA, vocab: INICIANTE_QUE_JA_LE_LINHAS_LONGAS },
    'a linha de uma palavra so, conhecida': { texto: 'Harbour', vocab: { en: { words: ['harbour'] } } },
    'texto lixo': { texto: 'skip intro', vocab: TUDO_CONHECIDO },
    'linha longa demais em inglês': { texto: `${'word '.repeat(60)}end`, vocab: TUDO_CONHECIDO },
    'linha longa demais em russo': { texto: `${'слово '.repeat(120)}конец`, lang: 'ru', vocab: { ru: { words: ['слово', 'конец'] } } },
    'idioma desligado': { ligadas: ['ru'], texto: ELA, vocab: TUDO_CONHECIDO },
    'no limite do dia': { contagem: { en: 5 }, limite: 5, texto: ELA, vocab: TUDO_CONHECIDO },
    'sem Vocabulário': { texto: ELA, vocab: { en: { available: false } } },
  };
  for (const [nome, { texto = pedido.texto, lang = 'en', vocab, ...ajustes }] of Object.entries(cenarios)) {
    const p = portas({ vocab, termos: PUT_UP_WITH, ...ajustes });
    await MineracaoAutomatica.criar(p).candidata({ ...pedido, texto, lang });
    assert.deepStrictEqual(perguntas(p.chamadas), [], nome);
  }
}

async function antesDosFiltrosDeGracaNemOVocabularioNemONivelSaoLidos() {
  for (const ajustes of [{ ligadas: ['ru'] }, { contagem: { en: 5 }, limite: 5 }]) {
    const p = portas({ vocab: TUDO_CONHECIDO, termos: PUT_UP_WITH, ...ajustes });
    await MineracaoAutomatica.criar(p).candidata({ ...pedido, texto: ELA });
    assert.deepStrictEqual(p.chamadas.map(([nome]) => nome).filter(nome => ['vocabulario', 'termos'].includes(nome)), []);
    assert.deepStrictEqual(p.niveisPedidos, []);
  }
}

async function semRespostaDaIAOCodigoDecideSozinhoPelasPalavrasSoltas() {
  for (const semResposta of [null, new Error('sem plano e sem chave'), []]) {
    const tudoConhecido = portas({ vocab: TUDO_CONHECIDO, termos: semResposta });
    const nada = await MineracaoAutomatica.criar(tudoConhecido).candidata({ ...pedido, texto: ELA });
    assert.deepStrictEqual([nada.action, nada.reason, perguntas(tudoConhecido.chamadas).length], ['skip', 'nada_novo', 1]);

    const duas = portas({ vocab: { en: { words: ['ferry'] } }, termos: semResposta });
    const recusada = await MineracaoAutomatica.criar(duas).candidata(pedido);
    assert.deepStrictEqual([recusada.action, recusada.reason, perguntas(duas.chamadas).length], ['skip', 'nao_e_i_mais_1', 1]);
  }
}

async function aExpressaoRussaDePalavrasConhecidasEntraInteira() {
  const p = portas({ vocab: { ru: { words: ['он', 'взял', 'себя', 'руки'] } }, termos: [{ posicoes: [1, 2, 3, 4], tipo: 'expressao', comum: true }] });
  const resultado = await MineracaoAutomatica.criar(p).candidata({ texto: 'Он взял себя в руки', lang: 'ru', origem: 'prime' });
  assert.deepStrictEqual([resultado.action, resultado.evaluation.reason], ['saved', 'ru_i_plus_1']);
  assert.deepStrictEqual(perguntas(p.chamadas), [['termos', 'ru', 'Он взял себя в руки']]);
}

async function oNivelDaPessoaMudaAEscolhaNaProximaLinha() {
  let nivel = 'iniciante';
  const p = { ...portas({ vocab: INICIANTE_QUE_JA_LE_LINHAS_LONGAS, termos: PUT_UP_WITH }), nivel: async () => nivel };
  const decisao = MineracaoAutomatica.criar(p);
  assert.strictEqual((await decisao.candidata({ ...pedido, texto: ELA })).reason, 'nada_novo');
  nivel = 'avancado';
  assert.strictEqual((await decisao.candidata({ ...pedido, texto: ELA })).action, 'saved');
}

async function oNivelEscolheOTipoDoTermoENaProximaLinhaOQueMudouJaValeu() {
  const texto = 'They had to rustle up some food';
  const vocab = { en: { words: ['they', 'had', 'to', 'rustle', 'up', 'some', 'food'] } };
  let nivel = 'intermediario';
  const p = { ...portas({ vocab, termos: [{ posicoes: [3, 4], tipo: 'phrasal_verb', comum: false }] }), nivel: async () => nivel };
  const decisao = MineracaoAutomatica.criar(p);
  const recusada = await decisao.candidata({ ...pedido, texto });
  assert.deepStrictEqual([recusada.action, recusada.reason, recusada.evaluation.iaPerguntada], ['skip', 'fora_do_nivel', true]);
  assert.ok(!p.chamadas.some(([nome]) => nome === 'salvarSeNova' || nome === 'contarMais'));
  nivel = 'avancado';
  const aceita = await decisao.candidata({ ...pedido, texto: `${texto}.` });
  assert.deepStrictEqual([aceita.action, plano(aceita.evaluation.keywords)], ['saved', ['rustle@6', 'up@8']]);
}

(async () => {
  const casos = [
    aIAPerguntaOsTermosDaLinhaQuandoTudoEConhecidoEOPhrasalVerbEntraInteiro,
    oPhrasalVerbRecenteNoVocabularioNaoEntra,
    oNomeQueAIAReconheceNaoEntraNemEGrifado,
    duasDesconhecidasProximasEntramSeAIADizUmTermoSoESaoDuasCoisasSeNao,
    aIANuncaEChamadaQuandoOCodigoJaTemCerteza,
    antesDosFiltrosDeGracaNemOVocabularioNemONivelSaoLidos,
    semRespostaDaIAOCodigoDecideSozinhoPelasPalavrasSoltas,
    aExpressaoRussaDePalavrasConhecidasEntraInteira,
    oNivelDaPessoaMudaAEscolhaNaProximaLinha,
    oNivelEscolheOTipoDoTermoENaProximaLinhaOQueMudouJaValeu,
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
  console.log('test_mineracao_automatica_ia.js: tudo certo');
})();
