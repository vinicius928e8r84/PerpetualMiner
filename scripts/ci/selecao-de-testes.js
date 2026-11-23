'use strict';

const { ehDocumentacao, arquivosMudados } = require('./so-documentacao.js');
const { ehDaExtensao } = require('../arquivos-do-pacote.js');

const DAS_FERRAMENTAS = [/^scripts\//, /^\.github\//];
const DO_CONTRATO = [/^complemento\/contrato\//];
const SO_DO_COMPLEMENTO = [/^complemento\//, /^conexao\//, /^engine\//];
const LIDOS_PELO_COMPLEMENTO = [/^lib\/ankiweb\.js$/, /^docs\/design\/dentro-do-anki\.md$/, /^docs\/design\/voz\//];
const LIDOS_PELO_E2E = [/^complemento\/modelos_da_ia\.json$/, /^conexao\//];
const TEXTO_DO_PACOTE = /^complemento\/(?!LEIA-ME\.md$)(?!contrato\/)[^/]+\.md$/i;
const NA_RAIZ_E_OCULTO = /^\.[^/]+$/;
const DA_EXTENSAO = [/^e2e\//, /^preview\//, /^docs\//];

const FORCAM_TUDO = [...DAS_FERRAMENTAS, ...DO_CONTRATO, NA_RAIZ_E_OCULTO];
const FAZEM_RODAR_O_COMPLEMENTO = [...LIDOS_PELO_COMPLEMENTO, TEXTO_DO_PACOTE];

const TUDO = { e2e: true, complemento: true };

const casa = (regras, arquivo) => regras.some(regra => regra.test(arquivo));

const ehDaExtensaoOuDoE2e = arquivo => ehDaExtensao(arquivo) || casa(DA_EXTENSAO, arquivo);

function donoDoCodigo(arquivo) {
  if (casa(SO_DO_COMPLEMENTO, arquivo)) return 'complemento';
  return ehDaExtensaoOuDoE2e(arquivo) ? 'e2e' : null;
}

function efeitoDe(arquivo) {
  if (casa(FORCAM_TUDO, arquivo)) return null;
  const lidos = { e2e: casa(LIDOS_PELO_E2E, arquivo), complemento: casa(FAZEM_RODAR_O_COMPLEMENTO, arquivo) };
  if (ehDocumentacao(arquivo)) return lidos;
  const dono = donoDoCodigo(arquivo);
  return dono === null ? null : { ...lidos, [dono]: true };
}

function selecionar(arquivos) {
  if (arquivos.length === 0) return { ...TUDO };
  const efeitos = arquivos.map(efeitoDe);
  if (efeitos.includes(null)) return { ...TUDO };
  return { e2e: efeitos.some(efeito => efeito.e2e), complemento: efeitos.some(efeito => efeito.complemento) };
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
