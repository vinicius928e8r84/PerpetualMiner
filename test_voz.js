'use strict';

const assert = require('assert');
const fs = require('fs');

const path = require('path');
const { CAMINHO_DO_HTML, NOTAS_POR_AREA, carregarCatalogo, htmlDoCatalogo, linhasDoHtml } = require('./scripts/voz-do-catalogo.js');
const { CAMINHO_DO_RETRATO, problemasDaVoz, retratoDoCatalogo, textosDoCatalogo } = require('./scripts/conferir-voz.js');

const CATALOGO_DA_VOZ = carregarCatalogo();
const retrato = JSON.parse(fs.readFileSync(CAMINHO_DO_RETRATO, 'utf8'));

const notas = Object.assign({}, ...Object.values(NOTAS_POR_AREA));
const idsSemNota = Object.keys(CATALOGO_DA_VOZ).filter(id => typeof notas[id] !== 'string');
assert.deepStrictEqual(idsSemNota, [], 'um ID do catálogo não tem a nota em docs/design/voz/notas-<área>.json (sem nota é "")');
assert.deepStrictEqual(Object.keys(notas).filter(id => !(id in CATALOGO_DA_VOZ)), [], 'uma nota em docs/design/voz/notas-<área>.json é de um ID que não está no catálogo');
assert.strictEqual(Object.values(NOTAS_POR_AREA).reduce((soma, doArea) => soma + Object.keys(doArea).length, 0), Object.keys(notas).length, 'um ID tem nota em duas áreas');

const conferir = catalogo => problemasDaVoz({ catalogo, retrato });

assert(Object.keys(CATALOGO_DA_VOZ).length > 0, 'não li nenhum ID do catálogo');
assert.deepStrictEqual(conferir(CATALOGO_DA_VOZ), [],
  'lib/voz/catalogo.js não bate com o retrato catalogo-textos.json. Mudou um texto de propósito? Rode: node scripts/gerar-catalogo-da-voz.js e confira o diff do retrato');

assert.strictEqual(fs.readFileSync(CAMINHO_DO_HTML, 'utf8'), htmlDoCatalogo(),
  'docs/design/voz/catalogo.html não bate com o catálogo. Rode: node scripts/gerar-catalogo-da-voz.js');

const noHtml = linhasDoHtml(fs.readFileSync(CAMINHO_DO_HTML, 'utf8'));
assert.deepStrictEqual(noHtml.map(l => l.id).sort(), Object.keys(CATALOGO_DA_VOZ).sort(), 'o catalogo.html não tem os mesmos IDs do catálogo');
for (const { id, texto, nota } of noHtml) {
  assert.strictEqual(nota, notas[id], `${id}: a nota do catalogo.html não é a de notas-<área>.json`);
  for (const { nome, modelo } of textosDoCatalogo({ [id]: CATALOGO_DA_VOZ[id] })) assert(texto.includes(modelo), `${nome}: o texto do catalogo.html não traz o do catálogo`);
}

function comMudanca(mudar) {
  const copia = JSON.parse(JSON.stringify(CATALOGO_DA_VOZ));
  mudar(copia);
  return copia;
}
const aponta = (problemas, nome) => problemas.some(p => p.startsWith(`${nome}:`));

const comONomeMinusculo = Object.entries(retratoDoCatalogo(CATALOGO_DA_VOZ)).filter(([, texto]) => /conexão com o Anki/.test(texto)).map(([nome]) => nome);
assert.deepStrictEqual(comONomeMinusculo, [], 'o nome é “Conexão com o Anki”, com C maiúsculo, em todo texto da Voz');

assert(aponta(conferir(comMudanca(c => { c['POP-04'] = 'Min'; })), 'POP-04'), 'POP-04 cortado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { delete c['FOT-11'].causaChave; })), 'FOT-11.causaChave'), 'parte apagada devia ficar vermelha');
assert(aponta(conferir(comMudanca(c => { c['FOT-11'].causaRede = 'TEXTO DIFERENTE NO CATALOGO'; })), 'FOT-11.causaRede'), 'texto trocado sem regravar o retrato devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['FOT-11'].nova = 'Parte nova'; })), 'FOT-11.nova'), 'parte nova devia ficar vermelha');
assert(aponta(conferir(comMudanca(c => { delete c['POP-04']; })), 'POP-04'), 'ID apagado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['XXX-01'] = 'Inventado'; })), 'XXX-01'), 'ID inventado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['POP-04'] = 'Cole ou escrev'; })), 'POP-04'));

console.log(`ok: ${Object.keys(CATALOGO_DA_VOZ).length} IDs, ${Object.keys(retrato).length} textos e partes conferidos com o retrato`);
