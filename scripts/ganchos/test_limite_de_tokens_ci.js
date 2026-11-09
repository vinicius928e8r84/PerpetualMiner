'use strict';

// A conferência de tamanho no CI (limite-de-tokens.js --base <ref>): o que a branch mudou desde a base
// passa pelo mesmo limite e pela mesma linha de base que só desce do gancho. Roda num repositório de
// mentira com uma "main" e uma branch, criado e apagado aqui.

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, 'limite-de-tokens.js');
const LINHA_DE_BASE = 'scripts/ganchos/linha-de-base-de-tamanho.json';
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'limite-de-tokens-ci-'));
const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: raiz, encoding: 'utf8' });
const escrever = (caminho, conteudo) => {
  fs.mkdirSync(path.dirname(path.join(raiz, caminho)), { recursive: true });
  fs.writeFileSync(path.join(raiz, caminho), conteudo);
};
const gravarBase = arquivos => escrever(LINHA_DE_BASE, `${JSON.stringify({ descricao: 'x', arquivos }, null, 2)}\n`);
const commit = mensagem => { git('add', '-A'); git('commit', '-q', '-m', mensagem); };
const rodar = (...args) => spawnSync('node', [CLI, '--base', ...args], { cwd: raiz, encoding: 'utf8' });
const passa = ref => {
  const r = rodar(ref);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return r;
};
const barra = ref => {
  const r = rodar(ref);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  return r;
};

try {
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  escrever('grande.js', 'a'.repeat(30000));
  gravarBase({ 'grande.js': 30000 });
  commit('main');

  git('checkout', '-q', '-b', 'branch');
  passa('main'); // nada mudou

  // Arquivo novo no limite passa; um byte acima barra, com o nome e os números.
  escrever('lib/no-limite.js', 'a'.repeat(20000));
  commit('no limite');
  passa('main');
  escrever('lib/acima.js', 'a'.repeat(20001));
  commit('acima');
  const r = barra('main');
  assert.ok(r.stderr.includes('lib/acima.js') && r.stderr.includes('20001 bytes'), r.stderr);
  assert.ok(!r.stderr.includes('lib/no-limite.js'), r.stderr);
  git('rm', '-q', 'lib/acima.js');
  commit('sem o acima');
  passa('main'); // o mesmo teste, sem o arquivo, passa

  // Arquivo da linha de base: encolher e editar sem crescer passa; crescer barra.
  escrever('grande.js', 'a'.repeat(29000));
  commit('encolhe');
  passa('main');
  escrever('grande.js', 'a'.repeat(30001));
  commit('cresce');
  assert.ok(barra('main').stderr.includes('grande.js'));
  escrever('grande.js', 'a'.repeat(29000));
  commit('volta');
  passa('main');

  // Afrouxar a linha de base (entrada nova) barra, mesmo com o arquivo dentro do limite da base editada.
  escrever('outro.js', 'a'.repeat(25000));
  gravarBase({ 'grande.js': 30000, 'outro.js': 25000 });
  commit('afrouxa');
  assert.ok(barra('main').stderr.includes('outro.js'));

  // Uma base que não existe é erro, não verde.
  const inexistente = rodar('nao-existe');
  assert.strictEqual(inexistente.status, 1, inexistente.stdout + inexistente.stderr);
  assert.ok(inexistente.stderr.includes('nao-existe'), inexistente.stderr);
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log('limite de tokens no CI ok');
