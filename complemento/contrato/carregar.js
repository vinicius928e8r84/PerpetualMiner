'use strict';

const fs = require('fs');
const path = require('path');

function carregar(pasta = __dirname) {
  const contrato = JSON.parse(fs.readFileSync(path.join(pasta, 'exemplos.json'), 'utf8'));
  for (const nome of fs.readdirSync(pasta).filter(n => /^exemplos-.+\.json$/.test(n)).sort()) {
    const outro = JSON.parse(fs.readFileSync(path.join(pasta, nome), 'utf8'));
    for (const [chave, valor] of Object.entries(outro)) {
      if (Array.isArray(valor)) {
        contrato[chave] = [...(contrato[chave] || []), ...valor];
        continue;
      }
      for (const dentro of Object.keys(valor)) {
        if (contrato[chave]?.[dentro] !== undefined) throw new Error(`${nome}: "${dentro}" de "${chave}" já existe em outro arquivo do contrato`);
      }
      contrato[chave] = { ...contrato[chave], ...valor };
    }
  }
  return contrato;
}

module.exports = carregar();
Object.defineProperty(module.exports, 'carregar', { value: carregar });
