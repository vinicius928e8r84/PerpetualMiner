'use strict';

// A festa do quiz de nível (#171, `lib/festa-do-quiz.js`), sem tela e sem som: o que um acerto rende (pontos, nota, confete e pulo) conforme a sequência, e a Revelação
// do nível. Roda sem navegador: `node test_festa_do_quiz.js`. O que a pessoa vê e ouve é do e2e (`boas-vindas-quiz-festa.spec.js`).

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

globalThis.PerpetualMiner = {};
require('./lib/quiz-de-nivel.js');
require('./lib/festa-do-quiz.js');
const { FestaDoQuiz, QuizDeNivel } = globalThis.PerpetualMiner;

// Os níveis são os do quiz, e só dele: a festa carregada com outra lista usa essa lista (nenhuma cópia própria).
const comOutrosNiveis = { PerpetualMiner: { QuizDeNivel: { NIVEIS: { A: 'basico', B: 'fluente' } } } };
vm.runInNewContext(fs.readFileSync('./lib/festa-do-quiz.js', 'utf8'), comOutrosNiveis);
assert.deepStrictEqual(JSON.parse(JSON.stringify(comOutrosNiveis.PerpetualMiner.FestaDoQuiz.portas('fluente'))),
  [{ nivel: 'basico', cheia: true }, { nivel: 'fluente', cheia: true }]);
assert.deepStrictEqual(FestaDoQuiz.portas(QuizDeNivel.NIVEIS.INTERMEDIARIO).map(p => p.cheia), [true, true, false]);

const acertos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map(FestaDoQuiz.doAcerto);

// Os pontos sobem de 10 em 10 com a sequência (+10, +20…) e param no teto, para o placar não disparar.
assert.deepStrictEqual(acertos.slice(0, 3).map(a => a.pontos), [10, 20, 30]);
assert.strictEqual(acertos.at(-1).pontos, FestaDoQuiz.TETO_DOS_PONTOS);
assert.ok(acertos.every((a, i) => i === 0 || a.pontos >= acertos[i - 1].pontos));

// O som sobe uma nota a cada acerto seguido e, no fim da escala, fica na última em vez de subir sem fim.
const notas = acertos.map(a => a.nota);
assert.ok(notas.slice(0, FestaDoQuiz.ESCALA.length).every((hz, i) => i === 0 || hz > notas[i - 1]));
assert.strictEqual(notas.at(-1), notas[FestaDoQuiz.ESCALA.length - 1]);

// A festa cresce com a sequência, e o maior confete de um acerto é menor que o da Revelação.
assert.ok(acertos[0].confetes > 0);
assert.ok(acertos.every((a, i) => i === 0 || a.confetes >= acertos[i - 1].confetes));
assert.ok(acertos.every(a => a.confetes < FestaDoQuiz.CONFETES_DA_REVELACAO));
assert.ok(acertos.at(-1).confetes > acertos[0].confetes);

// Sequência zero ou inválida não rende festa.
assert.throws(() => FestaDoQuiz.doAcerto(0));

// A Revelação: as portas enchem uma a uma até o nível e as de cima ficam vazias.
assert.deepStrictEqual(FestaDoQuiz.portas('iniciante').map(p => p.cheia), [true, false, false]);
assert.deepStrictEqual(FestaDoQuiz.portas('intermediario').map(p => p.cheia), [true, true, false]);
assert.deepStrictEqual(FestaDoQuiz.portas('avancado').map(p => p.cheia), [true, true, true]);
assert.deepStrictEqual(FestaDoQuiz.portas('avancado').map(p => p.nivel), ['iniciante', 'intermediario', 'avancado']);
assert.throws(() => FestaDoQuiz.portas('mestre'));

// Cada pedaço de confete sai para um lado diferente, sem depender de sorteio (a mesma festa é sempre a mesma).
const pedacos = FestaDoQuiz.pedacos(12);
assert.strictEqual(pedacos.length, 12);
assert.strictEqual(new Set(pedacos.map(p => `${p.dx},${p.dy}`)).size, 12);
assert.deepStrictEqual(FestaDoQuiz.pedacos(12), pedacos);

console.log('test_festa_do_quiz.js: ok');
