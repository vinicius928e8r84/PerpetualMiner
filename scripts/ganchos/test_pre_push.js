'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EMAIL_DO_DONO } = require('../ci/autoria.js');
const { lerYaml } = require('../yaml-de-workflow.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pre-push-'));
const remoto = path.join(pasta, 'remoto.git');
const trabalho = path.join(pasta, 'trabalho');
const ANALISADOR_INSTALADO = path.join(RAIZ, 'scripts', 'regras', 'analisador', 'node_modules');
const env = (email = EMAIL_DO_DONO) => ({
  ...process.env, NODE_PATH: ANALISADOR_INSTALADO, GIT_AUTHOR_NAME: 'n', GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: 'n', GIT_COMMITTER_EMAIL: email,
});
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: env(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(trabalho, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(trabalho, arquivo), texto);
};
function commitar(arquivo, texto, email) {
  escrever(arquivo, texto);
  git(trabalho, 'add', '-A');
  execFileSync('git', ['commit', '-q', '-m', `muda ${arquivo}`], { cwd: trabalho, env: env(email) });
}
const empurrar = (...args) => spawnSync('git', ['push', ...args], { cwd: trabalho, encoding: 'utf8', env: env() });
const saida = r => r.stdout + r.stderr;
const noRemoto = branch => spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: remoto }).status === 0;

git(pasta, 'clone', '-q', '--bare', RAIZ, remoto);
git(remoto, 'update-ref', 'refs/heads/main', git(RAIZ, 'rev-parse', 'HEAD'));
git(pasta, 'clone', '-q', remoto, trabalho);
git(trabalho, 'checkout', '-q', '-B', 'main', 'origin/main');
git(trabalho, 'config', 'core.hooksPath', path.join(__dirname));
git(trabalho, 'config', 'user.name', 'n');
git(trabalho, 'config', 'user.email', EMAIL_DO_DONO);

git(trabalho, 'checkout', '-q', '-b', 'certa');
commitar('docs/pre-push-certa.md', 'texto\n');
let r = empurrar('origin', 'certa');
assert.strictEqual(r.status, 0, saida(r));
assert(noRemoto('certa'), 'a branch chegou ao remoto');
assert(/pre-push: refs\/heads\/certa contra origin\/main/.test(saida(r)) && /autoria ok/.test(saida(r)), saida(r));

git(trabalho, 'checkout', '-q', '-b', 'autoria-errada', 'main');
commitar('docs/pre-push-autoria.md', 'texto\n', 'agente@exemplo.com');
r = empurrar('origin', 'autoria-errada');
assert.notStrictEqual(r.status, 0, 'a autoria errada barra');
assert(/sem a autoria do dono/.test(saida(r)) && /muda docs\/pre-push-autoria\.md/.test(saida(r)) && /Push barrado/.test(saida(r)), saida(r));
assert(!noRemoto('autoria-errada'), 'nada chegou ao remoto');

git(trabalho, 'checkout', '-q', '-b', 'com-coautor', 'main');
escrever('docs/pre-push-coautor.md', 'texto\n');
git(trabalho, 'add', '-A');
git(trabalho, 'commit', '-q', '-m', 'muda docs/pre-push-coautor.md', '-m', 'Co-Authored-By: Agente <agente@exemplo.com>');
r = empurrar('origin', 'com-coautor');
assert.notStrictEqual(r.status, 0, `o co-autor de outro e-mail barra: ${saida(r)}`);
assert(/sem a autoria do dono/.test(saida(r)) && /co-autor Agente <agente@exemplo\.com>/.test(saida(r)) && /Push barrado/.test(saida(r)), saida(r));
assert(!noRemoto('com-coautor'), 'nada chegou ao remoto');

git(trabalho, 'checkout', '-q', '-b', 'regra-quebrada', 'main');
commitar('test_sem_grupo.js', "'use strict';\n");
r = empurrar('origin', 'regra-quebrada');
assert.notStrictEqual(r.status, 0, 'a regra quebrada barra');
assert(/testes-no-portao/.test(saida(r)) && /test_sem_grupo\.js/.test(saida(r)) && /Push barrado/.test(saida(r)), saida(r));
assert(!noRemoto('regra-quebrada'), 'nada chegou ao remoto');
r = empurrar('--no-verify', 'origin', 'regra-quebrada');
assert.strictEqual(r.status, 0, saida(r));
assert(noRemoto('regra-quebrada'), '--no-verify pula o gancho');

git(trabalho, 'checkout', '-q', '-b', 'arquivo-grande', 'main');
escrever('docs/pre-push-grande.md', 'linha de texto\n'.repeat(1400));
git(trabalho, 'add', '-A');
git(trabalho, 'commit', '-q', '--no-verify', '-m', 'muda docs/pre-push-grande.md');
r = empurrar('origin', 'arquivo-grande');
assert.notStrictEqual(r.status, 0, 'o arquivo acima do limite de tamanho barra');
assert(/docs\/pre-push-grande\.md: 21000 bytes/.test(saida(r)) && /acima do limite/.test(saida(r)) && /Push barrado/.test(saida(r)), saida(r));
assert(!noRemoto('arquivo-grande'), 'nada chegou ao remoto');

const passosDoCI = lerYaml(fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'regras.yml'), 'utf8')).jobs.regras.steps;
const conferenciasDoCI = passosDoCI.filter(passo => passo.run && !(passo.env && 'PR_BODY' in passo.env))
  .map(passo => /^node (scripts\/\S+)/.exec(passo.run)).filter(Boolean).map(achado => achado[1]).filter(script => script !== 'scripts/testar.mjs');
const gancho = fs.readFileSync(path.join(__dirname, 'pre-push'), 'utf8');
assert.deepStrictEqual(conferenciasDoCI, ['scripts/regras/verificar.js', 'scripts/ganchos/limite-de-tokens.js', 'scripts/ci/autoria.js']);
assert.deepStrictEqual(conferenciasDoCI.filter(script => !gancho.includes(`node ${script} `)), [],
  'o pre-push roda cada conferência do job Regras que não lê o corpo da PR');
for (const script of ['scripts/regras/verificar.js', 'scripts/ganchos/limite-de-tokens.js']) {
  const passo = passosDoCI.find(p => p.run && p.run.startsWith(`node ${script}`));
  assert.strictEqual(passo.env && passo.env.REGRAS_BASE, "${{ github.event_name == 'push' && github.event.before || 'HEAD^1' }}",
    `${script} no PR compara com o HEAD^1, a main sobre a qual o GitHub montou o merge ref; o origin/main da hora pode já ter andado e dar falso vermelho`);
}

git(trabalho, 'checkout', '-q', '-b', 'outra', 'main');
r = empurrar('origin', 'autoria-errada:outra-destino');
assert.notStrictEqual(r.status, 0, 'a autoria vale para qualquer branch');
assert(/não é o HEAD; as regras de revisão e o limite de tamanho foram pulados/.test(saida(r)) && /sem a autoria do dono/.test(saida(r)), saida(r));
assert(!noRemoto('outra-destino'));

r = empurrar('origin', '--delete', 'certa');
assert.strictEqual(r.status, 0, saida(r));
assert(!/pre-push:/.test(saida(r)) && !noRemoto('certa'), saida(r));
git(trabalho, 'tag', 'v-teste');
r = empurrar('origin', 'v-teste');
assert.strictEqual(r.status, 0, saida(r));
assert(!/pre-push:/.test(saida(r)), saida(r));

// Um clone com core.autocrlf=true (o padrão do Git for Windows), em que os workflows e o cadastro chegam com CRLF: a branch
// certa sobe igual. Antes o verificador lia o workflow com CRLF pela metade e o gancho barrava todo push no Windows.
{
  const comCRLF = path.join(pasta, 'trabalho-crlf');
  git(pasta, 'clone', '-q', '-c', 'core.autocrlf=true', remoto, comCRLF);
  assert(fs.readFileSync(path.join(comCRLF, '.github', 'workflows', 'testes.yml'), 'utf8').includes('\r\n'), 'o workflow do clone tem CRLF');
  git(comCRLF, 'config', 'core.hooksPath', path.join(__dirname));
  git(comCRLF, 'checkout', '-q', '-b', 'certa-crlf', 'origin/main');
  fs.writeFileSync(path.join(comCRLF, 'docs', 'pre-push-crlf.md'), 'texto\r\n');
  git(comCRLF, 'add', '-A');
  git(comCRLF, 'commit', '-q', '-m', 'muda docs/pre-push-crlf.md');
  r = spawnSync('git', ['push', 'origin', 'certa-crlf'], { cwd: comCRLF, encoding: 'utf8', env: env() });
  assert.strictEqual(r.status, 0, saida(r));
  assert(noRemoto('certa-crlf') && /regras ok/.test(saida(r)) && /autoria ok/.test(saida(r)), saida(r));
}

git(trabalho, 'checkout', '-q', '-b', 'sem-base', 'main');
commitar('docs/pre-push-sem-base.md', 'texto\n');
git(trabalho, 'update-ref', '-d', 'refs/remotes/origin/main');
r = empurrar('origin', 'sem-base');
assert.strictEqual(r.status, 0, saida(r));
assert(/aviso: sem origin\/main nem origin\/main para comparar/.test(saida(r)) && noRemoto('sem-base'), saida(r));

fs.rmSync(pasta, { recursive: true, force: true });
console.log('pre-push ok');
