'use strict';

// Diz se um conjunto de arquivos alterados é só documentação, caso em que o workflow Testes
// pula o trabalho das fatias e2e. Lê os caminhos (um por linha) da entrada padrão e imprime
// `true` ou `false`. Na dúvida (lista vazia) é `false`: a suíte roda.

// O que conta como documentação: Markdown em qualquer pasta, tudo em docs/ e o que é só
// instrução para agentes.
const DOCUMENTACAO = [/\.md$/i, /^docs\//, /^\.agents\//, /^\.claude\//];

// A suíte e2e lê estes arquivos de documentação (docs/design/voz/README.md em
// catalogo-da-voz.spec.js, os assets da marca em base-veio.spec.js, as imagens da loja em
// e2e/loja/): mudá-los muda o que ela confere.
const LIDOS_PELA_SUITE = [/^docs\/design\/voz\//, /^docs\/design\/identidade-veio\//, /^docs\/loja\//];

// `.agents/` e `.claude/` também guardam scripts (doctor.sh, drive.sh...): só o que é texto
// de instrução fica de fora da suíte.
const SCRIPTS_DE_AGENTE = /^\.(agents|claude)\/.*\.(sh|js|mjs|json|py)$/;

function ehDocumentacao(arquivo) {
  if (LIDOS_PELA_SUITE.some(regra => regra.test(arquivo))) return false;
  if (SCRIPTS_DE_AGENTE.test(arquivo)) return false;
  return DOCUMENTACAO.some(regra => regra.test(arquivo));
}

function soDocumentacao(arquivos) {
  return arquivos.length > 0 && arquivos.every(ehDocumentacao);
}

module.exports = { soDocumentacao };

if (require.main === module) {
  const entrada = require('fs').readFileSync(0, 'utf8');
  const arquivos = entrada.split('\n').map(l => l.trim()).filter(Boolean);
  console.log(String(soDocumentacao(arquivos)));
}
