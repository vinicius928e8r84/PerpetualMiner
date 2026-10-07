'use strict';

// A conferência do catálogo da Voz que `test_voz.js` roda: o que `lib/voz/catalogo.js`
// (o que a extensão mostra) tem de bater com a spec (`docs/design/voz/README.md`).

const CAMINHO_DO_RETRATO = require('path').join(__dirname, '..', 'docs', 'design', 'voz', 'catalogo-textos.json');

/** Cada texto do catálogo com o nome dele: `ID` quando a entrada é um texto, `ID.parte` quando tem partes. */
function textosDoCatalogo(catalogo) {
  const textos = [];
  for (const [id, entrada] of Object.entries(catalogo)) {
    if (typeof entrada === 'string') textos.push({ nome: id, id, modelo: entrada });
    else for (const [parte, modelo] of Object.entries(entrada)) textos.push({ nome: `${id}.${parte}`, id, modelo });
  }
  return textos.filter(({ modelo }) => modelo !== '');
}

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

/**
 * @param {object} catalogo o `CATALOGO_DA_VOZ`
 * @param {{id: string, copia: string, nota: string}[]} linhas a spec, de `linhasDaSpec()`
 * @param {Record<string, string>} retrato todos os textos e partes de `catalogo.js`, `ID` ou `ID.parte` →
 *   texto, como a última regravação os deixou (`docs/design/voz/catalogo-textos.json`)
 * @param {Set<string>} naoEscritos textos que a spec não escreve por extenso
 * @returns {string[]} o que não bate; vazio quando tudo bate
 */
function problemasDaVoz({ catalogo, linhas, retrato, naoEscritos }) {
  const problemas = [];
  const idsDaSpec = linhas.map(l => l.id);
  const idsDoCatalogo = Object.keys(catalogo);

  for (const id of idsDaSpec.filter(id => !(id in catalogo))) problemas.push(`${id}: está na spec e falta no catalogo.js`);
  for (const id of idsDoCatalogo.filter(id => !idsDaSpec.includes(id))) problemas.push(`${id}: está no catalogo.js e falta na spec`);

  // Todo texto e toda parte, por inteiro: um texto mudado ou uma parte apagada aparece aqui.
  const atuais = retratoDoCatalogo(catalogo);
  for (const nome of Object.keys(retrato)) {
    if (!(nome in atuais)) problemas.push(`${nome}: estava no retrato e saiu do catalogo.js`);
    else if (atuais[nome] !== retrato[nome]) problemas.push(`${nome}: o texto mudou (era “${retrato[nome]}”, agora “${atuais[nome]}”)`);
  }
  for (const nome of Object.keys(atuais).filter(nome => !(nome in retrato))) problemas.push(`${nome}: entrou no catalogo.js e não está no retrato`);

  // E o texto de cada parte está escrito na linha do mesmo ID da spec.
  const copiaDaSpec = Object.fromEntries(linhas.map(l => [l.id, normalizar(`${l.copia} ${l.nota}`)]));
  for (const { nome, id, modelo } of textosDoCatalogo(catalogo)) {
    if (!(id in copiaDaSpec)) continue;
    const bate = expressaoDoModelo(modelo).test(copiaDaSpec[id]);
    if (!bate && !naoEscritos.has(nome)) problemas.push(`${nome}: o texto não está na linha de ${id} da spec`);
    if (bate && naoEscritos.has(nome)) problemas.push(`${nome}: a spec já escreve este texto, tire-o de naoEscritos`);
  }
  return problemas;
}

/** O retrato do catálogo: todos os textos e partes, na ordem do `catalogo.js`. */
const retratoDoCatalogo = catalogo => Object.fromEntries(textosDoCatalogo(catalogo).map(({ nome, modelo }) => [nome, modelo]));

module.exports = { CAMINHO_DO_RETRATO, problemasDaVoz, retratoDoCatalogo, textosDoCatalogo };
