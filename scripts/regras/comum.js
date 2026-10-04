'use strict';

// O que as regras de scripts/regras/ compartilham: quais arquivos olhar, como
// tirar os comentários antes de procurar um padrão e em que linha está um
// trecho. Cada regra fica no seu arquivo; verificar.js as roda.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/** Os arquivos do repositório (versionados e novos ainda não ignorados), com `/`. */
function arquivosDoRepositorio(raiz) {
  const saida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(saida.split('\0').filter(Boolean))]
    .filter(arquivo => fs.existsSync(path.join(raiz, arquivo)))
    .sort();
}

// O código da extensão que roda no Chrome: os .js da raiz (menos os test_*.js),
// lib/ (menos os bundles do Firebase, que ninguém carrega) e veio/.
function ehJsDaExtensao(arquivo) {
  if (/^[^/]+\.js$/.test(arquivo)) return !/^test_/.test(arquivo);
  if (arquivo.startsWith('lib/firebase/')) return false;
  return /^(lib|veio)\/.+\.js$/.test(arquivo);
}

/** O número da linha (a partir de 1) do caractere `indice`. */
function linhaDe(texto, indice) {
  let linha = 1;
  for (let i = 0; i < indice; i++) if (texto.charCodeAt(i) === 10) linha++;
  return linha;
}

// Troca cada caractere de um comentário por espaço, mantendo as quebras de linha,
// para os índices e as linhas continuarem os mesmos do arquivo original.
function apagar(trecho) {
  return trecho.replace(/[^\n]/g, ' ');
}

/** JavaScript sem comentários; strings, templates e regex ficam como estão. */
function semComentariosJs(fonte) {
  let saida = '';
  let anterior = '';
  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i];
    const d = fonte[i + 1];
    if (c === '/' && d === '/') {
      const fim = fonte.indexOf('\n', i);
      const ate = fim < 0 ? fonte.length : fim;
      saida += apagar(fonte.slice(i, ate));
      i = ate;
      continue;
    }
    if (c === '/' && d === '*') {
      const fim = fonte.indexOf('*/', i + 2);
      const ate = fim < 0 ? fonte.length : fim + 2;
      saida += apagar(fonte.slice(i, ate));
      i = ate;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < fonte.length && fonte[j] !== c) j += fonte[j] === '\\' ? 2 : 1;
      saida += fonte.slice(i, j + 1);
      anterior = c;
      i = j + 1;
      continue;
    }
    const comecaRegex = c === '/' && (anterior === '' || '(,=:[!&|?{};+-*%<>~^'.includes(anterior)
      || /\b(return|typeof|case|in|of)\s*$/.test(saida));
    if (comecaRegex) {
      let j = i + 1;
      let naClasse = false;
      while (j < fonte.length && fonte[j] !== '\n') {
        if (fonte[j] === '\\') { j += 2; continue; }
        if (fonte[j] === '[') naClasse = true;
        else if (fonte[j] === ']') naClasse = false;
        else if (fonte[j] === '/' && !naClasse) break;
        j++;
      }
      saida += fonte.slice(i, j + 1);
      anterior = '/';
      i = j + 1;
      continue;
    }
    saida += c;
    if (!/\s/.test(c)) anterior = c;
    i++;
  }
  return saida;
}

/** CSS sem comentários, com as mesmas linhas. */
function semComentariosCss(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, apagar);
}

/** Onde fecha o parêntese que abre em `abre` (o índice do `(`); -1 se não fecha. */
function fechamento(texto, abre) {
  const par = { '(': ')', '{': '}', '[': ']' };
  const pilha = [];
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < texto.length && texto[j] !== c) j += texto[j] === '\\' ? 2 : 1;
      i = j;
      continue;
    }
    if (par[c]) pilha.push(par[c]);
    else if (c === ')' || c === '}' || c === ']') {
      if (pilha.pop() !== c) return -1;
      if (pilha.length === 0) return i;
    }
  }
  return -1;
}

module.exports = {
  arquivosDoRepositorio, ehJsDaExtensao, linhaDe, semComentariosJs, semComentariosCss, fechamento,
};
