'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');
const NOMES = ['overlay.css', 'overlay.js'];
const ANTIGO = /(?<![\w./\\-])overlay\.(css|js)\b/;
const ESTE_TESTE = 'scripts/ci/test_overlay_na_pasta.js';

for (const nome of NOMES) {
  assert.ok(!fs.existsSync(path.join(RAIZ, nome)), `${nome} saiu da raiz`);
  assert.ok(fs.existsSync(path.join(RAIZ, 'overlay', nome)), `overlay/${nome} existe`);
}

const rastreados = execFileSync('git', ['-C', RAIZ, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  .filter(arquivo => arquivo !== ESTE_TESTE && !arquivo.startsWith('overlay/') && /\.(js|mjs|json|md|html|css|py|yml|yaml|sh)$/.test(arquivo) && fs.existsSync(path.join(RAIZ, arquivo)));

const restos = [];
for (const arquivo of rastreados) {
  fs.readFileSync(path.join(RAIZ, arquivo), 'utf8').split('\n').forEach((linha, i) => {
    if (ANTIGO.test(linha)) restos.push(`${arquivo}:${i + 1}: ${linha.trim().slice(0, 100)}`);
  });
}
assert.deepStrictEqual(restos, [], `referência ao caminho velho de overlay.*:\n${restos.join('\n')}`);

console.log('ok: overlay.* vive em overlay/ e nada aponta para a raiz');
