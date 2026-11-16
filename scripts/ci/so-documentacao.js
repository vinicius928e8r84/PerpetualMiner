'use strict';

const { execFileSync } = require('child_process');

const CODIGO = [/^e2e\//, /^\.github\//, /^scripts\//, /^lib\//, /^veio\//, /^conexao\//];

const LIDOS_PELA_SUITE = [/^docs\/design\/voz\/.*\.(json|html)$/, /^docs\/design\/identidade-veio\//, /^docs\/loja\//, /^docs\/design\/cartao-do-russo\.html$/];

const TEXTO = /\.md$/i;
const ILUSTRACAO = /\.(png|jpe?g|gif|webp|svg|html)$/i;

function ehDocumentacao(arquivo) {
  if (CODIGO.some(regra => regra.test(arquivo))) return false;
  if (LIDOS_PELA_SUITE.some(regra => regra.test(arquivo))) return false;
  if (TEXTO.test(arquivo)) return true;
  return /^docs\//.test(arquivo) && ILUSTRACAO.test(arquivo);
}

function soDocumentacao(arquivos) {
  return arquivos.length > 0 && arquivos.every(ehDocumentacao);
}

function arquivosMudados(base, head, repositorio) {
  const saida = execFileSync('git', ['-C', repositorio || '.', 'diff', '--no-renames', '--name-only', base, head], { encoding: 'utf8' });
  return saida.split('\n').map(l => l.trim()).filter(Boolean);
}

module.exports = { soDocumentacao, arquivosMudados };

if (require.main === module) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error('uso: node scripts/ci/so-documentacao.js <base> <head>');
    process.exit(2);
  }
  console.log(String(soDocumentacao(arquivosMudados(base, head))));
}
