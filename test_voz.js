'use strict';

const assert = require('assert');
const fs = require('fs');

const path = require('path');
const { CAMINHO_DA_SPEC, CAMINHOS_DA_SPEC, CAMINHO_DO_HTML, linhasDaSpec, htmlDoCatalogo } = require('./scripts/voz-da-spec.js');
const { CAMINHO_DO_RETRATO, problemasDaVoz, retratoDoCatalogo } = require('./scripts/conferir-voz.js');

globalThis.PerpetualMiner = {};
require('./lib/voz/catalogo.js');
require('./lib/voz/catalogo-nivel.js');
const { CATALOGO_DA_VOZ } = globalThis.PerpetualMiner;

const linhas = linhasDaSpec();
const retrato = JSON.parse(fs.readFileSync(CAMINHO_DO_RETRATO, 'utf8'));

const SPEC_NAO_ESCREVE = new Set([
  'FOT-11.causaRede',
  'ENV-03.motivoAjustes',
  'ENV-10.ajudaUma',
  'BRG-01.desligada',
  'ONB-11.corpo',
  'ONB-11.detalhes',
]);

const pastaDaVoz = path.dirname(CAMINHO_DA_SPEC);
const linhasDeId = texto => texto.split('\n').filter(linha => /^\| [A-Z]{3}-\d{2} \|/.test(linha));
const readme = fs.readFileSync(CAMINHO_DA_SPEC, 'utf8');
assert.deepStrictEqual(linhasDeId(readme), [], 'o README da Voz é só o índice: a linha de ID mora no arquivo da área (`catalogo-*.md`)');
for (const arquivo of fs.readdirSync(pastaDaVoz).filter(nome => /^catalogo-.*\.md$/.test(nome))) {
  assert(CAMINHOS_DA_SPEC.includes(path.join(pastaDaVoz, arquivo)), `${arquivo} não está em CAMINHOS_DA_SPEC (scripts/voz-da-spec.js): a spec não o lê`);
}
for (const caminho of CAMINHOS_DA_SPEC.filter(caminho => caminho !== CAMINHO_DA_SPEC)) {
  assert(readme.includes(`(${path.basename(caminho)})`), `o README da Voz não aponta ${path.basename(caminho)}`);
}

const notasPorArea = Object.fromEntries(fs.readdirSync(pastaDaVoz).filter(nome => /^notas-.*\.json$/.test(nome))
  .map(nome => [nome.replace(/^notas-|\.json$/g, ''), JSON.parse(fs.readFileSync(path.join(pastaDaVoz, nome), 'utf8'))]));
const notas = Object.assign({}, ...Object.values(notasPorArea));
const idsSemNota = Object.keys(CATALOGO_DA_VOZ).filter(id => typeof notas[id] !== 'string');
assert.deepStrictEqual(idsSemNota, [], 'um ID do catálogo não tem a nota em docs/design/voz/notas-<área>.json (sem nota é "")');
assert.deepStrictEqual(Object.keys(notas).filter(id => !(id in CATALOGO_DA_VOZ)), [], 'uma nota em docs/design/voz/notas-<área>.json é de um ID que não está no catálogo');
assert.strictEqual(Object.values(notasPorArea).reduce((soma, doArea) => soma + Object.keys(doArea).length, 0), Object.keys(notas).length, 'um ID tem nota em duas áreas');
assert.deepStrictEqual(Object.fromEntries(linhas.map(l => [l.id, l.nota])), Object.fromEntries(Object.keys(CATALOGO_DA_VOZ).map(id => [id, notas[id]])),
  'a nota de um ID não bate com a coluna Nota da spec da Voz');
for (const caminho of CAMINHOS_DA_SPEC.filter(caminho => caminho !== CAMINHO_DA_SPEC)) {
  const area = path.basename(caminho).replace(/^catalogo-|\.md$/g, '');
  assert.deepStrictEqual(Object.keys(notasPorArea[area] || {}).sort(), linhasDaSpec(`## 3. Catálogo de estados-chave\n${fs.readFileSync(caminho, 'utf8')}`).map(l => l.id).sort(),
    `docs/design/voz/notas-${area}.json não tem os mesmos IDs de catalogo-${area}.md`);
}

const conferir = (catalogo, spec = linhas) => problemasDaVoz({ catalogo, linhas: spec, retrato, naoEscritos: SPEC_NAO_ESCREVE });

assert(linhas.length > 0, 'não li nenhuma linha do catálogo na spec');
assert.strictEqual(new Set(linhas.map(l => l.id)).size, linhas.length, 'a spec repete um ID');
assert.deepStrictEqual(linhas.filter(l => l.hoje === '(não existe)' && l.marca !== 'novo').map(l => l.id), [],
  'um estado que não existia precisa da marca **(novo)** na spec e no catálogo HTML');

assert.deepStrictEqual(conferir(CATALOGO_DA_VOZ), [],
  'lib/voz/catalogo.js, a spec da Voz e o retrato não batem. Mudou um texto de propósito? Mude a spec e rode: node scripts/gerar-catalogo-da-voz.js');

assert.strictEqual(fs.readFileSync(CAMINHO_DO_HTML, 'utf8'), htmlDoCatalogo(),
  'docs/design/voz/catalogo.html não bate com a spec. Rode: node scripts/gerar-catalogo-da-voz.js');

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
assert(aponta(conferir(comMudanca(c => { c['FOT-11'].causaRede = 'TEXTO DIFERENTE NA COPIA'; })), 'FOT-11.causaRede'), 'texto fora da spec, trocado, devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['FOT-11'].nova = 'Parte nova'; })), 'FOT-11.nova'), 'parte nova devia ficar vermelha');
assert(aponta(conferir(comMudanca(c => { delete c['POP-04']; })), 'POP-04'), 'ID apagado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['XXX-01'] = 'Inventado'; })), 'XXX-01'), 'ID inventado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['POP-04'] = 'Cole ou escrev'; })), 'POP-04'));

console.log(`ok: ${linhas.length} IDs, ${Object.keys(retrato).length} textos e partes conferidos com a spec e o retrato`);
