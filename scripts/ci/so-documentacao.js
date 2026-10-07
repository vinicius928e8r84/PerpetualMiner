'use strict';

// Diz se uma mudança é só documentação, caso em que o workflow Testes pula o trabalho das fatias
// e2e. Uso: `node scripts/ci/so-documentacao.js <base> <head>` imprime `true` ou `false` para
// o que mudou entre os dois commits. Na dúvida (nada mudou, ou não deu para ver) é `false`:
// a suíte roda.

const { execFileSync } = require('child_process');

// Pastas que a suíte, o CI ou a extensão usam: nada nelas é documentação, nem um .md ou um .png.
const CODIGO = [/^e2e\//, /^\.github\//, /^scripts\//, /^lib\//, /^veio\//, /^conexao\//];

// A suíte e2e lê estes arquivos de documentação (docs/design/voz/README.md em
// catalogo-da-voz.spec.js, os assets da marca em base-veio.spec.js, as imagens da loja em
// e2e/loja/): mudá-los muda o que ela confere.
const LIDOS_PELA_SUITE = [/^docs\/design\/voz\//, /^docs\/design\/identidade-veio\//, /^docs\/loja\//];

// O que é documentação, e só com estas extensões: texto em qualquer pasta, e em docs/ também as
// imagens e os protótipos em HTML que ilustram o texto. `.agents/` e `.claude/` guardam scripts
// (doctor.sh, drive.sh...) junto das instruções: só o texto delas fica de fora da suíte.
const TEXTO = /\.md$/i;
const ILUSTRACAO = /\.(png|jpe?g|gif|webp|svg|html)$/i;

function ehDocumentacao(arquivo) {
  if (CODIGO.some(regra => regra.test(arquivo))) return false;
  if (LIDOS_PELA_SUITE.some(regra => regra.test(arquivo))) return false;
  if (TEXTO.test(arquivo)) return true;
  return /^docs\//.test(arquivo) && ILUSTRACAO.test(arquivo);
}

/** Verdadeiro quando há arquivos e todos são documentação. */
function soDocumentacao(arquivos) {
  return arquivos.length > 0 && arquivos.every(ehDocumentacao);
}

/**
 * Os caminhos que mudaram entre dois commits. Sem detectar renomeações: um arquivo movido
 * aparece como apagado no caminho de origem e criado no de destino, e os dois entram na conta
 * (com a detecção, só o destino apareceria e mover um teste para docs/ passaria por texto).
 */
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
