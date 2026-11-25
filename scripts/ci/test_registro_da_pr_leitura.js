'use strict';

const assert = require('assert');
const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const { conferir, linhasQueValem } = require('./registro-da-pr.js');

const HEAD = '96cfa870d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6';
const MODELO = ['## Summary', '', 'O que mudou.', '', '## Evidence', '', 'Rodei.', '', '## Merge Danger', '', '**Door:** two-way', '', '**Blast Radius:** CI', '', '**Política:** sem mudança', '', '**Atenção:** BAIXA', ''];
const REVISAO = ['## Code review', '', 'Veredito: CLEAN', `Head: ${HEAD}`, 'Autor: sessão do autor', 'Revisor: sessão da revisão', 'Risco: BAIXA'].join('\n');
const corpoCom = (...linhas) => [...MODELO, ...linhas].join('\n');
const linha = (texto, nivel = 0, puro = true) => ({ texto, nivel, puro });
const textoDe = linhas => linhas.join('\n');

const LINHAS_QUE_VALEM = [
  ['a cerca de crases não fecha com til', ['```', '~~~', 'dentro', '```', 'fora'], [linha('fora')]],
  ['a cerca não fecha com uma marca mais curta', ['````', '```', 'dentro', '````', 'fora'], [linha('fora')]],
  ['a marca com texto depois não fecha a cerca', ['```', '```js', 'dentro', '```', 'fora'], [linha('fora')]],
  ['uma marca mais longa fecha a cerca', ['~~~', 'dentro', '~~~~~', 'fora'], [linha('fora')]],
  ['a cerca recuada até 3 espaços abre; com 4 é código recuado', ['   ```', 'dentro', '```', '    ```', 'fora'], [linha('', 0, false), linha('fora')]],
  ['o comentário de HTML sem fim leva o resto', ['antes', '<!-- sem fim', 'depois'], [linha('antes'), linha('')]],
  ['o comentário de HTML some no meio da linha e entre linhas', ['a <!-- x --> b', '<!--', 'y', '--> c'], [linha('a  b'), linha('c')]],
  ['a citação, até 3 espaços de recuo, não conta', ['> citado', '   > recuado', '    > código', 'fora'], [linha('> código', 0, false), linha('fora')]],
  ['os títulos e a marcação', ['## Título ##', '#sem espaço', '####### sete', '   ### três', '**Negrito**: x', '- item.', '`código` aqui', '\tTab'], [
    linha('Título', 2), linha('#sem espaço'), linha('####### sete'), linha('três', 3), linha('Negrito: x'), linha('item'), linha('código aqui', 0, false), linha('Tab', 0, false),
  ]],
  ['o CRLF', ['## A\r', 'b\r', ''], [linha('A', 2), linha('b'), linha('')]],
];

function conferirAsLinhasQueValem() {
  for (const [caso, linhas, esperadas] of LINHAS_QUE_VALEM) assert.deepStrictEqual(linhasQueValem(textoDe(linhas)), esperadas, caso);
  assert.deepStrictEqual(linhasQueValem(null), [linha('')], 'sem corpo');
  assert.deepStrictEqual(linhasQueValem(undefined), [linha('')], 'corpo indefinido');
}

const SEM_ISSUE = /o corpo não diz a issue/;
const ISSUE = 'https://github.com/dono/repo/issues/12';

function conferirAIssueSoNoTextoPuro() {
  const mensagem = (...linhas) => conferir({ corpo: corpoCom(...linhas), rotulos: [], registros: [REVISAO], head: HEAD, repositorio: 'dono/repo' }).mensagem;
  assert.match(mensagem(`Closes ${ISSUE}`), /^registro da PR ok/, 'a linha de texto puro');
  assert.match(mensagem(`\`Closes ${ISSUE}\``), SEM_ISSUE, 'entre crases');
  assert.match(mensagem(`    Closes ${ISSUE}`), SEM_ISSUE, 'código recuado');
  assert.match(mensagem(`\tCloses ${ISSUE}`), SEM_ISSUE, 'recuo de tabulação');
  assert.match(mensagem('`Sem issue`'), SEM_ISSUE, 'o "Sem issue" entre crases');
  assert.match(mensagem('```', '```js', 'Sem issue', '```'), SEM_ISSUE, 'a marca com texto não fecha a cerca');
}

function servidorDoGitHub() {
  const servidor = http.createServer((pedido, resposta) => {
    const { pathname } = new URL(pedido.url, 'http://github.test');
    const rotas = {
      '/repos/dono/repo/pulls/7': { head: { sha: HEAD }, body: corpoCom('Sem issue'), labels: [] },
      '/repos/dono/repo/issues/7/comments': [{ body: REVISAO, created_at: '2026-01-02T00:00:00Z', author_association: 'OWNER' }],
      '/repos/dono/repo/pulls/7/reviews': [],
      '/repos/dono/repo/pulls/7/files': [],
    };
    resposta.writeHead(rotas[pathname] ? 200 : 404, { 'content-type': 'application/json' });
    resposta.end(JSON.stringify(rotas[pathname] || { message: 'erro' }));
  });
  return new Promise(pronto => servidor.listen(0, '127.0.0.1', () => pronto(servidor)));
}

const rodar = (servidor, env) => new Promise(pronto => {
  execFile('node', [path.join(__dirname, 'registro-da-pr.js')], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_API_URL: `http://127.0.0.1:${servidor.address().port}`, GITHUB_REPOSITORY: 'dono/repo', GITHUB_TOKEN: 't', PR: '7', HEAD, ...env },
  }, (erro, stdout) => pronto({ status: erro ? erro.code : 0, stdout }));
});

const USO = 'uso: GITHUB_TOKEN=… GITHUB_REPOSITORY=<dono/repo> PR=<número> HEAD=<SHA inteiro do head> node scripts/ci/registro-da-pr.js\n';

async function conferirALinhaDeComando(servidor) {
  const normalizado = await rodar(servidor, { HEAD: `  ${HEAD.toUpperCase()}\n` });
  assert.deepStrictEqual(normalizado, { status: 0, stdout: `registro da PR ok no head ${HEAD}: atenção BAIXA, /code-review CLEAN\n` }, 'o HEAD com espaços e em maiúsculas');
  assert.deepStrictEqual(await rodar(servidor, { GITHUB_RUN_ID: '99' }), normalizado, 'no CI, o check verde não sugere rodar de novo');
  assert.deepStrictEqual(await rodar(servidor, { PR: 'sete' }), { status: 2, stdout: USO }, 'o número da PR com letras');
  assert.deepStrictEqual(await rodar(servidor, { PR: '7a' }), { status: 2, stdout: USO }, 'o número da PR com uma letra no fim');
  assert.deepStrictEqual(await rodar(servidor, { HEAD: `${HEAD}0` }), { status: 2, stdout: USO }, 'o HEAD com 41 caracteres');
}

(async () => {
  conferirAsLinhasQueValem();
  conferirAIssueSoNoTextoPuro();
  const servidor = await servidorDoGitHub();
  try {
    await conferirALinhaDeComando(servidor);
  } finally {
    servidor.close();
  }
  console.log('test_registro_da_pr_leitura: ok');
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
