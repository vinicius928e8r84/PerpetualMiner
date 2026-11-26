'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromeDoServiceWorker } = require('./chrome-do-service-worker');

process.chdir(path.join(__dirname, '..'));

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


function vocabularioDoInglesSemAsPalavras() {
  return {
    cacheVersion: 2, deckName: 'PerpetualMiner::Inglês', createdAt: Date.now(),
    words: ['rain'], terms: [], wordInfo: {}, termInfo: {},
  };
}

function dadosDoDia() {
  return {
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } },
    pm_auto_keyword_vocab_en: vocabularioDoInglesSemAsPalavras(),
    frases: [],
  };
}

const legenda = { texto: 'The ferry left the harbour.', origem: 'prime', contexto: { fonte: 'prime', titulo: 'Serie', detalhe: '' }, lang: 'en' };

async function aMesmaLegendaDuasVezesEmParaleloGravaUmaSoVez() {
  const dados = dadosDoDia();
  const { area, segurarAProximaLeitura } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);

  const portao = segurarAProximaLeitura();
  const primeira = sw.handleAutoMinerCandidate(legenda);
  await portao.leu;
  const segunda = sw.handleAutoMinerCandidate({ ...legenda, texto: '  The ferry   left the HARBOUR. ' });
  await new Promise(resolve => setTimeout(resolve, 20));
  portao.soltar();
  const resultados = await Promise.all([primeira, segunda]);

  assert.deepStrictEqual(dados.frases.map(frase => frase.texto), [legenda.texto], 'a legenda ficou uma vez só no Histórico');
  assert.deepStrictEqual(resultados.map(r => r.action).sort(), ['saved', 'skip']);
  assert.strictEqual(resultados.find(r => r.action === 'skip').reason, 'duplicate');
  assert.strictEqual(dados.pm_auto_miner_daily.en.count, 1, 'e só uma entrou na conta do dia');
}

async function aMesmaLegendaEmRussoDuasVezesEmParaleloGravaUmaSoVez() {
  const dados = dadosDoDia();
  dados.pm_auto_keyword_vocab_ru = { cacheVersion: 2, deckName: 'PerpetualMiner::Russo', createdAt: Date.now(), words: [], terms: [], wordInfo: {}, termInfo: {} };
  const { area, segurarAProximaLeitura } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);
  const russa = { texto: '\u042f \u0443\u043b\u044b\u0431\u0430\u044e\u0441\u044c', origem: 'prime', contexto: null, lang: 'ru' };

  const portao = segurarAProximaLeitura();
  const primeira = sw.handleAutoMinerCandidate(russa);
  await portao.leu;
  const segunda = sw.handleAutoMinerCandidate(russa);
  await new Promise(resolve => setTimeout(resolve, 20));
  portao.soltar();
  await Promise.all([primeira, segunda]);

  assert.strictEqual(dados.frases.length, 1, 'a legenda em russo ficou uma vez só no Histórico');
}

async function umaLegendaQueJaEstaNoHistoricoNaoEntraDeNovo() {
  const dados = dadosDoDia();
  dados.frases = [{ id: 5, texto: 'the ferry left the harbour.', idioma: 'Inglês', data: '18/11/2026', streaming: 'prime' }];
  const { area } = armazenamentoComPortao(dados);
  const sw = serviceWorker(area);

  const resultado = await sw.handleAutoMinerCandidate(legenda);

  assert.strictEqual(resultado.action, 'skip');
  assert.strictEqual(resultado.reason, 'duplicate');
  assert.strictEqual(dados.frases.length, 1);
  assert.ok(!dados.pm_auto_miner_daily || dados.pm_auto_miner_daily.en.count === 0, 'a duplicata não conta no dia');
}

(async () => {
  const casos = [
    aMesmaLegendaDuasVezesEmParaleloGravaUmaSoVez,
    aMesmaLegendaEmRussoDuasVezesEmParaleloGravaUmaSoVez,
    umaLegendaQueJaEstaNoHistoricoNaoEntraDeNovo,
  ];
  let falhas = 0;
  for (const caso of casos) {
    try {
      await caso();
      console.log(`ok  ${caso.name}`);
    } catch (erro) {
      falhas++;
      console.log(`FALHOU  ${caso.name}\n${erro.message}`);
    }
  }
  if (falhas) process.exit(1);
  console.log('test_mineracao_automatica_duplicata.js: tudo certo');
})();
