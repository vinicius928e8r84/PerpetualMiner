'use strict';

const assert = require('assert');
const path = require('path');

const regra = Object.fromEntries(require('./verificar').REGRAS.map(r => [r.id, r]))['e2e-funcao-interna'];
const RAIZ = path.resolve(__dirname, '..', '..');

const marcaComLinhasEmBranco = branco => [
  '// Exceção de teste: catálogo (docs/testes.md).',
  ...Array(branco).fill(''),
  'const texto = await page.evaluate(() => PerpetualMiner.textoDaVoz("PAI-05"));',
].join('\n');

const achadosCom = fonte => regra.verificar('e2e/tests/review-probe.spec.js', fonte, RAIZ);

assert.strictEqual(achadosCom(marcaComLinhasEmBranco(11)).length, 0, 'a marca na última linha que a janela de doze alcança');
assert.strictEqual(achadosCom(marcaComLinhasEmBranco(12)).length, 1, 'a marca uma linha além da janela de doze');

const parada = [
  '// Exceção de teste: catálogo (docs/testes.md).',
  'const outra = 1;',
  'const texto = await page.evaluate(() => PerpetualMiner.textoDaVoz("PAI-05"));',
].join('\n');
assert.strictEqual(achadosCom(parada).length, 1, 'a marca acima de uma instrução encerrada não cobre a chamada');

const [achado] = achadosCom('await page.evaluate(() => PerpetualMiner.Veio.A);\nawait page.evaluate(() => PerpetualMiner.Veio.A);\n');
assert.strictEqual(achado.detalhe, 'evaluate chama o código da extensão: PerpetualMiner.Veio.A');

console.log('e2e-funcao-interna: 4 provas passaram');
