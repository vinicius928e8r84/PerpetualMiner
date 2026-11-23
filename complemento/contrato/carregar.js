'use strict';

const fs = require('fs');
const path = require('path');

const lerJson = (pasta, nome) => JSON.parse(fs.readFileSync(path.join(pasta, nome), 'utf8'));
const ehOutroArquivoDoContrato = nome => /^exemplos-.+\.json$/.test(nome);

function recusarNomeRepetido(atual, valor, nome, chave) {
  const repetido = Object.keys(valor).find(dentro => atual?.[dentro] !== undefined);
  if (repetido !== undefined) throw new Error(`${nome}: "${repetido}" de "${chave}" já existe em outro arquivo do contrato`);
}

function juntarSecao(atual, valor, nome, chave) {
  if (Array.isArray(valor)) return [...(atual || []), ...valor];
  recusarNomeRepetido(atual, valor, nome, chave);
  return { ...atual, ...valor };
}

function carregar(pasta = __dirname) {
  const contrato = lerJson(pasta, 'exemplos.json');
  for (const nome of fs.readdirSync(pasta).filter(ehOutroArquivoDoContrato).sort()) {
    for (const [chave, valor] of Object.entries(lerJson(pasta, nome))) contrato[chave] = juntarSecao(contrato[chave], valor, nome, chave);
  }
  return contrato;
}

module.exports = carregar();
Object.defineProperty(module.exports, 'carregar', { value: carregar });
