'use strict';

const FORA_DAS_REGRAS = [
  { quem: 'e2e/tests/catalogo-da-voz.spec.js', guarda: 'o texto da interface vem do catálogo da Voz, por ID' },
  { quem: 'e2e/tests/texto-literal.spec.js', guarda: 'o texto da página e da Frase entra como texto, nunca como HTML' },
  { quem: 'testes/test_contrato_fechado.js e o tearDownModule de complemento/test_harness.py', guarda: 'o contrato tem um exemplo para cada pedido que a extensão monta e cada status que o servidor responde' },
  { quem: 'testes/test_empacotar.js', guarda: 'o pacote da extensão leva só os arquivos da extensão, e o manifest passa nas exigências da loja' },
  { quem: 'Registro da PR (scripts/ci/registro-da-pr.js)', guarda: 'o corpo da PR liga a issue (Closes/Refs, "Prova que falta:"); o formato está em .github/PULL_REQUEST_TEMPLATE.md; a PR que toca .github/, scripts/regras/, scripts/ci/, scripts/ganchos/, AGENTS.md, CLAUDE.md, .claude/ ou .agents/ conta ALTA, diga o que disser o corpo (scripts/ci/caminhos-sensiveis.js)' },
  { quem: 'Linha de base refeita (scripts/ci/linha-de-base-refeita.js)', guarda: 'o commit "Linha de base: desce no merge" é refeito a partir do pai por baixar-no-merge.js e comparado' },
  { quem: 'scripts/ci/lint-do-que-mudou.js', guarda: 'nenhum achado novo do ESLint (scripts/regras/eslint.config.mjs) nem do ruff F,E9 nas linhas que a mudança acrescenta' },
  { quem: 'scripts/ci/auditoria-de-dependencias.js', guarda: 'nenhuma vulnerabilidade alta ou crítica nova numa dependência que a mudança traz (npm audit no package-lock.json, pip-audit no requirements.txt)' },
];

const ehTextoDeUmaLinha = guarda => typeof guarda === 'string' && guarda.trim() !== '' && !guarda.includes('\n');

const regrasSemGuarda = regras => regras.filter(regra => !ehTextoDeUmaLinha(regra.guarda)).map(regra => regra.id);

function linhasDaAjuda(regras) {
  const largura = Math.max(...regras.map(regra => regra.id.length));
  return regras.map(regra => `  ${regra.id.padEnd(largura)}  ${regra.guarda}`);
}

function textoDaAjuda(regras) {
  return [
    'Regras (cada uma, o que guarda):',
    ...linhasDaAjuda(regras),
    '',
    'Checks que não são deste diretório:',
    ...FORA_DAS_REGRAS.map(check => `  ${check.quem}: ${check.guarda}`),
  ].join('\n');
}

module.exports = { regrasSemGuarda, linhasDaAjuda, textoDaAjuda, FORA_DAS_REGRAS };
