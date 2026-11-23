'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { raizTemporaria } = require('./apoio-sem-comentario');
const { ARQUIVOS } = require('./linha-de-base-no-merge');

const [ARQUIVO_DAS_REGRAS, ARQUIVO_DE_TAMANHO] = ARQUIVOS;
const VERIFICAR = path.join(__dirname, 'verificar.js');
const BAIXAR = path.join(__dirname, 'baixar-no-merge.js');
const LIMITE_DE_TOKENS = path.join(__dirname, '..', 'ganchos', 'limite-de-tokens.js');

const linhasDe = n => 'x\n'.repeat(n);
const bytesDe = n => 'a'.repeat(n);

function rodar(script, args, cwd, env = {}) {
  const base = { ...process.env, ...env };
  for (const nome of ['GITHUB_EVENT_NAME', 'REGRAS_PR', 'REGRAS_BASE']) if (!(nome in env)) delete base[nome];
  const rodado = spawnSync('node', [script, ...args], { cwd, encoding: 'utf8', env: base });
  return { status: rodado.status, saida: `${rodado.stdout}${rodado.stderr}` };
}

function repositorioDeMentira() {
  const repo = raizTemporaria();
  const { raiz, git, gravar, commit } = repo;
  git('config', 'core.hooksPath', '/dev/null');
  git('config', 'commit.gpgsign', 'false');
  gravar({ 'grande.js': linhasDe(1020), 'volumoso.txt': bytesDe(21000), 'pequeno.js': 'x\n', 'scripts/regras/.gitkeep': '' });
  git('add', '-A');
  const criada = rodar(VERIFICAR, ['--raiz', raiz, '--criar-linha-de-base'], raiz);
  const gerada = rodar(LIMITE_DE_TOKENS, ['--gerar-linha-de-base'], raiz);
  if (criada.status !== 0 || gerada.status !== 0) throw new Error(`a linha de base de mentira não saiu:\n${criada.saida}\n${gerada.saida}`);
  commit('base');
  return {
    ...repo,
    lerLinhaDeBase: () => JSON.parse(fs.readFileSync(path.join(raiz, ARQUIVO_DAS_REGRAS), 'utf8')),
    lerTamanho: () => JSON.parse(fs.readFileSync(path.join(raiz, ARQUIVO_DE_TAMANHO), 'utf8')),
    limpar: () => fs.rmSync(raiz, { recursive: true, force: true }),
    baixar: () => rodar(BAIXAR, ['--raiz', raiz], raiz),
    conferirComoPr: (base = 'main') => rodar(VERIFICAR, ['--raiz', raiz, '--base', base], raiz, { REGRAS_PR: '1' }),
    conferirForaDePr: (base = 'main') => rodar(VERIFICAR, ['--raiz', raiz, '--base', base], raiz),
    editarJson: (arquivo, editar) => {
      const dados = JSON.parse(fs.readFileSync(path.join(raiz, arquivo), 'utf8'));
      editar(dados);
      fs.writeFileSync(path.join(raiz, arquivo), `${JSON.stringify(dados, null, 2)}\n`);
    },
  };
}

module.exports = { repositorioDeMentira, linhasDe, bytesDe, ARQUIVO_DAS_REGRAS, ARQUIVO_DE_TAMANHO };
