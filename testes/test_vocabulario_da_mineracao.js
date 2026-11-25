'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const CHAVE = 'pm_auto_keyword_vocab_en';
const BARALHO = 'PerpetualMiner::Inglês';
const QUINZE_MINUTOS_MS = 15 * 60 * 1000;

function carregarOBackground(storage, aoAnki) {
  const pedidos = [];
  const contexto = {
    console,
    navigator: globalThis.navigator,
    importScripts: (...arquivos) => arquivos.forEach(arquivo => vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo })),
    fetch: async (_url, opcoes) => {
      pedidos.push(JSON.parse(opcoes.body));
      return aoAnki();
    },
    AbortSignal,
    setTimeout,
    clearTimeout,
    Date,
    chrome: {
      contextMenus: { create() {}, onClicked: { addListener() {} } },
      runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} }, lastError: null },
      storage: {
        local: {
          get(padroes, responder) {
            const lidos = {};
            for (const [chave, padrao] of Object.entries(padroes || {})) lidos[chave] = chave in storage ? storage[chave] : padrao;
            responder(lidos);
          },
          set(valores, responder) {
            Object.assign(storage, valores || {});
            if (responder) responder();
          },
        },
      },
      tabs: { query(_consulta, responder) { responder([]); } },
    },
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), contexto, { filename: 'background.js' });
  contexto.PerpetualMiner.PareamentoComOAnki = {
    pedirAssinado: async (endereco, pedido, opcoes, enviar) => enviar(endereco, { ...pedido, corpoEmTexto: JSON.stringify(pedido.corpo) }, opcoes),
  };
  return { contexto, pedidos };
}

const leitura = ({ createdAt, deckName = BARALHO, words = [], terms = [], wordInfo = {}, termInfo = {} }) => (
  { cacheVersion: 2, deckName, createdAt, words, terms, wordInfo, termInfo });

const AnkiRespondendo = lista => () => ({ status: 200, texto: JSON.stringify({ words: lista, source: 'anki' }) });
const AnkiMudo = () => ({ status: 503, texto: '{}' });
const comoPlano = valor => JSON.parse(JSON.stringify(valor));

const palavrasDe = vocabulario => comoPlano({
  disponivel: vocabulario.available,
  palavras: [...vocabulario.words],
  termos: [...vocabulario.terms],
  infoDasPalavras: Object.fromEntries(vocabulario.wordInfo),
  infoDosTermos: Object.fromEntries(vocabulario.termInfo),
});

async function leituraEmDia() {
  const guardada = leitura({ createdAt: Date.now() - 1000, words: ['gruel'], wordInfo: { gruel: { status: 'mature', cards: 2, new: 0, recent: 0, mature: 2 } } });
  const storage = { [CHAVE]: guardada };
  const { contexto, pedidos } = carregarOBackground(storage, AnkiRespondendo([{ word: 'weaned', type: 'word' }]));

  const vocabulario = await contexto.getAutoKeywordVocabulary('en');

  assert.deepStrictEqual(palavrasDe(vocabulario).palavras, ['gruel'], 'a leitura em dia vale');
  assert.deepStrictEqual(pedidos, [], 'e o Anki nem é perguntado');
  assert.strictEqual(storage[CHAVE], guardada, 'nem o que está guardado muda');
}

async function leituraVencidaComOAnkiRespondendo() {
  const velha = leitura({ createdAt: Date.now() - QUINZE_MINUTOS_MS - 1000, words: ['gruel'] });
  const storage = { [CHAVE]: velha };
  const resposta = [
    { word: 'Weaned', type: 'word', status: 'mature', cards: 3, new: 0, recent: 1, mature: 2 },
    { word: 'around the clock', type: 'term', status: 'recent', cards: 1, new: 0, recent: 1, mature: 0 },
    { word: '', type: 'word' },
    { word: 'seed' },
  ];
  const { contexto, pedidos } = carregarOBackground(storage, AnkiRespondendo(resposta));
  const antes = Date.now();

  const vocabulario = await contexto.getAutoKeywordVocabulary('en');

  assert.deepStrictEqual(pedidos.map(pedido => pedido.deck), [BARALHO], 'a leitura vencida pergunta ao Anki pelo Baralho dos Ajustes');
  assert.deepStrictEqual(palavrasDe(vocabulario), {
    disponivel: true,
    palavras: ['weaned', 'seed'],
    termos: ['around the clock'],
    infoDasPalavras: {
      weaned: { status: 'mature', cards: 3, new: 0, recent: 1, mature: 2 },
      seed: { status: 'seen', cards: 0, new: 0, recent: 0, mature: 0 },
    },
    infoDosTermos: { 'around the clock': { status: 'recent', cards: 1, new: 0, recent: 1, mature: 0 } },
  }, 'a leitura nova separa a palavra do termo e guarda a informação de cada um');
  const gravada = comoPlano(storage[CHAVE]);
  assert.deepStrictEqual(
    [gravada.cacheVersion, gravada.deckName, gravada.words, gravada.terms, gravada.createdAt >= antes],
    [2, BARALHO, ['weaned', 'seed'], ['around the clock'], true],
    'a leitura nova substitui a velha no que está guardado');
}

async function leituraVencidaComOAnkiMudo() {
  const velha = leitura({ createdAt: 1, words: ['gruel'] });
  const storage = { [CHAVE]: velha };
  const { contexto, pedidos } = carregarOBackground(storage, AnkiMudo);

  const vocabulario = await contexto.getAutoKeywordVocabulary('en');

  assert.strictEqual(pedidos.length, 1, 'o Anki foi perguntado');
  assert.deepStrictEqual(palavrasDe(vocabulario).palavras, ['gruel'], 'sem resposta, a leitura velha continua valendo');
  assert.strictEqual(vocabulario.available, true);
  assert.strictEqual(storage[CHAVE], velha, 'e o que está guardado fica como estava');
}

async function leituraDeOutroBaralhoNaoValeEEsperaOAnki() {
  const deOutroBaralho = leitura({ createdAt: Date.now(), deckName: 'CIMV', words: ['gruel'] });
  const storage = { [CHAVE]: deOutroBaralho };
  const { contexto, pedidos } = carregarOBackground(storage, AnkiMudo);

  const vocabulario = await contexto.getAutoKeywordVocabulary('en');

  assert.strictEqual(pedidos.length, 1, 'a leitura de outro Baralho não vale, mesmo em dia');
  assert.strictEqual(vocabulario.available, false);
  assert.strictEqual(storage[CHAVE], deOutroBaralho, 'e fica onde estava');
}

async function semLeituraESemAnki() {
  const storage = {};
  const { contexto } = carregarOBackground(storage, AnkiMudo);

  const vocabulario = await contexto.getAutoKeywordVocabulary('en');

  assert.deepStrictEqual(palavrasDe(vocabulario), { disponivel: false, palavras: [], termos: [], infoDasPalavras: {}, infoDosTermos: {} }, 'sem leitura e sem Anki o vocabulário não está disponível');
  assert.ok(!(CHAVE in storage), 'e nada vazio vai para o que está guardado');
}

async function oRussoLeESeGuardaNaChaveDele() {
  const storage = {};
  const { contexto, pedidos } = carregarOBackground(storage, AnkiRespondendo([{ word: 'бассейн', type: 'word' }]));

  const vocabulario = await contexto.getAutoKeywordVocabulary('ru');

  assert.deepStrictEqual(pedidos.map(pedido => pedido.deck), ['PerpetualMiner::Russo']);
  assert.deepStrictEqual(palavrasDe(vocabulario).palavras, ['бассейн']);
  assert.deepStrictEqual(comoPlano(Object.keys(storage)), ['pm_auto_keyword_vocab_ru']);
}

(async () => {
  await leituraEmDia();
  await leituraVencidaComOAnkiRespondendo();
  await leituraVencidaComOAnkiMudo();
  await leituraDeOutroBaralhoNaoValeEEsperaOAnki();
  await semLeituraESemAnki();
  await oRussoLeESeGuardaNaChaveDele();
  console.log('vocabulário da mineração tests passed');
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
