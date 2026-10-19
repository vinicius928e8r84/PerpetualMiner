// Liga os ganchos do repositório (scripts/ganchos/): `git config core.hooksPath scripts/ganchos`.
// Roda sozinho no `npm ci` de e2e/ (script `prepare`); num clone que já existe, uma vez:
//   node scripts/ganchos/instalar.mjs
// Não mexe se o clone já escolheu outra pasta de ganchos (local, global ou do sistema), avisa dos ganchos de
// .git/hooks que passam a não rodar, não faz nada no CI e nunca falha (não pode quebrar o `npm ci`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CAMINHO = 'scripts/ganchos';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: aqui, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// Só os escopos que ficam gravados (local, global, system): o `-c core.hooksPath=` de quem chamou o git,
// ou do ambiente (GIT_CONFIG_*), vale para aquele comando e não diz o que o clone escolheu.
function hooksPathEscolhido() {
  for (const escopo of ['--local', '--global', '--system']) {
    try {
      const valor = git('config', escopo, '--get', 'core.hooksPath');
      if (valor) return valor;
    } catch { /* sem valor nesse escopo */ }
  }
  return '';
}

function ganchosQueDeixamDeRodar() {
  // A pasta padrão, não a que o core.hooksPath aponta (o `--git-path hooks` já obedece a ele).
  const pasta = path.join(path.resolve(aqui, git('rev-parse', '--git-common-dir')), 'hooks');
  if (!fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta).filter(nome => !nome.endsWith('.sample'));
}

if (process.env.CI) {
  console.log('CI: ganchos não ligados');
} else {
  try {
    const raiz = git('rev-parse', '--show-toplevel');
    const atual = hooksPathEscolhido();
    if (atual === CAMINHO) {
      console.log(`ganchos já ligados (core.hooksPath = ${CAMINHO})`);
    } else if (atual) {
      console.log(`core.hooksPath já é "${atual}"; não alterei. Para usar os ganchos deste repositório: git config core.hooksPath ${CAMINHO}`);
    } else {
      execFileSync('git', ['config', 'core.hooksPath', CAMINHO], { cwd: raiz });
      console.log(`ganchos ligados (core.hooksPath = ${CAMINHO})`);
      const deixam = ganchosQueDeixamDeRodar();
      if (deixam.length) {
        console.log(`atenção: estes ganchos de .git/hooks deixam de rodar: ${deixam.join(', ')}. `
          + `Para mantê-los, copie-os para ${CAMINHO}/ (ou use \`git config --unset core.hooksPath\` para voltar).`);
      }
    }
  } catch {
    console.log('fora de um clone do git: ganchos não ligados');
  }
}
