'use strict';

const assert = require('assert');
const path = require('path');

const regras = Object.fromEntries(require('./verificar').REGRAS.map(regra => [regra.id, regra]));
const RAIZ = path.resolve(__dirname, '..', '..');

const REGRA = regras['relogio-fora-da-fixture'];

let total = 0;
function acusa(arquivo, fonte, quantas, porque) {
  const achados = REGRA.verificar(arquivo, fonte, RAIZ);
  assert.strictEqual(achados.length, quantas, `${REGRA.id} em ${arquivo}: ${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
  return achados;
}

function confereSeAplica(arquivo, esperado) {
  assert.strictEqual(REGRA.seAplica(arquivo), esperado);
  total++;
}

acusa('e2e/tests/configuracoes-conta.spec.js', [
  "test('Sincronizado há 2 min', async ({ page, extensao }) => {",
  '  await page.clock.install();',
  "  await page.clock.runFor('02:30');",
  '});',
].join('\n'), 1, 'o install sozinho deixa o relógio correndo (edc5a109)');
const [pausaCurta] = acusa('e2e/tests/conexao-na-tela.spec.js', [
  'const agora = new Date();',
  'await page.clock.install({ time: agora });',
  'await page.clock.pauseAt(new Date(agora.getTime() + 1_000));',
].join('\n'), 2, 'a montagem à mão, com a margem que o teste inventou (e426f7c)');
assert.strictEqual(pausaCurta.linha, 2);
total++;
acusa('e2e/repouso.js', 'await b.clock.install();\nawait b.clock.pauseAt(t);\n', 2, 'o apoio que monta o relógio');
acusa('e2e/tests/painel-anki-visual.spec.js', 'await page\n  .clock\n  .install({ time: AGORA });\n', 1, 'a chamada quebrada em linhas');
acusa('e2e/tests/chave-autoridade.spec.js', [
  "test('K1', async ({ page, relogioParado }) => {",
  "  // não use page.clock.install nem pauseAt aqui",
  "  const relogio = await relogioParado({ em: new Date('2026-09-18T12:00:00') });",
  '  await relogio.avancar(16000);',
  '  await page.clock.runFor(1);',
  '  await page.clock.setFixedTime(new Date());',
  '});',
].join('\n'), 0, 'a fixture, o avanço e o setFixedTime passam');
acusa('e2e/tests/a.spec.js', 'const relogio = page.clock;\nawait relogio.install();\n', 1, 'o apelido de page.clock');
acusa('e2e/tests/a.spec.js', 'const { install, pauseAt } = page.clock;\n', 1, 'desestruturar o que page.clock devolve');
acusa('e2e/tests/a.spec.js', 'const { clock } = page;\nawait clock.install();\n', 2, 'desestruturar clock de page e instalar');
acusa('e2e/tests/a.spec.js', 'const { clock: relogio } = context;\n', 1, 'desestruturar clock com outro nome');
acusa('e2e/tests/a.spec.js', "await page.clock['install']();\nawait page.clock[\"pauseAt\"](t);\n", 2, 'colchetes no método');
acusa('e2e/tests/a.spec.js', "await page['clock'].install();\nawait page['clock']['pauseAt'](t);\n", 2, 'colchetes em clock');
acusa('e2e/tests/a.spec.js', 'await page.clock[comando](t);\nawait instalar(page.clock);\n', 2, 'método calculado e page.clock passado adiante');
acusa('e2e/tests/a.spec.js', "await page.clock?.install();\n", 1, 'encadeamento opcional');
acusa('e2e/tests/a.spec.js', "const { montarRelogio } = require('../relogio-parado');\nawait montarRelogio(page, { desde: agora });\n", 2, 'o montarRelogio exportado fora da prova');
acusa('e2e/repouso.js', "const { montarRelogio: montar } = require('./relogio-parado');\n", 1, 'o montarRelogio importado com outro nome, num apoio');
acusa('e2e/tests/a.spec.js', [
  "await page.clock.runFor(1);",
  "await page['clock'].setFixedTime(new Date());",
  "const { page, context } = extensao;",
  "const frase = 'The clock tower'; const torre = { clockTower: 1 };",
].join('\n'), 0, 'o avanço, o setFixedTime e o texto clock não são a montagem');
acusa('e2e/tests/relogio-parado.spec.js', [
  "const { montarRelogio } = require('../relogio-parado');",
  'const sobAtraso = page => ({ clock: new Proxy(page.clock, {}) });',
  'await montarRelogio(page, { desde: AGORA });',
].join('\n'), 0, 'a prova usa o montarRelogio e embrulha page.clock');
acusa('e2e/tests/relogio-parado.spec.js', 'await page.clock.install();\n', 1, 'nem a prova instala direto');

confereSeAplica('e2e/relogio-parado.js', false);
confereSeAplica('e2e/repouso.js', true);
confereSeAplica('e2e/tests/relogio-parado.spec.js', true);
confereSeAplica('painel.js', false);

console.log(`relogio-fora-da-fixture: ${total} provas passaram`);
