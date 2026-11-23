'use strict';

const SEM_FILHOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const PEDACOS = /<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
const ATRIBUTOS = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function lerAtributos(texto) {
  return [...texto.matchAll(ATRIBUTOS)].map(([, nome, aspas, apostrofos, solto]) => [nome, aspas ?? apostrofos ?? solto ?? '']);
}

function lerHtml(texto) {
  const raiz = { tag: '#raiz', atributos: [], filhos: [] };
  const abertos = [raiz];
  for (const [pedaco, fecha, abre, atributos, solto] of texto.matchAll(PEDACOS)) {
    const atual = abertos[abertos.length - 1];
    if (fecha) abertos.pop();
    else if (abre) {
      const no = { tag: abre.toLowerCase(), atributos: lerAtributos(atributos), filhos: [] };
      atual.filhos.push(no);
      if (!SEM_FILHOS.has(no.tag) && !pedaco.endsWith('/>')) abertos.push(no);
    } else if (solto !== undefined) atual.filhos.push(solto);
  }
  return raiz;
}

function acharNo(no, tag, atributo, valor) {
  if (typeof no === 'string') return null;
  if (no.tag === tag && no.atributos.some(([n, v]) => n === atributo && v === valor)) return no;
  for (const filho of no.filhos) {
    const achado = acharNo(filho, tag, atributo, valor);
    if (achado) return achado;
  }
  return null;
}

function doElementoFalso(elemento) {
  const atributos = [...elemento.atributos];
  if (elemento.className) atributos.push(['class', elemento.className]);
  const filhos = elemento.childNodes.map(filho => (filho.nodeType === 3 ? filho.data : doElementoFalso(filho)));
  return { tag: elemento.localName, atributos, filhos };
}

const textoLimpo = texto => texto.replace(/\s+/g, ' ').trim();

function linhas(no, fundo = 0) {
  const recuo = '  '.repeat(fundo);
  if (typeof no === 'string') return textoLimpo(no) ? [`${recuo}"${textoLimpo(no)}"`] : [];
  const atributos = [...no.atributos].sort(([a], [b]) => (a < b ? -1 : 1)).map(([n, v]) => ` ${n}="${v}"`).join('');
  return [`${recuo}${no.tag}${atributos}`, ...no.filhos.flatMap(filho => linhas(filho, fundo + 1))];
}

const retrato = no => `${linhas(no).join('\n')}\n`;

module.exports = { lerHtml, acharNo, doElementoFalso, retrato };
