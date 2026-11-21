'use strict';

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('../lib/ajustes-de-envio.js');
require('../lib/quiz-de-nivel.js');
const { QuizDeNivel } = globalThis.PerpetualMiner;
const { TIPOS, NAO_SEI } = QuizDeNivel;

const FORA_DA_PERGUNTA = [-1, 4, 5, 1.5, -0.5, '1', '0', NaN, Infinity, -Infinity, null, undefined, true, [1], {}, 'nao sei'];

function aEscolhaForaDaPerguntaERecusada(lang) {
  for (const escolha of FORA_DA_PERGUNTA) {
    const quiz = QuizDeNivel.iniciar(lang, TIPOS.LEGENDA);
    const antes = quiz.pergunta();
    assert.throws(() => quiz.responder(escolha), { message: `Alternativa fora da pergunta: ${escolha}` }, `${lang}: ${String(escolha)} não é alternativa`);
    assert.deepStrictEqual(quiz.pergunta(), antes, `${lang}: a escolha recusada (${String(escolha)}) não passa a pergunta`);
    assert.strictEqual(quiz.sequencia(), 0);
  }
}

function cadaAlternativaDaPerguntaEAceita(lang) {
  for (const escolha of [0, 1, 2, 3, -0]) {
    const quiz = QuizDeNivel.iniciar(lang, TIPOS.LEGENDA);
    const { certa } = quiz.pergunta();
    const resposta = quiz.responder(escolha);
    const acertou = escolha === certa;
    assert.deepStrictEqual(resposta, { acertou, naoSei: false, certa, sequencia: acertou ? 1 : 0, melhorSequencia: acertou ? 1 : 0 },
      `${lang}: a alternativa ${escolha} é aceita`);
    assert.strictEqual(quiz.pergunta().numero, 2, `${lang}: a alternativa ${escolha} passa a pergunta`);
  }
}

function oNaoSeiNaoAcerta(lang) {
  const quiz = QuizDeNivel.iniciar(lang, TIPOS.VERSO);
  const { certa } = quiz.pergunta();
  assert.deepStrictEqual(quiz.responder(NAO_SEI), { acertou: false, naoSei: true, certa, sequencia: 0, melhorSequencia: 0 }, `${lang}: Não sei`);
}

function aSequenciaSobeParaEZera(lang) {
  const quiz = QuizDeNivel.iniciar(lang, TIPOS.VERSO);
  const passos = [];
  const responderAssim = jeito => {
    const { certa, opcoes } = quiz.pergunta();
    const escolha = { certo: certa, errado: (certa + 1) % opcoes.length, naoSei: NAO_SEI }[jeito];
    const { sequencia, melhorSequencia } = quiz.responder(escolha);
    passos.push([jeito, sequencia, melhorSequencia]);
  };
  for (const jeito of ['certo', 'certo', 'errado', 'certo', 'naoSei', 'errado']) responderAssim(jeito);
  assert.deepStrictEqual(passos, [
    ['certo', 1, 1], ['certo', 2, 2], ['errado', 0, 2], ['certo', 1, 2], ['naoSei', 1, 2], ['errado', 0, 2],
  ], `${lang}: a sequência sobe no acerto, para no Não sei e zera no erro; a melhor fica`);
  assert.strictEqual(quiz.pergunta(), null);
  assert.throws(() => quiz.responder(0), { message: 'O quiz já acabou' });
  assert.throws(() => quiz.responder(NAO_SEI), { message: 'O quiz já acabou' });
  assert.deepStrictEqual([quiz.sequencia(), quiz.melhorSequencia()], [0, 2]);
}

for (const lang of ['en', 'ru']) {
  aEscolhaForaDaPerguntaERecusada(lang);
  cadaAlternativaDaPerguntaEAceita(lang);
  oNaoSeiNaoAcerta(lang);
  aSequenciaSobeParaEZera(lang);
}

console.log('quiz de nível escolha tests passed');
