#!/usr/bin/env node
'use strict';

// Regrava a tabela de `docs/design/voz/catalogo.html` a partir da spec da Voz
// (`docs/design/voz/README.md`), que é a fonte. `--conferir` não grava: sai com 1 se a
// página não bate com a spec.
//
//   node scripts/gerar-catalogo-da-voz.js [--conferir]

const fs = require('fs');
const { CAMINHO_DO_HTML, htmlDoCatalogo } = require('./voz-da-spec.js');

const atual = fs.readFileSync(CAMINHO_DO_HTML, 'utf8');
const gerado = htmlDoCatalogo(atual);

if (process.argv.includes('--conferir')) {
  if (gerado !== atual) {
    console.error('docs/design/voz/catalogo.html não bate com README.md. Rode: node scripts/gerar-catalogo-da-voz.js');
    process.exit(1);
  }
  console.log('catalogo.html bate com README.md');
} else {
  fs.writeFileSync(CAMINHO_DO_HTML, gerado);
  console.log(gerado === atual ? 'catalogo.html já estava em dia' : 'catalogo.html regravado');
}
