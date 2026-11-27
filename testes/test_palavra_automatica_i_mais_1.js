'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const contexto = { console };
contexto.globalThis = contexto;
vm.createContext(contexto);
for (const arquivo of ['lib/voz/catalogo.js', 'lib/voz/catalogo-configuracoes.js', 'lib/voz/catalogo-anki.js', 'lib/voz/catalogo-boas-vindas.js', 'lib/voz/catalogo-envio.js', 'lib/voz/texto.js', 'lib/idioma.js', 'lib/mineracao.js', 'lib/palavras-frequentes-en.js', 'lib/palavras-frequentes-ru.js', 'lib/palavras-frequentes.js', 'lib/palavras-gramaticais.js', 'lib/palavra-em-duvida.js', 'lib/palavra-automatica.js']) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto, { filename: arquivo });
}
const { PalavraAutomatica } = contexto.PerpetualMiner;

function vocabulario({ words = [], terms = [], termInfo = {}, wordInfo = {}, available = true } = {}) {
  return {
    available,
    words: new Set(words),
    terms: new Set(terms),
    wordInfo: new Map(Object.entries(wordInfo)),
    termInfo: new Map(Object.entries(termInfo).map(([termo, status]) => [termo, { status }])),
  };
}

const AVALIACOES = [];
function avaliacao(id, texto, lang, vocab = {}) {
  const entrada = { id, texto, lang, vocab, esperado: undefined };
  AVALIACOES.push(entrada);
  return { espera: esperado => { entrada.esperado = esperado; } };
}
const aceita = (reason, ...keywords) => ({ accept: true, reason, keywords });
const recusa = reason => ({ accept: false, reason });
const noBaralho = (...palavras) => Object.fromEntries(palavras.map(palavra => [palavra, { status: 'new' }]));
const estudada = status => ({ status });

const PORTO = 'The ferry left the harbour.';
const CONHECIDAS = ['ferry', 'left'];
avaliacao('novo no baralho e o resto conhecido entra', PORTO, 'en', { words: [...CONHECIDAS, 'harbour'], wordInfo: { harbour: estudada('new') } }).espera(aceita('en_new_item', 'harbour@8'));
avaliacao('fora do baralho e o resto conhecido entra', PORTO, 'en', { words: CONHECIDAS }).espera(aceita('en_new_item', 'harbour@8'));
for (const status of ['recent', 'mature', 'mixed', 'seen']) {
  avaliacao(`${status} conta como conhecida`, PORTO, 'en', { words: [...CONHECIDAS, 'harbour'], wordInfo: { harbour: estudada(status) } }).espera(recusa('nada_novo'));
}
avaliacao('palavra sem informacao do ponto conta como conhecida', PORTO, 'en', { words: [...CONHECIDAS, 'harbour'] }).espera(recusa('nada_novo'));
avaliacao('duas desconhecidas nao entram', PORTO, 'en', { words: ['ferry'] }).espera(recusa('nao_e_i_mais_1'));
avaliacao('uma nova e uma fora do baralho nao entram', PORTO, 'en', { words: ['ferry', 'left'], wordInfo: noBaralho('left', 'harbour') }).espera(recusa('nao_e_i_mais_1'));
avaliacao('tres desconhecidas nao entram', 'zebra yak llama', 'en').espera(recusa('nao_e_i_mais_1'));
avaliacao('duas novas nao entram', PORTO, 'en', { words: [...CONHECIDAS, 'harbour'], wordInfo: { harbour: estudada('new'), left: estudada('new') } }).espera(recusa('nao_e_i_mais_1'));
avaliacao('a palavra repetida e uma coisa so', 'zebra and zebra', 'en').espera(aceita('en_new_item', 'zebra@0'));
avaliacao('so palavra gramatical nao tem nada novo', 'the of and', 'en').espera(recusa('nada_novo'));
avaliacao('palavra curta e numero nao contam', 'zebra 12 ok', 'en').espera(aceita('en_new_item', 'zebra@0'));
avaliacao('o nome no meio da frase conta como conhecido', 'Then Harry saw the zebra', 'en', { words: ['saw'] }).espera(aceita('en_new_item', 'zebra@8'));
avaliacao('a palavra depois de ponto abre a frase e nao e nome', 'He saw it. Harry saw zebra.', 'en', { words: ['saw'] }).espera(recusa('nao_e_i_mais_1'));
avaliacao('a palavra que abre a frase nao e nome', 'Zebra ran', 'en', { words: ['ran'] }).espera(aceita('en_new_item', 'zebra@0'));
avaliacao('a palavra em maiuscula inteira nao e nome', 'Then HARRY saw zebra', 'en', { words: ['then', 'saw'] }).espera(recusa('nao_e_i_mais_1'));
avaliacao('o termo recente cobre as palavras dele', 'She gave up smoking', 'en', { words: ['smoking'], terms: ['gave up'], termInfo: { 'gave up': 'recent' } }).espera(recusa('nada_novo'));
avaliacao('o termo maduro cobre as palavras dele', 'She gave up smoking', 'en', { words: ['smoking'], terms: ['gave up'], termInfo: { 'gave up': 'mature' } }).espera(recusa('nada_novo'));
avaliacao('o termo novo nao cobre as palavras dele', 'She gave up smoking', 'en', { words: ['smoking'], terms: ['gave up'], termInfo: { 'gave up': 'new' } }).espera(aceita('en_new_item', 'gave@2'));
avaliacao('a palavra solta conhecida continua conhecida com o termo novo', 'She gave up smoking', 'en', { words: ['smoking', 'gave'], terms: ['gave up'], termInfo: { 'gave up': 'new' } }).espera(recusa('nada_novo'));
avaliacao('sem o termo a palavra solta e a coisa nova', 'She gave up smoking', 'en', { words: ['smoking'] }).espera(aceita('en_new_item', 'gave@2'));
avaliacao('o phrasal verb com a particula separada vira uma coisa so', "Don't fritter it away", 'en', { words: ["don't", 'away'] }).espera(aceita('en_new_item', 'fritter@2', 'away@6'));
avaliacao('o phrasal verb com a particula colada vira uma coisa so', 'He frittered away money', 'en', { words: ['he', 'money', 'away'] }).espera(aceita('en_new_item', 'frittered@2', 'away@4'));
avaliacao('a particula que ele nao conhece soma uma segunda coisa', 'He frittered away money', 'en', { words: ['he', 'money'] }).espera(recusa('nao_e_i_mais_1'));
avaliacao('sem vocabulario em ingles nada entra', 'zebra', 'en', { available: false }).espera(recusa('sem_vocabulario'));
avaliacao('sem vocabulario em russo nada entra', 'зебра', 'ru', { available: false }).espera(recusa('sem_vocabulario'));
avaliacao('russo: uma nova no baralho entra', 'Я вижу зебра', 'ru', { words: ['вижу', 'зебра'], wordInfo: { зебра: estudada('new') } }).espera(aceita('ru_i_plus_1', 'зебра@4'));
avaliacao('russo: recente nao entra', 'Я вижу зебра', 'ru', { words: ['вижу', 'зебра'], wordInfo: { зебра: estudada('recent') } }).espera(recusa('nada_novo'));
avaliacao('russo: duas desconhecidas nao entram', 'Я вижу зебра лама', 'ru', { words: ['вижу'] }).espera(recusa('nao_e_i_mais_1'));
avaliacao('russo: a palavra gramatical conta como conhecida', 'и в на зебра', 'ru').espera(aceita('ru_i_plus_1', 'зебра@6'));
avaliacao('russo: o nome no meio da frase conta como conhecido', 'Я вижу Ивана и зебра', 'ru', { words: ['вижу'] }).espera(aceita('ru_i_plus_1', 'зебра@8'));

async function run() {
  const diferentes = [];
  for (const { id, texto, lang, vocab, esperado } of AVALIACOES) {
    const atual = JSON.parse(JSON.stringify(await PalavraAutomatica.avaliar(texto, lang, { vocabulario: vocabulario(vocab) })));
    if (JSON.stringify(atual) !== JSON.stringify(esperado)) diferentes.push([id, atual]);
  }
  assert.deepStrictEqual(diferentes, [], 'a regra do I+1 exato mudou');
  console.log(`I+1 exato: ${AVALIACOES.length} casos de linha, Vocabulário e saída iguais.`);
}

run().catch(erro => { console.error(erro); process.exit(1); });
