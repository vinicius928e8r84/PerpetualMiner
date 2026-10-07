#!/usr/bin/env node
'use strict';

// Regrava o que se deriva da Voz:
//   - a tabela de `docs/design/voz/catalogo.html`, a partir da spec
//     (`docs/design/voz/README.md`, a fonte do texto);
//   - `docs/design/voz/catalogo-textos.json`, o retrato de todos os textos e partes de
//     `lib/voz/catalogo.js`. `test_voz.js` falha quando o `catalogo.js` se afasta dele:
//     regravar é o passo de quem muda um texto de propósito, e o diff mostra a mudança.
//
// `--conferir` não grava: sai com 1 se alguma das duas cópias não bate.
//
//   node scripts/gerar-catalogo-da-voz.js [--conferir]

const fs = require('fs');
const { CAMINHO_DO_HTML, htmlDoCatalogo } = require('./voz-da-spec.js');
const { CAMINHO_DO_RETRATO, retratoDoCatalogo } = require('./conferir-voz.js');

globalThis.PerpetualMiner = {};
require('../lib/voz/catalogo.js');

const copias = [
  [CAMINHO_DO_HTML, htmlDoCatalogo(fs.readFileSync(CAMINHO_DO_HTML, 'utf8'))],
  [CAMINHO_DO_RETRATO, `${JSON.stringify(retratoDoCatalogo(globalThis.PerpetualMiner.CATALOGO_DA_VOZ), null, 2)}\n`],
];

let desatualizado = false;
for (const [caminho, gerado] of copias) {
  const atual = fs.existsSync(caminho) ? fs.readFileSync(caminho, 'utf8') : null;
  if (process.argv.includes('--conferir')) {
    if (gerado !== atual) { console.error(`${caminho} não bate. Rode: node scripts/gerar-catalogo-da-voz.js`); desatualizado = true; }
  } else if (gerado !== atual) {
    fs.writeFileSync(caminho, gerado);
    console.log(`regravado: ${caminho}`);
  }
}
if (desatualizado) process.exit(1);
console.log("as cópias derivadas da Voz estão em dia");
