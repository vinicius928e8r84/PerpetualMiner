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
prova(linhasDe('scripts/a.sh', juntar('#!/usr/bin/env bash', '# shellcheck disable=SC2034', 'x=1  # um', '# shellcheck source=lib.sh porque sim')), [3, 4],
  'o shebang e a diretiva do shellcheck passam; o resto do shell conta');
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
prova([regra.seAplica('docs/design/painel/a.html'), regra.seAplica('docs/outro/a.html'), regra.seAplica('.claude/skills/a.js'), regra.seAplica('lib/a.js'), regra.seAplica('README.md')],
  [true, false, false, true, false], 'o alcance é o de sem-comentario-novo, mais os protótipos de docs/design');
prova(linhasDe('complemento/a.py', juntar('"""Módulo."""', 'import os', '', 'class A:', '    """Um', '    dois', '    """', '', '    def f(self):', '        """Faz."""', '        return "não é docstring"')),
  [1, 5, 6, 10], 'a docstring do módulo, da classe e da função conta, uma linha por linha com texto');
prova(linhasDe('complemento/a.py', juntar('def f():', '    x = """texto"""', '    return x')), [], 'uma string que não é docstring não conta');
prova(linhasDe('docs/design/a.html', juntar('<!-- legenda -->', '<p>oi</p>')), [1], 'o protótipo de docs/design conta');

const { semAProsa } = require('./apoio-apagar-comentarios');
prova(semAProsa('lib/a.js', juntar('// topo', '', 'const a = 1; // um', '/**', ' * doc', ' */', '// eslint-disable-next-line no-console', 'console.log(a);')),
  juntar('const a = 1;', '// eslint-disable-next-line no-console', 'console.log(a);'), 'apagar tira a prosa e deixa a diretiva');
prova(semAProsa('complemento/a.py', juntar('"""Mod."""', 'import os  # noqa: F401  (usado fora)', 'class E(Exception):', '    """Erro."""', 'def f():', '    """Faz."""', '    return 1  # um')),
  juntar('import os  # noqa: F401', 'class E(Exception):', '    pass', 'def f():', '    return 1'), 'apagar encurta a diretiva, troca a docstring que era o corpo por pass e tira as outras');

const { formatar } = require('./apoio-listar-comentarios');
prova(formatar([{ arquivo: 'a.js', linha: 2, texto: '// x' }, { arquivo: 'a.js', linha: 5, texto: 'f(); // y' }, { arquivo: 'b.js', linha: 1, texto: '// z' }]).split('\n'),
  ['', '=== a.js (2)', '2: // x', '5: f(); // y', '', '=== b.js (1)', '1: // z'], 'a lista de comentários agrupa por arquivo');

const COMENTADO = n => Array.from({ length: n }, (_, i) => `// linha ${i + 1}`).concat('const a = 1;').join('\n') + '\n';
const ARQUIVO_DA_BASE = 'scripts/regras/linha-de-base-sem-comentario.json';
const PRINCIPAL = { 'scripts/regras/linha-de-base.json': '{}' };
const base = objeto => JSON.stringify({ 'sem-comentario': objeto });
const semEnv = () => {
  const env = { ...process.env };
  for (const nome of ['REGRAS_BASE', 'REGRAS_PR', 'GITHUB_EVENT_NAME']) delete env[nome];
  return env;
};

function rodar(arquivos, ...bandeiras) {
  const pasta = repositorioDeTestes(arquivos);
  try {
    const r = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, '--base', '0'.repeat(40), ...bandeiras],
      { cwd: pasta, encoding: 'utf8', env: semEnv() });
    const gravada = JSON.parse(fs.readFileSync(path.join(pasta, ARQUIVO_DA_BASE), 'utf8'))['sem-comentario'];
    return { status: r.status, saida: r.stdout, gravada };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

const com = (n, linhaDeBase) => ({ ...PRINCIPAL, 'lib/a.js': COMENTADO(n), [ARQUIVO_DA_BASE]: base(linhaDeBase) });

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
assert.strictEqual(r.status, 0, `apagar sem baixar a linha de base passa, a baixa é do merge: ${r.saida}`);
assert.match(r.saida, /a linha de base pode descer: 1 entrada/);
r = rodar(com(0, { 'lib/a.js': 2 }));
assert.strictEqual(r.status, 0, r.saida);
total += 4;

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

const naMain = { ...PRINCIPAL, 'lib/a.js': COMENTADO(2), 'lib/b.js': 'const b = 1;\n', [ARQUIVO_DA_BASE]: base({ 'lib/a.js': 2 }) };
r = contraAMain(naMain, { 'lib/a.js': COMENTADO(1), 'lib/b.js': `// volta\n${'const b = 1;\n'}`,
  [ARQUIVO_DA_BASE]: base({ 'lib/a.js': 1, 'lib/b.js': 1 }) });
assert.strictEqual(r.status, 1, `a folga de um arquivo não passa para outro: ${r.saida}`);
assert.match(r.saida, /sem-comentario lib\/b\.js não está na linha de base de HEAD\. A linha de base só desce: um arquivo que não tinha comentário/);
r = contraAMain(naMain, { 'lib/a.js': COMENTADO(1), [ARQUIVO_DA_BASE]: base({ 'lib/a.js': 1 }) });
assert.strictEqual(r.status, 0, r.saida);
total += 3;


prova(semAProsa('e2e/tests/a.spec.js', "'use strict';\n\n// Exceção de teste (o aviso nativo do Chrome): o aviso é do Chrome\n// e o Playwright não alcança.\n\nconst x = 1;\n"),
  "'use strict';\n\n// Exceção de teste: chrome-nativo (docs/testes.md).\n\nconst x = 1;\n", 'a marca de exceção de teste de várias linhas fica numa linha só, com o nome');
prova(semAProsa('e2e/tests/a.spec.js', 'test(1, async () => {\n  // Exceção de teste: sem-estado-guardado — motivo longo\n  // que continua aqui.\n  await x();\n});\n'),
  'test(1, async () => {\n  // Exceção de teste: sem-estado-guardado\n  await x();\n});\n', 'a marca sem-estado-guardado fica só com o nome');
prova(semAProsa('e2e/fakes/a.js', 'const o = {\n  /**\n   * @estado-guardado A chave da conta, já convertida:\n   * em objeto.\n   */\n  chave: () => 1,\n};\n'),
  'const o = {\n  /** @estado-guardado */\n  chave: () => 1,\n};\n', 'o JSDoc do leitor marcado fica só com a marca');
prova(semAProsa('lib/a.js', "'use strict';\n\n//\n\nconst x = 1;\n"), "'use strict';\n\nconst x = 1;\n", 'a linha com só a marca de comentário sai');
prova(semAProsa('lib/a.js', "'use strict';\n\n//\n// o que fazia\n\nconst x = 1;\n"), "'use strict';\n\nconst x = 1;\n", 'o bloco que sobra sem texto sai inteiro');

console.log(`sem-comentario: ${total} provas passaram`);
