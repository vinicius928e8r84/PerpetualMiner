'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PREFIXO, esperados } = require('./commit-verde.js');

const script = path.join(__dirname, 'commit-verde.js');
const SHA = 'ca90cd2f0ad60b36a70847435f919f5951f97177';
const USO = 'uso: node scripts/ci/commit-verde.js conferir [--exigir] | marcar <sha>\n';
const USO_DE_MARCAR = 'uso: GITHUB_REPOSITORY=dono/repo node scripts/ci/commit-verde.js marcar <sha inteiro> [--esperar <minutos>] [--ignorar <nome do check>]\n';

function ambienteSem(...nomes) {
  const env = { ...process.env };
  for (const nome of nomes) delete env[nome];
  return env;
}

function rodar(args, env = ambienteSem('PM_COMMIT_VERDE')) {
  const { status, stdout, stderr } = spawnSync('node', [script, ...args], { encoding: 'utf8', env });
  return { status, stdout, stderr };
}

function repositorioMarcado(pasta) {
  const repo = path.join(pasta, 'repo');
  fs.mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'um');
  git('add', '.');
  git('commit', '-q', '-m', 'um');
  git('tag', `${PREFIXO}2026-11-17-abcdef0`);
  return { repo, curto: git('rev-parse', '--short=7', 'HEAD') };
}

function conferirAConferencia(pasta) {
  const { repo, curto } = repositorioMarcado(pasta);
  const verde = `${curto} é um commit verde (${PREFIXO}2026-11-17-abcdef0)\n`;
  assert.deepStrictEqual(rodar(['conferir', '--raiz', repo]), { status: 0, stdout: verde, stderr: '' }, 'o commit verde sai no stdout');
  assert.deepStrictEqual(rodar(['conferir', '--raiz', repo], { ...process.env, PM_COMMIT_VERDE: 'avisar' }), { status: 0, stdout: verde, stderr: '' }, 'também no modo de aviso');
  const semMarca = path.join(pasta, 'sem-marca');
  fs.mkdirSync(semMarca);
  const aviso = rodar(['conferir', '--raiz', semMarca], { ...process.env, PM_COMMIT_VERDE: 'avisar' });
  assert.deepStrictEqual([aviso.status, aviso.stdout], [0, ''], 'o aviso não trava');
  assert.match(aviso.stderr, /^commit sem registro de verde: não consegui ler o git \(/);
  const exigido = rodar(['conferir', '--raiz', semMarca, '--exigir'], { ...process.env, PM_COMMIT_VERDE: 'avisar' });
  assert.deepStrictEqual(exigido, { ...aviso, status: 1 }, '--exigir vence o PM_COMMIT_VERDE=avisar');
  assert.deepStrictEqual(rodar(['conferir', '--raiz', semMarca], { ...process.env, PM_COMMIT_VERDE: 'ignorar' }), { status: 0, stdout: '', stderr: '' }, 'ignorar não escreve nada');
}

function conferirOsErrosDeUso() {
  for (const args of [[], ['apagar'], ['Conferir'], ['--raiz', '.']]) {
    assert.deepStrictEqual(rodar(args), { status: 2, stdout: '', stderr: USO }, `o comando desconhecido: ${args.join(' ')}`);
  }
  const semValor = rodar(['apagar', '--raiz']);
  assert.deepStrictEqual([semValor.status, semValor.stdout], [1, ''], 'a opção --raiz sem valor é lida antes do comando');
  assert.match(semValor.stderr, /^The "paths\[0\]" argument must be of type string\. Received undefined\n$/);
  const comRepo = { ...process.env, GITHUB_REPOSITORY: 'dono/repo' };
  for (const [caso, args, env] of [
    ['sem GITHUB_REPOSITORY', ['marcar', SHA], ambienteSem('GITHUB_REPOSITORY')], ['sem o SHA', ['marcar'], comRepo], ['o SHA em maiúsculas', ['marcar', SHA.toUpperCase()], comRepo],
    ['o SHA depois de uma opção', ['marcar', '--esperar', SHA], comRepo],
  ]) assert.deepStrictEqual(rodar(args, env), { status: 2, stdout: '', stderr: USO_DE_MARCAR }, caso);
}

function ghDeMentira(pasta) {
  const bin = path.join(pasta, 'bin');
  const chamadas = path.join(pasta, 'chamadas.jsonl');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(chamadas)}, JSON.stringify(args) + '\\n');
const alvo = args.find(a => a.startsWith('repos/')) || '';
if (alvo.includes('/compare/')) { console.log('identical'); process.exit(0); }
if (alvo.includes('/check-runs')) { for (const run of JSON.parse(process.env.GH_CHECKS)) console.log(JSON.stringify(run)); process.exit(0); }
process.exit(alvo.endsWith('/git/refs') ? 0 : 1);
`, { mode: 0o755 });
  return { bin, chamadas };
}

function conferirAMarcacao(pasta) {
  const { bin, chamadas } = ghDeMentira(pasta);
  const checks = [...esperados(), 'Vermelho'].map((name, i) => ({ name, status: 'completed', conclusion: i < esperados().length ? 'success' : 'failure' }));
  const marcar = args => {
    fs.rmSync(chamadas, { force: true });
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_REPOSITORY: 'dono/repo', GH_CHECKS: JSON.stringify(checks) };
    return { ...rodar(['marcar', SHA, ...args], env), criacoes: fs.readFileSync(chamadas, 'utf8').split('\n').filter(linha => linha.includes('"POST"')).length };
  };
  assert.deepStrictEqual(marcar([]), { status: 0, stdout: 'ca90cd2 não foi marcado: check vermelho: Vermelho\n', stderr: '', criacoes: 0 }, 'o check vermelho');
  const marcado = marcar(['--ignorar', 'Vermelho', 'solto']);
  assert.match(marcado.stdout, new RegExp(`^${PREFIXO}\\d{4}-\\d{2}-\\d{2}-ca90cd2: tag criada em ${SHA}\\n$`), '--ignorar tira o check da conta, e um argumento solto depois do SHA não muda nada');
  assert.deepStrictEqual({ ...marcado, stdout: '' }, { status: 0, stdout: '', stderr: '', criacoes: 1 });
}

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-verde-linha-'));
try {
  conferirAConferencia(pasta);
  conferirOsErrosDeUso();
  conferirAMarcacao(pasta);
} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}
console.log('test_commit_verde_linha_de_comando: ok');
