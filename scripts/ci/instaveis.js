'use strict';

// Lista os testes e2e que falharam e passaram na repetição automática (`retries` em
// e2e/playwright.config.js), para o resumo do job não esconder a instabilidade.
// Também diz ao job, pela saída `achou`, se algum oscilou: o job então guarda e2e/test-results
// (com o PNG de diferença da primeira tentativa), que sem isso só se guarda quando o job falha.
// Uso: node scripts/ci/instaveis.js e2e/test-results/relatorio.json

const fs = require('fs');

function percorrer(suite, achados) {
  for (const spec of suite.specs || []) {
    for (const teste of spec.tests || []) {
      if (teste.status === 'flaky') {
        achados.push({ arquivo: spec.file, linha: spec.line, titulo: spec.title });
      }
    }
  }
  for (const filha of suite.suites || []) percorrer(filha, achados);
}

/** Os testes do relatório JSON do Playwright que passaram só depois de repetidos. */
function instaveis(relatorio) {
  const achados = [];
  for (const suite of relatorio.suites || []) percorrer(suite, achados);
  return achados;
}

/** O texto (Markdown) do resumo do job; vazio quando nenhum oscilou. */
function resumo(lista) {
  if (!lista.length) return '';
  const linhas = lista.map(t => `- \`${t.arquivo}:${t.linha}\` ${t.titulo}`);
  return [`### ${lista.length} teste(s) e2e passaram só na segunda tentativa`, '', ...linhas, ''].join('\n');
}

module.exports = { instaveis, resumo };

if (require.main === module) {
  const caminho = process.argv[2];
  if (!caminho || !fs.existsSync(caminho)) {
    console.log('Sem relatório do Playwright: nada a listar.');
    process.exit(0);
  }
  const lista = instaveis(JSON.parse(fs.readFileSync(caminho, 'utf8')));
  for (const t of lista) {
    console.log(`::warning file=e2e/tests/${t.arquivo},line=${t.linha}::Instável: passou só na segunda tentativa: ${t.titulo}`);
  }
  const texto = resumo(lista);
  if (texto && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto);
  if (texto) console.log(texto);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `achou=${lista.length > 0}\n`);
}
