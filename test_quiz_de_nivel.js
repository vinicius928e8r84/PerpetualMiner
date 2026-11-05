'use strict';

// A regra do quiz de nível (#170, `lib/quiz-de-nivel.js`), sem tela: por qual portão a parte 2 começa, quantas perguntas entram, o nível que cada caminho dá
// e a sequência de acertos. Roda sem navegador: `node test_quiz_de_nivel.js`. O que a pessoa vê e o nível que fica guardado são do e2e (`boas-vindas-quiz.spec.js`).

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('./lib/quiz-de-nivel.js');
const { QuizDeNivel } = globalThis.PerpetualMiner;
const { TIPOS, NAO_SEI, NIVEIS } = QuizDeNivel;

/** Roda o quiz respondendo cada pergunta como o roteiro manda (`'certo'`, `'errado'` ou `'nao_sei'`, por tipo e ordem); devolve os tipos perguntados e o resultado. */
function rodar(lang, inicial, roteiro) {
  const quiz = QuizDeNivel.iniciar(lang, inicial);
  const vistos = [];
  const contagem = {};
  for (let pergunta = quiz.pergunta(); pergunta; pergunta = quiz.pergunta()) {
    const ordem = contagem[pergunta.tipo] = (contagem[pergunta.tipo] ?? -1) + 1;
    const jeito = roteiro[pergunta.tipo]?.[ordem] ?? 'certo';
    vistos.push(pergunta.tipo);
    quiz.responder(jeito === 'nao_sei' ? NAO_SEI : jeito === 'certo' ? pergunta.certa : (pergunta.certa + 1) % pergunta.opcoes.length);
  }
  return { vistos, resultado: quiz.resultado() };
}

const L = TIPOS.LEGENDA, V = TIPOS.VERSO, E = TIPOS.ESCUTA;

for (const lang of ['en', 'ru']) {
  // Começando pela legenda (a parte 1 aponta Iniciante)
  assert.deepStrictEqual(rodar(lang, L, { legenda: ['errado', 'certo'] }).vistos, [L, E, L], `${lang}: errou uma de legenda, são 3 perguntas`);
  assert.strictEqual(rodar(lang, L, { legenda: ['errado', 'certo'] }).resultado.nivel, NIVEIS.INICIANTE);
  assert.strictEqual(rodar(lang, L, { legenda: ['nao_sei', 'certo'] }).resultado.nivel, NIVEIS.INICIANTE, `${lang}: Não sei não passa o portão`);
  assert.deepStrictEqual(rodar(lang, L, {}).vistos, [L, E, L, V, E, V], `${lang}: acertou as 2 de legenda, entra o verso: 6 perguntas`);
  assert.strictEqual(rodar(lang, L, {}).resultado.nivel, NIVEIS.AVANCADO);
  assert.strictEqual(rodar(lang, L, { verso: ['certo', 'errado'] }).resultado.nivel, NIVEIS.INTERMEDIARIO);
  assert.strictEqual(rodar(lang, L, { verso: ['errado', 'errado'] }).resultado.nivel, NIVEIS.INTERMEDIARIO);

  // Começando pelo verso (a parte 1 aponta Intermediário ou Avançado)
  assert.deepStrictEqual(rodar(lang, V, {}).vistos, [V, E, V], `${lang}: acertou as 2 do verso, são 3 perguntas`);
  assert.strictEqual(rodar(lang, V, {}).resultado.nivel, NIVEIS.AVANCADO);
  assert.deepStrictEqual(rodar(lang, V, { verso: ['certo', 'errado'] }).vistos, [V, E, V, L, E, L], `${lang}: errou uma do verso, entra a legenda: 6 perguntas`);
  assert.strictEqual(rodar(lang, V, { verso: ['errado', 'certo'] }).resultado.nivel, NIVEIS.INTERMEDIARIO);
  assert.strictEqual(rodar(lang, V, { verso: ['nao_sei', 'certo'], legenda: ['certo', 'errado'] }).resultado.nivel, NIVEIS.INICIANTE);
  assert.strictEqual(rodar(lang, V, { verso: ['errado', 'errado'], legenda: ['errado', 'errado'] }).resultado.nivel, NIVEIS.INICIANTE);

  // A escuta aparece no resultado e não muda o nível
  const surdo = rodar(lang, L, { escuta: ['errado', 'errado'] }).resultado;
  assert.strictEqual(surdo.nivel, NIVEIS.AVANCADO);
  assert.deepStrictEqual(surdo.escuta, { acertos: 0, perguntas: 2 });
  assert.deepStrictEqual(rodar(lang, V, {}).resultado.escuta, { acertos: 1, perguntas: 1 });
}

// A sequência: cada acerto sobe, “Não sei” a pausa e o chute errado a zera
{
  const quiz = QuizDeNivel.iniciar('en', L);
  const certa = () => quiz.pergunta().certa;
  assert.strictEqual(quiz.responder(certa()).sequencia, 1);
  assert.strictEqual(quiz.responder(certa()).sequencia, 2);
  const pausada = quiz.responder(NAO_SEI);
  assert.deepStrictEqual([pausada.sequencia, pausada.acertou, pausada.certa >= 0], [2, false, true], 'Não sei pausa a sequência');
  assert.strictEqual(quiz.pergunta(), null);
  assert.strictEqual(quiz.melhorSequencia(), 2);
}
{
  const quiz = QuizDeNivel.iniciar('en', L);
  quiz.responder(quiz.pergunta().certa);
  quiz.responder(quiz.pergunta().certa);
  const errada = quiz.responder((quiz.pergunta().certa + 1) % 4);
  assert.deepStrictEqual([errada.sequencia, errada.melhorSequencia], [0, 2], 'o chute errado zera a sequência e guarda a melhor');
  assert.strictEqual(quiz.sequencia(), 0);
}

// A parte 1 escolhe o portão pela soma das alternativas
assert.strictEqual(QuizDeNivel.portaoInicial([0, 0]), L);
assert.strictEqual(QuizDeNivel.portaoInicial([1, 0]), L);
assert.strictEqual(QuizDeNivel.portaoInicial([1, 1]), V);
assert.strictEqual(QuizDeNivel.portaoInicial([0, 2]), V);
assert.strictEqual(QuizDeNivel.portaoInicial([2, 2]), V);

// Cada idioma tem 2 perguntas de cada tipo, de 4 alternativas, com a certa entre elas
for (const [lang, porTipo] of Object.entries(QuizDeNivel.PERGUNTAS)) {
  for (const tipo of Object.values(TIPOS)) {
    assert.strictEqual(porTipo[tipo].length, 2, `${lang}: duas de ${tipo}`);
    for (const pergunta of porTipo[tipo]) {
      assert.strictEqual(pergunta.opcoes.length, 4);
      assert.strictEqual(new Set(pergunta.opcoes).size, 4);
      assert(pergunta.certa >= 0 && pergunta.certa < 4);
      assert(pergunta.texto.length > 0 && pergunta.texto.length <= 200, 'a Conexão fala até 200 letras');
    }
  }
}

assert.throws(() => QuizDeNivel.iniciar('fr', L));
assert.throws(() => QuizDeNivel.iniciar('en', L).responder(4));

console.log('quiz de nível tests passed');
