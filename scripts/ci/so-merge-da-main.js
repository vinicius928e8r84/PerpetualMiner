'use strict';

const { execFileSync } = require('child_process');

const SHA_INTEIRO = /^[0-9a-f]{40}$/;

function git(raiz, ...args) {
  return execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

const ehAncestral = (raiz, ancestral, commit) => {
  try { git(raiz, 'merge-base', '--is-ancestor', ancestral, commit); return true; } catch { return false; }
};
function soMergesLimposDaMain({ de, ate, base, raiz = '.' }) {
  if (!SHA_INTEIRO.test(de) || !SHA_INTEIRO.test(ate) || !/^[\w][\w./-]*$/.test(base || '')) return false;
  try {
    if (de === ate) return true;
    if (!ehAncestral(raiz, de, ate)) return false;
    const refDaBase = `refs/remotes/origin/${base}`;
    git(raiz, 'rev-parse', '--verify', '--quiet', `${refDaBase}^{commit}`);
    const novos = git(raiz, 'rev-list', '--parents', `${de}..${ate}`, `^${refDaBase}`).split('\n').filter(Boolean);
    return novos.every(linha => {
      const [commit, ...pais] = linha.split(' ');
      if (pais.length !== 2 || !ehAncestral(raiz, pais[1], refDaBase)) return false;
      let arvore;
      try { arvore = git(raiz, 'merge-tree', '--write-tree', '--no-messages', pais[0], pais[1]).split('\n')[0]; } catch { return false; }
      return arvore === git(raiz, 'rev-parse', `${commit}^{tree}`);
    });
  } catch {
    return false;
  }
}

module.exports = { soMergesLimposDaMain };
