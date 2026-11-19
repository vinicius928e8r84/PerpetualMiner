'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const contexto = vm.createContext({});
contexto.globalThis = contexto;
vm.runInContext(fs.readFileSync('veio/componentes.js', 'utf8'), contexto);
const { separarTeclas } = contexto.PerpetualMiner.Veio;

const junto = rotulo => [...separarTeclas(rotulo)].join('|');
assert.strictEqual(junto('Ctrl++'), 'Ctrl|+');
assert.strictEqual(junto('Alt+S'), 'Alt|S');
assert.strictEqual(junto('+'), '+');
assert.strictEqual(junto('Ctrl+Alt++'), 'Ctrl|Alt|+');

console.log('separarTeclas tests passed');
