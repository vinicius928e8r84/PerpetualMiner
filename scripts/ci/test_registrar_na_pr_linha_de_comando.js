'use strict';

const assert = require('assert');
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { corpoComAProva, secaoDaProva } = require('./registrar-na-pr.js');

const HEAD = '1d606d78aac180096ca7cc5df8279355f21ac729';
const SECAO = secaoDaProva(HEAD, 'Provei.');
const SECAO_NO_FIM = ['', ...SECAO.split('\n'), ''];
const ALTA = ['## Summary', '', 'O que mudou.', '', 'Sem issue', '', '## Evidence', '', 'Rodei.', '', '## Merge Danger', '', '**Door:** two-way', '', '**Blast Radius:** CI', '', '**Política:** sem mudança', '', '**Atenção:** ALTA', ''].join('\n');
const linhas = (...partes) => partes.join('\n');

const CORPOS = [
  ['o título dentro de uma cerca de til', ['x', '~~~', '## Prova real', '~~~', 'y'], ['x', '~~~', '## Prova real', '~~~', 'y', ...SECAO_NO_FIM]],
  ['crases dentro do til não abrem outra cerca', ['x', '~~~', '```', '~~~', '## Prova real', 'velha', '## Depois', 'd'], ['x', '~~~', '```', '~~~', SECAO, '', '## Depois', 'd']],
  ['o til não fecha a cerca de crases', ['```', '~~~', '## Prova real', '```', 'y'], ['```', '~~~', '## Prova real', '```', 'y', ...SECAO_NO_FIM]],
  ['a marca mais curta não fecha a cerca', ['````', '```', '## Prova real', '````'], ['````', '```', '## Prova real', '````', ...SECAO_NO_FIM]],
  ['a marca com texto não fecha a cerca', ['```', '```js', '## Prova real', '```'], ['```', '```js', '## Prova real', '```', ...SECAO_NO_FIM]],
  ['o comentário de HTML sem fim esconde o resto', ['x', '<!-- sem fim', '## Prova real', 'velha'], ['x', '<!-- sem fim', '## Prova real', 'velha', ...SECAO_NO_FIM]],
  ['a seção acaba no primeiro título do mesmo nível', ['## Prova real', 'velha', '## A', 'a', '## B', 'b'], [SECAO, '', '## A', 'a', '## B', 'b']],
  ['só a primeira seção "Prova real" é trocada', ['## Prova real', 'velha', '## Prova real', 'outra'], [SECAO, '', '## Prova real', 'outra']],
  ['o título com marcação e outra caixa, e os subtítulos dentro dela', ['# Topo', '### **Prova Real**', 'velha', '#### sub', 's', '## Seguinte', 'z'], ['# Topo', SECAO, '', '## Seguinte', 'z']],
  ['o CRLF vira LF', ['a\r', '## Prova real\r', 'velha\r', '## Depois\r', 'd'], ['a', SECAO, '', '## Depois', 'd']],
  ['o corpo vazio', [], ['', ...SECAO_NO_FIM]],
];

function conferirOCorpoComAProva() {
  for (const [caso, corpo, esperado] of CORPOS) assert.strictEqual(corpoComAProva(linhas(...corpo), SECAO), linhas(...esperado), caso);
  assert.strictEqual(corpoComAProva(null, SECAO), linhas('', ...SECAO_NO_FIM), 'sem corpo');
}

const servidorDoGitHub = pedidos => new Promise(pronto => {
  const rotas = {
    'GET /repos/dono/repo/pulls/7': { body: ALTA, labels: [], head: { sha: HEAD } },
    'GET /repos/dono/repo/issues/7/comments': [],
    'GET /repos/dono/repo/pulls/7/reviews': [],
    'GET /repos/dono/repo/pulls/7/files': [],
    'PATCH /repos/dono/repo/pulls/7': { number: 7 },
    'GET /repos/dono/repo/actions/workflows/registro-da-pr.yml/runs': { workflow_runs: [] },
  };
  const servidor = http.createServer((pedido, resposta) => {
    let recebido = '';
    pedido.on('data', pedaco => { recebido += pedaco; });
    pedido.on('end', () => {
      const rota = `${pedido.method} ${new URL(pedido.url, 'http://github.test').pathname}`;
      pedidos.push(`${rota} ${pedido.headers.authorization} ${recebido}`.trimEnd());
      resposta.writeHead(rotas[rota] ? 200 : 404, { 'content-type': 'application/json' });
      resposta.end(JSON.stringify(rotas[rota] || {}));
    });
  });
  servidor.listen(0, '127.0.0.1', () => pronto(servidor));
});

function rodador(servidor, pedidos) {
  return (args, { env = {}, cwd = __dirname } = {}) => new Promise(pronto => {
    pedidos.length = 0;
    execFile('node', [path.join(__dirname, 'registrar-na-pr.js'), ...args], {
      cwd,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, GITHUB_API_URL: `http://127.0.0.1:${servidor.address().port}`, GITHUB_REPOSITORY: 'dono/repo', GITHUB_TOKEN: 't', ...env },
    }, (erro, stdout) => pronto({ status: erro ? erro.code : 0, stdout, pedidos: [...pedidos] }));
  });
}

const USO = /^uso: node scripts\/ci\/registrar-na-pr\.js <comando>[^]*e 2 no erro de uso ou do GitHub\.\n$/;
const LEITURA = ['GET /repos/dono/repo/pulls/7 Bearer t', 'GET /repos/dono/repo/issues/7/comments Bearer t', 'GET /repos/dono/repo/pulls/7/reviews Bearer t', 'GET /repos/dono/repo/pulls/7/files Bearer t'];
const CONSERTO = [
  '  Conserto: o formato de cada parte está em .github/PULL_REQUEST_TEMPLATE.md. O que está em comentário de HTML, em bloco de código ou em citação não conta; na seção "Prova real", a parte não coberta ou bloqueada conta também no código e na citação.',
  '  O corpo se confere antes de abrir a PR ou de editá-lo, sem o GitHub: node scripts/ci/corpo-da-pr.js <arquivo do corpo>',
  '  O registro do /code-review e a prova com o head lido do GitHub (e o check rodando de novo): node scripts/ci/registrar-na-pr.js --help',
];
const SEM_REVISAO = '    - nenhum comentário ou revisão da PR é o registro do /code-review (as linhas "Veredito: CLEAN", "Head: <SHA>", "Autor:", "Revisor:" e "Risco:")';
const SEM_PROVA = '    - atenção ALTA: o corpo não tem a seção "Prova real"';
const NAO_VALE = `✗ O registro da PR não vale para o head ${HEAD}:`;
const SEM_EXECUCAO = '  O check "Registro da PR" não tem execução neste head, e um comentário não cria uma. Se a PR acabou de receber um commit ou uma edição, '
  + 'espere um minuto e confira de novo. Senão (a PR é de antes de o check existir na main), feche e reabra a PR: o head não muda, '
  + 'e a revisão e a prova continuam valendo: gh pr close 7 -R dono/repo && gh pr reopen 7 -R dono/repo';
const recuada = texto => texto.replace(/^/gm, '    ');

async function conferirOsErrosDeUso(rodar) {
  for (const args of [[], ['-h'], ['--help'], ['conferir', '--pr', '7', '--help'], ['revisao', '--help', '--pr']]) {
    const ajuda = await rodar(args);
    assert.strictEqual(ajuda.status, 0, `a ajuda: ${args.join(' ')}`);
    assert.match(ajuda.stdout, USO, args.join(' '));
  }
  for (const [args, mensagem] of [
    [['conferir', '--pr'], '--pr precisa de um valor'], [['revisao', '--pr', '7', '--head', '--autor', 'a'], '--head precisa de um valor'],
    [['conferir', '--pr', '7', '--veredito'], '--veredito precisa de um valor'], [['conferir', '--pr', '7', 'repo', 'x'], 'opção desconhecida: repo'],
    [['conferir', '--pr', '7', '-repo', 'x'], 'opção desconhecida: -repo'], [['conferir', '--pr', '7', '++repo', 'x'], 'opção desconhecida: ++repo'],
    [['conferir', '--pr', 'sete'], '--pr <número> é obrigatório'],
    [['revisao', '--pr', '7', '--head', HEAD, '--autor', ' ', '--revisor', 'b'], 'revisao pede --autor, --risco'], [['-x'], 'comando desconhecido: -x'],
    [['revisao', '--pr', '7', '--head', HEAD, '--autor', 'a', '--revisor', 'b', '--risco', 'urgente'], '--risco é baixa, media, alta; veio "urgente"'],
    [['prova', '--pr', '7', '--head', HEAD, '--cobertura', 'quase', '--nota', 'x'], '--cobertura é total, parcial; veio "quase"'],
  ]) {
    const errado = await rodar(args);
    assert.deepStrictEqual([errado.status, errado.pedidos], [2, []], args.join(' '));
    assert(errado.stdout.startsWith(`${mensagem}\n\nuso: `), `${args.join(' ')}: ${errado.stdout}`);
  }
  const semRepositorio = await rodar(['conferir', '--pr', '7'], { env: { GITHUB_REPOSITORY: '' }, cwd: os.tmpdir() });
  assert.strictEqual(semRepositorio.status, 2);
  assert(semRepositorio.stdout.startsWith('não sei qual é o repositório: passe --repo <dono/repo>\n\nuso: '), semRepositorio.stdout);
}

async function conferirAsSaidas(rodar, nota) {
  const PROVA = ['prova', '--pr', '7', '--head', HEAD, '--cobertura', 'total', '--nota', nota];
  const depoisDaProva = ['Com isso publicado, o check diz:', NAO_VALE, SEM_REVISAO, ...CONSERTO, ''];
  assert.deepStrictEqual(await rodar(PROVA), {
    status: 1, stdout: linhas('A seção que entra no corpo da PR 7 (ensaio: nada foi publicado; repita com --publicar):', '', recuada(SECAO), '', ...depoisDaProva), pedidos: LEITURA,
  }, 'o ensaio da prova');
  assert.deepStrictEqual(await rodar([...PROVA, '--publicar']), {
    status: 1,
    stdout: linhas('A seção que entra no corpo da PR 7:', '', recuada(SECAO), '', 'Corpo gravado (a edição do corpo dispara o check).', ...depoisDaProva),
    pedidos: [...LEITURA, `PATCH /repos/dono/repo/pulls/7 Bearer t ${JSON.stringify({ body: `${ALTA.trimEnd()}\n\n${SECAO}\n` })}`],
  }, 'a prova publicada');
  const registro = linhas('Registro do /code-review', '', 'Veredito: CLEAN', `Head: ${HEAD}`, 'Autor: a', 'Revisor: b', 'Risco: MÉDIA');
  assert.deepStrictEqual(await rodar(['revisao', '--pr', '7', '--head', ` ${HEAD.toUpperCase()} `, '--autor', 'a', '--revisor', 'b', '--risco', 'Média']), {
    status: 1,
    stdout: linhas('O comentário da PR 7 (ensaio: nada foi publicado; repita com --publicar):', '', recuada(registro), '', 'Com isso publicado, o check diz:', NAO_VALE, SEM_PROVA, ...CONSERTO, SEM_EXECUCAO, ''),
    pedidos: [...LEITURA, 'GET /repos/dono/repo/actions/workflows/registro-da-pr.yml/runs Bearer t'],
  }, 'o ensaio da revisão com o head em maiúsculas e com espaços');
  const conferida = linhas(NAO_VALE, SEM_REVISAO, SEM_PROVA, ...CONSERTO, SEM_EXECUCAO, '');
  const pedidosDoConferir = token => [...LEITURA, 'GET /repos/dono/repo/actions/workflows/registro-da-pr.yml/runs Bearer t'].map(pedido => pedido.replace('Bearer t', `Bearer ${token}`));
  assert.deepStrictEqual(await rodar(['conferir', '--pr', '7', '--repo', 'dono/repo'], { env: { GITHUB_REPOSITORY: '' } }), { status: 1, stdout: conferida, pedidos: pedidosDoConferir('t') }, '--repo');
  assert.deepStrictEqual(await rodar(['conferir', '--pr', '7'], { env: { GITHUB_TOKEN: '', GH_TOKEN: 'g' } }), { status: 1, stdout: conferida, pedidos: pedidosDoConferir('g') }, 'o token do GH_TOKEN');
  const semNota = await rodar(['prova', '--pr', '7', '--head', HEAD, '--cobertura', 'total', '--nota', `${nota}.falta`]);
  assert.deepStrictEqual(semNota, { status: 2, stdout: `✗ ENOENT: no such file or directory, open '${nota}.falta'\n`, pedidos: [] }, 'a nota que não existe');
}

async function conferirORepositorioDoOrigin(rodar, pasta) {
  for (const [caso, origin] of [['pelo ssh', 'git@github.com:dono/repo.git'], ['pelo https, sem .git', 'https://github.com/dono/repo']]) {
    const clone = fs.mkdtempSync(path.join(pasta, 'clone-'));
    execFileSync('git', ['-C', clone, 'init', '-q']);
    execFileSync('git', ['-C', clone, 'remote', 'add', 'origin', origin]);
    const lida = await rodar(['conferir', '--pr', '7'], { env: { GITHUB_REPOSITORY: '' }, cwd: clone });
    assert.deepStrictEqual([lida.status, lida.pedidos[0]], [1, 'GET /repos/dono/repo/pulls/7 Bearer t'], `sem --repo nem GITHUB_REPOSITORY, o repositório vem do origin ${caso}`);
  }
}

(async () => {
  conferirOCorpoComAProva();
  const pedidos = [];
  const servidor = await servidorDoGitHub(pedidos);
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'registrar-na-pr-linha-'));
  const nota = path.join(pasta, 'nota.md');
  fs.writeFileSync(nota, 'Provei.\n');
  try {
    const rodar = rodador(servidor, pedidos);
    await conferirOsErrosDeUso(rodar);
    await conferirAsSaidas(rodar, nota);
    await conferirORepositorioDoOrigin(rodar, pasta);
  } finally {
    servidor.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
  console.log('test_registrar_na_pr_linha_de_comando: ok');
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
