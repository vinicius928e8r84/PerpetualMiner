'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const AGORA = new Date(2026, 10, 21, 12, 0, 0).getTime();
const ARQUIVOS_DA_ABA = ['veio/componentes.js', 'lib/idioma.js', 'painel/painel-anki-plano.js', 'painel/painel-anki.js'];
const IDS_DA_ABA = [
  'anki-conectando', 'anki-ajustes-nota', 'anki-quatro-casas', 'anki-ids-dos-envios', 'anki-custos-de', 'anki-custos-ate',
  'btn-anki-atualizar', 'anki-custos-antigo', 'anki-custos-azulejos', 'anki-custos-avancado', 'anki-custos-corpo',
  'anki-custos-avancado-numeros', 'anki-custos-diagnostico', 'anki-diagnostico-falha',
];
const PERIODOS = ['hoje', 'mes', 'tudo'];

const textoDaVoz = (id, valores) => (valores ? `${id}${JSON.stringify(valores)}` : id);

const valoresDosAtributos = no => ({ ...no.atributos, ...Object.fromEntries(Object.entries(no.dataset).map(([nome, valor]) => [`data-${nome}`, valor])) });

function atributoCabe(no, [, nome, valor]) {
  const valores = valoresDosAtributos(no);
  return valor === undefined ? nome in valores : valores[nome] === valor;
}

function parteCabe(no, parte) {
  const atributo = /^\[([\w-]+)(?:="(.*)")?\]$/.exec(parte);
  if (atributo) return atributoCabe(no, atributo);
  if (parte.startsWith('#')) return no.id === parte.slice(1);
  if (parte.startsWith('.')) return no.classes().includes(parte.slice(1));
  return no.tag === parte;
}

function temAntepassado(no, parte) {
  for (let acima = no.pai; acima; acima = acima.pai) if (parteCabe(acima, parte)) return true;
  return false;
}

function cabe(no, seletor) {
  const partes = seletor.split(' ');
  const propria = partes.pop();
  return parteCabe(no, propria) && partes.every(parte => temAntepassado(no, parte));
}

class No {
  constructor(tag, documento) {
    Object.assign(this, { tag, documento, filhos: [], atributos: {}, ouvintes: {}, pai: null, dataset: {}, style: {} });
  }

  classes() {
    return String(this.className || '').split(' ').filter(Boolean);
  }

  get classList() {
    return {
      toggle: (classe, ligar) => {
        const outras = this.classes().filter(c => c !== classe);
        this.className = (ligar ? [...outras, classe] : outras).join(' ');
      },
    };
  }

  append(...filhos) {
    for (const filho of filhos) {
      if (filho instanceof No) filho.pai = this;
      this.filhos.push(filho instanceof No ? filho : String(filho));
    }
  }

  replaceChildren(...filhos) {
    this.filhos = [];
    this.append(...filhos);
  }

  remove() {
    if (this.pai) this.pai.filhos = this.pai.filhos.filter(filho => filho !== this);
    this.pai = null;
  }

  set textContent(texto) {
    this.replaceChildren(String(texto));
  }

  get textContent() {
    return this.filhos.map(filho => (filho instanceof No ? filho.textContent : filho)).join('');
  }

  get children() {
    return this.filhos.filter(filho => filho instanceof No);
  }

  get firstChild() {
    return this.filhos[0];
  }

  setAttribute(nome, valor) {
    this.atributos[nome] = String(valor);
  }

  getAttribute(nome) {
    return nome in this.atributos ? this.atributos[nome] : null;
  }

  removeAttribute(nome) {
    delete this.atributos[nome];
  }

  addEventListener(tipo, ouvinte) {
    (this.ouvintes[tipo] = this.ouvintes[tipo] || []).push(ouvinte);
  }

  disparar(tipo, evento = {}) {
    return Promise.all((this.ouvintes[tipo] || []).map(ouvinte => ouvinte({ target: this, preventDefault() { evento.evitado = true; }, ...evento })));
  }

  click() {
    this.documento.cliques.push(this);
    return this.disparar('click');
  }

  focus() {
    this.documento.activeElement = this;
  }

  todos() {
    return this.children.flatMap(filho => [filho, ...filho.todos()]);
  }

  querySelectorAll(seletor) {
    return this.todos().filter(no => cabe(no, seletor));
  }

  querySelector(seletor) {
    return this.querySelectorAll(seletor)[0] || null;
  }

  closest(seletor) {
    for (let no = this; no; no = no.pai) if (cabe(no, seletor)) return no;
    return null;
  }
}

function novoDocumento() {
  const documento = { cliques: [], activeElement: null, ouvintes: {} };
  Object.assign(documento, {
    createElement: tag => new No(tag, documento),
    getElementById: id => documento.porId[id] || null,
    addEventListener: (tipo, ouvinte) => { documento.ouvintes[tipo] = ouvinte; },
    querySelectorAll: () => documento.radios,
  });
  documento.body = documento.createElement('body');
  documento.porId = Object.fromEntries(IDS_DA_ABA.map(id => [id, Object.assign(documento.createElement('div'), { id })]));
  documento.radios = PERIODOS.map(value => Object.assign(documento.createElement('input'), { value }));
  return documento;
}

function conexaoDeMentira(situacao, respondeu) {
  const conexao = { situacao, respondeu, ouvinte: null, conferencias: 0 };
  conexao.api = {
    ENDERECO: 'http://127.0.0.1:8766',
    SITUACAO: { CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' },
    pronta: Promise.resolve(),
    situacao: () => conexao.situacao,
    ultimaResposta: () => (conexao.respondeu ? {} : null),
    apresentada: () => conexao.situacao,
    acompanhar: ouvinte => { conexao.ouvinte = ouvinte; },
    conferir: async () => { conexao.conferencias++; return conexao.situacao; },
  };
  return conexao;
}

function conversaDeMentira(respostas) {
  const conversa = { pedidos: [], respostas };
  conversa.api = {
    pedir: async pedido => {
      conversa.pedidos.push(pedido);
      const proxima = conversa.respostas.length > 1 ? conversa.respostas.shift() : conversa.respostas[0];
      return typeof proxima === 'function' ? proxima(pedido) : proxima;
    },
  };
  return conversa;
}

const pedidoAoAnki = {
  custosDosEnvios: ({ de, ate }) => ({ caminho: '/analytics/jobs', corpo: { lang: 'all', ...(de ? { from: de } : {}), ...(ate ? { to: ate } : {}) } }),
  pacoteDeDiagnostico: jobId => ({ caminho: '/jobs/debug-bundle', corpo: { jobId } }),
};

class DataParada extends Date {
  constructor(...partes) {
    super(...(partes.length ? partes : [AGORA]));
  }

  static now() {
    return AGORA;
  }
}

function armazenamentoDeMentira(inicial) {
  const guardado = { ...inicial };
  const gravacoes = [];
  return {
    guardado,
    gravacoes,
    api: {
      get: async padroes => ({ ...padroes, ...guardado }),
      set: async valores => { gravacoes.push(JSON.parse(JSON.stringify(valores))); Object.assign(guardado, valores); },
    },
  };
}

function painelComAsPecas(documento, { conexao, conversa, shell, armazenamento, continuados }) {
  const baixados = { urls: [], revogadas: [] };
  const contexto = vm.createContext({
    document: documento, Date: DataParada, CSS: { escape: texto => texto }, Blob: class { constructor(partes) { this.partes = Array.from(partes); } },
    URL: { createObjectURL: blob => { baixados.urls.push(blob); return `blob:${baixados.urls.length}`; }, revokeObjectURL: url => baixados.revogadas.push(url) },
    chrome: { storage: { local: armazenamento.api } },
  });
  contexto.globalThis = contexto;
  contexto.PerpetualMiner = {
    textoDaVoz, Shell: shell, ConexaoAnki: conexao.api, ConversaComOAnki: conversa.api, PedidoAoAnki: pedidoAoAnki,
    Contexto: { haQuanto: quando => `há:${quando}` },
    PrimeiraConexao: { montar: () => {} },
    ColunaDoChatGPT: { GERENCIAR_USO: 'https://uso' },
    Envio: { nomeDaEtapa: etapa => (etapa === 'cards' ? 'criandoCartoes' : null) },
    ContinuarEnvioNosCustos: { criar: deps => continuarDeMentira(deps, continuados) },
  };
  return { contexto, baixados };
}

function continuarDeMentira(deps, continuados) {
  continuados.deps = deps;
  return {
    montar: envio => {
      const acao = continuados.documento.createElement('button');
      acao.dataset.foco = `continuar:${envio.jobId}`;
      acao.textContent = `continuar:${envio.jobId}`;
      deps.marcarIndisponivel(acao, 'anki-continuar-indisponivel');
      return acao;
    },
  };
}

function avisoDeMentira(documento, { texto, acao, detalhes, fechavel }) {
  const aviso = documento.createElement('aside');
  aviso.className = 'aviso-de-mentira';
  const usar = documento.createElement('button');
  usar.textContent = acao.rotulo;
  usar.addEventListener('click', acao.aoUsar);
  aviso.append(texto, usar, `detalhes:${detalhes}`, `fechavel:${fechavel}`);
  return aviso;
}

const deixarAndar = () => new Promise(resolver => setImmediate(resolver));

async function abrirOsCustos({ situacao = 'ligada', respondeu = true, area = 'anki', guardado = {}, respostas = [], arquivos = ARQUIVOS_DA_ABA } = {}) {
  const documento = novoDocumento();
  const conexao = conexaoDeMentira(situacao, respondeu);
  const conversa = conversaDeMentira(respostas.length ? respostas : [{ ok: true, dados: { jobs: [] } }]);
  const armazenamento = armazenamentoDeMentira(guardado);
  const shell = { area, entradas: {}, aoEntrarNaArea: (nome, ouvinte) => { shell.entradas[nome] = ouvinte; }, areaAtual: () => shell.area };
  const continuados = { documento };
  const { contexto, baixados } = painelComAsPecas(documento, { conexao, conversa, shell, armazenamento, continuados });
  for (const arquivo of arquivos) vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto, { filename: arquivo });
  contexto.PerpetualMiner.Veio.montarAviso = opcoes => avisoDeMentira(documento, opcoes);
  await documento.ouvintes.DOMContentLoaded();
  await deixarAndar();
  return {
    documento, conexao, conversa, armazenamento, shell, continuados, baixados, Anki: contexto.PerpetualMiner.Anki, porId: id => documento.porId[id],
    entrar: () => depoisDe(() => shell.entradas.anki()),
    mudarAConexao: situacao => depoisDe(() => { conexao.situacao = situacao; conexao.ouvinte(situacao); }),
  };
}

async function depoisDe(acao) {
  acao();
  await deixarAndar();
}

const ENVIO_INGLES = {
  jobId: 'en1', lang: 'en', createdAt: '2026-11-20T10:00:00Z', status: 'completed', requestedCards: 3, successfulCards: 3,
  costs: { cardUsd: 0.5, imageGenerationUsd: 0.25, imageJudgeUsd: 0.01, imageGuardUsd: 0.02 },
  images: { real: 2, generated: 1, skipped: 0, failed: 0, savingsUsd: 0.1 },
};
const ENVIO_EM_PARTE = {
  jobId: 'ru1', lang: 'ru', createdAt: '2026-11-21T09:00:00Z', status: 'partial', requestedCards: 4, successfulCards: 1, failedCards: 0,
  costs: { cardUsd: 0.004, otherUsd: 0.3, correctionUsd: 0.2 }, images: { skipped: 1, failed: 3 }, lastError: 'timeout',
};
const ENVIO_QUE_FALHOU = {
  jobId: 'en2', lang: 'en', createdAt: '2026-11-19T08:00:00Z', status: 'failed', requestedCards: 5, successfulCards: 1, failedCards: 2, lastError: 'boom',
};
const ENVIO_APAGADO = { ...ENVIO_QUE_FALHOU, jobId: 'en3', createdAt: '2026-11-18T08:00:00Z', lastError: 'frases_apagadas' };
const ENVIO_ANDANDO = { jobId: 'ru2', lang: 'ru', createdAt: '2026-11-17T08:00:00Z', status: 'running', stage: 'cards', requestedCards: 5 };
const ENVIO_NA_FILA = { jobId: 'xx1', lang: 'xx', createdAt: '2026-11-16T08:00:00Z', status: 'queued', stage: 'outra' };
const ENVIO_CONCLUIDO_COM_ERRO = { ...ENVIO_INGLES, jobId: 'en4', createdAt: '2026-11-15T08:00:00Z', lastError: 'aviso do motor' };
const TODOS = [ENVIO_INGLES, ENVIO_EM_PARTE, ENVIO_QUE_FALHOU, ENVIO_APAGADO, ENVIO_ANDANDO, ENVIO_NA_FILA, ENVIO_CONCLUIDO_COM_ERRO];

const comEnvios = envios => ({ ok: true, dados: { jobs: envios } });
const LEITURA_GUARDADA = { quando: 1000, periodo: 'tudo', de: '', ate: '', envios: [ENVIO_EM_PARTE] };

const corpoDe = painel => painel.porId('anki-custos-corpo');
const textoEm = (painel, seletor) => corpoDe(painel).querySelector(seletor)?.textContent ?? null;
const textosEm = (painel, seletor) => corpoDe(painel).querySelectorAll(seletor).map(no => no.textContent);
const opcao = (painel, jobId) => corpoDe(painel).querySelector(`[data-foco="envio:${jobId}"]`);
const escolher = (painel, jobId) => depoisDe(() => opcao(painel, jobId).click());
const vista = painel => ({
  conectando: painel.porId('anki-conectando').hidden,
  nota: painel.porId('anki-ajustes-nota').hidden,
  azulejos: painel.porId('anki-custos-azulejos').hidden,
  avancado: painel.porId('anki-custos-avancado').hidden,
  antigo: painel.porId('anki-custos-antigo').hidden,
  corpo: corpoDe(painel).children.map(no => no.className),
});
const periodo = painel => ({
  radios: painel.documento.radios.map(radio => `${radio.value}:${radio.checked}:${radio.disabled}`),
  campos: ['anki-custos-de', 'anki-custos-ate'].map(id => `${painel.porId(id).value}:${painel.porId(id).disabled}`),
});
const pedidos = painel => painel.conversa.pedidos.map(pedido => `${pedido.caminho} ${JSON.stringify(pedido.corpo)}`);

const lendo = () => new Promise(() => {});

async function rodarUmCaso({ nome, abrir = {}, respostas, agir = painel => painel.entrar(), ver, esperado }) {
  const painel = await abrirOsCustos({ ...abrir, respostas: abrir.respostas || respostas || [comEnvios(TODOS)] });
  await agir(painel);
  assert.deepStrictEqual(ver(painel), esperado, nome);
}

async function rodarOsCasos(casos, rotulo) {
  let rodados = 0;
  process.once('exit', () => {
    if (rodados < casos.length) {
      console.error(`${rotulo}: só ${rodados} de ${casos.length} casos terminaram`);
      process.exitCode = 1;
    }
  });
  for (const caso of casos) {
    await rodarUmCaso(caso);
    rodados++;
  }
  console.log(`${rotulo} tests passed`);
}

module.exports = {
  AGORA, ENVIO_INGLES, ENVIO_QUE_FALHOU, LEITURA_GUARDADA, TODOS,
  abrirOsCustos, comEnvios, corpoDe, depoisDe, escolher, lendo, opcao, pedidos, periodo, rodarOsCasos, textoEm, textosEm, vista,
};
