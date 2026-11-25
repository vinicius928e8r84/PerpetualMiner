'use strict';

const fs = require('fs');
const path = require('path');
const { lerYaml } = require('../yaml-de-workflow');

const PASTA_DOS_WORKFLOWS = '.github/workflows';
const ARQUIVO_DA_LISTA = 'scripts/ci/checks-obrigatorios.json';

const valoresDaMatriz = texto => String(texto).replace(/^\s*\[|\]\s*$/g, '').split(',')
  .map(valor => valor.trim().replace(/^(['"])(.*)\1$/, '$2')).filter(Boolean);

function combinacoes(matriz) {
  let saida = [{}];
  for (const [chave, valores] of Object.entries(matriz || {})) {
    if (['include', 'exclude'].includes(chave)) continue;
    saida = saida.flatMap(parcial => valoresDaMatriz(valores).map(valor => ({ ...parcial, [chave]: valor })));
  }
  return saida;
}

const semValoresDeMatriz = combinados => combinados.every(valores => !Object.keys(valores).length);

function nomesDoJob(id, job) {
  const nome = job.name || id;
  const combinados = combinacoes(job.strategy && job.strategy.matrix);
  if (semValoresDeMatriz(combinados)) return [nome];
  return combinados.map(valores => {
    if (/\$\{\{\s*matrix\./.test(nome)) return nome.replace(/\$\{\{\s*matrix\.([\w-]+)\s*\}\}/g, (_, chave) => valores[chave]);
    return `${nome} (${Object.values(valores).join(', ')})`;
  });
}

function checksDosWorkflows(raiz) {
  const pasta = path.join(raiz, PASTA_DOS_WORKFLOWS);
  const nomes = new Set();
  for (const arquivo of fs.readdirSync(pasta).filter(f => /\.ya?ml$/.test(f)).sort()) {
    const workflow = lerYaml(fs.readFileSync(path.join(pasta, arquivo), 'utf8'));
    for (const [id, job] of Object.entries(workflow.jobs || {})) nomesDoJob(id, job).forEach(nome => nomes.add(nome));
  }
  return nomes;
}

function checksQueFaltam(raiz) {
  const lista = JSON.parse(fs.readFileSync(path.join(raiz, ARQUIVO_DA_LISTA), 'utf8')).checks;
  const existentes = checksDosWorkflows(raiz);
  return lista.filter(nome => !existentes.has(nome));
}

module.exports = { ARQUIVO_DA_LISTA, checksDosWorkflows, checksQueFaltam };
