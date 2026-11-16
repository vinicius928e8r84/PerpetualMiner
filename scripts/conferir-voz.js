'use strict';

const CAMINHO_DO_RETRATO = require('path').join(__dirname, '..', 'docs', 'design', 'voz', 'catalogo-textos.json');

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

function expressaoDoModelo(modelo) {
  const corpo = normalizar(modelo).split(/(\{[^{}]+\})/).map(parte => {
    if (!/^\{[^{}]+\}$/.test(parte)) return escapar(parte);
    const [, ...formas] = parte.slice(1, -1).split('|');
    return formas.length ? `(?:${formas.map(escapar).join('|')})` : '.+?';
  }).join('');
  return new RegExp(corpo);
}

function problemasDaVoz({ catalogo, linhas, retrato, naoEscritos }) {
  const problemas = [];
  const idsDaSpec = linhas.map(l => l.id);
  const idsDoCatalogo = Object.keys(catalogo);

  for (const id of idsDaSpec.filter(id => !(id in catalogo))) problemas.push(`${id}: está na spec e falta no catalogo.js`);
  for (const id of idsDoCatalogo.filter(id => !idsDaSpec.includes(id))) problemas.push(`${id}: está no catalogo.js e falta na spec`);

  const atuais = retratoDoCatalogo(catalogo);
  for (const nome of Object.keys(retrato)) {
    if (!(nome in atuais)) problemas.push(`${nome}: estava no retrato e saiu do catalogo.js`);
    else if (atuais[nome] !== retrato[nome]) problemas.push(`${nome}: o texto mudou (era “${retrato[nome]}”, agora “${atuais[nome]}”)`);
  }
  for (const nome of Object.keys(atuais).filter(nome => !(nome in retrato))) problemas.push(`${nome}: entrou no catalogo.js e não está no retrato`);

  const copiaDaSpec = Object.fromEntries(linhas.map(l => [l.id, normalizar(`${l.copia} ${l.nota}`)]));
  for (const { nome, id, modelo } of textosDoCatalogo(catalogo)) {
    if (!(id in copiaDaSpec)) continue;
    const bate = expressaoDoModelo(modelo).test(copiaDaSpec[id]);
    if (!bate && !naoEscritos.has(nome)) problemas.push(`${nome}: o texto não está na linha de ${id} da spec`);
    if (bate && naoEscritos.has(nome)) problemas.push(`${nome}: a spec já escreve este texto, tire-o de naoEscritos`);
  }
  return problemas;
}

const retratoDoCatalogo = catalogo => Object.fromEntries(textosDoCatalogo(catalogo).map(({ nome, modelo }) => [nome, modelo]));

module.exports = { CAMINHO_DO_RETRATO, problemasDaVoz, retratoDoCatalogo, textosDoCatalogo };
