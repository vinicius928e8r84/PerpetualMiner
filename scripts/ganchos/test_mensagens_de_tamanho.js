'use strict';

const assert = require('assert');
const { mensagemDeAfrouxamento, mensagemDeErro, tokensDe } = require('./mensagens-de-tamanho.js');

const LINHA_DE_BASE = 'scripts/ganchos/linha-de-base-de-tamanho.json';
const config = { linhaDeBase: LINHA_DE_BASE, bytesPorToken: 4 };

const PRIMEIRO_PASSO_DO_TIPO = {
  teste: ['Divida por unidade ou cenário sob teste', 3],
  doc: ['Divida por seção de primeiro nível', 3],
  html: ['Tire o CSS e o JavaScript embutidos', 3],
  dado: ['Divida por coleção', 2],
  css: ['Divida por componente ou por tela', 2],
  python: ['Divida por responsabilidade em módulos irmãos: um módulo por responsabilidade (entrada/saída', 3],
  codigo: ['Divida por responsabilidade em módulos irmãos: um módulo por responsabilidade, com o nome dela.', 3],
  outro: ['Divida por responsabilidade: um arquivo por responsabilidade', 2],
};

const TIPO_DO_CAMINHO = [
  ['test_x.js', 'teste'], ['complemento/test_servidor.py', 'teste'], ['a/b_test.go', 'teste'], ['a/b.test.js', 'teste'],
  ['a/b.spec.ts', 'teste'], ['tests/dados.json', 'teste'], ['e2e/test/x.css', 'teste'], ['a/__tests__/b.js', 'teste'],
  ['a/testes/b.js', 'codigo'], ['a/contest/b.js', 'codigo'], ['testando.py', 'python'], ['x.test', 'outro'], ['a/test_/b.md', 'doc'],
  ['README.MD', 'doc'], ['a.md', 'doc'], ['a.mdx', 'doc'], ['a.txt', 'doc'], ['a.rst', 'doc'],
  ['a.html', 'html'], ['a.HTM', 'html'],
  ['a.json', 'dado'], ['a.yaml', 'dado'], ['a.yml', 'dado'], ['a.csv', 'dado'], ['a.toml', 'dado'],
  ['a.css', 'css'], ['a.scss', 'css'],
  ['a.py', 'python'], ['a.PY', 'python'],
  ['a.js', 'codigo'], ['a.mjs', 'codigo'], ['a.cjs', 'codigo'], ['a.ts', 'codigo'], ['a.tsx', 'codigo'], ['a.jsx', 'codigo'], ['a.sh', 'codigo'],
  ['Makefile', 'outro'], ['a.coisa', 'outro'], ['.gitignore', 'outro'], ['a.constructor', 'outro'], ['a.__proto__', 'outro'], ['a.toString', 'outro'],
];

const passosDe = mensagem => mensagem.split('\n').filter(linha => /^ {4}\d+\. /.test(linha)).map(linha => linha.replace(/^ {4}\d+\. /, ''));
const excede = caminho => mensagemDeErro({ estado: 'excede', caminho, tamanho: 30000, limite: 20000 }, config);

for (const [caminho, tipo] of TIPO_DO_CAMINHO) {
  const [primeiro, doTipo] = PRIMEIRO_PASSO_DO_TIPO[tipo];
  const passos = passosDe(excede(caminho));
  assert.ok(passos[0].startsWith(primeiro), `${caminho} devia ser ${tipo}: ${passos[0]}`);
  assert.strictEqual(passos.length, doTipo + 2, caminho);
}

const PASSOS_COMUNS = [
  '    4. Cada arquivo novo fica abaixo do limite (confira com `git show :<arquivo> | wc -c`).',
  '    5. Atualize os imports e os links que apontavam para o arquivo antigo, rode os testes do que mexeu e dê `git add` no arquivo antigo e nos novos.',
];

assert.strictEqual(mensagemDeErro({ estado: 'excede', caminho: 'lib/grande.js', tamanho: 30001, limite: 20000 }, config), [
  '✗ lib/grande.js: 30001 bytes (~7501 tokens), acima do limite de 20000 bytes (5000 tokens).',
  '  Como dividir:',
  '    1. Divida por responsabilidade em módulos irmãos: um módulo por responsabilidade, com o nome dela.',
  '    2. Mova tipos, constantes e dados para o seu próprio arquivo.',
  '    3. Deixe no arquivo antigo só a montagem e corrija os imports/`<script>`/`importScripts`/`manifest` que o carregam (arquivo novo precisa ser carregado onde o antigo era).',
  ...PASSOS_COMUNS,
  `  Não ponha lib/grande.js na linha de base (${LINHA_DE_BASE}): arquivo novo precisa caber no limite.`,
  '  Se ele é gerado por uma ferramenta (ninguém o edita à mão), acrescente o glob dele em "ignorar" de scripts/ganchos/limite-de-tokens.json em vez de dividir.',
].join('\n'));

assert.strictEqual(mensagemDeErro({ estado: 'cresceu', caminho: 'docs/guia.md', tamanho: 25010, limite: 20000, naBase: 25000 }, { linhaDeBase: 'b.json' }), [
  '✗ docs/guia.md: 25010 bytes (~6253 tokens). Ele já passava do limite (20000 bytes = 5000 tokens) e está na linha de base; '
    + 'o máximo para ele é 25000 bytes (o menor entre a linha de base e o tamanho no último commit); cresceu 10 bytes. '
    + 'Um arquivo da linha de base não pode crescer: ponha o que você acrescentou (ou parte do que já havia) em um arquivo novo ao lado.',
  '  Como dividir:',
  '    1. Divida por seção de primeiro nível (`##`): um arquivo por seção, com o título da seção como nome.',
  '    2. Deixe o arquivo antigo como índice: o título, um parágrafo e um link para cada arquivo novo.',
  '    3. Procure no repositório os links para o arquivo e para as âncoras que mudaram de arquivo e corrija (`grep -rn "<nome-do-arquivo>" .`).',
  ...PASSOS_COMUNS,
  '  Depois de dividir docs/guia.md, não edite b.json na PR: a linha de base desce depois do merge, por node scripts/regras/baixar-no-merge.js',
].join('\n'));

const TOKENS_DO_CABECALHO = [
  [{ bytesPorToken: 3 }, '✗ a.js: 30001 bytes (~10001 tokens), acima do limite de 20000 bytes (6667 tokens).'],
  [{}, '✗ a.js: 30001 bytes (~7501 tokens), acima do limite de 20000 bytes (5000 tokens).'],
];
for (const [bytesPorToken, cabecalho] of TOKENS_DO_CABECALHO) {
  const mensagem = mensagemDeErro({ estado: 'excede', caminho: 'a.js', tamanho: 30001, limite: 20000 }, { linhaDeBase: 'b.json', ...bytesPorToken });
  assert.strictEqual(mensagem.split('\n')[0], cabecalho);
}

const MOTIVO_DO_AFROUXAMENTO = [
  [25000, {}, 'o permitido é 25000 bytes (o da linha de base do último commit)'],
  [25000, null, 'o permitido é 25000 bytes (o da linha de base do último commit, o tamanho dele)'],
  [0, {}, 'o permitido é 0 bytes (o da linha de base do último commit)'],
  [null, {}, 'ele não estava na linha de base do último commit'],
  [null, null, 'ele não passava do limite no último commit'],
];
for (const [permitido, baseDoHead, motivo] of MOTIVO_DO_AFROUXAMENTO) {
  assert.strictEqual(mensagemDeAfrouxamento({ caminho: 'a.js', valor: 30000, permitido }, baseDoHead, config),
    `✗ a.js: linha de base afrouxada. Entrada preparada: 30000 bytes, mas ${motivo}. `
    + `A linha de base só desce. Desfaça: git restore --source=HEAD --staged --worktree -- ${LINHA_DE_BASE}; `
    + 'e divida o arquivo em vez de afrouxar a base (arquivo gerado por ferramenta: acrescente o glob em "ignorar" de scripts/ganchos/limite-de-tokens.json).');
}

const TOKENS = [[0, undefined, 0], [1, undefined, 1], [4, undefined, 1], [5, undefined, 2], [20000, 4, 5000], [10, 3, 4]];
for (const [bytes, bytesPorToken, tokens] of TOKENS) assert.strictEqual(tokensDe(bytes, bytesPorToken), tokens, `${bytes}/${bytesPorToken}`);

console.log('mensagens de tamanho ok');
