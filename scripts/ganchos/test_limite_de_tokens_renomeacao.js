'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, 'limite-de-tokens.js');
const LINHA_DE_BASE = 'scripts/ganchos/linha-de-base-de-tamanho.json';
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'limite-de-tokens-renomeacao-'));
const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: raiz, encoding: 'utf8' });
const escrever = (caminho, conteudo) => {
  fs.mkdirSync(path.dirname(path.join(raiz, caminho)), { recursive: true });
  fs.writeFileSync(path.join(raiz, caminho), conteudo);
};
const gravarBase = arquivos => escrever(LINHA_DE_BASE, `${JSON.stringify({ descricao: 'x', arquivos }, null, 2)}\n`);
const linhas = (n, marca = '') => Array.from({ length: n }, (_, i) => `const linha${i} = ${i * 7919 % 10007};${marca}\n`).join('');
const noGancho = () => spawnSync('node', [CLI], { cwd: raiz, encoding: 'utf8' });
const contraMain = () => spawnSync('node', [CLI, '--base', 'main'], { cwd: raiz, encoding: 'utf8' });
const recomecar = () => { git('checkout', '-q', '-B', 'branch', 'main'); };

try {
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  const grande = linhas(1500);
  const tamanho = Buffer.byteLength(grande);
  assert.ok(tamanho > 20000);
  escrever('grande.js', grande);
  gravarBase({ 'grande.js': tamanho });
  git('add', '-A');
  git('commit', '-q', '-m', 'main');

  recomecar();
  git('mv', 'grande.js', 'novo-lugar.js');
  escrever('novo-lugar.js', grande.replace('linha0 ', 'linha0  '));
  gravarBase({ 'novo-lugar.js': tamanho + 1 });
  git('add', '-A');
  const crescida = noGancho();
  assert.strictEqual(crescida.status, 1, 'mover não dá licença para crescer além da linha de base');

  escrever('novo-lugar.js', grande.replace('linha0 ', 'linhaX '));
  gravarBase({ 'novo-lugar.js': tamanho });
  git('add', '-A');
  const movido = noGancho();
  assert.strictEqual(movido.status, 0, movido.stdout + movido.stderr);
  git('commit', '-q', '-m', 'move');
  const noCi = contraMain();
  assert.strictEqual(noCi.status, 0, noCi.stdout + noCi.stderr);

  recomecar();
  escrever('copia.js', grande);
  gravarBase({ 'grande.js': tamanho, 'copia.js': tamanho });
  git('add', '-A');
  assert.strictEqual(noGancho().status, 1, 'arquivo novo grande continua barrado');
  git('commit', '-q', '-m', 'copia');
  assert.strictEqual(contraMain().status, 1, 'no CI também');

  recomecar();
  git('mv', 'grande.js', 'outro.js');
  escrever('outro.js', linhas(1500, ' // muda tudo').replace(/linha/g, 'coluna'));
  gravarBase({ 'outro.js': tamanho });
  git('add', '-A');
  assert.strictEqual(noGancho().status, 1, 'o que o git não vê como renomeação não herda a linha de base');
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log('limite de tokens: renomeação ok');
