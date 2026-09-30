'use strict';

// O pacote da loja leva só o que a extensão usa em execução.

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PASTAS_QUE_NAO_SAO_RUNTIME } = require('./scripts/arquivos-do-pacote.js');

const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pacote-'));
const versao = JSON.parse(fs.readFileSync('manifest.json', 'utf8')).version;
const texto = execFileSync('node', ['scripts/empacotar-extensao.mjs', '--saida', saida], { encoding: 'utf8' });
const arquivos = texto.split('\n').filter(l => l.startsWith('  ')).map(l => l.trim());

for (const esperado of ['manifest.json', 'background.js', 'lib/auto-recarregar.js', 'lib/arquivos-da-extensao.js', 'painel.html', 'veio/tokens.css']) {
  assert(arquivos.includes(esperado), `falta ${esperado} no pacote`);
}
for (const arquivo of arquivos) {
  assert(!PASTAS_QUE_NAO_SAO_RUNTIME.includes(arquivo.split('/')[0]), `não devia entrar: ${arquivo}`);
  assert(!/^test_.*\.js$/.test(arquivo), `teste no pacote: ${arquivo}`);
  assert(!arquivo.startsWith('lib/firebase/'), `bundle sem uso no pacote: ${arquivo}`);
}

const zip = fs.readFileSync(path.join(saida, `perpetualminer-${versao}.zip`));
assert.strictEqual(zip.readUInt32LE(0), 0x04034b50, 'o arquivo não começa como um zip');
assert.strictEqual(zip.readUInt16LE(zip.length - 22 + 10), arquivos.length, 'o zip não tem todos os arquivos listados');

fs.rmSync(saida, { recursive: true, force: true });
console.log('empacotar tests passed');
