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

// O ambiente do CI de uma PR liga a parte "a versão é dada no merge"; as provas abaixo escolhem o seu.
const ambienteDoCi = { GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME, REGRAS_PR: process.env.REGRAS_PR };
const emPr = ligado => {
  delete process.env.GITHUB_EVENT_NAME;
  delete process.env.REGRAS_PR;
  if (ligado) process.env.GITHUB_EVENT_NAME = 'pull_request';
};
emPr(false);
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
  const rodar = () => spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta, '--base', 'main'], { cwd: pasta, encoding: 'utf8', env: process.env });
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

// A versão é dada no merge: numa PR, mexer à mão na VERSAO, no versoes.json ou no .ankiaddon falha; o commit de versão e os
// números que as PRs abertas já escreveram passam; fora de PR (a main, o commit de versão empurrado) a regra não pergunta.
const CONFIGURACAO = 'complemento/configuracao.py';
const PACOTE = 'conexao/perpetualminer.ankiaddon';
const configuracao = versao => `"""Config."""\n\nVERSAO = "${versao}"\nOUTRA = 1\n`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-versao-no-merge-'));
const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
const gravar = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(dir, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(dir, arquivo), texto);
};
const registrar = mensagem => { g('add', '.'); g('commit', '-q', '-m', mensagem); };
try {
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'regras@teste');
  g('config', 'user.name', 'regras');
  gravar(CONFIGURACAO, configuracao('0.4.27'));
  gravar(ARQUIVO, versoes({ '0.4.26': 'aaaa', '0.4.27': 'bbbb' }));
  gravar(PACOTE, 'zip-antigo');
  registrar('a main');
  const principal = g('rev-parse', 'HEAD');
  const voltar = () => g('checkout', '-q', '-f', '-B', 'pr', principal);
  const mudar = ({ versao, chaves = {}, pacote }) => {
    if (versao) gravar(CONFIGURACAO, configuracao(versao));
    gravar(ARQUIVO, versoes({ '0.4.26': 'aaaa', '0.4.27': 'bbbb', ...chaves }));
    if (pacote) gravar(PACOTE, pacote);
  };
  const achados = () => regra.verificar(ARQUIVO, fs.readFileSync(path.join(dir, ARQUIVO), 'utf8'), dir, principal);
  const barrado = (esperado, quando) => {
    const feitos = achados();
    assert.strictEqual(feitos.length, 1, `${quando}: ${JSON.stringify(feitos)}`);
    assert.match(feitos[0].detalhe, /a versão é dada no merge: esta PR mexe à mão (na|no) /);
    for (const trecho of esperado) assert.ok(feitos[0].detalhe.includes(trecho), `${quando}: ${feitos[0].detalhe}`);
  };

  voltar();
  emPr(true);
  assert.deepStrictEqual(achados(), [], 'uma PR que não mexe na versão passa');

  mudar({ versao: '0.5.0', chaves: { '0.5.0': 'cccc' }, pacote: 'zip-novo' });
  barrado(['`VERSAO`', ARQUIVO, PACOTE], 'a PR sobe tudo à mão');
  emPr(false);
  assert.deepStrictEqual(achados(), [], 'fora de PR (a main) a regra não pergunta');
  emPr(true);

  voltar();
  mudar({ versao: '0.5.0' });
  barrado(['`VERSAO`'], 'só a VERSAO');
  voltar();
  mudar({ chaves: { '0.5.0': 'cccc' } });
  barrado([ARQUIVO], 'só o versoes.json');
  voltar();
  mudar({ pacote: 'zip-novo' });
  barrado([PACOTE], 'só o arquivo da extensão');

  // As PRs abertas que já carregam número (#381 = 0.4.28, #387 = 0.4.32, #389 = 0.4.33) seguem como estão.
  voltar();
  mudar({ versao: '0.4.33', chaves: { '0.4.33': 'cccc' }, pacote: 'zip-novo' });
  assert.deepStrictEqual(achados(), [], 'o número que a PR aberta já escreveu passa');
  voltar();
  mudar({ versao: '0.4.34', chaves: { '0.4.34': 'cccc' }, pacote: 'zip-novo' });
  barrado(['`VERSAO`'], 'um número novo à mão, acima dos que já estavam escritos');

  // O commit de versão (versao_no_merge.py), mesmo que chegue por uma PR.
  voltar();
  mudar({ versao: '0.5.0', chaves: { '0.5.0': 'cccc' }, pacote: 'zip-novo' });
  registrar('Conexão 0.5.0: versão dada no merge');
  assert.deepStrictEqual(achados(), [], 'o commit de versão passa');
  gravar(CONFIGURACAO, configuracao('0.5.1'));
  registrar('Conexão 0.5.1: ajuste feito à mão');
  barrado(['`VERSAO`'], 'um commit à mão junto com o de versão');

  // De ponta a ponta, pelo verificar.js, com a mensagem que o autor da PR lê.
  voltar();
  mudar({ versao: '0.5.0' });
  gravar('scripts/regras/linha-de-base.json', `${JSON.stringify({ 'versoes-publicadas': {} }, null, 2)}\n`);
  const rodar = ambiente => spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', dir, '--base', principal], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, ...ambiente, GITHUB_EVENT_NAME: ambiente.GITHUB_EVENT_NAME || '' },
  });
  const naPr = rodar({ GITHUB_EVENT_NAME: 'pull_request' });
  assert.strictEqual(naPr.status, 1, naPr.stdout);
  assert.match(naPr.stdout, /versoes-publicadas — complemento\/versoes\.json/);
  assert.match(naPr.stdout, /a versão é dada no merge: esta PR mexe à mão na `VERSAO` de complemento\/configuracao\.py/);
  assert.doesNotMatch(rodar({}).stdout, /versoes-publicadas — /, 'na main a regra de PR não vale');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [nome, valor] of Object.entries(ambienteDoCi)) {
    if (valor === undefined) delete process.env[nome]; else process.env[nome] = valor;
  }
}

console.log('versoes-publicadas: provas passaram');
