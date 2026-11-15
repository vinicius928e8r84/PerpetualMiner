'use strict';

// Um arquivo de código tem no máximo 1.000 linhas. Acima disso ele deixa de caber na cabeça de quem o abre e
// vira o lugar onde toda mudança esbarra na de outro PR (painel.css 3.163 linhas, painel.js 1.894 quando a regra
// entrou). A regra acusa o arquivo de código (JS, TS, Python, HTML, CSS e shell) com mais de LIMITE linhas.
//
// Fora da conta: documentação (docs/), pastas de fixtures, saída de build e cópia de terceiros (dist/, build/,
// coverage/, node_modules/, vendor/, third_party/), arquivo minificado (*.min.*) e o que traz a marca de gerado
// nas primeiras linhas (`@generated`, `DO NOT EDIT`, `Code generated`, as mesmas de scripts/ganchos/limite-de-tokens.json),
// menos o arquivo que a linha de base da main já tem na lista (a marca não o tira dela).
// Trava de pacotes e dado (JSON, Markdown) nem têm a extensão.
//
// A catraca é a de scripts/regras/linha-de-base.json, contada em linhas ACIMA do teto: o arquivo que já passava de 1.000
// quando a regra entrou tem ali o excesso que tinha; ele não pode crescer (o excesso sobe, a regra falha), e a linha
// de base tem de descer junto com ele (`--atualizar`) para o teto de cada um ser sempre o tamanho de hoje. Ao cair
// para 1.000 ou menos, o arquivo sai da lista. Um arquivo novo, ou fora da lista, falha acima de 1.000.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const id = 'limite-de-linhas';

const LIMITE = 1000;

const conserto = `Divida o arquivo por responsabilidade em módulos menores (no máximo ${LIMITE} linhas cada) e leve o código novo para um módulo novo, não para ele. `
  + 'Depois de encolher um arquivo da linha de base (ou de levá-lo ao teto), rode `node scripts/regras/verificar.js --atualizar` e versione scripts/regras/linha-de-base.json.';

const EXTENSOES = /\.(?:js|mjs|cjs|jsx|ts|tsx|py|html|css|sh|bash)$/;
const FORA = /^(?:docs|dist|build|coverage|node_modules|vendor|third_party)\/|(?:^|\/)(?:fixtures?|dist|node_modules|vendor|third_party)\/|\.min\.[^/]+$/;

const seAplica = arquivo => EXTENSOES.test(arquivo) && !FORA.test(arquivo);

const configuracao = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ganchos', 'limite-de-tokens.json'), 'utf8'));
const LINHAS_DO_CABECALHO = configuracao.linhasDoCabecalho;
const MARCAS_DE_GERADO = configuracao.marcasDeGerado;

/** As linhas do arquivo: a última quebra de linha fecha a última linha, não abre uma nova (o mesmo que `wc -l`, com a última linha sem quebra contada). */
function contarLinhas(fonte) {
  if (fonte === '') return 0;
  const quebras = fonte.split('\n').length - 1;
  return fonte.endsWith('\n') ? quebras : quebras + 1;
}

const ehGerado = fonte => {
  const cabecalho = fonte.split('\n').slice(0, LINHAS_DO_CABECALHO).join('\n');
  return MARCAS_DE_GERADO.some(marca => cabecalho.includes(marca));
};

// Os arquivos que a linha de base da --base (a main) já tem na lista: a marca de gerado não os isenta, senão
// bastaria escrever `DO NOT EDIT` no topo para um deles crescer e sair da lista. null sem base, sem git ou sem lista.
const listasDasBases = new Map();
function naListaDaBase(raiz, base, arquivo) {
  if (!raiz || !base) return false;
  const chave = `${raiz}\0${base}`;
  if (!listasDasBases.has(chave)) {
    let lista = {};
    try {
      const texto = execFileSync('git', ['show', `${base}:scripts/regras/linha-de-base.json`], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      lista = JSON.parse(texto)[id] || {};
    } catch { /* a base não tem a linha de base (ou a regra): nada na lista */ }
    listasDasBases.set(chave, lista);
  }
  return arquivo in listasDasBases.get(chave);
}

// Uma ocorrência por linha acima do teto (a de número LIMITE + 1 em diante): o que a linha de base conta.
function verificar(arquivo, fonte, raiz, base) {
  const linhas = contarLinhas(fonte);
  if (linhas <= LIMITE || (ehGerado(fonte) && !naListaDaBase(raiz, base, arquivo))) return [];
  return Array.from({ length: linhas - LIMITE }, (_, i) => ({
    linha: LIMITE + 1 + i,
    detalhe: `a linha ${LIMITE + 1 + i} de ${linhas} passa do teto de ${LIMITE} linhas`,
  }));
}

/** O erro de um arquivo (o que verificar.js mostra no lugar do texto padrão): o arquivo, a contagem, o teto. */
function mensagem({ arquivo, tem, pode }) {
  const linhas = LIMITE + tem;
  const naLista = pode > 0
    ? `Ele já passava do limite quando a regra entrou e a linha de base o deixa em ${LIMITE + pode} linhas: não pode crescer.`
    : 'Ele não está na linha de base, e arquivo novo tem de caber no teto.';
  return [`✗ ${id} — ${arquivo}: ${linhas} linhas; o teto é ${LIMITE} (${tem} acima). ${naLista}`, `  Conserto: ${conserto}`].join('\n');
}

/** O arquivo da lista que encolheu: a linha de base tem de descer com ele, para não sobrar folga para crescer de novo. */
function mensagemDeFolga({ arquivo, tem, pode }) {
  const o = tem === 0
    ? `ficou em ${LIMITE} linhas ou menos: tire-o da linha de base`
    : `tem ${LIMITE + tem} linhas e a linha de base ainda o deixa em ${LIMITE + pode}: baixe-a`;
  return `✗ ${id} — ${arquivo} ${o}. Rode \`node scripts/regras/verificar.js --atualizar\` e versione scripts/regras/linha-de-base.json: o teto de cada arquivo da lista é o tamanho que ele tem hoje.`;
}

module.exports = { id, LIMITE, conserto, seAplica, verificar, mensagem, mensagemDeFolga, contarLinhas, baixarObrigatorio: true };
