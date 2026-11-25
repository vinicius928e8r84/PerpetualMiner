'use strict';

const assert = require('assert');
const { criarFakeAnki } = require('../e2e/fakes/anki');
const { cabecalhosAssinados } = require('../e2e/pareamento-de-teste');

async function pedirAoFake(fake, metodo, caminho, corpo = {}) {
  let entregue = null;
  const texto = metodo === 'POST' ? JSON.stringify(corpo) : null;
  const cabecalhos = Object.fromEntries(Object.entries(cabecalhosAssinados({ sessao: fake.pareamento.sessao(), metodo, caminho, corpo: texto ?? '' }))
    .map(([nome, valor]) => [nome.toLowerCase(), valor]));
  await fake.tratar({
    request: () => ({ method: () => metodo, url: () => `http://127.0.0.1:8766${caminho}`, postData: () => texto, headers: () => cabecalhos }),
    fulfill: resposta => { entregue = { status: resposta.status, json: JSON.parse(resposta.body) }; },
    abort: motivo => { entregue = { abortado: motivo }; },
  });
  return entregue;
}

const pedirVocabulario = fake => pedirAoFake(fake, 'POST', '/anki/vocabulary', { deck: 'Inglês', lang: 'en', limit: 10000 });
const pedirBaralhos = fake => pedirAoFake(fake, 'POST', '/anki/decks');
const pedirNumeros = fake => pedirAoFake(fake, 'POST', '/anki/stats/decks', { decks: [{ deckName: 'Inglês', lang: 'en' }] });

async function aLeituraPorGetNaoExiste() {
  const fake = criarFakeAnki();
  for (const caminho of ['/anki/vocabulary', '/anki/decks', '/anki/stats/decks']) {
    assert.deepStrictEqual(await pedirAoFake(fake, 'GET', caminho), { status: 404, json: { error: 'not_found' } }, caminho);
  }
}

async function oVocabularioDadoEhOQueOAnkiLe() {
  const fake = criarFakeAnki();
  fake.definirVocabulario('en', [{ word: 'gave up', type: 'term', maduros: 1 }, 'smoking']);
  const lido = await pedirVocabulario(fake);
  assert.strictEqual(lido.status, 200);
  assert.deepStrictEqual(lido.json.words.map(linha => linha.word), ['gave up', 'smoking']);
}

async function oVocabularioFalhaComOStatusDadoOuSemRespostaDeRede() {
  const fake = criarFakeAnki();
  fake.falharVocabulario({ status: 502 });
  assert.deepStrictEqual(await pedirVocabulario(fake), { status: 502, json: { error: 'anki_vocabulary_unavailable', detail: 'collection_not_open' } });
  fake.falharVocabulario();
  assert.strictEqual((await pedirVocabulario(fake)).status, 503);
  fake.falharVocabulario({ rede: true });
  assert.deepStrictEqual(await pedirVocabulario(fake), { abortado: 'connectionrefused' });
  fake.voltarVocabulario();
  assert.strictEqual((await pedirVocabulario(fake)).status, 200);
}

async function osNumerosFalhamComOStatusDadoOuSemRespostaDeRede() {
  const fake = criarFakeAnki();
  fake.definirBaralho('Inglês', { cartoes: 4, termos: 3, palavras: 11, porCartao: 2.75, novos: 1, aprendendo: 1, recentes: 1, maduros: 1 });
  assert.strictEqual((await pedirNumeros(fake)).status, 200);
  fake.falharBaralhos({ status: 500 });
  assert.deepStrictEqual(await pedirNumeros(fake), { status: 500, json: { error: 'anki_stats_unavailable', detail: 'collection_not_open' } });
  fake.falharBaralhos({ rede: true });
  assert.deepStrictEqual(await pedirNumeros(fake), { abortado: 'connectionrefused' });
  fake.voltarBaralhos();
  assert.strictEqual((await pedirNumeros(fake)).status, 200);
}

async function osBaralhosSoExistemDepoisDeOAnkiTerAlista() {
  const fake = criarFakeAnki();
  assert.deepStrictEqual(await pedirBaralhos(fake), { status: 503, json: { error: 'anki_decks_unavailable', detail: 'collection_not_open' } });
  fake.definirBaralhosDoAnki(['Inglês', 'Russo']);
  assert.deepStrictEqual(await pedirBaralhos(fake), { status: 200, json: { decks: ['Inglês', 'Russo'] } });
}

async function comUmaColecaoAbertaORespondedorEOContrato() {
  const fake = criarFakeAnki();
  fake.abrirColecao('inglês com subbaralho');
  fake.falharVocabulario({ status: 500 });
  const lido = await pedirVocabulario(fake);
  assert.strictEqual(lido.status, 200, 'com a coleção aberta quem responde é o contrato, não a falha dada ao fake');
  assert.ok(Array.isArray(lido.json.words));
}

const CASOS = [
  ['a leitura por GET não existe', aLeituraPorGetNaoExiste],
  ['o vocabulário dado é o que o Anki lê', oVocabularioDadoEhOQueOAnkiLe],
  ['o vocabulário falha com o status dado ou sem resposta de rede', oVocabularioFalhaComOStatusDadoOuSemRespostaDeRede],
  ['os números falham com o status dado ou sem resposta de rede', osNumerosFalhamComOStatusDadoOuSemRespostaDeRede],
  ['os Baralhos só existem depois de o Anki ter a lista', osBaralhosSoExistemDepoisDeOAnkiTerAlista],
  ['com uma coleção aberta quem responde é o contrato', comUmaColecaoAbertaORespondedorEOContrato],
];

(async () => {
  for (const [nome, caso] of CASOS) {
    await caso();
    console.log(`ok - ${nome}`);
  }
})().catch(erro => {
  console.error(erro);
  process.exit(1);
});
