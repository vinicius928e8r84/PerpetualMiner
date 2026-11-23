'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { lerHtml, acharNo, retrato } = require('./retrato_da_arvore');

const RAIZ = path.join(__dirname, '..');
const ler = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');

const esperado = ler('testes/retratos/esqueleto_das_frases.txt');
const area = acharNo(lerHtml(ler('painel/painel.html')), 'section', 'data-area', 'frases');

assert(area, 'a página do painel devia ter a Área Frases');
assert.strictEqual(retrato(area), esperado, 'a árvore da Área Frases mudou: tags, ids, classes, aria-*, data-voz e hidden têm de ficar como estavam');

console.log('ok: a Área Frases tem a mesma árvore');
