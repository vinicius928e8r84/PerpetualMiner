'use strict';

// O que as provas de scripts/regras/ dividem: um repositório git temporário com só os arquivos que a regra lê.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function repositorioDeTestes(arquivos) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-portao-'));
  execFileSync('git', ['init', '-q'], { cwd: pasta });
  for (const [arquivo, texto] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(pasta, arquivo)), { recursive: true });
    fs.writeFileSync(path.join(pasta, arquivo), texto);
  }
  return pasta;
}

module.exports = { repositorioDeTestes };
