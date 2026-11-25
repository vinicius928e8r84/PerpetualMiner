'use strict';

const { semComentariosJs } = require('./comum');
const { linhasNovas } = require('./apoio-linhas-novas');

const id = 'sem-depuracao-nova';

const conserto = 'Tire a linha de depuração. O que o produto precisa registrar vai pelo registro que o módulo já tem (`console.info`/`console.warn`/`console.error` '
  + 'na extensão, o log do Anki no complemento); um teste que quer ver o valor usa `assert`. Um `.only` esquecido faz o CI rodar um teste só e passar verde. '
  + 'Ferramentas de linha de comando e testes podem imprimir (CAMINHOS_QUE_IMPRIMEM em scripts/regras/sem-depuracao-nova.js).';

const ehJs = arquivo => /\.(?:js|mjs|cjs)$/.test(arquivo);
const ehPython = arquivo => /\.py$/.test(arquivo);

const seAplica = arquivo => (ehJs(arquivo) || ehPython(arquivo)) && !/(?:^|\/)(?:node_modules|vendor|dist)\//.test(arquivo);

const CAMINHOS_QUE_IMPRIMEM = /^(?:scripts|testes|e2e|preview|\.agents|\.claude)\/|(?:^|\/)test_[^/]*$|\.(?:spec|test)\.[cm]?js$/;

const PADROES_JS = [
  { nome: 'debugger', regex: /\bdebugger\b/, imprime: false },
  { nome: '.only esquecido num teste', regex: /\b(?:it|test|describe)\.only\s*\(/, imprime: false },
  { nome: 'console.log', regex: /\bconsole\s*\.\s*(?:log|debug|trace|dir)\s*\(/, imprime: true },
];

const PADROES_PYTHON = [
  { nome: 'breakpoint()', regex: /\bbreakpoint\s*\(\s*\)/, imprime: false },
  { nome: 'depurador (pdb)', regex: /\b(?:i?pdb\.set_trace\s*\(|(?:import|from)\s+i?pdb\b)/, imprime: false },
  { nome: 'print de depuração', regex: /^\s*print\s*\(\s*(?:[A-Za-z_][\w.]*\s*(?:[,)]|$)|f?['"][^'"]*\b(?:debug|DEBUG|aqui|here|xxx)\b)/, imprime: true },
];

const TEXTOS_DE_UMA_LINHA = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

const semTextosJs = fonte => semComentariosJs(fonte).split('\n').map(linha => linha.replace(TEXTOS_DE_UMA_LINHA, texto => ' '.repeat(texto.length)));

const semComentariosPython = fonte => fonte.split('\n').map(linha => (/^\s*#/.test(linha) ? '' : linha));

function achadoDaLinha(arquivo, texto) {
  const imprime = CAMINHOS_QUE_IMPRIMEM.test(arquivo);
  const padroes = ehPython(arquivo) ? PADROES_PYTHON : PADROES_JS;
  return padroes.find(padrao => padrao.regex.test(texto) && !(imprime && padrao.imprime));
}

function verificar(arquivo, fonte, raiz, base) {
  const novas = linhasNovas(arquivo, raiz, base);
  const linhas = ehPython(arquivo) ? semComentariosPython(fonte) : semTextosJs(fonte);
  const achados = [];
  linhas.forEach((texto, indice) => {
    const padrao = novas.has(indice + 1) ? achadoDaLinha(arquivo, texto) : null;
    if (padrao) achados.push({ linha: indice + 1, detalhe: `${padrao.nome} novo` });
  });
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
