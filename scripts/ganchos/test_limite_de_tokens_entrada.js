'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, 'limite-de-tokens.js');
const LINHA_DE_BASE = 'scripts/ganchos/linha-de-base-de-tamanho.json';
const ARQUIVOS_DO_GANCHO = ['limite-de-tokens.js', 'mensagens-de-tamanho.js', 'entrada-do-gancho.js', 'globs.js', 'configuracao-do-indice.js', 'limite-de-tokens.json'];

const pasta = prefixo => fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
const escrever = (raiz, caminho, conteudo) => {
  fs.mkdirSync(path.dirname(path.join(raiz, caminho)), { recursive: true });
  fs.writeFileSync(path.join(raiz, caminho), conteudo);
};
const gravarBase = (raiz, texto) => escrever(raiz, LINHA_DE_BASE, texto);
const baseValida = arquivos => `${JSON.stringify({ descricao: 'x', arquivos }, null, 2)}\n`;

function repositorio() {
  const raiz = pasta('limite-de-tokens-entrada-');
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: raiz, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  escrever(raiz, 'lib/pequeno.js', 'x');
  git('add', '-A');
  return { raiz, git };
}

const rodar = (raiz, cli = CLI, opcoes = {}) => spawnSync(process.execPath, [cli], { cwd: raiz, encoding: 'utf8', ...opcoes });
function barraDizendo(r, ...trechos) {
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.ok(!r.stderr.includes('aviso:'), r.stderr);
  assert.ok(r.stderr.startsWith('Commit barrado'), r.stderr);
  for (const trecho of trechos) assert.ok(r.stderr.includes(trecho), `${trecho} não está em: ${r.stderr}`);
}

{
  const { raiz, git } = repositorio();
  try {
    const preparar = texto => { gravarBase(raiz, texto); git('add', LINHA_DE_BASE); };

    preparar('{\n  "arquivos": {\n    "a.js": 30000,\n  }\n}\n');
    barraDizendo(rodar(raiz), LINHA_DE_BASE, 'linha 4', 'JSON válido');

    for (const valor of ['"30000"', 'null', '-1', '{}']) {
      preparar(`{\n  "arquivos": {\n    "ok.js": 25000,\n    "b.js": ${valor}\n  }\n}\n`);
      barraDizendo(rodar(raiz), LINHA_DE_BASE, 'linha 4', 'b.js');
    }

    for (const arquivos of ['[]', '"a.js"', 'null', '5']) {
      preparar(`{\n  "arquivos": ${arquivos}\n}\n`);
      barraDizendo(rodar(raiz), LINHA_DE_BASE, 'linha 2', '"arquivos"');
    }
    for (const raizJson of ['null', '[]', '"x"']) {
      preparar(`${raizJson}\n`);
      barraDizendo(rodar(raiz), LINHA_DE_BASE, 'linha 1');
    }

    preparar('');
    barraDizendo(rodar(raiz), LINHA_DE_BASE, 'JSON válido');

    preparar(baseValida({}));
    gravarBase(raiz, '{ quebrado');
    let r = rodar(raiz);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!r.stderr.includes('aviso:'), r.stderr);

    preparar(baseValida({}));
    r = rodar(raiz);
    assert.strictEqual(r.status, 0, r.stderr);
    preparar('{}\n');
    r = rodar(raiz);
    assert.strictEqual(r.status, 0, r.stderr);

    preparar('{ quebrado');
    git('commit', '-q', '-m', 'base quebrada', '--no-verify');
    preparar(baseValida({}));
    r = rodar(raiz);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!r.stderr.includes('aviso:'), r.stderr);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}

{
  const { raiz } = repositorio();
  const scripts = pasta('limite-de-tokens-scripts-');
  try {
    for (const nome of ARQUIVOS_DO_GANCHO) fs.copyFileSync(path.join(__dirname, nome), path.join(scripts, nome));
    const cli = path.join(scripts, 'limite-de-tokens.js');
    const configuracao = JSON.parse(fs.readFileSync(path.join(__dirname, 'limite-de-tokens.json'), 'utf8'));
    const gravarConfiguracao = texto => fs.writeFileSync(path.join(scripts, 'limite-de-tokens.json'), texto);
    const NOME = 'limite-de-tokens.json';

    let r = rodar(raiz, cli);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!r.stderr.includes('aviso:'), r.stderr);

    gravarConfiguracao('{\n  "limiteDeBytes": 20000,\n  "ignorar": [,\n}\n');
    barraDizendo(rodar(raiz, cli), NOME, 'linha 3', 'JSON válido');

    const comCampo = (campo, valor) => `${JSON.stringify({ ...configuracao, [campo]: valor }, null, 2)}\n`;
    for (const [campo, valor] of [['limiteDeBytes', '20000'], ['limiteDeBytes', 0], ['ignorar', {}], ['ignorar', [{ glob: 'a' }]],
      ['marcasDeGerado', 'DO NOT EDIT'], ['linhasDoCabecalho', -1], ['linhaDeBase', ''], ['bytesPorToken', 0]]) {
      gravarConfiguracao(comCampo(campo, valor));
      barraDizendo(rodar(raiz, cli), NOME, `"${campo}"`, 'linha ');
    }
    gravarConfiguracao('[]\n');
    barraDizendo(rodar(raiz, cli), NOME, 'linha 1');

    const { ignorar, ...semIgnorar } = configuracao;
    gravarConfiguracao(`${JSON.stringify(semIgnorar, null, 2)}\n`);
    barraDizendo(rodar(raiz, cli), NOME, '"ignorar"');

    fs.unlinkSync(path.join(scripts, NOME));
    barraDizendo(rodar(raiz, cli), NOME);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
    fs.rmSync(scripts, { recursive: true, force: true });
  }
}

{
  const { raiz, git } = repositorio();
  try {
    const CONFIGURACAO = 'scripts/ganchos/limite-de-tokens.json';
    const original = JSON.parse(fs.readFileSync(path.join(__dirname, 'limite-de-tokens.json'), 'utf8'));
    escrever(raiz, CONFIGURACAO, `${JSON.stringify({ ...original, limiteDeBytes: '20000' }, null, 2)}\n`);
    git('add', CONFIGURACAO);
    const r = rodar(raiz);
    barraDizendo(r, CONFIGURACAO, 'linha 2', '"limiteDeBytes"');
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}

{
  const { raiz } = repositorio();
  const fora = pasta('limite-de-tokens-fora-');
  try {
    let r = rodar(fora, CLI, { env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(fora) } });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stderr.includes('aviso:'), r.stderr);
    r = rodar(raiz, CLI, { env: { ...process.env, PATH: path.join(fora, 'vazio') } });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stderr.includes('aviso:'), r.stderr);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
    fs.rmSync(fora, { recursive: true, force: true });
  }
}

console.log('limite de tokens (entrada inválida) ok');
