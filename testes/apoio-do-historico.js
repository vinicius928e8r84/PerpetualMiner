'use strict';

const fs = require('fs');
const vm = require('vm');
const { chromeDoServiceWorker } = require('./chrome-do-service-worker');

globalThis.PerpetualMiner = globalThis.PerpetualMiner || {};
require('../lib/historico.js');
const { Historico } = globalThis.PerpetualMiner;
const { criarSincronizacao } = require('../lib/sincronizacao.js');

const copia = valor => JSON.parse(JSON.stringify(valor));

function armazenamentoComPortao(dados) {
  let portao = null;
  async function ler(pedido) {
    const lido = Object.fromEntries(Object.entries(pedido).map(([chave, padrao]) => [chave, copia(chave in dados ? dados[chave] : padrao)]));
    if (portao && 'frases' in pedido) {
      const { soltar, chegou } = portao;
      portao = null;
      chegou();
      await soltar;
    }
    return lido;
  }
  async function gravar(valores) {
    for (const [chave, valor] of Object.entries(valores)) dados[chave] = copia(valor);
  }
  function segurarAProximaLeitura() {
    let soltar;
    let chegou;
    const aberto = new Promise(resolve => { soltar = resolve; });
    const leu = new Promise(resolve => { chegou = resolve; });
    portao = { soltar: aberto, chegou };
    return { leu, soltar };
  }
  return { area: { get: ler, set: gravar }, segurarAProximaLeitura };
}

function serviceWorker(area) {
  const contexto = {
    console,
    navigator: globalThis.navigator,
    fetch: async () => ({ ok: false }),
    setTimeout,
    clearTimeout,
    Date,
    chrome: chromeDoServiceWorker({
      storage: { local: {
        get: (pedido, devolver) => { area.get(pedido).then(devolver); },
        set: (valores, pronto) => { area.set(valores).then(() => pronto?.()); },
      } },
    }),
  };
  contexto.importScripts = (...arquivos) => arquivos.forEach(arquivo =>
    vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo }));
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), contexto, { filename: 'background.js' });
  return contexto;
}

const fraseDoPainel = { id: 1, texto: 'He barely made it to the station.', data: '18/11/2026', streaming: 'netflix', idioma: 'Inglês' };
const outraFrase = { ...fraseDoPainel, id: 2, texto: 'Let us call it a day.' };

function salvarFoto(sw, texto) {
  return sw.minerar({
    texto, origem: 'livro', contexto: { fonte: 'livro', titulo: 'Livro', detalhe: '' }, idioma: 'Inglês',
    extras: { keywords: ['harbour@3'], autoKeyword: false },
  }, { comNuvem: false });
}

function cenario(frases) {
  const dados = { frases };
  const { area, segurarAProximaLeitura } = armazenamentoComPortao(dados);
  return { dados, area, segurarAProximaLeitura, sw: serviceWorker(area), historico: Historico.criar({ armazenamento: area }) };
}

async function corrida({ segurarAProximaLeitura }, retida, chegando) {
  const portao = segurarAProximaLeitura();
  const daRetida = retida();
  await portao.leu;
  const daChegada = chegando();
  await deixarCorrer();
  portao.soltar();
  return Promise.all([daRetida, daChegada]);
}

const historicoSobre = dados => Historico.criar({ armazenamento: armazenamentoComPortao(dados).area });

const deixarCorrer = () => new Promise(resolve => setTimeout(resolve, 5));

function nuvemComPortaoNaSubida(frasesDaNuvem, { tombstones = [] } = {}) {
  let soltar;
  let chegou;
  const subindo = new Promise(resolve => { chegou = resolve; });
  const aberto = new Promise(resolve => { soltar = resolve; });
  const nuvem = {
    uid: 'uid-teste',
    listarFrases: async () => copia(frasesDaNuvem),
    gravarFrase: async () => { chegou(); await aberto; },
    gravarFrases: async () => {},
    apagarFrases: async () => {},
    lerTombstones: async () => new Map(tombstones.map(id => [id, Date.now()])),
    gravarTombstones: async () => {},
  };
  return { nuvem, subindo, soltar };
}

function sincronizacaoSobre(area, nuvem) {
  const sync = { get: async () => ({}), set: async () => {}, remove: async () => {} };
  return criarSincronizacao({ nuvem, armazenamento: { local: { ...area, remove: async () => {} }, sync } });
}

module.exports = { fraseDoPainel, outraFrase, salvarFoto, cenario, corrida, historicoSobre, deixarCorrer, nuvemComPortaoNaSubida, sincronizacaoSobre };
