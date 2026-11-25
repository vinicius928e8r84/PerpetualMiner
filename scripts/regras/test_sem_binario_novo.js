'use strict';

const assert = require('assert');
const regra = require('./sem-binario-novo');
const { achadosDaMudanca } = require('./apoio-teste-linhas-novas');

const novo = (arquivo, conteudo) => ({ depois: { [arquivo]: conteudo }, arquivo });
const alterado = (arquivo, antes, depois) => ({ antes: { [arquivo]: antes }, depois: { [arquivo]: depois }, arquivo });
const achados = mudanca => achadosDaMudanca(regra, mudanca);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const EXECUTAVEL_WINDOWS = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const COM_NUL = Buffer.from('texto\0texto');

for (const [arquivo, conteudo, motivo] of [
  ['lib/programa.exe', 'x', 'extensão .exe'], ['dist/pacote.zip', 'x', 'extensão .zip'], ['docs/banco.sqlite', 'x', 'extensão .sqlite'],
  ['lib/__pycache__/a.pyc', 'x', 'extensão .pyc'], ['lib/native.node', 'x', 'extensão .node'],
  ['scripts/ferramenta', EXECUTAVEL_WINDOWS, 'executável Windows'], ['scripts/ferramenta2', ELF, 'executável Linux'],
  ['docs/anexo.txt', ZIP, 'arquivo ZIP'], ['docs/dados.bin', COM_NUL, 'conteúdo binário'], ['lib/foto.png', PNG, 'imagem fora das pastas permitidas'],
  ['.DS_Store', 'x', 'lixo de máquina'], ['lib/a.js.bak', 'x', 'lixo de editor'], ['debug.log', 'x', 'log'],
]) {
  const [achado] = achados(novo(arquivo, conteudo));
  assert(achado && /arquivo novo que não deve entrar no repositório/.test(achado.detalhe), `${arquivo} (${motivo}) barra`);
}

assert.match(achados(novo('lib/programa.exe', 'x'))[0].detalhe, /extensão \.exe$/);
assert.match(achados(novo('scripts/ferramenta', ELF))[0].detalhe, /executável Linux/);

for (const arquivo of ['e2e/tests/popup-visual.spec.js-snapshots/popup-chromium.png', 'e2e/pages/tela.png', 'docs/assets/a.png', 'docs/loja/b.webp',
  'docs/design/identidade-veio/assets/c.png', 'veio/icones/d.png', 'veio/fontes/e.woff2', 'conexao/perpetualminer.ankiaddon']) {
  assert.deepStrictEqual(achados(novo(arquivo, PNG)), [], `${arquivo} é uma pasta permitida`);
}

assert.deepStrictEqual(achados(novo('lib/novo.js', 'const a = 1;\n')), [], 'o texto passa');
assert.deepStrictEqual(achados(novo('docs/texto-grande.md', 'linha\n'.repeat(100000))), [], 'o texto grande, abaixo do limite, passa');
assert.deepStrictEqual(achados(alterado('lib/foto.png', PNG, Buffer.concat([PNG, Buffer.from([1])]))), [], 'o binário que a base já tinha e a mudança só alterou não conta');
assert.deepStrictEqual(achados(alterado('lib/pacote.zip', ZIP, Buffer.concat([ZIP, Buffer.from([1])]))), [], 'o que não nasce na mudança não barra');
assert.strictEqual(regra.seAplica('qualquer/arquivo'), true);

console.log('test_sem_binario_novo: ok');
