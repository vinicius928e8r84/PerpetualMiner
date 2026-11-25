'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const contexto = vm.createContext({ Intl });
contexto.globalThis = contexto;
contexto.PerpetualMiner = {
  CATALOGO_DA_VOZ: {
    'T-01': 'Sem campo',
    'T-02': 'Olá, {nome}!',
    'T-03': '{n} {n|foto|fotos} na fila',
    'T-04': { titulo: 'Total: {total}', sem: { fundo: 'Fundo {n|um|muitos}' } },
  },
};
vm.runInContext(fs.readFileSync('lib/voz/texto.js', 'utf8'), contexto);
const { textoDaVoz } = contexto.PerpetualMiner;
const erroDe = (id, valores) => {
  try {
    textoDaVoz(id, valores);
  } catch (erro) {
    return erro.message;
  }
  return null;
};

assert.strictEqual(textoDaVoz('T-01'), 'Sem campo');
assert.strictEqual(textoDaVoz('T-02', { nome: 'Ana' }), 'Olá, Ana!');
assert.strictEqual(textoDaVoz('T-02', { nome: 0 }), 'Olá, 0!');
assert.strictEqual(textoDaVoz('T-02', { nome: false }), 'Olá, false!');
assert.strictEqual(textoDaVoz('T-02', { nome: '' }), 'Olá, !');
assert.strictEqual(textoDaVoz('T-04.titulo', { total: 1234567 }), 'Total: 1.234.567');
assert.strictEqual(textoDaVoz('T-04.titulo', { total: 1234.5 }), 'Total: 1.234,5');

assert.strictEqual(textoDaVoz('T-03', { n: 1 }), '1 foto na fila');
assert.strictEqual(textoDaVoz('T-03', { n: -1 }), '-1 foto na fila');
assert.strictEqual(textoDaVoz('T-03', { n: 0 }), '0 fotos na fila');
assert.strictEqual(textoDaVoz('T-03', { n: 2 }), '2 fotos na fila');
assert.strictEqual(textoDaVoz('T-03', { n: 1500 }), '1.500 fotos na fila');
assert.strictEqual(textoDaVoz('T-04.sem.fundo', { n: 1 }), 'Fundo um');

assert.strictEqual(erroDe('T-02', {}), 'Falta o valor "nome" para o texto T-02');
assert.strictEqual(erroDe('T-02', { nome: undefined }), 'Falta o valor "nome" para o texto T-02');
assert.strictEqual(erroDe('T-02', { nome: null }), 'Falta o valor "nome" para o texto T-02');
assert.strictEqual(erroDe('T-03', { n: '2' }), 'O valor "n" do texto T-03 escolhe o plural, então precisa ser número');
assert.strictEqual(erroDe('T-03', {}), 'Falta o valor "n" para o texto T-03');
assert.strictEqual(erroDe('T-99'), 'Texto fora do catálogo da Voz: T-99');
assert.strictEqual(erroDe('T-04'), 'O estado T-04 é dividido em partes: titulo, sem');
assert.strictEqual(erroDe('T-04.nada'), 'O estado T-04 não tem a parte "nada": titulo, sem');
assert.strictEqual(erroDe('T-01.nada'), 'O estado T-01 não tem a parte "nada": (nenhuma)');

console.log('ok');
