'use strict';

// O catálogo da Voz tem uma fonte: a spec, `docs/design/voz/README.md`. As outras
// duas cópias seguem dela, e este teste falha quando uma se afasta:
//   - `docs/design/voz/catalogo.html` é gerado (`scripts/gerar-catalogo-da-voz.js`);
//   - `lib/voz/catalogo.js` (o que roda) tem os mesmos IDs, e cada texto dele está
//     escrito na linha do mesmo ID da spec.
// Roda sem navegador: `node test_voz.js`.

const assert = require('assert');
const fs = require('fs');

const { CAMINHO_DO_HTML, linhasDaSpec, htmlDoCatalogo } = require('./scripts/voz-da-spec.js');

globalThis.PerpetualMiner = {};
require('./lib/voz/catalogo.js');
const { CATALOGO_DA_VOZ } = globalThis.PerpetualMiner;

const linhas = linhasDaSpec();
assert(linhas.length > 0, 'não li nenhuma linha do catálogo na spec');

// ─── os IDs ──────────────────────────────────────────────────────────────────

const idsDaSpec = linhas.map(l => l.id);
assert.strictEqual(new Set(idsDaSpec).size, idsDaSpec.length, 'a spec repete um ID');
assert.deepStrictEqual(Object.keys(CATALOGO_DA_VOZ).sort(), [...idsDaSpec].sort(),
  'lib/voz/catalogo.js e a spec da Voz não têm os mesmos IDs');

// ─── catalogo.html é gerado ──────────────────────────────────────────────────

assert.strictEqual(fs.readFileSync(CAMINHO_DO_HTML, 'utf8'), htmlDoCatalogo(),
  'docs/design/voz/catalogo.html não bate com a spec. Rode: node scripts/gerar-catalogo-da-voz.js');

// ─── o texto de cada ID ──────────────────────────────────────────────────────

const normalizar = texto => texto.replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const escapar = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** O modelo do catálogo como expressão: `{nome}` vira qualquer valor e `{n|a|b}`, uma das duas formas. */
function expressaoDoModelo(modelo) {
  const corpo = normalizar(modelo).split(/(\{[^{}]+\})/).map(parte => {
    if (!/^\{[^{}]+\}$/.test(parte)) return escapar(parte);
    const [, ...formas] = parte.slice(1, -1).split('|');
    return formas.length ? `(?:${formas.map(escapar).join('|')})` : '.+?';
  }).join('');
  return new RegExp(corpo);
}

/** Cada texto do catálogo com o nome dele: `ID` quando a entrada é um texto, `ID.parte` quando tem partes. */
function textosDoCatalogo() {
  const textos = [];
  for (const [id, entrada] of Object.entries(CATALOGO_DA_VOZ)) {
    if (typeof entrada === 'string') textos.push([id, id, entrada]);
    else for (const [parte, modelo] of Object.entries(entrada)) textos.push([`${id}.${parte}`, id, modelo]);
  }
  return textos.filter(([, , modelo]) => modelo !== '');
}

// Textos que a spec não escreve por extenso: ela os resume ou manda ler o catálogo.js.
// Cada um segue sem conferência até a spec passar a trazê-lo; quando trouxer, o teste
// pede para tirá-lo daqui.
const SPEC_NAO_ESCREVE = new Set([
  'FOT-11.causaRede',
  'ENV-03.motivoAjustes',
  'ENV-10.ajudaUma',
  'BRG-01.desligada',
  'BRG-33.reparar',
  'ONB-11.corpo',
  'ONB-11.detalhes',
]);

const copiaDaSpec = Object.fromEntries(linhas.map(l => [l.id, normalizar(`${l.copia} ${l.nota}`)]));
const desviados = [];
const queJaBatem = [];
for (const [nome, id, modelo] of textosDoCatalogo()) {
  const bate = expressaoDoModelo(modelo).test(copiaDaSpec[id]);
  if (!bate && !SPEC_NAO_ESCREVE.has(nome)) desviados.push(nome);
  if (bate && SPEC_NAO_ESCREVE.has(nome)) queJaBatem.push(nome);
}
assert.deepStrictEqual(desviados, [],
  `texto do lib/voz/catalogo.js que a spec da Voz não tem na linha do mesmo ID (mude os dois juntos): ${desviados.join(', ')}`);
assert.deepStrictEqual(queJaBatem, [],
  `a spec já escreve estes textos: tire-os de SPEC_NAO_ESCREVE: ${queJaBatem.join(', ')}`);

console.log(`ok: ${idsDaSpec.length} IDs, ${textosDoCatalogo().length - SPEC_NAO_ESCREVE.size} textos conferidos com a spec da Voz`);
