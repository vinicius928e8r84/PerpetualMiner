'use strict';

const { execFileSync } = require('child_process');

const SHA_INTEIRO = /^[0-9a-f]{40}$/;
const NOME_DE_BRANCH = /^[\w][\w./-]*$/;

function git(raiz, ...args) {
  return execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

const gitSaiuLimpo = (raiz, ...args) => {
  try { git(raiz, ...args); return true; } catch { return false; }
};

const ehAncestral = (raiz, ancestral, commit) => gitSaiuLimpo(raiz, 'merge-base', '--is-ancestor', ancestral, commit);

const ehSha = valor => SHA_INTEIRO.test(valor);
const ehNomeDeBranch = nome => NOME_DE_BRANCH.test(nome || '');
const pedidoBemFormado = ({ de, ate, base }) => [de, ate].every(ehSha) && ehNomeDeBranch(base);

function arvoreDoMergeDosPais(raiz, [primeiro, segundo]) {
  try { return git(raiz, 'merge-tree', '--write-tree', '--no-messages', primeiro, segundo).split('\n')[0]; } catch { return null; }
}

function ehMergeLimpoDaBase(raiz, refDaBase, linha) {
  const [commit, ...pais] = linha.split(' ');
  if (pais.length !== 2 || !ehAncestral(raiz, pais[1], refDaBase)) return false;
  return arvoreDoMergeDosPais(raiz, pais) === git(raiz, 'rev-parse', `${commit}^{tree}`);
}

function commitsForaDaBase(raiz, refDaBase, { de, ate }) {
  git(raiz, 'rev-parse', '--verify', '--quiet', `${refDaBase}^{commit}`);
  return git(raiz, 'rev-list', '--parents', `${de}..${ate}`, `^${refDaBase}`).split('\n').filter(Boolean);
}

function soMergesLimposAte(raiz, base, intervalo) {
  const refDaBase = `refs/remotes/origin/${base}`;
  return commitsForaDaBase(raiz, refDaBase, intervalo).every(linha => ehMergeLimpoDaBase(raiz, refDaBase, linha));
}

function soMergesLimposDaMain({ de, ate, base, raiz = '.' }) {
  if (!pedidoBemFormado({ de, ate, base })) return false;
  if (de === ate) return true;
  try {
    return ehAncestral(raiz, de, ate) && soMergesLimposAte(raiz, base, { de, ate });
  } catch {
    return false;
  }
}

module.exports = { soMergesLimposDaMain };
