'use strict';

// Um ID da Voz (ENV-22, ONB-16…) é definido uma vez só. `catalogo-nivel.js` entra no
// mesmo `CATALOGO_DA_VOZ` por `Object.assign`, e uma chave repetida (no mesmo arquivo ou
// em outro) vence em silêncio: dois PRs que acrescentam o mesmo ID passam limpos no Git e
// o texto errado só apareceria na tela. Este teste lê o código-fonte dos catálogos e
// falha, com os dois lugares, quando um ID aparece duas vezes.
// Roda sem navegador: `node test_ids_da_voz.js`.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CATALOGOS = ['lib/voz/catalogo.js', 'lib/voz/catalogo-nivel.js'];
const ESTENDE = /^\s*Object\.assign\(\s*raiz\.CATALOGO_DA_VOZ\[/;   // `'ONB-03': Object.assign(raiz.CATALOGO_DA_VOZ['ONB-03'], …)` acrescenta partes, não redefine
const CHAVE_DE_ID = /'([A-Z]{3}-\d+)'\s*:/g;

// { id: ['arquivo:linha', …] } de cada chave de ID escrita num código-fonte.
function definicoesDosIds(fontes) {
  const achados = {};
  for (const [arquivo, texto] of Object.entries(fontes)) {
    texto.split('\n').forEach((linha, i) => {
      const semComentario = linha.replace(/\/\/.*$/, '');
      for (const m of semComentario.matchAll(CHAVE_DE_ID)) {
        if (ESTENDE.test(semComentario.slice(m.index + m[0].length))) continue;
        (achados[m[1]] = achados[m[1]] || []).push(`${arquivo}:${i + 1}`);
      }
    });
  }
  return achados;
}

const repetidos = achados => Object.entries(achados).filter(([, lugares]) => lugares.length > 1)
  .map(([id, lugares]) => `${id} definido ${lugares.length} vezes: ${lugares.join(' e ')}`);

const fontes = Object.fromEntries(CATALOGOS.map(a => [a, fs.readFileSync(path.join(__dirname, a), 'utf8')]));
const achados = definicoesDosIds(fontes);

assert(Object.keys(achados).length > 100, 'não li os IDs dos catálogos da Voz');
assert.deepStrictEqual(repetidos(achados), [],
  'um ID da Voz está definido mais de uma vez; renumere um deles ou junte os textos (veja os dois lugares acima)');

// A prova: o mesmo ID em dois arquivos, e no mesmo, é pego; a extensão de um ID não é.
assert.deepStrictEqual(repetidos(definicoesDosIds({
  'a.js': "const c = { 'ENV-22': { demora: 'x' } };",
  'b.js': "Object.assign(raiz.CATALOGO_DA_VOZ, {\n  'ENV-22': { demora: 'y' }, 'ENV-23': 'z', 'ENV-23': 'w' });",
})), ['ENV-22 definido 2 vezes: a.js:1 e b.js:2', 'ENV-23 definido 2 vezes: b.js:2 e b.js:2']);
assert.deepStrictEqual(repetidos(definicoesDosIds({
  'a.js': "{ 'ONB-03': { titulo: 'x' } }",
  'b.js': "{ 'ONB-03': Object.assign(raiz.CATALOGO_DA_VOZ['ONB-03'], { envio: 'y' }) }",
})), []);

console.log('ok: nenhum ID da Voz definido duas vezes');
