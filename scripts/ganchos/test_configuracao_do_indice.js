'use strict';

// A configuração do gancho de tamanho (limite-de-tokens.json) vale pelo índice e só aperta em relação ao HEAD
// (scripts/ganchos/configuracao-do-indice.js): o limite não sobe, "ignorar" e "marcasDeGerado" não ganham
// entrada, e uma edição só na cópia de trabalho não vale para o commit. A parte pura roda com objetos escritos
// à mão; a parte do git, num repositório de mentira criado e apagado aqui.

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { afrouxamentosDaConfiguracao } = require('./configuracao-do-indice.js');

const CLI = path.join(__dirname, 'limite-de-tokens.js');
const CONFIGURACAO = 'scripts/ganchos/limite-de-tokens.json';
const original = JSON.parse(fs.readFileSync(path.join(__dirname, 'limite-de-tokens.json'), 'utf8'));
const com = mudancas => ({ ...JSON.parse(JSON.stringify(original)), ...mudancas });

// Parte pura: só o que afrouxa aparece; apertar ou repetir não.
assert.deepStrictEqual(afrouxamentosDaConfiguracao(original, original), []);
assert.deepStrictEqual(afrouxamentosDaConfiguracao(com({ limiteDeBytes: 19000 }), original), []);
assert.deepStrictEqual(afrouxamentosDaConfiguracao(com({ limiteDeBytes: 20001 }), original), ['"limiteDeBytes" subiu de 20000 para 20001']);
assert.deepStrictEqual(afrouxamentosDaConfiguracao(com({ linhasDoCabecalho: 6 }), original), ['"linhasDoCabecalho" subiu de 5 para 6']);
assert.deepStrictEqual(afrouxamentosDaConfiguracao(com({ linhaDeBase: 'outra.json' }), original),
  [`"linhaDeBase" mudou de ${original.linhaDeBase} para outra.json`]);
assert.deepStrictEqual(afrouxamentosDaConfiguracao(com({ ignorar: [...original.ignorar, { glob: '*.js', motivo: 'x' }] }), original),
  ['"ignorar" ganhou o glob "*.js"']);
// Só o motivo mudar, ou sair uma entrada, não afrouxa.
assert.deepStrictEqual(afrouxamentosDaConfiguracao(com({ ignorar: original.ignorar.map(r => ({ ...r, motivo: 'outro' })) }), original), []);
assert.deepStrictEqual(afrouxamentosDaConfiguracao(com({ ignorar: original.ignorar.slice(1) }), original), []);
assert.deepStrictEqual(afrouxamentosDaConfiguracao(com({ marcasDeGerado: [...original.marcasDeGerado, 'AUTO'] }), original),
  ['"marcasDeGerado" ganhou "AUTO"']);
assert.deepStrictEqual(afrouxamentosDaConfiguracao(com({ marcasDeGerado: original.marcasDeGerado.slice(1) }), original), []);

// O git de verdade: o gancho como linha de comando num repositório de mentira que tem a configuração no HEAD.
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'configuracao-do-indice-'));
// Sem ganchos no repositório de mentira: o core.hooksPath de quem roda o teste não pode entrar nos commits daqui.
const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: raiz, encoding: 'utf8' });
const escrever = (caminho, conteudo) => {
  fs.mkdirSync(path.dirname(path.join(raiz, caminho)), { recursive: true });
  fs.writeFileSync(path.join(raiz, caminho), conteudo);
};
const gravarConfiguracao = config => escrever(CONFIGURACAO, `${JSON.stringify(config, null, 2)}\n`);
const rodar = () => spawnSync('node', [CLI], { cwd: raiz, encoding: 'utf8' });
const passa = () => {
  const r = rodar();
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!r.stderr.includes('aviso:'), r.stderr);
};
const barra = () => {
  const r = rodar();
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.ok(!r.stderr.includes('aviso:'), r.stderr);
  return r.stderr;
};
const desfazer = () => git('checkout', 'HEAD', '--', CONFIGURACAO);
try {
  git('init', '-q');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  git('config', 'core.autocrlf', 'false');

  // Primeira versão da configuração, sem nenhuma no HEAD: não há o que comparar.
  gravarConfiguracao(com({ limiteDeBytes: 30000 }));
  git('add', CONFIGURACAO);
  passa();
  gravarConfiguracao(original);
  git('add', CONFIGURACAO);
  git('commit', '-q', '-m', 'configuração');

  // Limite alterado só no disco: não vale. Um arquivo de 25000 bytes preparado continua barrado.
  gravarConfiguracao(com({ limiteDeBytes: 90000 }));
  escrever('lib/medio.js', 'a'.repeat(25000));
  git('add', 'lib/medio.js');
  let erro = barra();
  assert.ok(erro.includes('lib/medio.js') && erro.includes('20000 bytes') && !erro.includes('afrouxada'), erro);
  // Glob largo só no disco: também não vale.
  gravarConfiguracao(com({ ignorar: [...original.ignorar, { glob: '*.js', motivo: 'x' }] }));
  barra();
  desfazer();
  git('reset', '-q', '--', 'lib/medio.js');
  fs.unlinkSync(path.join(raiz, 'lib/medio.js'));
  passa();

  // Limite alterado e preparado: barra, com o campo, os valores e como desfazer.
  gravarConfiguracao(com({ limiteDeBytes: 90000 }));
  git('add', CONFIGURACAO);
  erro = barra();
  for (const parte of [CONFIGURACAO, 'afrouxada', '"limiteDeBytes" subiu de 20000 para 90000', 'git restore --source=HEAD --staged --worktree']) {
    assert.ok(erro.includes(parte), `${parte}\n${erro}`);
  }
  git('reset', '-q', '--hard', 'HEAD');
  passa();

  // Glob novo preparado e marca nova preparada: barram.
  gravarConfiguracao(com({ ignorar: [...original.ignorar, { glob: '*.js', motivo: 'x' }] }));
  git('add', CONFIGURACAO);
  assert.ok(barra().includes('"ignorar" ganhou o glob "*.js"'));
  git('reset', '-q', '--hard', 'HEAD');
  gravarConfiguracao(com({ marcasDeGerado: [...original.marcasDeGerado, 'AUTO'] }));
  git('add', CONFIGURACAO);
  assert.ok(barra().includes('"marcasDeGerado" ganhou "AUTO"'));
  git('reset', '-q', '--hard', 'HEAD');

  // Apertar passa: limite menor e glob a menos.
  gravarConfiguracao(com({ limiteDeBytes: 15000, ignorar: original.ignorar.slice(1) }));
  git('add', CONFIGURACAO);
  passa();
  git('reset', '-q', '--hard', 'HEAD');

  // Um JSON quebrado preparado barra (não desliga o gancho).
  escrever(CONFIGURACAO, '{ "limiteDeBytes": ');
  git('add', CONFIGURACAO);
  assert.ok(barra().includes('JSON válido'));
  git('reset', '-q', '--hard', 'HEAD');
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log('configuração do índice ok');
