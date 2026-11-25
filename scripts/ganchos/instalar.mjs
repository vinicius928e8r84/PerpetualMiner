import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CAMINHO = 'scripts/ganchos';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: aqui, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function hooksPathEscolhido() {
  for (const escopo of ['--local', '--global', '--system']) {
    try {
      const valor = git('config', escopo, '--get', 'core.hooksPath');
      if (valor) return valor;
    } catch {}
  }
  return '';
}

function ganchosQueDeixamDeRodar() {
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
