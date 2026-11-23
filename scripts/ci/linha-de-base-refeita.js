#!/usr/bin/env node
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { git, arvore } = require('./pr-de-versao');
const { ASSUNTO } = require('../regras/linha-de-base-no-merge');

const USO = `uso: node scripts/ci/linha-de-base-refeita.js [<head>] [--desde <base>]

Refaz o commit de linha de base: cada commit "${ASSUNTO}" (sem <base>, só o <head>, padrão HEAD; com --desde <base>, todos os de <base>..<head>)
é refeito rodando scripts/regras/baixar-no-merge.js numa cópia do pai dele, e a árvore que o comando dá é comparada com a do commit.
Sai 0 quando são iguais (ou quando não há commit de linha de base) e 1 quando diferem, com os arquivos.`;

const BAIXAR = path.join(__dirname, '..', 'regras', 'baixar-no-merge.js');

function commitsDeLinhaDeBase(raiz, head, desde) {
  if (!desde) return git(raiz, 'log', '-1', '--format=%s', head) === ASSUNTO ? [git(raiz, 'rev-parse', '--verify', `${head}^{commit}`)] : [];
  const registros = git(raiz, 'log', '--no-merges', '--format=%H%x09%s', `${desde}..${head}`).split('\n').filter(Boolean);
  return registros.map(registro => registro.split('\t')).filter(([, assunto]) => assunto === ASSUNTO).map(([sha]) => sha);
}

function copiarOPai(raiz, pai, pasta) {
  execFileSync('sh', ['-c', 'git -C "$1" archive "$2" | tar -x -C "$3"', 'sh', raiz, pai, pasta]);
  git(pasta, 'init', '-q');
  git(pasta, 'add', '-A');
  git(pasta, 'commit', '-q', '-m', `pai ${pai}`);
}

function arquivosDiferentes(raiz, sha, pasta) {
  const refeita = arvore(pasta, 'HEAD');
  const daPr = arvore(raiz, sha);
  return [...new Set([...refeita.keys(), ...daPr.keys()])].filter(caminho => refeita.get(caminho) !== daPr.get(caminho)).sort();
}

function refazerNaCopia(raiz, sha, pai, pasta) {
  const curto = sha.slice(0, 8);
  const rodado = spawnSync('node', [BAIXAR, '--raiz', pasta], { encoding: 'utf8' });
  const comando = `node scripts/regras/baixar-no-merge.js no pai ${pai.slice(0, 8)}`;
  if (rodado.status !== 0) return { ok: false, linha: `${comando} saiu ${rodado.status}:\n${(rodado.stdout + rodado.stderr).trim()}` };
  if (git(pasta, 'rev-list', '--count', 'HEAD') === '1') return { ok: false, linha: `${comando} não baixa nada, e o commit ${curto} diz que baixou:\n${rodado.stdout.trim()}` };
  const diferentes = arquivosDiferentes(raiz, sha, pasta);
  if (diferentes.length) return { ok: false, linha: `o commit de linha de base ${curto} não é o que \`${comando}\` dá; diferem:\n${diferentes.map(caminho => `  ${caminho}`).join('\n')}` };
  return { ok: true, linha: `commit de linha de base ${curto} refeito: \`${comando}\` dá a árvore dele (${git(raiz, 'rev-parse', `${sha}^{tree}`).slice(0, 12)})` };
}

function refazer(raiz, sha) {
  const pais = git(raiz, 'rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
  if (pais.length !== 1) return { ok: false, linha: `o commit de linha de base ${sha.slice(0, 8)} tem ${pais.length} pais; ele sai do baixar-no-merge.js com um só` };
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'linha-de-base-refeita-'));
  try {
    copiarOPai(raiz, pais[0], pasta);
    return refazerNaCopia(raiz, sha, pais[0], pasta);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

function conferir(raiz, head, desde) {
  const commits = commitsDeLinhaDeBase(raiz, head, desde);
  if (!commits.length) return { ok: true, linhas: [`não há commit "${ASSUNTO}" ${desde ? `em ${desde}..${head}` : `no head ${head}`}: nada a refazer`] };
  const refeitos = commits.map(sha => refazer(raiz, sha));
  return { ok: refeitos.every(refeito => refeito.ok), linhas: refeitos.map(refeito => refeito.linha) };
}

function lerArgumentos(args) {
  const i = args.indexOf('--desde');
  const semDesde = i < 0 ? args : [...args.slice(0, i), ...args.slice(i + 2)];
  const desde = i < 0 ? null : args[i + 1] || null;
  return { desde, head: semDesde[0] || 'HEAD', invalido: semDesde.length > 1 || (i >= 0 && !desde) };
}

const pedeAjuda = args => ['--help', '-h'].some(bandeira => args.includes(bandeira));

if (require.main === module) {
  const args = process.argv.slice(2);
  const { desde, head, invalido } = lerArgumentos(args);
  if (pedeAjuda(args) || invalido) {
    console.log(USO);
    process.exit(invalido ? 2 : 0);
  }
  const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const { ok, linhas } = conferir(raiz, head, desde);
  console.log(linhas.join('\n'));
  process.exit(ok ? 0 : 1);
}

module.exports = { conferir };
