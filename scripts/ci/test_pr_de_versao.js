'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const CONFERIR = path.join(__dirname, 'pr-de-versao.js');
const IDENTIDADE = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const ambiente = { ...process.env, ...IDENTIDADE };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, env: ambiente, encoding: 'utf8' }).trim();
const conferir = (cwd, ...args) => spawnSync('node', [CONFERIR, ...args], { cwd, env: ambiente, encoding: 'utf8' });
const darVersao = (cwd, ...args) => execFileSync('python3', ['complemento/versao_no_merge.py', '--sem-testes', ...args], { cwd, env: { ...ambiente, SOURCE_DATE_EPOCH: '1700000000' }, encoding: 'utf8' });

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-de-versao-'));
try {
  const repo = path.join(pasta, 'repo');
  fs.mkdirSync(repo);
  execFileSync('sh', ['-c', `git -C "${RAIZ}" archive HEAD | tar -x -C "${repo}"`]);
  git(repo, 'init', '-q');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  fs.appendFileSync(path.join(repo, 'complemento', 'configuracao.py'), '\n');
  git(repo, 'commit', '-q', '-am', 'muda o código da Conexão');
  const pai = git(repo, 'rev-parse', 'HEAD');

  let r = conferir(repo);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /não é uma PR de versão/, 'um head que não é o commit de versão não é conferido');

  darVersao(repo);
  const versao = git(repo, 'log', '-1', '--format=%s');
  assert.match(versao, /^Conexão \d+\.\d+\.\d+: versão dada no merge$/);
  r = conferir(repo);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /refeita/, 'o script rodado no pai dá a mesma árvore');

  r = conferir(repo, pai);
  assert.match(r.stdout, /não é uma PR de versão/, 'o head pode ser dado na linha de comando');

  fs.writeFileSync(path.join(repo, 'complemento', 'versoes.json'), fs.readFileSync(path.join(repo, 'complemento', 'versoes.json'), 'utf8').replace(/"[0-9a-f]{64}"\n}/, '"' + '0'.repeat(64) + '"\n}'));
  git(repo, 'commit', '-q', '-a', '--amend', '--no-edit');
  r = conferir(repo);
  assert.strictEqual(r.status, 1, 'um commit de versão que o script não daria falha');
  assert.match(r.stdout + r.stderr, /complemento\/versoes\.json/, 'e diz o arquivo que difere');

  git(repo, 'reset', '-q', '--hard', pai);
  const maior = versao.match(/(\d+)\.(\d+)\.(\d+)/);
  darVersao(repo, '--acima-de', `${maior[1]}.${maior[2]}.${Number(maior[3])}`);
  assert.notStrictEqual(git(repo, 'log', '-1', '--format=%s'), versao, 'a versão pulou um número');
  r = conferir(repo);
  assert.strictEqual(r.status, 0, 'um número dado com --acima-de também é refeito\n' + r.stdout + r.stderr);

  git(repo, 'reset', '-q', '--hard', pai);
  const reservada = `${maior[1]}.${maior[2]}.${Number(maior[3]) + 5}`;
  const reservadas = path.join(repo, 'complemento', 'versoes-reservadas.json');
  fs.writeFileSync(reservadas, JSON.stringify([...JSON.parse(fs.readFileSync(reservadas, 'utf8')), reservada]) + '\n');
  git(repo, 'commit', '-q', '-am', 'reserva um número');
  darVersao(repo, '--versao', reservada);
  r = conferir(repo);
  assert.strictEqual(r.status, 0, 'o número reservado, dado com --versao, também é refeito\n' + r.stdout + r.stderr);

  git(repo, 'checkout', '-q', '-b', 'com-merge');
  git(repo, 'commit', '-q', '--allow-empty', '-m', `Conexão ${reservada}: versão dada no merge`);
  r = conferir(repo);
  assert.strictEqual(r.status, 1, 'um commit com o assunto de versão e outro conteúdo falha');
} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}
console.log('pr-de-versao: ok');
