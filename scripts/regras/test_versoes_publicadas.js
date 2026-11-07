'use strict';

// A prova da regra `versoes-publicadas` (#225): o hash de uma VERSAO que já saiu não se reescreve; muda-se o código, sobe-se a
// VERSAO. O hash da 0.2.0 reescrito em vez de subir a versão passava no test_pacote.py, que só compara o hash registrado da
// VERSAO de hoje com o de hoje.

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const regra = require('./versoes-publicadas');
const { REGRAS } = require('./verificar');

assert.ok(REGRAS.includes(regra), 'a regra está em verificar.js');

const ARQUIVO = 'complemento/versoes.json';
const versoes = obj => `${JSON.stringify(obj, null, 2)}\n`;

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-versoes-'));
const git = (...args) => execFileSync('git', args, { cwd: pasta, encoding: 'utf8', stdio: 'pipe' }).trim();
const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(pasta, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(pasta, arquivo), texto);
};
const commit = mensagem => { git('add', '.'); git('commit', '-q', '-m', mensagem); return git('rev-parse', 'HEAD'); };

try {
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'regras@teste');
  git('config', 'user.name', 'regras');
  escrever(ARQUIVO, versoes({ '0.2.0': 'aaaa', '0.3.0': 'bbbb' }));
  const base = commit('versões publicadas');

  const achadosDe = (obj, de = base) => regra.verificar(ARQUIVO, versoes(obj), pasta, de);

  assert.deepStrictEqual(achadosDe({ '0.2.0': 'aaaa', '0.3.0': 'bbbb' }), [], 'nada mudou');
  assert.deepStrictEqual(achadosDe({ '0.2.0': 'aaaa', '0.3.0': 'bbbb', '0.3.1': 'cccc' }), [], 'uma versão nova entra');

  const reescrito = achadosDe({ '0.2.0': 'zzzz', '0.3.0': 'bbbb' });
  assert.strictEqual(reescrito.length, 1, 'o hash da 0.2.0 reescrito');
  assert.strictEqual(reescrito[0].linha, 2);
  assert.match(reescrito[0].detalhe, /0\.2\.0/);

  const sumiu = achadosDe({ '0.3.0': 'bbbb' });
  assert.strictEqual(sumiu.length, 1, 'uma versão publicada que sumiu');
  assert.match(sumiu[0].detalhe, /0\.2\.0.*sumiu/);

  assert.strictEqual(achadosDe({ '0.2.0': 'zzzz', '0.3.0': 'yyyy', '0.3.1': 'cccc' }).length, 2, 'duas reescritas; a versão nova não conta');
  assert.deepStrictEqual(achadosDe({ '0.2.0': 'zzzz' }, null), [], 'sem base não há o que comparar');
  assert.deepStrictEqual(achadosDe({ '0.2.0': 'zzzz' }, 'a'.repeat(40)), [], 'uma base sem o arquivo não tem o que comparar');

  assert.strictEqual(regra.seAplica(ARQUIVO), true);
  assert.strictEqual(regra.seAplica('complemento/configuracao.py'), false);

  // De ponta a ponta, pelo verificar.js: contra a ponta da base, reescrever um hash publicado falha; uma versão nova passa.
  escrever('scripts/regras/linha-de-base.json', `${JSON.stringify({ 'versoes-publicadas': {} }, null, 2)}\n`);
  commit('linha de base');
  git('checkout', '-q', '-b', 'mudanca');
  const rodar = () => spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, '--base', 'main'], { cwd: pasta, encoding: 'utf8' });
  escrever(ARQUIVO, versoes({ '0.2.0': 'zzzz', '0.3.0': 'bbbb' }));
  let r = rodar();
  assert.strictEqual(r.status, 1, `reescrever o hash da 0.2.0 falha:\n${r.stdout}`);
  assert.match(r.stdout, /versoes-publicadas — complemento\/versoes\.json/);
  assert.match(r.stdout, /complemento\/versoes\.json:2: o hash da versão 0\.2\.0/);
  escrever(ARQUIVO, versoes({ '0.2.0': 'aaaa', '0.3.0': 'bbbb', '0.3.1': 'zzzz' }));
  r = rodar();
  assert.doesNotMatch(r.stdout, /versoes-publicadas — /, `uma versão nova passa na regra:\n${r.stdout}`);
} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}

console.log('versoes-publicadas: provas passaram');
