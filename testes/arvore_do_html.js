'use strict';

const crypto = require('crypto');

const SEM_FECHAR = new Set(['input', 'br', 'img', 'meta', 'link', 'hr']);
const SO_TEXTO = new Set(['script', 'style']);
const PEDACO = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/gi;
const ATRIBUTO = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function atributosDe(texto) {
  const atributos = {};
  for (const [, nome, aspas, simples, solto] of texto.matchAll(ATRIBUTO)) atributos[nome.toLowerCase()] = aspas ?? simples ?? solto ?? '';
  return atributos;
}

const noNovo = (tag, atributos) => ({ tag: tag.toLowerCase(), atributos: atributosDe(atributos), filhos: [] });
const fechaSozinha = (no, pedaco) => SEM_FECHAR.has(no.tag) || pedaco.endsWith('/>');

function abrirTag(estado, [pedaco, , tag, atributos]) {
  const no = noNovo(tag, atributos);
  estado.pilha.at(-1).filhos.push(no);
  if (SO_TEXTO.has(no.tag)) estado.ate = no.tag;
  if (SO_TEXTO.has(no.tag) || !fechaSozinha(no, pedaco)) estado.pilha.push(no);
}

function dentroDoScript(estado, fecha) {
  if (fecha?.toLowerCase() !== estado.ate) return;
  estado.pilha.pop();
  estado.ate = null;
}

function tratarPedaco(estado, pedaco) {
  const [, fecha, abre, , solto] = pedaco;
  if (estado.ate) dentroDoScript(estado, fecha);
  else if (fecha) estado.pilha.pop();
  else if (abre) abrirTag(estado, pedaco);
  else if (solto?.trim()) estado.pilha.at(-1).filhos.push(solto.trim().replace(/\s+/g, ' '));
}

function lerHtml(texto) {
  const raiz = { tag: '#raiz', atributos: {}, filhos: [] };
  const estado = { pilha: [raiz], ate: null };
  for (const pedaco of texto.matchAll(PEDACO)) tratarPedaco(estado, pedaco);
  return raiz;
}

function acharTodos(no, serve, achados = []) {
  if (typeof no === 'string') return achados;
  if (serve(no)) achados.push(no);
  for (const filho of no.filhos) acharTodos(filho, serve, achados);
  return achados;
}

function canonicaDoFalso(no) {
  if (no.nodeType === 3) return no.data.trim().replace(/\s+/g, ' ');
  const atributos = Object.fromEntries(no.atributos.entries());
  if (no.className) atributos.class = no.className;
  const filhos = no.childNodes.map(canonicaDoFalso).filter(filho => filho !== '');
  return { tag: no.localName, atributos, filhos };
}

function ordenada(no) {
  if (typeof no === 'string') return no;
  return { tag: no.tag, atributos: Object.fromEntries(Object.entries(no.atributos).sort()), filhos: no.filhos.map(ordenada) };
}

const impressaoDigital = no => crypto.createHash('sha256').update(JSON.stringify(ordenada(no))).digest('hex');

module.exports = { lerHtml, acharTodos, canonicaDoFalso, impressaoDigital };
