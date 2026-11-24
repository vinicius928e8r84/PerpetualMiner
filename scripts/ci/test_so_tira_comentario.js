'use strict';

const assert = require('assert');
const fs = require('fs');
const { raizTemporaria } = require('../regras/apoio-sem-comentario');
const { soTiraComentario, confereOArquivo, confereALinhaDeBase } = require('./so-tira-comentario.js');

let total = 0;
const prova = (achado, esperado, porque) => { assert.deepStrictEqual(achado, esperado, porque); total++; };
const juntar = (...linhas) => `${linhas.join('\n')}\n`;
const passa = (arquivo, antes, depois, porque) => prova(confereOArquivo(arquivo, antes, depois), null, porque);
const recusa = (...argumentos) => {
  const [arquivo, antes, depois, padrao, porque] = argumentos;
  const falta = confereOArquivo(arquivo, antes, depois);
  assert.match(falta || '', padrao, porque);
  total++;
};

passa('lib/a.js', juntar('// soma', 'const a = 1; // um', 'f(a);'), juntar('const a = 1;', 'f(a);'), 'JS: o comentário de linha e o do fim da linha saem');
passa('lib/a.js', juntar('/* a', ' * b */', 'const a = 1;'), juntar('const a = 1;'), 'JS: o bloco /* */ sai');
passa('lib/a.js', juntar('const a = 1;', '', '// x', '', 'f(a);'), juntar('const a = 1;', '', '', 'f(a);'), 'JS: espaço em branco entre os tokens não conta');
passa('lib/a.js', juntar('const u = "http://x//y"; // a', 'const r = /a\\/\\/b/;'), juntar('const u = "http://x//y";', 'const r = /a\\/\\/b/;'), 'JS: // dentro de string e de regex não é comentário');
passa('lib/a.js', juntar('const t = `// ${[1].map(i => `// ${i}`).join(",")}`; // fim'), juntar('const t = `// ${[1].map(i => `// ${i}`).join(",")}`;'), 'JS: // em template aninhado não é comentário');
passa('lib/a.js', juntar('#!/usr/bin/env node', '// x', 'f();'), juntar('#!/usr/bin/env node', 'f();'), 'JS: o shebang é lido');
recusa('lib/a.js', juntar('// x', 'const a = 1;'), juntar('const a = 2;'), /o código mudou/, 'JS: o valor mudou');
recusa('lib/a.js', juntar('// x', 'const a = "http://y";'), juntar('const a = "http:";'), /o código mudou/, 'JS: o texto de uma string mudou');
recusa('lib/a.js', juntar('const a = 1;', '// x'), juntar('const a = 1;', '// y', '// z'), /nenhum comentário a menos/, 'JS: comentário que só trocou ou cresceu');
passa('lib/a.py', juntar('import os  # noqa: F401  (usado por fora)', 'x = 1'), juntar('import os  # noqa: F401', 'x = 1'), 'Python: a diretiva fica e a prosa atrás dela sai');
passa('lib/a.js', juntar('// a b c', 'f();'), juntar('// a b', 'f();'), 'JS: um comentário encurtado vale como tirar texto');
recusa('lib/a.js', juntar('const a = 1;', '// x', '// y'), juntar('const a = 1;', '// z'), /comentário que o antes não tinha/, 'JS: um comentário novo no lugar de dois');
recusa('lib/a.js', juntar('// x', 'const a = 1;'), juntar('const a = 1;', '', 'const b = 2;'), /o código mudou/, 'JS: um token a mais');
recusa('lib/a.js', juntar('function f() {', '  return /* a', '  */ 1;', '}'), juntar('function f() {', '  return 1;', '}'), /o código mudou/, 'JS: a quebra de linha que o bloco carregava muda a leitura de return');
recusa('lib/a.js', juntar('// x', 'const a = "x;'), juntar('const a = "x;'), /não consegui ler/, 'JS: o que o analisador não lê não passa');

passa('lib/a.py', juntar('import os  # x', '# y', 'x = 1  # z'), juntar('import os', 'x = 1'), 'Python: o # sai');
passa('lib/a.py', juntar('x = "a # b"  # c'), juntar('x = "a # b"'), 'Python: # em string não é comentário');
passa('lib/a.py', juntar('class A:', '    # x', '    def f(self):', '        # y', '        return 1'), juntar('class A:', '    def f(self):', '        return 1'), 'Python: o recuo continua');
recusa('lib/a.py', juntar('x = 1  # a'), juntar('x = 2'), /o código mudou/, 'Python: o valor mudou');
recusa('lib/a.py', juntar('def f():', '    """doc"""', '    return 1  # a'), juntar('def f():', '    return 1'), /o código mudou/, 'Python: a docstring é código, e tirá-la não vale');
recusa('lib/a.py', juntar('if x:', '    y = 1  # a'), juntar('if x:', '  y = 1'), /o código mudou/, 'Python: o recuo mudou');

passa('lib/a.sh', juntar('#!/bin/sh', '# x', 'echo "a # b" # c', 'ls'), juntar('#!/bin/sh', 'echo "a # b"', 'ls'), 'shell: # fora de aspas');
passa('lib/a.css', juntar('/* x */', '.a { color: red; /* y */ }'), juntar('.a { color: red; }'), 'CSS: o bloco sai');
passa('lib/a.html', juntar('<!-- x -->', '<p>oi</p>'), juntar('<p>oi</p>'), 'HTML: o comentário sai');
recusa('lib/a.css', juntar('/* x */', '.a { color: red; }'), juntar('.a { color: blue; }'), /o código mudou/, 'CSS: o valor mudou');
recusa('lib/a.sh', juntar('cat <<EOF', 'a', '', 'b', 'EOF', '# x'), juntar('cat <<EOF', 'a', 'b', 'EOF'), /o código mudou/, 'shell: a linha em branco dentro do heredoc é código');
recusa('lib/a.md', 'a', 'b', /não sabe ler/, 'um tipo de arquivo que a conferência não lê não passa');

prova(confereALinhaDeBase('{"sem-comentario":{"a.js":3,"b.js":2},"x":{"a":1}}', '{"sem-comentario":{"a.js":1},"x":{"a":1}}'), null, 'a catraca desce e um arquivo sai');
prova(/não desceu/.test(confereALinhaDeBase('{"sem-comentario":{"a.js":3}}', '{"sem-comentario":{"a.js":4}}')), true, 'um teto que sobe não vale');
prova(/não desceu/.test(confereALinhaDeBase('{"sem-comentario":{"a.js":3}}', '{"sem-comentario":{"a.js":3,"b.js":1}}')), true, 'um arquivo novo na lista não vale');
prova(/não é a sem-comentario/.test(confereALinhaDeBase('{"sem-comentario":{},"x":{"a":1}}', '{"sem-comentario":{},"x":{"a":0}}')), true, 'outra seção que mudou não vale');

const { raiz, git, gravar, commit } = raizTemporaria();
const mudanca = (nome, arquivos, ...esperado) => {
  git('checkout', '-q', 'main');
  git('checkout', '-q', '-B', nome);
  gravar(arquivos);
  commit(nome);
  const r = soTiraComentario({ raiz, base: 'main', head: nome });
  if (esperado[0] === true) prova(r.ok, true, `${nome}: ${r.motivo}`);
  else { prova(r.ok, false, nome); assert.match(r.motivo, esperado[0], nome); total++; }
};
gravar({
  'lib/a.js': juntar('// x', 'const a = 1;'),
  'lib/b.js': juntar('const b = 1; // y'),
  'scripts/regras/linha-de-base.json': '{"sem-comentario":{"lib/a.js":1,"lib/b.js":1},"limite-de-linhas":{"lib/a.js":4}}\n',
  'docs/adr/.gitkeep.md': 'x\n',
});
commit('base');

mudanca('so-codigo', { 'lib/a.js': juntar('const a = 1;') }, true);
mudanca('com-linha-de-base-e-adr', {
  'lib/a.js': juntar('const a = 1;'),
  'scripts/regras/linha-de-base.json': '{"sem-comentario":{"lib/b.js":1},"limite-de-linhas":{"lib/a.js":4}}\n',
  'docs/adr/0002-x.md': '# x\n',
}, true);
mudanca('o-codigo-mudou', { 'lib/a.js': juntar('const a = 2;') }, /lib\/a\.js: o código mudou/);
mudanca('arquivo-novo', { 'lib/a.js': juntar('const a = 1;'), 'lib/c.js': 'f();\n' }, /lib\/c\.js: arquivo novo que não é documentação/);
mudanca('so-documentacao', { 'docs/adr/0002-x.md': '# x\n' }, /não tira comentário de arquivo nenhum/);
mudanca('linha-de-base-que-sobe', { 'lib/a.js': juntar('const a = 1;'), 'scripts/regras/linha-de-base.json': '{"sem-comentario":{"lib/a.js":9},"limite-de-linhas":{"lib/a.js":4}}\n' }, /não desceu/);
mudanca('comentario-novo', { 'lib/a.js': juntar('// x', '// z', 'const a = 1;') }, /nenhum comentário a menos/);
mudanca('nada', {}, /não muda arquivo nenhum/);
git('checkout', '-q', 'main');
git('checkout', '-q', '-B', 'merge-da-main');
gravar({ 'lib/a.js': juntar('const a = 1;') });
commit('tira');
git('checkout', '-q', 'main');
gravar({ 'lib/z.js': 'z();\n' });
commit('a main anda');
git('checkout', '-q', 'merge-da-main');
git('merge', '-q', '--no-edit', 'main');
const r = soTiraComentario({ raiz, base: 'main', head: 'merge-da-main' });
prova(r.ok, true, `uma main que andou depois da branch não conta como mudança da PR: ${r.motivo}`);
prova(r.arquivos, ['lib/a.js'], 'só o arquivo da PR');

fs.rmSync(raiz, { recursive: true, force: true });
console.log(`so-tira-comentario: ${total} provas passaram`);
