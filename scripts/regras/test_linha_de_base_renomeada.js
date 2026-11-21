'use strict';

const assert = require('assert');
const { renomeacoes } = require('./verificar');
const { raizTemporaria } = require('./apoio-sem-comentario');

const { raiz, git, gravar, commit } = raizTemporaria();
const conteudo = Array.from({ length: 30 }, (_, i) => `linha ${i}\n`).join('');
gravar({ 'painel.js': conteudo, 'outro.js': 'a\n' });
commit('base');
const base = git('rev-parse', 'HEAD');
git('checkout', '-q', '-b', 'mudanca');
git('mv', 'painel.js', 'painel-novo.js');
assert.deepStrictEqual(renomeacoes(raiz, base), { 'painel-novo.js': 'painel.js' }, 'um arquivo movido herda a linha de base do nome antigo');
assert.deepStrictEqual(renomeacoes(raiz, null), {}, 'sem base não há renomeação');
git('mv', 'outro.js', 'novo.js');
gravar({ 'novo.js': 'b\nc\nd\n' });
assert.strictEqual(renomeacoes(raiz, base)['novo.js'], undefined, 'um arquivo trocado por outro, não movido, não herda');
console.log('linha de base renomeada ok');
