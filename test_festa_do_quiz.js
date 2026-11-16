'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

globalThis.PerpetualMiner = {};
require('./lib/quiz-de-nivel.js');
require('./lib/festa-do-quiz.js');
const { FestaDoQuiz, QuizDeNivel } = globalThis.PerpetualMiner;

const comOutrosNiveis = { PerpetualMiner: { QuizDeNivel: { NIVEIS: { A: 'basico', B: 'fluente' } } } };
vm.runInNewContext(fs.readFileSync('./lib/festa-do-quiz.js', 'utf8'), comOutrosNiveis);
assert.deepStrictEqual(JSON.parse(JSON.stringify(comOutrosNiveis.PerpetualMiner.FestaDoQuiz.portas('fluente'))),
  [{ nivel: 'basico', cheia: true }, { nivel: 'fluente', cheia: true }]);
assert.deepStrictEqual(FestaDoQuiz.portas(QuizDeNivel.NIVEIS.INTERMEDIARIO).map(p => p.cheia), [true, true, false]);

const acertos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map(FestaDoQuiz.doAcerto);

assert.deepStrictEqual(acertos.slice(0, 3).map(a => a.pontos), [10, 20, 30]);
assert.strictEqual(acertos.at(-1).pontos, FestaDoQuiz.TETO_DOS_PONTOS);
assert.ok(acertos.every((a, i) => i === 0 || a.pontos >= acertos[i - 1].pontos));

const notas = acertos.map(a => a.nota);
assert.ok(notas.slice(0, FestaDoQuiz.ESCALA.length).every((hz, i) => i === 0 || hz > notas[i - 1]));
assert.strictEqual(notas.at(-1), notas[FestaDoQuiz.ESCALA.length - 1]);

assert.ok(acertos[0].confetes > 0);
assert.ok(acertos.every((a, i) => i === 0 || a.confetes >= acertos[i - 1].confetes));
assert.ok(acertos.every(a => a.confetes < FestaDoQuiz.CONFETES_DA_REVELACAO));
assert.ok(acertos.at(-1).confetes > acertos[0].confetes);

assert.throws(() => FestaDoQuiz.doAcerto(0));

assert.deepStrictEqual(FestaDoQuiz.portas('iniciante').map(p => p.cheia), [true, false, false]);
assert.deepStrictEqual(FestaDoQuiz.portas('intermediario').map(p => p.cheia), [true, true, false]);
assert.deepStrictEqual(FestaDoQuiz.portas('avancado').map(p => p.cheia), [true, true, true]);
assert.deepStrictEqual(FestaDoQuiz.portas('avancado').map(p => p.nivel), ['iniciante', 'intermediario', 'avancado']);
assert.throws(() => FestaDoQuiz.portas('mestre'));

const pedacos = FestaDoQuiz.pedacos(12);
assert.strictEqual(pedacos.length, 12);
assert.strictEqual(new Set(pedacos.map(p => `${p.dx},${p.dy}`)).size, 12);
assert.deepStrictEqual(FestaDoQuiz.pedacos(12), pedacos);

console.log('test_festa_do_quiz.js: ok');
