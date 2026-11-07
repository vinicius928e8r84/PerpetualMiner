'use strict';

// A prova da regra relogio-fora-da-fixture (scripts/regras/relogio-fora-da-fixture.js): acusa o relógio que cada teste montava e
// deixa passar o jeito certo; a catraca inteira é provada em test_regras.js.

const assert = require('assert');
const path = require('path');

const regras = Object.fromEntries(require('./verificar').REGRAS.map(regra => [regra.id, regra]));
const RAIZ = path.resolve(__dirname, '..', '..');

let total = 0;
function acusa(id, arquivo, fonte, quantas, porque) {
  const achados = regras[id].verificar(arquivo, fonte, RAIZ);
  assert.strictEqual(achados.length, quantas, `${id} em ${arquivo}: ${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
  return achados;
}

// relogio-fora-da-fixture: o relógio que cada teste montava (#209), e o jeito certo, pela fixture.
// edc5a109 configuracoes-conta.spec.js: `install` sem pausa, o timer de 1,4 s corria antes da assertion.
acusa('relogio-fora-da-fixture', 'e2e/tests/configuracoes-conta.spec.js', [
  "test('Sincronizado há 2 min', async ({ page, extensao }) => {",
  '  await page.clock.install();',
  "  await page.clock.runFor('02:30');",
  '});',
].join('\n'), 1, 'o install sozinho deixa o relógio correndo (edc5a109)');
// e426f7c: a pausa que mira um segundo à frente, recusada com 1.701 ms de atraso entre os comandos.
const [pausaCurta] = acusa('relogio-fora-da-fixture', 'e2e/tests/conexao-na-tela.spec.js', [
  'const agora = new Date();',
  'await page.clock.install({ time: agora });',
  'await page.clock.pauseAt(new Date(agora.getTime() + 1_000));',
].join('\n'), 2, 'a montagem à mão, com a margem que o teste inventou (e426f7c)');
assert.strictEqual(pausaCurta.linha, 2);
total++;
// O mesmo fora de e2e/tests/: nos apoios e no repouso, e em outra página (o segundo perfil).
acusa('relogio-fora-da-fixture', 'e2e/repouso.js', 'await b.clock.install();\nawait b.clock.pauseAt(t);\n', 2, 'o apoio que monta o relógio');
acusa('relogio-fora-da-fixture', 'e2e/tests/painel-anki-visual.spec.js', 'await page\n  .clock\n  .install({ time: AGORA });\n', 1, 'a chamada quebrada em linhas');
// O jeito certo: a fixture; o avanço, o setFixedTime e um comentário que fala do install não são a montagem.
acusa('relogio-fora-da-fixture', 'e2e/tests/chave-autoridade.spec.js', [
  "test('K1', async ({ page, relogioParado }) => {",
  "  // não use page.clock.install nem pauseAt aqui",
  "  const relogio = await relogioParado({ em: new Date('2026-09-18T12:00:00') });",
  '  await relogio.avancar(16000);',
  '  await page.clock.runFor(1);',
  '  await page.clock.setFixedTime(new Date());',
  '});',
].join('\n'), 0, 'a fixture, o avanço e o setFixedTime passam');
// Só o dono monta o relógio, e a regra olha o e2e/ inteiro.
assert.strictEqual(regras['relogio-fora-da-fixture'].seAplica('e2e/relogio-parado.js'), false);
assert.strictEqual(regras['relogio-fora-da-fixture'].seAplica('e2e/repouso.js'), true);
assert.strictEqual(regras['relogio-fora-da-fixture'].seAplica('e2e/tests/relogio-parado.spec.js'), true);
assert.strictEqual(regras['relogio-fora-da-fixture'].seAplica('painel.js'), false);
total += 4;

console.log(`relogio-fora-da-fixture: ${total} provas passaram`);
