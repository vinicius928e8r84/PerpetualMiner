// Liga os ganchos do repositório (scripts/ganchos/): `git config core.hooksPath scripts/ganchos`.
// Roda sozinho no `npm ci` de e2e/ (script `prepare`); num clone que já existe, uma vez:
//   node scripts/ganchos/instalar.mjs
// Não mexe se o repositório já usa outra pasta de ganchos, e nunca falha (não pode quebrar o `npm ci`).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CAMINHO = 'scripts/ganchos';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: aqui, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  const raiz = git('rev-parse', '--show-toplevel');
  let atual = '';
  try { atual = git('config', '--get', 'core.hooksPath'); } catch { /* sem valor */ }
  if (atual === CAMINHO) {
    console.log(`ganchos já ligados (core.hooksPath = ${CAMINHO})`);
  } else if (atual) {
    console.log(`core.hooksPath já é "${atual}"; não alterei. Para usar os ganchos deste repositório: git config core.hooksPath ${CAMINHO}`);
  } else {
    execFileSync('git', ['config', 'core.hooksPath', CAMINHO], { cwd: raiz });
    console.log(`ganchos ligados (core.hooksPath = ${CAMINHO})`);
  }
} catch {
  console.log('fora de um clone do git: ganchos não ligados');
}
