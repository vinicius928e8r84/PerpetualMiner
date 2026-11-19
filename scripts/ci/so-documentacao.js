'use strict';

const { execFileSync } = require('child_process');
const { PASTAS_DE_RUNTIME } = require('../arquivos-do-pacote.js');

const CODIGO = [/^e2e\//, /^\.github\//, /^scripts\//];
const naPastaDoPacote = arquivo => PASTAS_DE_RUNTIME.includes(arquivo.split('/')[0]) && arquivo.includes('/');

const LIDOS_PELA_SUITE = [/^docs\/design\/voz\/.*\.(json|html)$/, /^docs\/design\/identidade-veio\//, /^docs\/loja\//, /^docs\/design\/cartao-do-russo\.html$/];

const TEXTO = /\.md$/i;
const ILUSTRACAO = /\.(png|jpe?g|gif|webp|svg|html)$/i;

function ehDocumentacao(arquivo) {
  if (naPastaDoPacote(arquivo) || CODIGO.some(regra => regra.test(arquivo))) return false;
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

module.exports = { soDocumentacao, ehDocumentacao, arquivosMudados };
