'use strict';

const assert = require('assert');
const regra = require('./sem-segredo-novo');
const { achadosDaMudanca, juntar } = require('./apoio-teste-linhas-novas');

const alterado = (arquivo, antes, depois) => ({ antes: { [arquivo]: antes }, depois: { [arquivo]: depois }, arquivo });
const novo = (arquivo, texto) => ({ depois: { [arquivo]: texto }, arquivo });
const achados = mudanca => achadosDaMudanca(regra, mudanca);
const linhas = mudanca => achados(mudanca).map(a => a.linha);

const AWS = ['AKIA', 'QWERTYUIOPASDFGH'].join('');
const GITHUB = ['ghp', '_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'].join('');
const SK = ['sk', '-proj-', 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7cDe0fGh'].join('');
const GOOGLE = ['AI', 'zaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6q'].join('');
const CHAVE_PRIVADA = ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join('');
const JWT = ['eyJ', 'hbGciOiJIUzI1NiJ9', '.eyJ', 'zdWIiOiIxMjM0NTY3ODkwIn0', '.dozjgNryP4J3jVmNHl0w5N'].join('');
const SENHA_NA_URL = ['postgres://admin:', 'Zx9!qLm2vB', '@banco.interno.net/app'].join('');
const SEGREDO_NO_CAMPO = ['const api_key = "', 'Qw3rTy9uIo2pAs5dFg8hJk1lZx7c', '";'].join('');

for (const [nome, linha] of [
  ['chave da AWS', `const chave = '${AWS}';`], ['token do GitHub', `const t = '${GITHUB}';`], ['chave sk-', `OPENAI = "${SK}"`],
  ['chave do Google', `const k = '${GOOGLE}';`], ['chave privada', CHAVE_PRIVADA], ['JWT', `const j = '${JWT}';`],
  ['senha na URL', `const url = '${SENHA_NA_URL}';`], ['valor literal em campo de segredo', SEGREDO_NO_CAMPO],
]) {
  assert.deepStrictEqual(linhas(alterado('lib/a.js', juntar('const a = 1;'), juntar('const a = 1;', linha))), [2], `${nome} acrescentado barra`);
  assert.deepStrictEqual(linhas(alterado('lib/a.js', juntar(linha), juntar(linha, 'const b = 2;'))), [], `${nome} que a base já tinha não é da mudança`);
}

assert.match(achados(alterado('lib/a.js', 'x\n', juntar('x', `const chave = '${AWS}';`)))[0].detalhe, /chave de acesso da AWS \(o valor não é mostrado\)$/);
assert(!JSON.stringify(achados(alterado('lib/a.js', 'x\n', juntar('x', `const chave = '${AWS}';`)))).includes(AWS), 'o achado não repete o segredo');
assert.deepStrictEqual(linhas(novo('docs/nota.md', juntar('texto', `a chave é ${AWS}`))), [2], 'num arquivo novo vale qualquer linha, até em Markdown');
assert.deepStrictEqual(linhas(novo('complemento/t.py', juntar(`token = '${GITHUB}'`))), [1], 'também em Python');

for (const [nome, linha] of [
  ['valor de teste que se denuncia', "const chave = 'sk-proj-chave-de-teste-0000';"], ['chave de teste do Python', "token = 'token-ficticio-A'"],
  ['leitura do ambiente', 'const chave = process.env.OPENAI_API_KEY;'], ['campo vazio', "const api_key = '';"],
  ['URL de exemplo', "const u = 'https://usuario:senha@exemplo.com/x';"], ['URL sem senha', "const u = 'https://github.com/dono/repo';"],
  ['hash de commit', "const c = 'a3f9c2d1e8b74f6a9c0d3e5f7a1b2c4d6e8f0a1b';"], ['campo com valor curto', "const token = 'abc123';"],
]) assert.deepStrictEqual(linhas(novo('lib/b.js', juntar(linha))), [], `${nome} não é segredo`);

for (const arquivo of ['.env', '.env.local', 'credenciais/id_rsa', 'chaves/servico.pem', 'conta/service-account-prod.json', '.npmrc', 'x/openai_key.json']) {
  const [achado] = achados(novo(arquivo, 'vazio\n'));
  assert(achado && /arquivo de segredo/.test(achado.detalhe), `${arquivo}: o arquivo de segredo novo barra pelo nome`);
}
assert.deepStrictEqual(linhas(novo('.env.example', 'OPENAI_API_KEY=\n')), [], 'o modelo .env.example pode');
assert.deepStrictEqual(linhas(alterado('.env', 'A=1\n', 'A=2\n')), [], 'o nome só vale para o arquivo que nasce na mudança');

assert.deepStrictEqual(linhas(novo('lib/c.js', `// exceção sem-segredo-novo até 2099-01-01, aprovada por alguém: fixture\nconst k = '${AWS}';\n`)).length, 1, 'a exceção na linha é do verificar.js, não da regra');

assert.strictEqual(regra.seAplica('lib/a.js'), true);
assert.strictEqual(regra.seAplica('docs/nota.md'), true);
assert.strictEqual(regra.seAplica('veio/icones/a.png'), false);
assert.strictEqual(regra.seAplica('e2e/package-lock.json'), false);
assert.strictEqual(regra.segredoNaLinha('const a = 1;'), null);

const grande = `${'a'.repeat(5000)} ${AWS}`;
assert.deepStrictEqual(linhas(novo('lib/d.js', juntar(grande))), [1], 'a linha enorme (minificada) é lida inteira, em janelas');

console.log('test_sem_segredo_novo: ok');
