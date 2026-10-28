'use strict';

// O catálogo da Voz tem uma fonte do texto: a spec, `docs/design/voz/README.md`. As
// outras cópias seguem dela, e este teste falha quando uma se afasta:
//   - `docs/design/voz/catalogo.html` é gerado (`scripts/gerar-catalogo-da-voz.js`);
//   - `lib/voz/catalogo.js` (o que roda) tem os mesmos IDs da spec, cada texto está
//     escrito na linha do mesmo ID dela e todo texto e toda parte batem, por inteiro,
//     com o retrato `docs/design/voz/catalogo-textos.json` (também gerado): um texto
//     mudado ou uma parte apagada só passa regravando o retrato, e o diff mostra.
// Roda sem navegador: `node test_voz.js`.

const assert = require('assert');
const fs = require('fs');

const { CAMINHO_DO_HTML, linhasDaSpec, htmlDoCatalogo } = require('./scripts/voz-da-spec.js');
const { CAMINHO_DO_RETRATO, problemasDaVoz, retratoDoCatalogo } = require('./scripts/conferir-voz.js');

globalThis.PerpetualMiner = {};
require('./lib/voz/catalogo.js');
const { CATALOGO_DA_VOZ } = globalThis.PerpetualMiner;

const linhas = linhasDaSpec();
const retrato = JSON.parse(fs.readFileSync(CAMINHO_DO_RETRATO, 'utf8'));

// Textos que a spec não escreve por extenso: ela os resume ou manda ler o catálogo.js.
// O retrato os guarda por inteiro; aqui só ficam fora da conferência com a linha da spec
// até ela passar a trazê-los (quando trouxer, o teste pede para tirá-los daqui).
const SPEC_NAO_ESCREVE = new Set([
  'FOT-11.causaRede',
  'ENV-03.motivoAjustes',
  'ENV-10.ajudaUma',
  'BRG-01.desligada',
  'ONB-11.corpo',
  'ONB-11.detalhes',
]);

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

// O nome da Conexão com o Anki leva o C maiúsculo em todo texto (a resposta do dono no #269).
const comONomeMinusculo = Object.entries(retratoDoCatalogo(CATALOGO_DA_VOZ)).filter(([, texto]) => /conexão com o Anki/.test(texto)).map(([nome]) => nome);
assert.deepStrictEqual(comONomeMinusculo, [], 'o nome é “Conexão com o Anki”, com C maiúsculo, em todo texto da Voz');

// Um texto cortado, que ainda aparece dentro da linha da spec.
assert(aponta(conferir(comMudanca(c => { c['POP-04'] = 'Min'; })), 'POP-04'), 'POP-04 cortado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { delete c['FOT-11'].causaChave; })), 'FOT-11.causaChave'), 'parte apagada devia ficar vermelha');
assert(aponta(conferir(comMudanca(c => { c['FOT-11'].causaRede = 'TEXTO DIFERENTE NA COPIA'; })), 'FOT-11.causaRede'), 'texto fora da spec, trocado, devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['FOT-11'].nova = 'Parte nova'; })), 'FOT-11.nova'), 'parte nova devia ficar vermelha');
assert(aponta(conferir(comMudanca(c => { delete c['POP-04']; })), 'POP-04'), 'ID apagado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['XXX-01'] = 'Inventado'; })), 'XXX-01'), 'ID inventado devia ficar vermelho');
// Um texto trocado por outro que a spec escreve na mesma linha, mas não é o dele.
assert(aponta(conferir(comMudanca(c => { c['POP-04'] = 'Cole ou escrev'; })), 'POP-04'));

console.log(`ok: ${linhas.length} IDs, ${Object.keys(retrato).length} textos e partes conferidos com a spec e o retrato`);
