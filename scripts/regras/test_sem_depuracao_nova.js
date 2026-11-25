'use strict';

const assert = require('assert');
const regra = require('./sem-depuracao-nova');
const { achadosDaMudanca, juntar } = require('./apoio-teste-linhas-novas');

const alterado = (arquivo, antes, depois) => ({ antes: { [arquivo]: antes }, depois: { [arquivo]: depois }, arquivo });
const novo = (arquivo, texto) => ({ depois: { [arquivo]: texto }, arquivo });
const achados = mudanca => achadosDaMudanca(regra, mudanca);
const linhas = mudanca => achados(mudanca).map(a => a.linha);
const acrescenta = (arquivo, linha) => alterado(arquivo, juntar('const a = 1;'), juntar('const a = 1;', linha));

const PARADA = ['debu', 'gger;'].join('');
const SO = ['it.', 'only("x", () => {});'].join('');
const IMPRIME = ['console', '.log(valor);'].join('');
const PARADA_PY = ['break', 'point()'].join('');
const PDB = ['import ', 'pdb'].join('');
const PRINT_PY = ['pri', 'nt(valor)'].join('');

for (const arquivo of ['lib/a.js', 'popup/popup.js', 'background.js', 'scripts/ferramenta.js', 'e2e/tests/a.spec.js', 'testes/test_a.js']) {
  assert.deepStrictEqual(linhas(acrescenta(arquivo, PARADA)), [2], `${arquivo}: o debugger barra em qualquer lugar`);
  assert.deepStrictEqual(linhas(acrescenta(arquivo, SO)), [2], `${arquivo}: o .only esquecido barra em qualquer lugar`);
}
for (const arquivo of ['lib/a.js', 'popup/popup.js', 'background.js', 'content.js', 'painel/painel.js', 'overlay/overlay.js']) {
  assert.deepStrictEqual(linhas(acrescenta(arquivo, IMPRIME)), [2], `${arquivo}: o console.log no código do produto barra`);
}
for (const arquivo of ['scripts/regras/verificar.js', 'testes/test_a.js', 'e2e/fixtures.js', 'preview/montar.mjs', '.agents/skills/popup/x.js', 'lib/test_a.js', 'lib/b.test.js']) {
  assert.deepStrictEqual(linhas(acrescenta(arquivo, IMPRIME)), [], `${arquivo}: ferramenta de linha de comando e teste podem imprimir`);
}

assert.deepStrictEqual(linhas(alterado('lib/a.js', juntar(IMPRIME), juntar(IMPRIME, 'const b = 2;'))), [], 'o console.log que a base já tinha não é da mudança');
assert.deepStrictEqual(linhas(acrescenta('lib/a.js', `// ${IMPRIME}`)), [], 'comentário não é código');
assert.deepStrictEqual(linhas(acrescenta('lib/a.js', `const texto = 'não use ${PARADA}';`)), [], 'a palavra dentro de um texto não é a instrução');
assert.deepStrictEqual(linhas(acrescenta('lib/a.js', "console.error('falhou');")), [], 'console.error é o registro do produto');
assert.deepStrictEqual(linhas(acrescenta('lib/a.js', "console.warn('aviso');")), []);
assert.deepStrictEqual(linhas(acrescenta('lib/a.js', 'const debuggerAtivo = true;')), [], 'o nome que só contém a palavra passa');
assert.deepStrictEqual(linhas(novo('lib/novo.js', juntar('const a = 1;', IMPRIME))), [2], 'num arquivo novo vale qualquer linha');
assert.strictEqual(achados(acrescenta('lib/a.js', PARADA))[0].detalhe, 'debugger novo');

for (const [nome, linha] of [['breakpoint()', PARADA_PY], ['pdb', PDB], ['pdb.set_trace', 'pdb.set_trace()']]) {
  assert.deepStrictEqual(linhas(alterado('complemento/a.py', 'x = 1\n', juntar('x = 1', linha))), [2], `${nome} barra em Python`);
  assert.deepStrictEqual(linhas(alterado('complemento/test_a.py', 'x = 1\n', juntar('x = 1', linha))), [2], `${nome} barra até num teste Python`);
}
assert.deepStrictEqual(linhas(alterado('complemento/a.py', 'x = 1\n', juntar('x = 1', PRINT_PY))), [2], 'o print de variável no complemento barra');
assert.deepStrictEqual(linhas(alterado('complemento/a.py', 'x = 1\n', juntar('x = 1', "print('aqui')"))), [2], 'o print "aqui" barra');
assert.deepStrictEqual(linhas(alterado('complemento/test_a.py', 'x = 1\n', juntar('x = 1', PRINT_PY))), [], 'o teste Python pode imprimir');
assert.deepStrictEqual(linhas(alterado('scripts/x.py', 'x = 1\n', juntar('x = 1', PRINT_PY))), [], 'a ferramenta pode imprimir');
assert.deepStrictEqual(linhas(alterado('complemento/a.py', 'x = 1\n', juntar('x = 1', `# ${PARADA_PY}`))), [], 'comentário Python não é código');
assert.deepStrictEqual(linhas(alterado('complemento/a.py', 'x = 1\n', juntar('x = 1', "print('Conexão pronta')"))), [], 'a mensagem ao usuário não é depuração');

assert.strictEqual(regra.seAplica('lib/a.js'), true);
assert.strictEqual(regra.seAplica('complemento/a.py'), true);
assert.strictEqual(regra.seAplica('docs/a.md'), false);
assert.strictEqual(regra.seAplica('e2e/node_modules/x/a.js'), false);

console.log('test_sem_depuracao_nova: ok');
