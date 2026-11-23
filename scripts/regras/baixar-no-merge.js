#!/usr/bin/env node
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const { EMAIL_DO_DONO } = require('../ci/autoria');
const { ARQUIVOS, ASSUNTO } = require('./linha-de-base-no-merge');

const USO = `uso: node scripts/regras/baixar-no-merge.js [--raiz <pasta>]

Baixa as duas linhas de base num commit só, depois do merge (a PR de código não as edita; a regra linha-de-base-no-merge a barra):
  ${ARQUIVOS.join('\n  ')}

Roda numa árvore limpa, na main (ou num ramo recém-criado dela). Lê a árvore e escreve o que ela mede, sem somar nem subtrair:
uma rodada baixa tudo o que entrou desde a última, e esquecer uma rodada não quebra nada. Se nada desceu, sai com 0 sem commit.
Senão faz UM commit, "${ASSUNTO}", que toca só esses dois arquivos, com a autoria do dono (o EMAIL_DO_DONO de scripts/ci/autoria.js).
Não empurra: abra a PR com esse commit e nada mais. O job "Linha de base refeita" refaz o commit a partir do pai e compara.

  --raiz <pasta>   baixa as linhas de base de outro repositório (os testes usam)
  --help           esta ajuda`;

const VERIFICAR = path.join(__dirname, 'verificar.js');
const LIMITE_DE_TOKENS = path.join(__dirname, '..', 'ganchos', 'limite-de-tokens.js');
const NOME_DO_DONO = EMAIL_DO_DONO.split('@')[0].split('+').pop();
const DO_DONO = {
  GIT_AUTHOR_NAME: NOME_DO_DONO, GIT_AUTHOR_EMAIL: EMAIL_DO_DONO, GIT_COMMITTER_NAME: NOME_DO_DONO, GIT_COMMITTER_EMAIL: EMAIL_DO_DONO,
};
const PULOU_A_CONFERENCIA = 'falhou e foi pulada';

const git = (raiz, ...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', env: { ...process.env, ...DO_DONO } }).trim();

function ambienteForaDeUmaPr() {
  const ambiente = { ...process.env };
  for (const nome of ['GITHUB_EVENT_NAME', 'REGRAS_PR', 'REGRAS_BASE']) delete ambiente[nome];
  return ambiente;
}

function rodar(raiz, script, args) {
  const rodado = spawnSync('node', [script, ...args], { cwd: raiz, encoding: 'utf8', env: ambienteForaDeUmaPr() });
  return { status: rodado.status, saida: `${rodado.stdout}${rodado.stderr}`.trim() };
}

const falhou = (rodado, script) => rodado.status !== 0 || (script === LIMITE_DE_TOKENS && rodado.saida.includes(PULOU_A_CONFERENCIA));

function desfazer(raiz) {
  git(raiz, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...ARQUIVOS);
}

function baixarAsDuas(raiz) {
  const passos = [
    [VERIFICAR, ['--raiz', raiz, '--base', 'HEAD', '--atualizar']],
    [LIMITE_DE_TOKENS, ['--atualizar-linha-de-base']],
  ];
  const saidas = [];
  for (const [script, args] of passos) {
    const rodado = rodar(raiz, script, args);
    if (falhou(rodado, script)) {
      desfazer(raiz);
      return { erro: `${path.basename(script)} ${args.join(' ')} não baixou; nada foi commitado e a árvore voltou ao que era:\n${rodado.saida}` };
    }
    saidas.push(rodado.saida);
  }
  return { saidas };
}

function commitar(raiz) {
  git(raiz, 'add', '--', ...ARQUIVOS);
  git(raiz, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', ASSUNTO);
  return git(raiz, 'rev-parse', '--short', 'HEAD');
}

function baixar(raiz) {
  const sujo = git(raiz, 'status', '--porcelain');
  if (sujo) return { codigo: 1, linhas: [`a árvore não está limpa; commite ou descarte antes de baixar a linha de base:\n${sujo}`] };
  const { erro, saidas } = baixarAsDuas(raiz);
  if (erro) return { codigo: 1, linhas: [erro] };
  if (!git(raiz, 'status', '--porcelain', '--', ...ARQUIVOS)) return { codigo: 0, linhas: [...saidas, 'nada desceu: as duas linhas de base já estavam em dia; sem commit'] };
  const sha = commitar(raiz);
  return { codigo: 0, linhas: [...saidas, `${sha} ${ASSUNTO}: toca só ${ARQUIVOS.join(' e ')}; não empurrei: abra a PR com esse commit e nada mais`] };
}

function raizDoPedido(args) {
  const i = args.indexOf('--raiz');
  if (i < 0) return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  if (!args[i + 1]) throw new Error('--raiz precisa de uma pasta');
  return path.resolve(args[i + 1]);
}

function main(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USO);
    return 0;
  }
  try {
    const { codigo, linhas } = baixar(raizDoPedido(args));
    console.log(linhas.join('\n'));
    return codigo;
  } catch (erro) {
    console.log(`error: ${erro.message}\nhelp: node scripts/regras/baixar-no-merge.js --help`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { baixar };
