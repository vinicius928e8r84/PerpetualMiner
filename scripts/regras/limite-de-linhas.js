'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const id = 'limite-de-linhas';

const guarda = 'um arquivo de código não passa do teto de linhas';

const LIMITE = 1000;

const conserto = `Divida o arquivo por responsabilidade em módulos menores (no máximo ${LIMITE} linhas cada) e leve o código novo para um módulo novo, não para ele. `
  + 'A PR não edita scripts/regras/linha-de-base.json: o que encolher um arquivo da linha de base (ou o levar ao teto) é baixado depois do merge, por `node scripts/regras/baixar-no-merge.js`.';

const EXTENSOES = /\.(?:js|mjs|cjs|jsx|ts|tsx|py|html|css|sh|bash)$/;
const FORA = /^(?:docs|dist|build|coverage|node_modules|vendor|third_party)\/|(?:^|\/)(?:fixtures?|dist|node_modules|vendor|third_party)\/|\.min\.[^/]+$/;

const seAplica = arquivo => EXTENSOES.test(arquivo) && !FORA.test(arquivo);

const configuracao = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ganchos', 'limite-de-tokens.json'), 'utf8'));
const LINHAS_DO_CABECALHO = configuracao.linhasDoCabecalho;
const MARCAS_DE_GERADO = configuracao.marcasDeGerado;

function contarLinhas(fonte) {
  if (fonte === '') return 0;
  const quebras = fonte.split('\n').length - 1;
  return fonte.endsWith('\n') ? quebras : quebras + 1;
}

const ehGerado = fonte => {
  const cabecalho = fonte.split('\n').slice(0, LINHAS_DO_CABECALHO).join('\n');
  return MARCAS_DE_GERADO.some(marca => cabecalho.includes(marca));
};

const listasDasBases = new Map();
function naListaDaBase(raiz, base, arquivo) {
  if (!raiz || !base) return false;
  const chave = `${raiz}\0${base}`;
  if (!listasDasBases.has(chave)) {
    let lista = {};
    try {
      const texto = execFileSync('git', ['show', `${base}:scripts/regras/linha-de-base.json`], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      lista = JSON.parse(texto)[id] || {};
    } catch {}
    listasDasBases.set(chave, lista);
  }
  return arquivo in listasDasBases.get(chave);
}

const geradoForaDaLinhaDeBase = (arquivo, fonte, raiz, base) => ehGerado(fonte) && !naListaDaBase(raiz, base, arquivo);

function verificar(arquivo, fonte, raiz, base) {
  const linhas = contarLinhas(fonte);
  if (linhas <= LIMITE || geradoForaDaLinhaDeBase(arquivo, fonte, raiz, base)) return [];
  return Array.from({ length: linhas - LIMITE }, (_, i) => ({
    linha: LIMITE + 1 + i,
    detalhe: `a linha ${LIMITE + 1 + i} de ${linhas} passa do teto de ${LIMITE} linhas`,
  }));
}

function mensagem({ arquivo, tem, pode }) {
  const linhas = LIMITE + tem;
  const naLista = pode > 0
    ? `Ele já passava do limite quando a regra entrou e a linha de base o deixa em ${LIMITE + pode} linhas: não pode crescer.`
    : 'Ele não está na linha de base, e arquivo novo tem de caber no teto.';
  return [`✗ ${id} — ${arquivo}: ${linhas} linhas; o teto é ${LIMITE} (${tem} acima). ${naLista}`, `  Conserto: ${conserto}`].join('\n');
}

module.exports = { id, guarda, LIMITE, conserto, seAplica, verificar, mensagem, contarLinhas, folgaPresaAoArquivo: true };
