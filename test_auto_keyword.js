'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadBackground(storage = {}) {
  const source = fs.readFileSync('background.js', 'utf8');
  const context = {
    console,
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
  // O service worker carrega a base compartilhada com importScripts; aqui o stub
  // roda os mesmos arquivos no mesmo contexto.
  context.importScripts = (...arquivos) => {
    for (const arquivo of arquivos) {
      vm.runInContext(fs.readFileSync(arquivo, 'utf8'), context, { filename: arquivo });
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'background.js' });
  return context;
}

function vocabulary({ words = [], terms = [], wordInfo = {}, termInfo = {} } = {}) {
  return {
    cacheVersion: 2,
    deckName: 'PerpetualMiner::Inglês',
    createdAt: Date.now(),
    words,
    terms,
    wordInfo,
    termInfo,
  };
}

const BASE_KNOWN_WORDS = [
  'aside', 'babies', 'children', 'clock', 'dependence', 'exposed', 'farmers',
  'fed', 'fields', 'lay', 'left', 'porridge', 'rain', 'required', 'seed',
  'settle', 'villages', 'wheat', 'women',
];

function display(keywords) {
  return keywords
    .map(item => (item === '|' ? '|' : item.replace(/@\d+$/, '')))
    .join(' ');
}

async function englishKeywords(text, vocab = vocabulary({ words: BASE_KNOWN_WORDS })) {
  const context = loadBackground({ pm_auto_keyword_vocab_en: vocab });
  return context.autoKeywordsForPhrase({ texto: text, idioma: 'Ingles' });
}

function russianVocabulary({ words = [], terms = [], wordInfo = {}, termInfo = {} } = {}) {
  return {
    ...vocabulary({ words, terms, wordInfo, termInfo }),
    deckName: 'PerpetualMiner::Russo',
  };
}

async function russianAutoMinerStorage() {
  const storage = {
    pm_auto_miner_settings: {
      en: { enabled: false, dailyLimit: 20 },
      ru: { enabled: true, dailyLimit: 20 },
    },
    pm_auto_miner_daily: null,
    pm_auto_keyword_vocab_ru: russianVocabulary({ words: [] }),
    frases: [],
  };
  const context = loadBackground(storage);
  const texto = '\u042f \u0443\u043b\u044b\u0431\u0430\u044e\u0441\u044c';

  const evaluation = await context.evaluateAutoMinerPhrase(texto, 'ru');
  assert.strictEqual(evaluation.accept, true, 'Russian i+1 evaluation still accepts an unknown word');
  assert.strictEqual(display(evaluation.keywords), '\u0443\u043b\u044b\u0431\u0430\u044e\u0441\u044c');

  const result = await context.handleAutoMinerCandidate({
    texto,
    origem: 'test',
    contexto: { fonte: 'test', titulo: 'Russian', detalhe: '' },
    lang: 'ru',
  });

  assert.strictEqual(result.action, 'saved');
  assert.strictEqual(result.frase.idioma, 'Russo');
  assert.strictEqual(result.frase.autoMiner, true);
  assert.strictEqual(result.frase.autoMinerReason, 'ru_i_plus_1');
  assert.ok(!Object.prototype.hasOwnProperty.call(result.frase, 'keywords'), 'Russian auto miner should not persist keywords');
  assert.ok(!Object.prototype.hasOwnProperty.call(result.frase, 'autoKeyword'), 'Russian auto miner should not mark autoKeyword');
  assert.strictEqual(storage.frases.length, 1);
  assert.ok(!Object.prototype.hasOwnProperty.call(storage.frases[0], 'keywords'));
  assert.ok(!Object.prototype.hasOwnProperty.call(storage.frases[0], 'autoKeyword'));
  assert.strictEqual(display(result.evaluation.keywords), '\u0443\u043b\u044b\u0431\u0430\u044e\u0441\u044c', 'internal Russian keyword remains available for diagnostics');
}

async function russianManualSaveDoesNotAutoKeyword() {
  const storage = {
    pm_auto_keyword_vocab_ru: russianVocabulary({ words: [] }),
    frases: [],
  };
  const context = loadBackground(storage);
  const frase = await context.salvarFrase(
    '\u042f \u0443\u043b\u044b\u0431\u0430\u044e\u0441\u044c',
    'manual',
    { fonte: 'manual', titulo: 'Manual Input', detalhe: '' },
    'Russo',
  );

  assert.strictEqual(frase.idioma, 'Russo');
  assert.ok(!Object.prototype.hasOwnProperty.call(frase, 'keywords'), 'Manual Russian save should not create keywords');
  assert.ok(!Object.prototype.hasOwnProperty.call(frase, 'autoKeyword'), 'Manual Russian save should not mark autoKeyword');
}

async function baralhoGravadoQueNaoRespondeNaoViraVocabularioVazio() {
  // A pessoa gravou o Baralho CIMV; a Conexão não o lê (503) e o Baralho padrão novo nem existe (200, vazio).
  const pedidos = [];
  const respostas = {
    CIMV: { ok: false, status: 503, json: async () => ({}) },
    'PerpetualMiner::Inglês': { ok: true, status: 200, json: async () => ({ words: [], source: 'anki' }) },
  };
  const storage = { ankiBridgePresets: { en: { deckName: 'CIMV' } } };
  const context = loadBackground(storage);
  context.fetch = async (_url, opcoes) => {
    const { deck } = JSON.parse(opcoes.body);
    pedidos.push(deck);
    return respostas[deck];
  };

  const semLeitura = await context.getAutoKeywordVocabulary('en');
  assert.strictEqual(semLeitura.available, false, 'sem leitura boa, o vocabulário não está disponível');
  assert.deepStrictEqual(pedidos, ['CIMV'], 'só o Baralho gravado é pedido, nunca o padrão no lugar dele');
  assert.ok(!('pm_auto_keyword_vocab_en' in storage), 'nada vazio vai para o cache');

  // Com uma leitura boa e vencida daquele Baralho, a falha devolve essa leitura e não a troca.
  const velha = { ...vocabulary({ words: ['gruel'] }), deckName: 'CIMV', createdAt: 1 };
  storage.pm_auto_keyword_vocab_en = velha;
  const renovado = await context.getAutoKeywordVocabulary('en');
  assert.ok(renovado.words.has('gruel'), 'a última leitura boa continua valendo');
  assert.strictEqual(storage.pm_auto_keyword_vocab_en, velha, 'o cache segue com a leitura boa');
}

async function run() {
  assert.strictEqual(
    display(await englishKeywords('Its dependence on rain left it exposed to the depredations of drought.')),
    'depredations of drought',
  );

  assert.strictEqual(
    display(await englishKeywords('Women did so by nursing their babies around the clock.')),
    'nursing | around the clock',
  );

  assert.strictEqual(
    display(await englishKeywords('They began to settle in villages, ploughing fields, sowing wheat.')),
    'ploughing fields | sowing wheat',
  );

  assert.strictEqual(
    display(await englishKeywords('After being weaned, children were fed on porridge and gruel.')),
    'weaned | gruel',
  );

  assert.strictEqual(
    display(await englishKeywords('Farmers had to lay aside some seed to sow.')),
    'sow',
  );

  const capped = await englishKeywords('Weaning children required gruel around the clock.');
  assert.strictEqual(capped.filter(item => item === '|').length, 1, 'normal English auto keyword is capped at two groups');

  await baralhoGravadoQueNaoRespondeNaoViraVocabularioVazio();
  await russianAutoMinerStorage();
  await russianManualSaveDoesNotAutoKeyword();
}

run().then(
  () => console.log('auto keyword tests passed'),
  error => {
    console.error(error);
    process.exitCode = 1;
  },
);
