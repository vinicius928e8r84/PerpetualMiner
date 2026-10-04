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

/** O índice da aspa que fecha a string que abre em `i` (ou o fim do texto). */
function fimDaString(texto, i) {
  const aspa = texto[i];
  let j = i + 1;
  while (j < texto.length && texto[j] !== aspa) j += texto[j] === '\\' ? 2 : 1;
  return Math.min(j, texto.length - 1);
}

// O JavaScript separado em código (comentários apagados) e os trechos de
// comentário ([início, fim)); strings, templates e regex ficam no código.
function separarJs(fonte) {
  let codigo = '';
  const comentarios = [];
  let anterior = '';
  let i = 0;
  const comentario = ate => {
    comentarios.push([i, ate]);
    codigo += apagar(fonte.slice(i, ate));
    i = ate;
  };
  while (i < fonte.length) {
    const c = fonte[i];
    const d = fonte[i + 1];
    if (c === '/' && d === '/') {
      const fim = fonte.indexOf('\n', i);
      comentario(fim < 0 ? fonte.length : fim);
      continue;
    }
    if (c === '/' && d === '*') {
      const fim = fonte.indexOf('*/', i + 2);
      comentario(fim < 0 ? fonte.length : fim + 2);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const fim = fimDaString(fonte, i);
      codigo += fonte.slice(i, fim + 1);
      anterior = c;
      i = fim + 1;
      continue;
    }
    const comecaRegex = c === '/' && (anterior === '' || '(,=:[!&|?{};+-*%<>~^'.includes(anterior)
      || /\b(return|typeof|case|in|of)\s*$/.test(codigo));
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
      codigo += fonte.slice(i, j + 1);
      anterior = '/';
      i = j + 1;
      continue;
    }
    codigo += c;
    if (!/\s/.test(c)) anterior = c;
    i++;
  }
  return { codigo, comentarios };
}

/** JavaScript sem comentários; strings, templates e regex ficam como estão. */
function semComentariosJs(fonte) {
  return separarJs(fonte).codigo;
}

const COMENTARIO_CSS = /\/\*[\s\S]*?\*\//g;

/** CSS sem comentários, com as mesmas linhas. */
function semComentariosCss(fonte) {
  return fonte.replace(COMENTARIO_CSS, apagar);
}

const trechos = (texto, regex, deslocamento = 0) =>
  [...texto.matchAll(regex)].map(m => [deslocamento + m.index, deslocamento + m.index + m[0].length]);

// Os comentários de Python: `#` fora de string, de uma linha ou de três aspas.
function comentariosPy(fonte) {
  const comentarios = [];
  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i];
    if (c === '#') {
      const fim = fonte.indexOf('\n', i);
      const ate = fim < 0 ? fonte.length : fim;
      comentarios.push([i, ate]);
      i = ate;
    } else if (c === '"' || c === "'") {
      const tripla = fonte.slice(i, i + 3) === c.repeat(3);
      if (tripla) {
        const fim = fonte.indexOf(c.repeat(3), i + 3);
        i = fim < 0 ? fonte.length : fim + 3;
      } else {
        let j = i + 1;
        while (j < fonte.length && fonte[j] !== c && fonte[j] !== '\n') j += fonte[j] === '\\' ? 2 : 1;
        i = j + 1;
      }
    } else i++;
  }
  return comentarios;
}

/**
 * O texto dos comentários de verdade de cada linha (Map linha → texto). Só ali
 * vale uma exceção ou a marca de uma exceção de teste: uma string que contém
 * as mesmas palavras não conta.
 */
function comentariosPorLinha(arquivo, fonte) {
  let comentarios = [];
  if (/\.(js|mjs|cjs)$/.test(arquivo)) comentarios = separarJs(fonte).comentarios;
  else if (arquivo.endsWith('.css')) comentarios = trechos(fonte, COMENTARIO_CSS);
  else if (arquivo.endsWith('.py')) comentarios = comentariosPy(fonte);
  else if (arquivo.endsWith('.html')) {
    comentarios = trechos(fonte, /<!--[\s\S]*?-->/g);
    for (const m of fonte.matchAll(/(<style[^>]*>)([\s\S]*?)<\/style>/g)) {
      comentarios.push(...trechos(m[2], COMENTARIO_CSS, m.index + m[1].length));
    }
    for (const m of fonte.matchAll(/(<script[^>]*>)([\s\S]*?)<\/script>/g)) {
      comentarios.push(...separarJs(m[2]).comentarios.map(([de, ate]) => [de + m.index + m[1].length, ate + m.index + m[1].length]));
    }
  }
  const porLinha = new Map();
  let linha = 1;
  let ondeEstou = 0;
  for (const [de, ate] of comentarios.sort((a, b) => a[0] - b[0])) {
    linha += linhaDe(fonte.slice(ondeEstou, de), de - ondeEstou) - 1;
    ondeEstou = de;
    fonte.slice(de, ate).split('\n').forEach((pedaco, i) => {
      if (i > 0) { linha++; }
      porLinha.set(linha, `${porLinha.get(linha) || ''} ${pedaco}`.trim());
    });
    linha -= fonte.slice(de, ate).split('\n').length - 1;
  }
  return porLinha;
}

/** Onde fecha o parêntese que abre em `abre` (o índice do `(`); -1 se não fecha. */
function fechamento(texto, abre) {
  const par = { '(': ')', '{': '}', '[': ']' };
  const pilha = [];
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === '`') {
      i = fimDaString(texto, i);
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
  arquivosDoRepositorio, ehJsDaExtensao, linhaDe, semComentariosJs, semComentariosCss, comentariosPorLinha, fechamento,
};
