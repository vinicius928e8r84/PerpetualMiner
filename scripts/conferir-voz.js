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

function problemasDaVoz({ catalogo, retrato }) {
  const problemas = [];
  const atuais = retratoDoCatalogo(catalogo);
  for (const nome of Object.keys(retrato)) {
    if (!(nome in atuais)) problemas.push(`${nome}: estava no retrato e saiu do catalogo.js`);
    else if (atuais[nome] !== retrato[nome]) problemas.push(`${nome}: o texto mudou (era “${retrato[nome]}”, agora “${atuais[nome]}”)`);
  }
  for (const nome of Object.keys(atuais).filter(nome => !(nome in retrato))) problemas.push(`${nome}: entrou no catalogo.js e não está no retrato`);
  return problemas;
}

const retratoDoCatalogo = catalogo => Object.fromEntries(textosDoCatalogo(catalogo).map(({ nome, modelo }) => [nome, modelo]));

module.exports = { CAMINHO_DO_RETRATO, problemasDaVoz, retratoDoCatalogo, textosDoCatalogo };
