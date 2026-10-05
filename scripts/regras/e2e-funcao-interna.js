'use strict';

// Um teste e2e confere o que a pessoa vê e o que fica gravado, nunca uma função
// interna (CODING_STANDARDS.md regra 8; CLAUDE.md § Testing). As três exceções
// levam um comentário que as nomeia, e a revisão cobrou esse comentário ou a
// conferência pela tela na C1 (#129, S1 e S2), em d2ab0da ("nenhum lê mais
// constante interna") e no #185 (um teste que só chama uma função do fake).
// Esta regra acusa o `evaluate` que chama o código da extensão sem dizer qual
// exceção usa.

const fs = require('fs');
const path = require('path');
const { comentariosPorLinha, ehJsDaExtensao, fechamento, linhaDe, semComentariosJs } = require('./comum');

const id = 'e2e-funcao-interna';

const EXCECOES = ['chrome-nativo', 'catálogo', 'componente-base'];

const conserto = 'Confira pela tela (locators) e pelo que ficou gravado (`extensao.lerStorage`, `extensao.frases()`), '
  + 'não chamando o código da extensão num `evaluate`. Se for uma das três exceções de CLAUDE.md § Testing, '
  + 'diga qual no comentário logo acima, seguido do porquê: `// Exceção de teste: chrome-nativo|catálogo|componente-base (CLAUDE.md § Testing).` '
  + '(CODING_STANDARDS.md regra 8).';

const seAplica = arquivo => /^e2e\/tests\/.+\.spec\.js$/.test(arquivo);

// As funções globais do código da extensão (as `function` do primeiro nível).
const globaisPorRaiz = new Map();
function funcoesDaExtensao(raiz) {
  if (globaisPorRaiz.has(raiz)) return globaisPorRaiz.get(raiz);
  const globais = new Set();
  globaisPorRaiz.set(raiz, globais);
  for (const pasta of ['.', 'lib', 'lib/voz', 'veio']) {
    if (!fs.existsSync(path.join(raiz, pasta))) continue;
    for (const nome of fs.readdirSync(path.join(raiz, pasta))) {
      const arquivo = pasta === '.' ? nome : `${pasta}/${nome}`;
      if (!ehJsDaExtensao(arquivo)) continue;
      const fonte = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
      for (const m of fonte.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) globais.add(m[1]);
    }
  }
  return globais;
}

const MARCA = new RegExp(`Exceção de teste:\\s*(${EXCECOES.join('|')})\\b`);

// O comentário que nomeia a exceção vale se estiver no próprio evaluate ou nas
// linhas de comentário logo acima da instrução que o contém. Só comentário de
// verdade conta: uma string com as mesmas palavras não nomeia exceção nenhuma.
// Subindo, uma linha de código é o começo da mesma instrução (um `const x = await`)
// só se não terminar uma instrução ou um bloco: a instrução anterior, já fechada
// com `;`, não empresta o seu comentário.
function anotado(comentarios, codigo, primeira, ultima) {
  const marcada = linha => MARCA.test(comentarios.get(linha) || '');
  for (let linha = primeira; linha <= ultima; linha++) if (marcada(linha)) return true;
  for (let linha = primeira - 1, vistas = 0; linha >= 1 && vistas < 12; linha--, vistas++) {
    if (marcada(linha)) return true;
    const instrucao = (codigo[linha - 1] || '').trim();
    if (instrucao === '') continue; // linha em branco ou só de comentário
    if (/[;{}]$/.test(instrucao)) break;
  }
  return false;
}

function verificar(arquivo, fonte, raiz = process.cwd()) {
  const nomes = funcoesDaExtensao(raiz);
  const codigo = semComentariosJs(fonte);
  const linhasDeCodigo = codigo.split('\n');
  const comentarios = comentariosPorLinha(arquivo, fonte);
  const achados = [];
  for (const m of codigo.matchAll(/\.evaluate(?:Handle)?\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const fecha = fechamento(codigo, abre);
    if (fecha < 0) continue;
    const corpo = codigo.slice(abre + 1, fecha);
    const usadas = new Set();
    for (const c of corpo.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) if (nomes.has(c[1])) usadas.add(`${c[1]}()`);
    for (const c of corpo.matchAll(/\bPerpetualMiner((?:\.[A-Za-z_$][\w$]*)+)/g)) usadas.add(`PerpetualMiner${c[1]}`);
    if (usadas.size === 0) continue;
    const primeira = linhaDe(codigo, m.index);
    if (anotado(comentarios, linhasDeCodigo, primeira, linhaDe(codigo, fecha))) continue;
    achados.push({ linha: primeira, detalhe: `evaluate chama o código da extensão: ${[...usadas].join(', ')}` });
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar, EXCECOES };
