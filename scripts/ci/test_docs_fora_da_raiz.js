'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const VELHO = /(^|[^/A-Za-z_.-])(glossary\.md|CODING_STANDARDS\.md)/;

for (const arquivo of ['glossary.md', 'CODING_STANDARDS.md']) {
  assert(!fs.existsSync(path.join(RAIZ, arquivo)), `${arquivo} mora em docs/, não na raiz`);
  assert(fs.existsSync(path.join(RAIZ, 'docs', arquivo)), `falta docs/${arquivo}`);
}

const rastreados = execFileSync('git', ['-C', RAIZ, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const textos = rastreados.filter(arquivo => !/\.(png|jpe?g|gif|webp|woff2?|ico|zip|ankiaddon|pdf)$/i.test(arquivo) && fs.statSync(path.join(RAIZ, arquivo), { throwIfNoEntry: false })?.isFile());
const soltas = [];
for (const arquivo of textos) {
  if (arquivo === 'scripts/ci/test_docs_fora_da_raiz.js') continue;
  fs.readFileSync(path.join(RAIZ, arquivo), 'utf8').split('\n').forEach((linha, i) => {
    if (VELHO.test(linha.replace(/^[│ ]*[├└]── /, 'docs/'))) soltas.push(`${arquivo}:${i + 1}`);
  });
}
assert.deepStrictEqual(soltas, [], `ainda citam o caminho antigo da raiz: ${soltas.join(', ')}`);
console.log('ok: glossary.md e CODING_STANDARDS.md só em docs/');
