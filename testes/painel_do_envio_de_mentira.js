'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const copia = valor => (valor === undefined ? valor : JSON.parse(JSON.stringify(valor)));
const adiante = async () => { for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r)); };

class Elemento {
  constructor(id = '', documento = null) {
    Object.assign(this, { id, documento, dataset: {}, hidden: false, textContent: '', filhos: [], ouvintes: {}, atributos: {}, pai: null });
  }
  addEventListener(tipo, funcao) { this.ouvintes[tipo] = funcao; }
  clicar() { return this.ouvintes.click(); }
  append(...nos) { for (const no of nos) { no.pai = this; this.filhos.push(no); } }
  replaceWith(novo) { novo.pai = this.pai; this.pai.filhos[this.pai.filhos.indexOf(this)] = novo; }
  remove() { this.pai.filhos.splice(this.pai.filhos.indexOf(this), 1); }
  contains(no) { return no === this || this.filhos.some(f => f.contains(no)); }
  querySelector(seletor) {
    const [, atributo, valor] = seletor.match(/^\[data-([\w-]+)="(.*)"\]$/);
    for (const filho of this.filhos) {
      const achado = filho.dataset[atributo] === valor ? filho : filho.querySelector(seletor);
      if (achado) return achado;
    }
    return null;
  }
  setAttribute(nome, valor) { this.atributos[nome] = valor; }
  removeAttribute(nome) { delete this.atributos[nome]; }
  focus() { this.documento.activeElement = this; }
}

function armazenamentoDeMentira(mundo) {
  const { guardado, log } = mundo;
  return {
    get: async pedido => ({ [Object.keys(pedido)[0]]: guardado.pm_envio === undefined ? Object.values(pedido)[0] : copia(guardado.pm_envio) }),
    set: async valores => { guardado.pm_envio = copia(valores.pm_envio); log.push(['grava', copia(valores.pm_envio)]); },
    remove: async () => { guardado.pm_envio = undefined; log.push(['remove']); },
  };
}

function contextoDoPainel(mundo) {
  let uuids = 0;
  return vm.createContext({
    globalThis: { PerpetualMiner: mundo.raiz },
    document: mundo.documento,
    console,
    Intl,
    Promise,
    Date: Object.assign(function Data(...a) { return new Date(...a); }, { now: () => 1000, parse: Date.parse }),
    crypto: { randomUUID: () => `u${++uuids}` },
    setInterval: (f, ms) => { mundo.intervalos.push({ f, ms }); return mundo.intervalos.length; },
    clearInterval: id => { mundo.log.push(['clearInterval', id]); },
    setTimeout: () => 0,
    chrome: { storage: { local: armazenamentoDeMentira(mundo), onChanged: { addListener: funcao => { mundo.aoMudarOArmazenamento = funcao; } } } },
  });
}

function fakesDaPagina(mundo, { jaConectou, aoPedir }) {
  const { log } = mundo;
  const real = { ...mundo.raiz.ConversaComOAnki };
  return {
    textoDaVoz: (id, dados) => (dados ? `${id}${JSON.stringify(dados)}` : id),
    Veio: {
      abrirModal: (elemento, { aoFechar }) => {
        log.push(['abrirModal', elemento.id]);
        return { fechar() { log.push(['fecharModal', elemento.id]); aoFechar(); } };
      },
      mostrarToastDeSucesso: texto => log.push(['toast', texto]),
    },
    Shell: { AREAS_DO_PAINEL: ['frases', 'anki'], aoEntrarNaArea: (area, funcao) => log.push(['aoEntrarNaArea', area, typeof funcao]) },
    ConexaoAnki: {
      SITUACAO: { DESLIGADA: 'desligada', LIGADA: 'ligada' },
      acompanhar: ouvinte => { mundo.ouvinteDaConexao = ouvinte; },
      conferir: async () => { log.push(['conferirConexao']); return mundo.situacaoDoAnki; },
      situacao: () => mundo.situacaoDoAnki,
      jaConectou: () => jaConectou,
    },
    ConversaComOAnki: {
      ...real,
      pedir: async pedido => {
        log.push(['pedido', `${pedido.metodo} ${pedido.caminho}`, copia(pedido.corpo)]);
        return aoPedir(`${pedido.metodo} ${pedido.caminho}`, pedido);
      },
    },
    EnvioApagarFrases: { pedir: () => log.push(['apagarFrasesPedir']) },
    TetoDoMes: { atualizar: () => log.push(['tetoAtualizar']) },
  };
}

function cartaoDeMentira(mundo, args) {
  mundo.dadosDoCartao = args;
  return {
    montarCartao: envio => {
      const cartao = new Elemento('', mundo.documento);
      const situacao = args.situacaoDe(envio);
      cartao.dataset.assinatura = `${envio.id}:${situacao.estado}:${JSON.stringify(envio.falhaAoCriar)}`;
      const botao = new Elemento('', mundo.documento);
      botao.dataset.foco = 'tentar';
      cartao.append(botao);
      mundo.log.push(['montarCartao', envio.id, situacao.estado]);
      return cartao;
    },
  };
}

function resumoDeMentira(mundo, args) {
  mundo.resumo = args;
  const { log } = mundo;
  return {
    tentarAbrir: () => log.push(['resumoTentarAbrir']),
    fechar: () => log.push(['resumoFechar']),
    responder: resposta => log.push(['resumoResponder', resposta]),
    descartarSeAberto: () => log.push(['resumoDescartar']),
  };
}

function fakesDoEnvio(mundo, ajustes) {
  return {
    AjustesDeEnvio: {
      ler: async () => { mundo.log.push(['lerAjustes']); if (ajustes instanceof Error) throw ajustes; return ajustes; },
      vozENivel: preset => ({ voz: preset.voz, nivel: preset.nivel }),
    },
    EnvioComOAnkiFechado: {
      criar: ({ aoLigar }) => {
        mundo.aoLigarOAnki = aoLigar;
        return { pedir: ids => { mundo.idsPedidos = ids; mundo.log.push(['ankiFechadoPediu', ids]); } };
      },
    },
    ResumoDoEnvio: { RESPOSTA: { APAGAR: 'apagar' }, criar: args => resumoDeMentira(mundo, args) },
    CartaoDoEnvio: {
      ETAPAS: [['queued', 'Na fila'], ['translate', 'Traduzindo']],
      nomeDoIdioma: lang => ({ en: 'inglês', ru: 'russo' })[lang],
      criar: args => cartaoDeMentira(mundo, args),
    },
  };
}

function criarMundo({ ajustes, conexao = 'ligada', jaConectou = true, aoPedir }) {
  const documento = { activeElement: null };
  const elementos = new Map();
  const porId = id => {
    if (!elementos.has(id)) elementos.set(id, new Elemento(id, documento));
    return elementos.get(id);
  };
  documento.getElementById = porId;
  const mundo = { log: [], guardado: { pm_envio: undefined }, porId, raiz: {}, intervalos: [], documento, situacaoDoAnki: conexao };
  const contexto = contextoDoPainel(mundo);
  const carregar = arquivo => vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto);
  ['lib/idioma.js', 'lib/pedido-ao-anki.js', 'lib/envio-gravado.js', 'painel/painel-envio-estado.js'].forEach(carregar);
  Object.assign(mundo.raiz, fakesDaPagina(mundo, { jaConectou, aoPedir }), fakesDoEnvio(mundo, ajustes));
  carregar('painel/painel-envio.js');
  return mundo;
}

const FRASES = new Map([[1, { id: 1, texto: 'hello' }], [2, { id: 2, texto: 'привет' }], [3, { id: 3, texto: 'world' }]]);
const PRESET = { deckName: 'Baralho', imageSource: 'openverse', voz: 'alloy', nivel: 'B1' };
const AJUSTES = { en: { ...PRESET, deckName: 'EN' }, ru: { ...PRESET, deckName: 'RU' } };

const SEM_RESPOSTA = { ok: false, motivo: 'sem_resposta', detalhes: 'timeout' };
const SEM_JOBS = { ok: true, status: 200, dados: { jobs: [] } };
const criado = jobId => ({ ok: true, status: 201, dados: { jobId } });
const jobs = (...lista) => ({ ok: true, status: 200, dados: { jobs: lista } });
const job = (jobId, status, stage = 'queued', extra = {}) => ({ jobId, status, state: { status, stage, ...extra } });
const criandoJobs = () => { let n = 0; return () => criado(`j${++n}`); };

const responder = (respostas, chave, pedido) => (typeof respostas[chave] === 'function' ? respostas[chave](pedido) : respostas[chave]);

async function preparar(opcoes = {}) {
  const respostas = opcoes.respostas || {};
  const mundo = criarMundo({ ...opcoes, ajustes: opcoes.ajustes || AJUSTES, aoPedir: (chave, pedido) => responder(respostas, chave, pedido) ?? SEM_JOBS });
  mundo.respostas = respostas;
  mundo.guardado.pm_envio = copia(opcoes.guardado);
  mundo.selecionadas = opcoes.selecionadas || [];
  mundo.selecionar = (...ids) => { mundo.selecionadas = ids; };
  await mundo.raiz.Envio.usar({
    selecionadas: () => mundo.selecionadas.map(id => FRASES.get(id)),
    frasesPorId: ids => ids.map(id => FRASES.get(id)),
    linha: frase => `linha ${frase.id}`,
  });
  await adiante();
  return mundo;
}

const lista = mundo => mundo.porId('modal-envio-lista').filhos.map(f => `${f.dataset.envio}|${f.dataset.assinatura}`);

const resumoDoEnvio = e => [e.id, e.jobId, e.falhaAoCriar && (e.falhaAoCriar.motivo || e.falhaAoCriar.causa), e.falhaAoCriar?.semResposta].filter(x => x !== undefined && x !== null).join(':');
const comoRastro = {
  grava: (_, gravado) => `grava ${(gravado?.envios || []).map(resumoDoEnvio).join(',')}${gravado?.apagarFrases ? ' +marca' : ''}`,
  pedido: (_, chave, corpo) => `${chave} ${corpo ? JSON.stringify(corpo.entries ? corpo.entries.map(e => e.phraseId) : corpo) : ''}`.trim(),
};
const rastro = mundo => mundo.log.map(passo => (comoRastro[passo[0]] || ((...partes) => partes.filter(x => x !== undefined).join(' ')))(...passo));

const clicarEmEnviar = async mundo => {
  mundo.log.length = 0;
  await mundo.porId('btn-send-anki').clicar();
  await adiante();
};
const comUmEnvio = async (respostas = {}) => {
  const mundo = await preparar({ selecionadas: [1], respostas: { 'POST /jobs': criandoJobs(), 'POST /jobs/list': jobs(job('j1', 'running', 'translate')), ...respostas } });
  await clicarEmEnviar(mundo);
  return mundo;
};
const girar = async mundo => {
  mundo.log.length = 0;
  mundo.intervalos[0].f();
  await adiante();
};

module.exports = { preparar, rastro, lista, adiante, criado, criandoJobs, jobs, job, SEM_RESPOSTA, clicarEmEnviar, comUmEnvio, girar };
