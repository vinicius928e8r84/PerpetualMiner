'use strict';

const NO_DE_ELEMENTO = 1;
const NO_DE_TEXTO = 3;
const SO_TEXTO = 4;
const CAIXA_VAZIA = Object.freeze({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });

const propriedadeDoAtributo = { id: 'id', class: 'className', type: 'type' };

function caixa(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

class ListaDeClasses {
  constructor(elemento) {
    this.elemento = elemento;
  }

  get nomes() {
    return String(this.elemento.className || '').split(/\s+/).filter(Boolean);
  }

  escrever(nomes) {
    this.elemento.className = nomes.join(' ');
  }

  contains(nome) {
    return this.nomes.includes(nome);
  }

  add(...nomes) {
    this.escrever([...new Set([...this.nomes, ...nomes])]);
  }

  remove(...nomes) {
    this.escrever(this.nomes.filter(nome => !nomes.includes(nome)));
  }

  toggle(nome, ligar = !this.contains(nome)) {
    if (ligar) this.add(nome);
    else this.remove(nome);
    return ligar;
  }
}

class Estilo {
  setProperty(nome, valor, prioridade = '') {
    this[nome] = prioridade ? `${valor} !${prioridade}` : valor;
  }
}

const PARTES_DO_COMPOSTO = /\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;

function lerComposto(texto) {
  const [, tag, resto] = /^([a-z0-9-]*)(.*)$/i.exec(texto);
  const partes = [...resto.matchAll(PARTES_DO_COMPOSTO)];
  if (partes.map(m => m[0]).join('') !== resto) throw new Error(`o DOM falso não lê o seletor ${texto}`);
  const classes = partes.filter(m => m[1]).map(m => m[1]);
  const atributos = partes.filter(m => !m[1]).map(m => (m[2] ? { nome: 'id', valor: m[2] } : { nome: m[3], valor: m[4] }));
  return { tag: tag.toLowerCase(), classes, atributos };
}

function lerSeletor(seletor) {
  return seletor.split(',').map(parte => {
    const pedacos = parte.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
    const passos = [];
    let combinador = ' ';
    for (const pedaco of pedacos) {
      if (pedaco === '>') combinador = '>';
      else passos.push({ composto: lerComposto(pedaco), combinador });
      if (pedaco !== '>') combinador = ' ';
    }
    return passos;
  });
}

function casaComComposto(elemento, { tag, classes, atributos }) {
  if (tag && elemento.localName !== tag) return false;
  if (!classes.every(nome => elemento.classList.contains(nome))) return false;
  return atributos.every(({ nome, valor }) => {
    const lido = elemento.getAttribute(nome);
    return valor === undefined ? lido !== null : lido === valor;
  });
}

function antepassadoQueCasa(elemento, passos, combinador) {
  for (let pai = elemento.parentElement; pai; pai = pai.parentElement) {
    if (casaComPassos(pai, passos)) return true;
    if (combinador === '>') return false;
  }
  return false;
}

function casaComPassos(elemento, passos) {
  const ultimo = passos[passos.length - 1];
  if (!casaComComposto(elemento, ultimo.composto)) return false;
  if (passos.length === 1) return true;
  return antepassadoQueCasa(elemento, passos.slice(0, -1), ultimo.combinador);
}

class No {
  constructor(documento) {
    this.ownerDocument = documento;
    this.childNodes = [];
    this.parentNode = null;
  }

  get children() {
    return this.childNodes.filter(no => no.nodeType === NO_DE_ELEMENTO);
  }

  get parentElement() {
    return this.parentNode instanceof Elemento ? this.parentNode : null;
  }

  get isConnected() {
    let no = this;
    while (no.parentNode || no.host) no = no.parentNode || no.host;
    return no === this.ownerDocument;
  }

  get textContent() {
    return this.childNodes.map(no => no.textContent).join('');
  }

  set textContent(texto) {
    this.replaceChildren();
    if (String(texto)) this.append(String(texto));
  }

  append(...filhos) {
    for (const filho of filhos) this.insertBefore(filho, null);
  }

  insertBefore(filho, referencia) {
    const no = typeof filho === 'object' ? filho : this.ownerDocument.createTextNode(String(filho));
    no.remove();
    const posicao = referencia ? this.childNodes.indexOf(referencia) : -1;
    this.childNodes.splice(posicao < 0 ? this.childNodes.length : posicao, 0, no);
    no.parentNode = this;
    return no;
  }

  before(...nos) {
    for (const no of nos) this.parentNode.insertBefore(no, this);
  }

  remove() {
    if (!this.parentNode) return;
    const irmaos = this.parentNode.childNodes;
    irmaos.splice(irmaos.indexOf(this), 1);
    this.parentNode = null;
  }

  replaceChildren(...filhos) {
    for (const filho of [...this.childNodes]) filho.remove();
    this.append(...filhos);
  }

  contains(outro) {
    for (let no = outro; no; no = no.parentNode) if (no === this) return true;
    return false;
  }

  descendentes() {
    return this.childNodes.flatMap(no => [no, ...no.descendentes()]);
  }

  querySelectorAll(seletor) {
    const alternativas = lerSeletor(seletor);
    return this.descendentes().filter(no => no.nodeType === NO_DE_ELEMENTO
      && alternativas.some(passos => casaComPassos(no, passos)));
  }

  querySelector(seletor) {
    return this.querySelectorAll(seletor)[0] || null;
  }
}

class Texto extends No {
  constructor(documento, data) {
    super(documento);
    this.nodeType = NO_DE_TEXTO;
    this.data = data;
    this.desenho = null;
  }

  get length() {
    return this.data.length;
  }

  get textContent() {
    return this.data;
  }

  descendentes() {
    return [];
  }
}

class Elemento extends No {
  constructor(documento, tag) {
    super(documento);
    this.nodeType = NO_DE_ELEMENTO;
    this.localName = tag.toLowerCase();
    this.className = '';
    this.atributos = new Map();
    this.dataset = {};
    this.classList = new ListaDeClasses(this);
    this.style = new Estilo();
    this.ouvintes = [];
  }

  setAttribute(nome, valor) {
    this.atributos.set(nome, String(valor));
  }

  getAttribute(nome) {
    if (this.atributos.has(nome)) return this.atributos.get(nome);
    if (nome.startsWith('data-')) return this.dataset[nome.slice(5)] ?? null;
    const propriedade = propriedadeDoAtributo[nome];
    return propriedade && this[propriedade] ? String(this[propriedade]) : null;
  }

  hasAttribute(nome) {
    return this.getAttribute(nome) !== null;
  }

  removeAttribute(nome) {
    this.atributos.delete(nome);
    if (nome === 'style') this.style = new Estilo();
  }

  addEventListener(tipo, funcao, opcoes) {
    this.ouvintes.push({ tipo, funcao, umaVez: Boolean(opcoes?.once) });
  }

  disparar(tipo, dados = {}) {
    const evento = { type: tipo, target: this, padraoImpedido: false, preventDefault() { this.padraoImpedido = true; }, stopPropagation() {}, ...dados };
    for (const ouvinte of this.ouvintes.filter(o => o.tipo === tipo)) {
      if (ouvinte.umaVez) this.ouvintes.splice(this.ouvintes.indexOf(ouvinte), 1);
      ouvinte.funcao(evento);
    }
    return evento;
  }

  matches(seletor) {
    return lerSeletor(seletor).some(passos => casaComPassos(this, passos));
  }

  closest(seletor) {
    for (let no = this; no; no = no.parentElement) if (no.matches(seletor)) return no;
    return null;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  attachShadow() {
    this.shadowRoot = new Sombra(this.ownerDocument, this);
    return this.shadowRoot;
  }

  getBoundingClientRect() {
    const achada = this.ownerDocument.caixas.find(([seletor]) => this.matches(seletor));
    return achada ? achada[1] : CAIXA_VAZIA;
  }
}

class Sombra extends No {
  constructor(documento, host) {
    super(documento);
    this.host = host;
  }
}

function linhasDoTrecho(no, inicio, fim) {
  const { left, top, altura, largura, porLinha = Infinity } = no.desenho;
  const linhas = [];
  for (let de = inicio; de < fim; de = (Math.floor(de / porLinha) + 1) * porLinha) {
    const ate = Math.min(fim, (Math.floor(de / porLinha) + 1) * porLinha);
    const coluna = de % porLinha;
    linhas.push(caixa(left + coluna * largura, top + Math.floor(de / porLinha) * altura, (ate - de) * largura, altura));
  }
  return linhas;
}

class Faixa {
  constructor(documento) {
    this.documento = documento;
  }

  setStart(no, posicao) {
    this.startContainer = no;
    this.startOffset = posicao;
  }

  setEnd(no, posicao) {
    this.endContainer = no;
    this.endOffset = posicao;
  }

  get commonAncestorContainer() {
    for (let no = this.startContainer; no; no = no.parentNode) if (no.contains(this.endContainer)) return no;
    return null;
  }

  intersectsNode(no) {
    const textos = this.documento.textosEmOrdem();
    const posicao = textos.indexOf(no);
    return posicao >= textos.indexOf(this.startContainer) && posicao <= textos.indexOf(this.endContainer);
  }

  getClientRects() {
    if (this.startContainer !== this.endContainer) throw new Error('o DOM falso só desenha uma faixa dentro de um texto');
    return linhasDoTrecho(this.startContainer, this.startOffset, this.endOffset);
  }
}

class Andador {
  constructor(raiz) {
    this.textos = raiz.descendentes().filter(no => no.nodeType === NO_DE_TEXTO);
    this.proximo = 0;
  }

  nextNode() {
    return this.textos[this.proximo++] || null;
  }
}

class DocumentoFalso extends No {
  constructor() {
    super(null);
    this.ownerDocument = this;
    this.documentElement = this.createElement('html');
    this.body = this.createElement('body');
    this.append(this.documentElement);
    this.documentElement.append(this.body);
    this.activeElement = this.body;
    this.caixas = [];
    this.ouvintes = [];
    this.fonts = { add() {} };
  }

  createElement(tag) {
    return new Elemento(this, tag);
  }

  createElementNS(espaco, tag) {
    return new Elemento(this, tag);
  }

  createTextNode(texto) {
    return new Texto(this, String(texto));
  }

  createRange() {
    return new Faixa(this);
  }

  createTreeWalker(raiz) {
    return new Andador(raiz);
  }

  textosEmOrdem() {
    return this.descendentes().filter(no => no.nodeType === NO_DE_TEXTO);
  }

  getElementById(id) {
    return this.descendentes().find(no => no.id === id) || null;
  }

  addEventListener(tipo, funcao) {
    this.ouvintes.push({ tipo, funcao });
  }

  disparar(tipo, dados = {}) {
    for (const { funcao } of this.ouvintes.filter(o => o.tipo === tipo)) funcao({ type: tipo, ...dados });
  }
}

const GLOBAIS_DO_DOM = { Node: { TEXT_NODE: NO_DE_TEXTO, ELEMENT_NODE: NO_DE_ELEMENTO }, NodeFilter: { SHOW_TEXT: SO_TEXTO } };

module.exports = { DocumentoFalso, GLOBAIS_DO_DOM, caixa };
