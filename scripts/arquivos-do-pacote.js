'use strict';

// Quais arquivos da raiz do repositório são da extensão em execução e quais não
// são. O empacotador da loja, o teste do pacote e o teste e2e da atualização
// automática (que copia a extensão para uma pasta temporária) leem daqui.

const fs = require('fs');
const path = require('path');

// Na raiz entram os .js/.html/.css da extensão (menos os test_*.js); das pastas
// entram só as de runtime (`conexao/` leva o `.ankiaddon` que a extensão entrega num link de
// download).
const PASTAS_DE_RUNTIME = ['lib', 'veio', 'conexao'];
const FORA_DO_PACOTE = [/^veio\/README\.md$/, /^test_.*\.js$/];

// O que existe no repositório e não é da extensão. O pacote nunca leva nada daqui.
const PASTAS_QUE_NAO_SAO_RUNTIME = [
  '.claude', '.git', 'bridge', 'complemento', 'dist', 'docs', 'e2e', 'engine', 'node_modules', 'preview', 'scripts', 'test-results',
];

function listar(raiz, pasta) {
  return fs.readdirSync(path.join(raiz, pasta), { withFileTypes: true }).flatMap(entrada => {
    const relativo = `${pasta}/${entrada.name}`;
    return entrada.isDirectory() ? listar(raiz, relativo) : [relativo];
  });
}

/** Os caminhos (relativos a `raiz`, com `/`) que entram no pacote, em ordem. */
function arquivosDoPacote(raiz) {
  const naRaiz = fs.readdirSync(raiz, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(js|html|css)$/.test(e.name))
    .map(e => e.name);
  const dasPastas = PASTAS_DE_RUNTIME.flatMap(pasta => listar(raiz, pasta));
  return [...naRaiz, 'manifest.json', ...dasPastas]
    .filter(arquivo => !FORA_DO_PACOTE.some(regra => regra.test(arquivo)))
    .sort();
}

module.exports = { arquivosDoPacote, PASTAS_QUE_NAO_SAO_RUNTIME };
