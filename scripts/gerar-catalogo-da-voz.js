#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { CAMINHO_DO_HTML, carregarCatalogo, htmlDoCatalogo } = require('./voz-do-catalogo.js');
const { CAMINHO_DO_RETRATO, retratoDoCatalogo } = require('./conferir-voz.js');

const copias = [
  [CAMINHO_DO_HTML, htmlDoCatalogo(fs.readFileSync(CAMINHO_DO_HTML, 'utf8'))],
  [CAMINHO_DO_RETRATO, `${JSON.stringify(retratoDoCatalogo(carregarCatalogo()), null, 2)}\n`],
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
