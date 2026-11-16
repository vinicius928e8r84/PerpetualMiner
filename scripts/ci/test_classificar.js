'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = path.join(__dirname, 'classificar.sh');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-classificar-'));
const repo = path.join(pasta, 'repo');
const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(repo, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(repo, arquivo), texto);
};
const commitar = alteracao => {
  alteracao();
  git('add', '-A');
  git('commit', '-q', '-m', 'mudança');
};

function classificar(evento, cwd = repo) {
  const arquivoDoEnv = path.join(pasta, 'github-env');
  fs.rmSync(arquivoDoEnv, { force: true });
  const env = { ...process.env, GITHUB_ENV: arquivoDoEnv };
  if (evento === undefined) delete env.GITHUB_EVENT_NAME; else env.GITHUB_EVENT_NAME = evento;
  const resultado = spawnSync('sh', [script], { cwd, env, encoding: 'utf8' });
  assert.strictEqual(resultado.status, 0, `o passo termina bem (${resultado.stderr})`);
  const gravado = fs.readFileSync(arquivoDoEnv, 'utf8');
  assert(gravado.trim() === resultado.stdout.trim(), 'o que vai ao GITHUB_ENV é o que aparece no log');
  return gravado.trim();
}

fs.mkdirSync(repo);
git('init', '-q');
escrever('painel.js', '// painel\n');
escrever('docs/leia.md', 'um\n');
git('add', '-A'); git('commit', '-q', '-m', 'base');

assert.strictEqual(classificar('pull_request'), 'RODAR=true', 'PR sem como comparar');

commitar(() => escrever('docs/leia.md', 'dois\n'));
assert.strictEqual(classificar('pull_request'), 'RODAR=false', 'PR só de documentação pula');
commitar(() => escrever('painel.js', '// painel 2\n'));
assert.strictEqual(classificar('pull_request'), 'RODAR=true', 'PR que muda código roda');
commitar(() => { escrever('docs/leia.md', 'tres\n'); escrever('painel.js', '// painel 3\n'); });
assert.strictEqual(classificar('pull_request'), 'RODAR=true', 'documentação e código juntos rodam');
commitar(() => escrever('.github/workflows/testes.yml', 'name: x\n'));
assert.strictEqual(classificar('pull_request'), 'RODAR=true', 'mexer num workflow roda');

assert.strictEqual(classificar('push'), 'RODAR=false', 'push na main');
assert.strictEqual(classificar('schedule'), 'RODAR=true', 'evento desconhecido roda');
assert.strictEqual(classificar('workflow_dispatch'), 'RODAR=true', 'disparo manual roda');

const semGit = path.join(pasta, 'sem-git');
fs.mkdirSync(semGit);
assert.strictEqual(classificar('pull_request', semGit), 'RODAR=true', 'falha ao ler a mudança');

fs.rmSync(pasta, { recursive: true, force: true });
console.log('classificar ok');
