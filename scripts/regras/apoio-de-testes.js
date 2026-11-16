'use strict';

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
