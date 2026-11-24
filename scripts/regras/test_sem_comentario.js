'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { repositorioDeTestes } = require('./apoio-de-testes');
const regra = require('./sem-comentario');

let total = 0;
const prova = (achadas, esperadas, porque) => { assert.deepStrictEqual(achadas, esperadas, porque); total++; };
const linhasDe = (arquivo, fonte) => regra.verificar(arquivo, fonte).map(a => a.linha);
const juntar = (...linhas) => `${linhas.join('\n')}\n`;

prova(linhasDe('lib/a.js', juntar('const a = 1;', '// soma um', '// e depois mais um', 'const b = a + 1; // fim')), [2, 3, 4],
  'cada linha de prosa conta, em bloco próprio ou no fim da linha');
prova(linhasDe('lib/a.js', juntar('/*', ' * explica', ' */', 'const a = 1;')), [2], 'num bloco /* */ só a linha com texto conta');
prova(linhasDe('scripts/a.sh', juntar('#!/usr/bin/env bash', '# shellcheck disable=SC2034', 'x=1  # um')), [2, 3],
  'o shebang passa; o resto do shell conta');
prova(linhasDe('complemento/a.py', juntar('import os  # noqa: F401', '# -*- coding: utf-8 -*-', 'x = 1  # um')), [3],
  'noqa e coding passam');
prova(linhasDe('lib/a.js', juntar('// eslint-disable-next-line no-console', 'console.log(1);')), [], 'a diretiva do eslint passa');
prova(linhasDe('e2e/tests/a.spec.js', juntar('// Exceção de teste: sem-estado-guardado', 'test();')), [], 'a marca que outra regra lê passa');
prova(linhasDe('lib/a.js', juntar('// exceção sem-comentario-novo até 2999-01-01, aprovada por Dono: motivo', 'f();')), [],
  'a exceção aprovada de sem-comentario-novo vale também aqui');
prova(linhasDe('lib/a.js', juntar('// exceção sem-comentario-novo até 2999-01-01, aprovada por Dono: motivo', '// e uma história', 'f();')), [2],
  'num bloco com prosa, a linha da exceção aprovada não conta');
prova(linhasDe('painel/a.html', juntar('<!-- cabeçalho -->', '<p>oi</p>')), [1], 'comentário de HTML conta');
prova(linhasDe('lib/a.js', 'const url = "http://x//y"; const r = /a\\/\\/b/;\n'), [], 'barra dupla em string e regex não é comentário');
prova([regra.seAplica('docs/design/a.html'), regra.seAplica('.claude/skills/a.js'), regra.seAplica('lib/a.js'), regra.seAplica('README.md')],
  [false, false, true, false], 'o alcance é o mesmo de sem-comentario-novo');

const COMENTADO = n => Array.from({ length: n }, (_, i) => `// linha ${i + 1}`).concat('const a = 1;').join('\n') + '\n';
const base = objeto => JSON.stringify({ 'sem-comentario': objeto });
const semEnv = () => {
  const env = { ...process.env };
  delete env.REGRAS_BASE;
  return env;
};

function rodar(arquivos, ...bandeiras) {
  const pasta = repositorioDeTestes(arquivos);
  try {
    const r = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, '--base', '0'.repeat(40), ...bandeiras],
      { cwd: pasta, encoding: 'utf8', env: semEnv() });
    const gravada = JSON.parse(fs.readFileSync(path.join(pasta, 'scripts/regras/linha-de-base.json'), 'utf8'))['sem-comentario'];
    return { status: r.status, saida: r.stdout, gravada };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

const com = (n, linhaDeBase) => ({ 'lib/a.js': COMENTADO(n), 'scripts/regras/linha-de-base.json': base(linhaDeBase) });

let r = rodar(com(2, { 'lib/a.js': 2 }));
assert.strictEqual(r.status, 0, `no teto da linha de base: ${r.saida}`);
r = rodar(com(3, { 'lib/a.js': 2 }));
assert.strictEqual(r.status, 1, r.saida);
assert.match(r.saida, /✗ sem-comentario — lib\/a\.js: 3 linha\(s\) de comentário; a linha de base deixa no máximo 2\./);
r = rodar(com(1, {}));
assert.strictEqual(r.status, 1, r.saida);
assert.match(r.saida, /lib\/a\.js: 1 linha\(s\) de comentário; ele não está na linha de base, então não pode ter nenhum/);
total += 5;

r = rodar(com(1, { 'lib/a.js': 2 }));
assert.strictEqual(r.status, 1, 'apagar sem baixar a linha de base falha');
assert.match(r.saida, /lib\/a\.js tem 1 linha\(s\) de comentário e a linha de base ainda deixa 2: baixe-a/);
r = rodar(com(0, { 'lib/a.js': 2 }));
assert.match(r.saida, /lib\/a\.js ficou sem comentário: tire-o da linha de base/);
total += 3;

r = rodar(com(1, { 'lib/a.js': 2 }), '--atualizar');
assert.strictEqual(r.status, 0, r.saida);
prova(r.gravada, { 'lib/a.js': 1 }, '--atualizar baixa a linha de base');
r = rodar(com(0, { 'lib/a.js': 2 }), '--atualizar');
prova(r.gravada, {}, 'o arquivo que chega a zero sai da lista');

function contraAMain(naMain, noRamo) {
  const pasta = repositorioDeTestes(naMain);
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: pasta, stdio: 'ignore' });
    git('add', '-A');
    git('commit', '-q', '-m', 'main');
    for (const [arquivo, texto] of Object.entries(noRamo)) {
      fs.mkdirSync(path.dirname(path.join(pasta, arquivo)), { recursive: true });
      fs.writeFileSync(path.join(pasta, arquivo), texto);
    }
    const r2 = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, '--base', 'HEAD'], { cwd: pasta, encoding: 'utf8', env: semEnv() });
    return { status: r2.status, saida: r2.stdout };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

const naMain = { 'lib/a.js': COMENTADO(2), 'lib/b.js': 'const b = 1;\n', 'scripts/regras/linha-de-base.json': base({ 'lib/a.js': 2 }) };
r = contraAMain(naMain, { 'lib/a.js': COMENTADO(1), 'lib/b.js': `// volta\n${'const b = 1;\n'}`,
  'scripts/regras/linha-de-base.json': base({ 'lib/a.js': 1, 'lib/b.js': 1 }) });
assert.strictEqual(r.status, 1, `a folga de um arquivo não passa para outro: ${r.saida}`);
assert.match(r.saida, /sem-comentario lib\/b\.js não está na linha de base de HEAD\. A linha de base só desce: um arquivo que não tinha comentário/);
r = contraAMain(naMain, { 'lib/a.js': COMENTADO(1), 'scripts/regras/linha-de-base.json': base({ 'lib/a.js': 1 }) });
assert.strictEqual(r.status, 0, r.saida);
total += 3;

console.log(`sem-comentario: ${total} provas passaram`);
