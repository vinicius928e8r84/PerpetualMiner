'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function raizTemporaria() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-sem-comentario-'));
  const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'regras@teste');
  git('config', 'user.name', 'regras');
  const gravar = arquivos => {
    for (const [arquivo, texto] of Object.entries(arquivos)) {
      fs.mkdirSync(path.dirname(path.join(raiz, arquivo)), { recursive: true });
      if (texto === null) fs.rmSync(path.join(raiz, arquivo));
      else fs.writeFileSync(path.join(raiz, arquivo), texto);
    }
  };
  const commit = mensagem => {
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', mensagem);
    return git('rev-parse', 'HEAD');
  };
  return { raiz, git, gravar, commit };
}

module.exports = { raizTemporaria };
