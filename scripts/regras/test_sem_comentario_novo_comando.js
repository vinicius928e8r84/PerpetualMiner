'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { raizTemporaria } = require('./apoio-sem-comentario');

let total = 0;
const juntar = (...linhas) => `${linhas.join('\n')}\n`;

const { raiz, git, gravar, commit } = raizTemporaria();
const verificar = path.join(__dirname, 'verificar.js');
const rodar = (base, ...args) => spawnSync('node', [verificar, '--raiz', raiz, ...args], {
  cwd: raiz, encoding: 'utf8', env: { ...process.env, REGRAS_BASE: base },
});
gravar({ 'scripts/regras/linha-de-base.json': '{}\n', 'painel.js': 'function a() {}\n', 'painel.css': '.a { font-size: var(--veio-tam-pagina); }\n' });
commit('base');
git('checkout', '-q', '-b', 'mudanca');
let r = rodar('main');
assert.strictEqual(r.status, 0, r.stdout + r.stderr);

gravar({ 'painel.js': juntar('function a() {}', 'const b = 1; // o limite da API') });
commit('com comentário');
r = rodar('main');
assert.strictEqual(r.status, 1, `um comentário novo falha o comando:\n${r.stdout}`);
assert.match(r.stdout, /✗ sem-comentario-novo — painel\.js/);
assert.match(r.stdout, /painel\.js:2: comentário novo: “o limite da API”/);
assert.match(r.stdout, /Conserto: Apague o comentário[^\n]*renomeie a função ou a variável[^\n]*corpo da PR[^\n]*docs\/[^\n]*glossary\.md/);
assert.match(r.stdout, /exceção sem-comentario-novo até AAAA-MM-DD, aprovada por <pessoa>: <motivo>/);

gravar({ 'painel.js': juntar('function a() {}', 'const b = 1; // exceção sem-comentario-novo até 2099-12-31, aprovada por Vinicius: o limite da API') });
commit('com exceção');
r = rodar('main');
assert.strictEqual(r.status, 0, `a exceção na própria linha passa:\n${r.stdout}`);

gravar({ 'painel.js': juntar('function a() {}', 'const b = 1; // exceção sem-comentario-novo até 2020-01-01, aprovada por Vinicius: o limite da API') });
commit('exceção vencida');
r = rodar('main');
assert.strictEqual(r.status, 1, r.stdout);
assert.match(r.stdout, /painel\.js:2: exceção vencida em 2020-01-01/);

gravar({ 'painel.js': juntar('function a() {}', '// exceção sem-comentario-novo até 2099-12-31, aprovada por Vinicius: o limite da API', '// e uma história inteira sobre ele', 'const b = 1;') });
commit('a exceção vale para a linha em que está');
r = rodar('main');
assert.strictEqual(r.status, 1, r.stdout);
assert.match(r.stdout, /painel\.js:3: comentário novo: “e uma história inteira sobre ele”/);
assert.doesNotMatch(r.stdout, /painel\.js:2:/);

gravar({ 'painel.js': juntar('function a() {}', 'const b = 1;'), 'painel.css': '.a { font-size: 9px; /* exceção tokens-veio até 2099-12-31, aprovada por Vinicius: imita o badge */ }\n' });
commit('a exceção de outra regra');
r = rodar('main');
assert.strictEqual(r.status, 0, `a exceção de outra regra não é comentário novo:\n${r.stdout}`);

gravar({ 'painel.js': juntar('function a() {}', 'const b = 1; // exceção sem-comentario-novo até 2099-12-31, aprovada por Vinicius: sobrou') });
commit('exceção que sobrou');
r = rodar('main');
assert.strictEqual(r.status, 0, 'uma exceção válida na linha acusada passa');
gravar({ 'painel.js': juntar('function a() {}', 'const b = 1;') });
commit('a exceção sai com o comentário');
assert.strictEqual(rodar('main').status, 0);

gravar({ 'painel.js': juntar('function a() {}', 'const b = 1; // exceção sem-comentario-novo até 2099-12-31, aprovada por Vinicius: já na main') });
commit('a exceção que a main recebe');
git('checkout', '-q', 'main');
git('merge', '-q', '--ff-only', 'mudanca');
r = rodar('main');
assert.strictEqual(r.status, 0, `a exceção já mesclada não quebra a main:\n${r.stdout}`);
git('checkout', '-q', '-b', 'seguinte');
gravar({ 'outro.js': 'x();\n' });
commit('outra PR');
r = rodar('main');
assert.strictEqual(r.status, 0, `uma PR que não tem a ver com a exceção passa:\n${r.stdout}`);
r = rodar('');
assert.strictEqual(r.status, 0, `sem base a exceção também não é acusada de sobrar:\n${r.stdout}`);
for (const [arquivo, texto, mexido] of [
  ['limpar.sh', juntar('#!/usr/bin/env bash', 'ls # exceção sem-comentario-novo porque sim', 'echo oi'), 'echo tchau'],
  ['.github/workflows/a.yml', juntar('on:', '  pull_request:', 'jobs:', '  a:', '    name: a # exceção sem-comentario-novo porque sim', '    runs-on: x'), '    runs-on: y'],
]) {
  git('checkout', '-q', 'main');
  gravar({ [arquivo]: texto, 'scripts/testes.json': '{"grupos":{},"fora":[]}\n' });
  commit(`${arquivo} chega à main`);
  git('checkout', '-q', '-b', `mexe-${path.basename(arquivo)}`);
  gravar({ [arquivo]: texto.replace(/\n[^\n]*\n$/, `\n${mexido}\n`) });
  commit(`${arquivo} mexe em outra linha`);
  r = rodar('main');
  assert.strictEqual(r.status, 1, `${arquivo}: a exceção mal escrita numa linha antiga continua sendo conferida:\n${r.stdout}`);
  assert.match(r.stdout, new RegExp(`${arquivo.replace(/[./]/g, '\\$&')}:\\d+: exceção sem o formato`), r.stdout);
}
total += 18 + 4;

fs.rmSync(raiz, { recursive: true, force: true });
console.log(`sem-comentario-novo (comando): ${total} provas passaram`);
