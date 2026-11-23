'use strict';

const fs = require('fs');

function instaveisDaSpec(spec) {
  return (spec.tests || []).filter(teste => teste.status === 'flaky').map(() => ({ arquivo: spec.file, linha: spec.line, titulo: spec.title }));
}

function percorrer(suite, achados) {
  for (const spec of suite.specs || []) achados.push(...instaveisDaSpec(spec));
  for (const filha of suite.suites || []) percorrer(filha, achados);
}

function instaveis(relatorio) {
  const achados = [];
  for (const suite of relatorio.suites || []) percorrer(suite, achados);
  return achados;
}

function resumo(lista) {
  if (!lista.length) return '';
  const linhas = lista.map(t => `- \`${t.arquivo}:${t.linha}\` ${t.titulo}`);
  return [`### ${lista.length} teste(s) e2e passaram só na segunda tentativa`, '', ...linhas, ''].join('\n');
}

function escreverOResumo(texto) {
  if (!texto) return;
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto);
  console.log(texto);
}

function avisarNoCI(caminho) {
  if (!caminho || !fs.existsSync(caminho)) {
    console.log('Sem relatório do Playwright: nada a listar.');
    process.exit(0);
  }
  const lista = instaveis(JSON.parse(fs.readFileSync(caminho, 'utf8')));
  for (const t of lista) {
    console.log(`::warning file=e2e/tests/${t.arquivo},line=${t.linha}::Instável: passou só na segunda tentativa: ${t.titulo}`);
  }
  escreverOResumo(resumo(lista));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `achou=${lista.length > 0}\n`);
}

module.exports = { instaveis, resumo };

if (require.main === module) avisarNoCI(process.argv[2]);
