'use strict';

// O contrato inteiro, como os leitores em JavaScript o querem: `exemplos.json` e os arquivos ao lado
// (`exemplos-*.json`, um por assunto) juntos num objeto só, com a forma de `exemplos.json`. Os `exemplos` se somam e os
// objetos (`colecoes`, `filas`) se juntam; um nome que dois arquivos têm é erro, para um exemplo não esconder o outro.
// O lado Python faz o mesmo em `complemento/test_servidor.py` (`ler_o_contrato`). Ver `LEIA-ME.md`.

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
// `carregar(pasta)` para quem lê o contrato de outra raiz (as provas das regras); fora do objeto, que tem a forma de `exemplos.json`.
Object.defineProperty(module.exports, 'carregar', { value: carregar });
