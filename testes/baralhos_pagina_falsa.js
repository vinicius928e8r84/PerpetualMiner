'use strict';

const SELETOR_DE_DADO = /^\[data-(\w+)(?:="(.*)")?\]$/;
const PARTES_DO_SELETOR = /(?:\[[^\]]*\]|[^\s[])+/g;

class ListaDeClasses {
  constructor(no) {
    this.no = no;
  }

  toggle(nome, ligar) {
    const atuais = new Set(this.no.className.split(' ').filter(Boolean));
    if (ligar) atuais.add(nome);
    else atuais.delete(nome);
    this.no.className = [...atuais].join(' ');
  }
}

function casaUmaParte(no, parte) {
  if (parte.startsWith('#')) return no.id === parte.slice(1);
  if (parte.startsWith('.')) return no.className.split(' ').includes(parte.slice(1));
  const [, chave, valor] = SELETOR_DE_DADO.exec(parte);
  if (valor === undefined) return chave in no.dataset;
  return no.dataset[chave] === valor;
}

function algumAncestralCasa(no, partes) {
  for (let acima = no.pai; acima; acima = acima.pai) {
    if (casaAsPartes(acima, partes)) return true;
  }
  return false;
}

function casaAsPartes(no, partes) {
  if (!casaUmaParte(no, partes[partes.length - 1])) return false;
  if (partes.length === 1) return true;
  return algumAncestralCasa(no, partes.slice(0, -1));
}

class No {
  constructor(documento, tag, espaco = null) {
    Object.assign(this, { documento, tag, espaco, className: '', id: '', pai: null, nos: [] });
    Object.assign(this, { atributos: new Map(), dataset: {}, style: {}, ouvintes: [] });
    this.classList = new ListaDeClasses(this);
  }

  get children() {
    return this.nos.filter(no => no instanceof No);
  }

  adotar(filho) {
    if (!(filho instanceof No)) {
      this.nos.push(String(filho));
      return;
    }
    filho.pai?.soltar(filho);
    filho.pai = this;
    this.nos.push(filho);
  }

  soltar(filho) {
    this.nos = this.nos.filter(no => no !== filho);
    filho.pai = null;
  }

  append(...filhos) {
    for (const filho of filhos) this.adotar(filho);
  }

  replaceChildren(...filhos) {
    for (const filho of this.children) this.soltar(filho);
    this.nos = [];
    this.append(...filhos);
  }

  set textContent(texto) {
    this.replaceChildren(String(texto));
  }

  get textContent() {
    return this.nos.map(no => (no instanceof No ? no.textContent : no)).join('');
  }

  setAttribute(nome, valor) {
    this.atributos.set(nome, String(valor));
  }

  addEventListener(tipo, ouvinte) {
    this.ouvintes.push({ tipo, ouvinte });
  }

  disparar(tipo, evento = {}) {
    for (const ouvido of this.ouvintes.filter(registro => registro.tipo === tipo)) ouvido.ouvinte(evento);
  }

  focus() {
    this.documento.activeElement = this;
  }

  descendentes() {
    return this.children.flatMap(no => [no, ...no.descendentes()]);
  }

  casa(seletor) {
    return casaAsPartes(this, seletor.match(PARTES_DO_SELETOR));
  }

  querySelector(seletor) {
    return this.descendentes().find(no => no.casa(seletor)) || null;
  }

  closest(seletor) {
    for (let no = this; no; no = no.pai) {
      if (no.casa(seletor)) return no;
    }
    return null;
  }
}

class DocumentoFalso {
  constructor() {
    this.activeElement = null;
    this.porId = new Map();
    this.ouvintes = [];
  }

  createElement(tag) {
    return new No(this, tag);
  }

  createElementNS(espaco, tag) {
    return new No(this, tag, espaco);
  }

  getElementById(id) {
    return this.porId.get(id) || null;
  }

  addEventListener(tipo, ouvinte) {
    this.ouvintes.push({ tipo, ouvinte });
  }

  montar(tag, id, filhos = []) {
    const no = this.createElement(tag);
    no.id = id;
    no.append(...filhos);
    this.porId.set(id, no);
    return no;
  }
}

const IDS_DA_PAGINA = {
  baralhos: ['anki-baralhos-topo', 'anki-baralhos-azulejos', 'anki-baralhos-corpo'],
  vocabulario: ['anki-vocabulario-topo', 'anki-vocabulario-azulejos', 'anki-vocabulario-filtros', 'anki-vocabulario-resumo', 'anki-vocabulario-corpo'],
};

function montarAPagina(documento) {
  const campos = [['select', 'tipo'], ['select', 'status'], ['input', 'busca'], ['button', 'limpar']]
    .map(([tag, nome]) => documento.montar(tag, `anki-vocabulario-${nome}`));
  for (const id of [...IDS_DA_PAGINA.baralhos, ...IDS_DA_PAGINA.vocabulario]) {
    documento.montar('div', id, id === 'anki-vocabulario-filtros' ? campos : []);
  }
}

const PROPRIEDADES_VISTAS = ['hidden', 'value', 'placeholder', 'type', 'tabIndex'];

class Fotografo {
  constructor() {
    this.marcas = new Map();
  }

  marca(no) {
    if (!this.marcas.has(no)) this.marcas.set(no, this.marcas.size + 1);
    return this.marcas.get(no);
  }

  cabecalho(no) {
    const partes = [`${no.tag}@${this.marca(no)}`];
    if (no.id) partes.push(`#${no.id}`);
    if (no.className) partes.push(`.${no.className.split(' ').join('.')}`);
    const atributos = [...no.atributos].sort().map(([nome, valor]) => `${nome}=${valor}`);
    const dados = Object.entries(no.dataset).sort().map(([nome, valor]) => `data-${nome}=${valor}`);
    const propriedades = PROPRIEDADES_VISTAS.filter(nome => no[nome] !== undefined).map(nome => `${nome}:${no[nome]}`);
    const estilo = Object.entries(no.style).map(([nome, valor]) => `style.${nome}=${valor}`);
    const ouvintes = no.ouvintes.map(({ tipo }) => `on:${tipo}`).sort();
    return [...partes, ...atributos, ...dados, ...propriedades, ...estilo, ...ouvintes].join(' ');
  }

  linhas(no, recuo = '') {
    if (!(no instanceof No)) return [`${recuo}${JSON.stringify(no)}`];
    return [`${recuo}${this.cabecalho(no)}`, ...no.nos.flatMap(filho => this.linhas(filho, `${recuo}  `))];
  }

  foco(documento) {
    const ativo = documento.activeElement;
    return ativo ? `foco: ${ativo.tag}@${this.marca(ativo)}` : 'foco: nenhum';
  }
}

module.exports = { DocumentoFalso, Fotografo, montarAPagina, IDS_DA_PAGINA };
