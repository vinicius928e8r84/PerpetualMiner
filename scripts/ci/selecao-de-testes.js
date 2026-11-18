'use strict';

const { ehDocumentacao, arquivosMudados } = require('./so-documentacao.js');

const DAS_FERRAMENTAS = [/^scripts\//, /^\.github\//];
const DO_CONTRATO = [/^complemento\/contrato\//];
const SO_DO_COMPLEMENTO = [/^complemento\//, /^conexao\//, /^engine\//];
const LIDOS_PELO_COMPLEMENTO = [/^lib\/ankiweb\.js$/, /^docs\/design\/dentro-do-anki\.md$/, /^docs\/design\/voz\//];
const LIDOS_PELO_E2E = [/^complemento\/modelos_da_ia\.json$/, /^conexao\//];
const TEXTO_DO_PACOTE = /^complemento\/(?!LEIA-ME\.md$)(?!contrato\/)[^/]+\.md$/i;
const NA_RAIZ_E_OCULTO = /^\.[^/]+$/;
const DA_EXTENSAO = [/^e2e\//, /^lib\//, /^veio\//, /^preview\//, /^docs\//, /^[^/]+$/];

const TUDO = { e2e: true, complemento: true };
const NADA = { e2e: false, complemento: false };

const casa = (regras, arquivo) => regras.some(regra => regra.test(arquivo));

function selecionar(arquivos) {
  if (arquivos.length === 0) return { ...TUDO };
  const rodar = { ...NADA };
  for (const arquivo of arquivos) {
    if (casa(DAS_FERRAMENTAS, arquivo) || casa(DO_CONTRATO, arquivo) || NA_RAIZ_E_OCULTO.test(arquivo)) return { ...TUDO };
    if (casa(LIDOS_PELO_COMPLEMENTO, arquivo) || TEXTO_DO_PACOTE.test(arquivo)) rodar.complemento = true;
    if (casa(LIDOS_PELO_E2E, arquivo)) rodar.e2e = true;
    if (ehDocumentacao(arquivo)) continue;
    if (casa(SO_DO_COMPLEMENTO, arquivo)) rodar.complemento = true;
    else if (casa(DA_EXTENSAO, arquivo)) rodar.e2e = true;
    else return { ...TUDO };
  }
  return rodar;
}

function linhasDe(rodar) {
  return [
    `RODAR_E2E=${rodar.e2e}`,
    `RODAR_COMPLEMENTO=${rodar.complemento}`,
    `RODAR_CONEXAO_REAL=${rodar.e2e || rodar.complemento}`,
  ];
}

module.exports = { selecionar };

if (require.main === module) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error('uso: node scripts/ci/selecao-de-testes.js <base> <head>');
    process.exit(2);
  }
  console.log(linhasDe(selecionar(arquivosMudados(base, head))).join('\n'));
}
