'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadBackground(storage = {}) {
  const source = fs.readFileSync('background.js', 'utf8');
  const context = {
    console,
    navigator: globalThis.navigator,
    importScripts: (...arquivos) => arquivos.forEach(arquivo =>
      vm.runInContext(fs.readFileSync(arquivo, 'utf8'), context, { filename: arquivo })),
    fetch: async () => ({ ok: false }),
    setTimeout,
    clearTimeout,
    Date,
    chrome: {
      contextMenus: {
        create() {},
        onClicked: { addListener() {} },
      },
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener() {} },
        lastError: null,
      },
      storage: {
        local: {
          get(defaults, callback) {
            const result = {};
            for (const [key, value] of Object.entries(defaults || {})) {
              result[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : value;
            }
            callback(result);
          },
          set(values, callback) {
            Object.assign(storage, values || {});
            if (callback) callback();
          },
        },
      },
      tabs: {
        query(_query, callback) { callback([]); },
      },
    },
    __storage: storage,
  };
  context.importScripts = (...arquivos) => {
    for (const arquivo of arquivos) {
      vm.runInContext(fs.readFileSync(arquivo, 'utf8'), context, { filename: arquivo });
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'background.js' });
  return context;
}

const DECK_EN = 'PerpetualMiner::Inglês';
const DECK_RU = 'PerpetualMiner::Russo';
const MINUTO = 60 * 1000;

function leitura({ deckName = DECK_EN, createdAt = Date.now(), cacheVersion = 2, words = [], terms = [], wordInfo = {}, termInfo = {} } = {}) {
  return { cacheVersion, deckName, createdAt, words, terms, wordInfo, termInfo };
}

function comAnki(storage, resposta) {
  const pedidos = [];
  const context = loadBackground(storage);
  context.PerpetualMiner.PareamentoComOAnki = {
    pedirAssinado: async (endereco, pedido, opcoes, enviar) => enviar(endereco, pedido, JSON.stringify(pedido.corpo), opcoes),
  };
  const prazos = [];
  context.AbortSignal = { timeout: ms => { prazos.push(ms); return new AbortController().signal; } };
  context.fetch = async (_url, opcoes) => {
    pedidos.push({ corpo: JSON.parse(opcoes.body), prazoMs: prazos[prazos.length - 1] });
    return resposta();
  };
  return { context, pedidos };
}

const anki200 = dados => () => ({ status: 200, texto: JSON.stringify(dados) });
const ankiMudo = () => ({ status: 503, texto: '{}' });
const comoLista = conjunto => [...conjunto].sort();
const comoObjeto = mapa => JSON.parse(JSON.stringify(Object.fromEntries(mapa)));
const plano = valor => JSON.parse(JSON.stringify(valor));

async function leituraEmDiaNaoPerguntaAoAnki() {
  const storage = {
    pm_auto_keyword_vocab_en: leitura({ words: ['rain', 'fed'], terms: ['around the clock'], wordInfo: { rain: { status: 'mature', cards: 2 } } }),
  };
  const { context, pedidos } = comAnki(storage, anki200({ words: [] }));
  const vocabulario = await context.getAutoKeywordVocabulary('en');
  assert.deepStrictEqual(pedidos, [], 'leitura de menos de 15 min não pergunta ao Anki');
  assert.strictEqual(vocabulario.available, true);
  assert.deepStrictEqual(comoLista(vocabulario.words), ['fed', 'rain']);
  assert.deepStrictEqual(comoLista(vocabulario.terms), ['around the clock']);
  assert.deepStrictEqual(comoObjeto(vocabulario.wordInfo), { rain: { status: 'mature', cards: 2 }, fed: { status: 'seen' } });
  assert.deepStrictEqual(comoObjeto(vocabulario.termInfo), { 'around the clock': { status: 'seen' } });
}

async function leituraVencidaComOAnkiRespondendoLeDeNovoEGrava() {
  const velha = leitura({ createdAt: Date.now() - 16 * MINUTO, words: ['gruel'] });
  const storage = { pm_auto_keyword_vocab_en: velha };
  const resposta = {
    words: [
      { word: 'Rain', type: 'word', status: 'mature', cards: 3, new: 1, recent: 2, mature: 3 },
      { word: 'around the clock', type: 'term' },
      { word: '', type: 'word' },
      { word: 'fed', type: 'word', status: null, cards: '4' },
    ],
  };
  const { context, pedidos } = comAnki(storage, anki200(resposta));
  const antes = Date.now();
  const vocabulario = await context.getAutoKeywordVocabulary('en');
  assert.strictEqual(pedidos.length, 1);
  assert.strictEqual(pedidos[0].corpo.deck, DECK_EN);
  assert.strictEqual(pedidos[0].corpo.lang, 'en');
  assert.strictEqual(pedidos[0].prazoMs, 8000, 'com leitura antiga o pedido leva prazo curto');
  assert.strictEqual(vocabulario.available, true);
  assert.deepStrictEqual(comoLista(vocabulario.words), ['fed', 'rain']);
  assert.deepStrictEqual(comoLista(vocabulario.terms), ['around the clock']);
  assert.deepStrictEqual(comoObjeto(vocabulario.wordInfo), {
    rain: { status: 'mature', cards: 3, new: 1, recent: 2, mature: 3 },
    fed: { status: 'seen', cards: 4, new: 0, recent: 0, mature: 0 },
  });
  assert.deepStrictEqual(comoObjeto(vocabulario.termInfo), { 'around the clock': { status: 'seen', cards: 0, new: 0, recent: 0, mature: 0 } });
  const gravada = storage.pm_auto_keyword_vocab_en;
  assert.notStrictEqual(gravada, velha);
  assert.strictEqual(gravada.cacheVersion, 2);
  assert.strictEqual(gravada.deckName, DECK_EN);
  assert.ok(gravada.createdAt >= antes);
  assert.deepStrictEqual(plano(gravada.words), ['rain', 'fed']);
  assert.deepStrictEqual(plano(gravada.terms), ['around the clock']);
  assert.deepStrictEqual(plano(Object.keys(gravada.wordInfo)), ['rain', 'fed']);
  assert.deepStrictEqual(plano(Object.keys(gravada.termInfo)), ['around the clock']);
}

async function leituraVencidaComOAnkiMudoDevolveAAntiga() {
  const velha = leitura({ createdAt: Date.now() - 20 * MINUTO, words: ['gruel'] });
  const storage = { pm_auto_keyword_vocab_en: velha };
  const { context, pedidos } = comAnki(storage, ankiMudo);
  const vocabulario = await context.getAutoKeywordVocabulary('en');
  assert.strictEqual(pedidos.length, 1);
  assert.strictEqual(vocabulario.available, true);
  assert.deepStrictEqual(comoLista(vocabulario.words), ['gruel']);
  assert.strictEqual(storage.pm_auto_keyword_vocab_en, velha, 'a leitura antiga fica como estava');
}

async function semLeituraESemAnkiOVocabularioEstaIndisponivel() {
  const storage = {};
  const { context, pedidos } = comAnki(storage, ankiMudo);
  const vocabulario = await context.getAutoKeywordVocabulary('en');
  assert.strictEqual(pedidos.length, 1);
  assert.notStrictEqual(pedidos[0].prazoMs, 8000, 'sem leitura antiga o pedido usa o prazo comum');
  assert.strictEqual(vocabulario.available, false);
  assert.strictEqual(vocabulario.words.size + vocabulario.terms.size + vocabulario.wordInfo.size + vocabulario.termInfo.size, 0);
  assert.deepStrictEqual(plano(Object.keys(storage)), [], 'nada vai para o cache');
}

async function leituraDeOutroBaralhoOuVersaoNaoContaComoLeitura() {
  for (const gravada of [leitura({ deckName: 'Outro', words: ['rain'] }), leitura({ cacheVersion: 1, words: ['rain'] })]) {
    const storage = { pm_auto_keyword_vocab_en: gravada };
    const { context, pedidos } = comAnki(storage, ankiMudo);
    const vocabulario = await context.getAutoKeywordVocabulary('en');
    assert.strictEqual(pedidos.length, 1, 'leitura que não é deste Baralho e desta versão não vale, ainda que nova');
    assert.strictEqual(vocabulario.available, false);
  }
}

async function oIdiomaEscolheAChaveEOBaralho() {
  const storage = { pm_auto_keyword_vocab_ru: leitura({ deckName: DECK_RU, words: ['привет'] }), pm_auto_keyword_vocab_en: leitura({ words: ['hello'] }) };
  const { context, pedidos } = comAnki(storage, ankiMudo);
  assert.deepStrictEqual(comoLista((await context.getAutoKeywordVocabulary('ru')).words), ['привет']);
  assert.deepStrictEqual(comoLista((await context.getAutoKeywordVocabulary('xx')).words), ['hello'], 'idioma desconhecido cai no inglês');
  assert.deepStrictEqual(comoLista((await context.getAutoKeywordVocabulary()).words), ['hello']);
  assert.deepStrictEqual(pedidos, []);
}

async function run() {
  await leituraEmDiaNaoPerguntaAoAnki();
  await leituraVencidaComOAnkiRespondendoLeDeNovoEGrava();
  await leituraVencidaComOAnkiMudoDevolveAAntiga();
  await semLeituraESemAnkiOVocabularioEstaIndisponivel();
  await leituraDeOutroBaralhoOuVersaoNaoContaComoLeitura();
  await oIdiomaEscolheAChaveEOBaralho();
  console.log('vocabulario da mineracao tests passed');
}

run().catch(erro => {
  console.error(erro);
  process.exit(1);
});
