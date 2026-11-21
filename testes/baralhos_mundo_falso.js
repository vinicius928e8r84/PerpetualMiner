'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { DocumentoFalso, Fotografo, montarAPagina, IDS_DA_PAGINA } = require('./baralhos_pagina_falsa.js');

const RAIZ = path.resolve(__dirname, '..');
const ARQUIVOS_DO_PAINEL = ['painel/painel-anki-baralhos.js'];
const SITUACAO = Object.freeze({ CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' });
const MINUTO = 60 * 1000;
const COMECO = Date.UTC(2026, 10, 21, 12, 0, 0);

const esperar = () => new Promise(resolve => setImmediate(resolve));
const textoDaVoz = (id, valores) => (valores ? `${id}${JSON.stringify(valores)}` : id);

class MundoDosBaralhos {
  constructor(gravado = {}) {
    Object.assign(this, { gravado, agora: COMECO, area: 'anki', situacao: SITUACAO.CONECTANDO, ultimaResposta: null, apresentada: SITUACAO.CONECTANDO });
    Object.assign(this, { pedidos: [], gravacoes: [], vistos: { pedidos: 0, gravacoes: 0 }, fotos: [], ouvintes: {} });
    this.documento = new DocumentoFalso();
    this.local = { hash: '' };
    this.fotografo = new Fotografo();
    montarAPagina(this.documento);
  }

  elemento(tag, classe, ...filhos) {
    const no = this.documento.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  montarAviso({ texto, acao, detalhes, fechavel }) {
    const aviso = this.elemento('div', 'aviso-falso', texto);
    aviso.dataset.detalhes = String(detalhes);
    aviso.dataset.fechavel = String(fechavel);
    const botao = this.elemento('button', 'aviso-falso__acao', acao.rotulo);
    botao.addEventListener('click', acao.aoUsar);
    aviso.append(botao);
    return aviso;
  }

  pecas() {
    return {
      esqueleto: alturas => this.elemento('div', `esqueleto-falso ${alturas.join('-')}`),
      linhaDeEspera: texto => this.elemento('p', 'espera-falsa', texto),
      seloDoDadoAntigo: (quando, motivo) => this.elemento('span', `selo-falso ${motivo}`, String(quando)),
    };
  }

  conexaoAnki() {
    return {
      SITUACAO,
      acompanhar: ouvinte => { this.ouvintes.conexao = ouvinte; },
      situacao: () => this.situacao,
      ultimaResposta: () => this.ultimaResposta,
      apresentada: () => this.apresentada,
    };
  }

  pedir(pedido) {
    return new Promise(resolver => this.pedidos.push({ pedido, resolver }));
  }

  raiz() {
    return {
      textoDaVoz,
      IDIOMAS: { INGLES: 'Inglês', RUSSO: 'Russo' },
      Veio: { elemento: (...partes) => this.elemento(...partes), montarAviso: aviso => this.montarAviso(aviso) },
      Shell: { aoEntrarNaArea: (area, ouvinte) => { this.ouvintes[`entrar:${area}`] = ouvinte; }, areaAtual: () => this.area },
      ConexaoAnki: this.conexaoAnki(),
      Contexto: { haQuanto: momento => `há ${Math.floor((this.agora - momento) / MINUTO)} min` },
      Anki: { pecas: this.pecas(), aoAtualizar: ouvinte => { this.ouvintes.atualizar = ouvinte; } },
      ConversaComOAnki: { pedir: pedido => this.pedir(pedido) },
      PedidoAoAnki: {
        estatisticas: (decks, opcoes) => ({ rota: 'stats', decks, opcoes }),
        vocabulario: (deck, idioma) => ({ rota: 'vocabulary', deck, idioma }),
      },
      AbrirOAnki: { montarBotao: () => this.elemento('button', 'abrir-o-anki-falso') },
    };
  }

  chrome() {
    const local = {
      get: async padrao => ({ ...padrao, ...this.gravado }),
      set: async valores => { this.gravacoes.push(valores); },
    };
    return { storage: { local } };
  }

  carregar() {
    const contexto = vm.createContext({ document: this.documento, chrome: this.chrome(), CSS: { escape: texto => texto }, location: this.local });
    contexto.globalThis = contexto;
    contexto.PerpetualMiner = this.raiz();
    vm.runInContext('(relogio) => { Date.now = relogio; }', contexto)(() => this.agora);
    for (const arquivo of ARQUIVOS_DO_PAINEL) {
      vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto, { filename: arquivo });
    }
    this.Baralhos = contexto.PerpetualMiner.Baralhos;
  }

  async terminarDeCarregar() {
    for (const { ouvinte } of this.documento.ouvintes) ouvinte();
    await esperar();
  }

  async abrir() {
    this.carregar();
    await this.terminarDeCarregar();
  }

  async usarBaralhos(nomes) {
    this.Baralhos.usarBaralhos(nomes);
    await esperar();
  }

  async conexao(situacao, apresentada = situacao) {
    Object.assign(this, { situacao, apresentada, ultimaResposta: { quando: this.agora } });
    this.ouvintes.conexao(situacao);
    await esperar();
  }

  async responder(indice, desfecho) {
    this.pedidos[indice].resolver(desfecho);
    await esperar();
  }

  async avisar(nome) {
    this.ouvintes[nome]();
    await esperar();
  }

  no(id) {
    return this.documento.getElementById(id);
  }

  achar(seletor) {
    return [...this.documento.porId.values()].map(no => no.querySelector(seletor)).find(Boolean);
  }

  async clicar(no) {
    no.disparar('click');
    await esperar();
  }

  async escrever(id, tipo, valor) {
    this.no(id).value = valor;
    this.no(id).disparar(tipo);
    await esperar();
  }

  async tecla(no, key) {
    const evento = { key, prevenido: false, preventDefault() { this.prevenido = true; } };
    no.disparar('keydown', evento);
    await esperar();
    return evento.prevenido;
  }

  novos(lista, chave) {
    const novos = this[lista].slice(this.vistos[chave]).map(item => JSON.stringify(item.pedido ?? item));
    this.vistos[chave] = this[lista].length;
    return novos;
  }

  foto(rotulo, abas = ['baralhos', 'vocabulario']) {
    const pagina = abas.flatMap(aba => IDS_DA_PAGINA[aba]).flatMap(id => this.fotografo.linhas(this.no(id)));
    const pedidos = this.novos('pedidos', 'pedidos').map(pedido => `pediu ${pedido}`);
    const gravacoes = this.novos('gravacoes', 'gravacoes').map(gravacao => `gravou ${gravacao}`);
    const fim = [this.fotografo.foco(this.documento), `hash: ${this.local.hash}`];
    this.fotos.push([rotulo, [...pedidos, ...gravacoes, ...pagina, ...fim].join('\n')]);
  }
}

module.exports = { MundoDosBaralhos, SITUACAO, MINUTO, COMECO };
