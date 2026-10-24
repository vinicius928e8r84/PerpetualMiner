'use strict';

// Os nomes dos checks que os workflows de PR produzem, para conferir contra a lista que a proteção da
// main exige (checks-obrigatorios.json). O nome de um check é o `name` do job com a matriz já expandida;
// sem `name`, o id do job, e uma matriz que o nome não cita entra entre parênteses, como o GitHub faz.

const fs = require('fs');
const path = require('path');
const { lerYaml } = require('../yaml-de-workflow');

const PASTA_DOS_WORKFLOWS = '.github/workflows';
const ARQUIVO_DA_LISTA = 'scripts/ci/checks-obrigatorios.json';

/** Uma lista inline do YAML (`[1, 2]`, `['3.9', '3.13']`) como valores de texto. */
const valoresDaMatriz = texto => String(texto).replace(/^\s*\[|\]\s*$/g, '').split(',')
  .map(valor => valor.trim().replace(/^(['"])(.*)\1$/, '$2')).filter(Boolean);

/** Todas as combinações da matriz: [{ chave: valor }]; uma lista vazia sem matriz. */
function combinacoes(matriz) {
  let saida = [{}];
  for (const [chave, valores] of Object.entries(matriz || {})) {
    if (['include', 'exclude'].includes(chave)) continue;
    saida = saida.flatMap(parcial => valoresDaMatriz(valores).map(valor => ({ ...parcial, [chave]: valor })));
  }
  return saida;
}

function nomesDoJob(id, job) {
  const nome = job.name || id;
  const combinados = combinacoes(job.strategy && job.strategy.matrix);
  if (!combinados.length || (combinados.length === 1 && !Object.keys(combinados[0]).length)) return [nome];
  return combinados.map(valores => {
    if (/\$\{\{\s*matrix\./.test(nome)) return nome.replace(/\$\{\{\s*matrix\.([\w-]+)\s*\}\}/g, (_, chave) => valores[chave]);
    return `${nome} (${Object.values(valores).join(', ')})`;
  });
}

/** Os checks que os workflows de `raiz` produzem. */
function checksDosWorkflows(raiz) {
  const pasta = path.join(raiz, PASTA_DOS_WORKFLOWS);
  const nomes = new Set();
  for (const arquivo of fs.readdirSync(pasta).filter(f => /\.ya?ml$/.test(f)).sort()) {
    const workflow = lerYaml(fs.readFileSync(path.join(pasta, arquivo), 'utf8'));
    for (const [id, job] of Object.entries(workflow.jobs || {})) nomesDoJob(id, job).forEach(nome => nomes.add(nome));
  }
  return nomes;
}

/** Os checks obrigatórios que nenhum workflow produz. */
function checksQueFaltam(raiz) {
  const lista = JSON.parse(fs.readFileSync(path.join(raiz, ARQUIVO_DA_LISTA), 'utf8')).checks;
  const existentes = checksDosWorkflows(raiz);
  return lista.filter(nome => !existentes.has(nome));
}

module.exports = { ARQUIVO_DA_LISTA, checksDosWorkflows, checksQueFaltam };
