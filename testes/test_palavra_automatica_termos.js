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

const termo = (posicoes, tipo = 'phrasal_verb', comum = true) => ({ posicoes, tipo, comum });
const aceita = (reason, ...keywords) => ({ accept: true, reason, keywords, iaPerguntada: true });
const recusa = reason => ({ accept: false, reason, iaPerguntada: true });
const semIA = reason => ({ accept: false, reason });

const CASOS = [];
function caso(id, { texto, lang = 'en', vocab = {}, nivel = 'intermediario', termos, esperado, perguntas }) {
  CASOS.push({ id, texto, lang, vocab, nivel, termos, esperado, perguntas });
}

const ELA = "She can't put up with him";
const TODAS_CONHECIDAS = { words: ['she', "can't", 'put', 'up', 'with', 'him'] };
const PUT_UP_WITH = [termo([2, 3, 4])];

caso('todas as palavras conhecidas e o phrasal verb fora do Vocabulario: entra com o phrasal verb inteiro', {
  texto: ELA, vocab: TODAS_CONHECIDAS, termos: PUT_UP_WITH, esperado: aceita('en_new_item', 'put@4', 'up@6', 'with@8'), perguntas: 1,
});
caso('o phrasal verb Recente no Vocabulario nao entra', {
  texto: ELA, vocab: { ...TODAS_CONHECIDAS, terms: ['put up with'], termInfo: { 'put up with': 'recent' } }, termos: PUT_UP_WITH, esperado: recusa('nada_novo'), perguntas: 1,
});
caso('o phrasal verb Maduro tambem nao entra', {
  texto: ELA, vocab: { ...TODAS_CONHECIDAS, terms: ['put up with'], termInfo: { 'put up with': 'mature' } }, termos: PUT_UP_WITH, esperado: recusa('nada_novo'), perguntas: 1,
});
caso('o phrasal verb so Novo no Baralho conta como desconhecido', {
  texto: ELA, vocab: { ...TODAS_CONHECIDAS, terms: ['put up with'], termInfo: { 'put up with': 'new' } }, termos: PUT_UP_WITH, esperado: aceita('en_new_item', 'put@4', 'up@6', 'with@8'), perguntas: 1,
});
caso('conhecer as palavras soltas nao basta para o Termo', {
  texto: ELA, vocab: { ...TODAS_CONHECIDAS, terms: ['put up'], termInfo: { 'put up': 'mature' } }, termos: PUT_UP_WITH, esperado: aceita('en_new_item', 'put@4', 'up@6', 'with@8'), perguntas: 1,
});
caso('o nome no meio da frase, com o resto conhecido, nao entra', {
  texto: "Tell Walter I'm here", vocab: { words: ['tell', "i'm", 'here'] }, termos: [termo([1], 'nome')], esperado: recusa('nada_novo'), perguntas: 1,
});
caso('duas desconhecidas proximas que a IA diz ser um Termo so entram como um Termo', {
  texto: 'He will fritter away money', vocab: { words: ['he', 'money'] }, termos: [termo([2, 3])], esperado: aceita('en_new_item', 'fritter@4', 'away@6'), perguntas: 1,
});
caso('duas desconhecidas proximas que a IA diz serem duas coisas nao entram', {
  texto: 'The ferry left the harbour.', vocab: { words: ['ferry'] }, termos: [termo([2], 'palavra'), termo([4], 'palavra')], esperado: recusa('nao_e_i_mais_1'), perguntas: 1,
});
caso('duas desconhecidas proximas sem Termo nenhum na resposta nao entram', {
  texto: 'The ferry left the harbour.', vocab: { words: ['ferry'] }, termos: [], esperado: recusa('nao_e_i_mais_1'), perguntas: 1,
});
caso('uma palavra solta desconhecida e um Termo conhecido: sem IA, entra a palavra solta', {
  texto: 'Zebra and gave up it', vocab: { words: ['it'], terms: ['gave up'], termInfo: { 'gave up': 'recent' } }, termos: [termo([2, 3])], esperado: { accept: true, reason: 'en_new_item', keywords: ['zebra@0'] }, perguntas: 0,
});
caso('o mesmo Termo duas vezes na resposta conta uma vez so', {
  texto: ELA, vocab: TODAS_CONHECIDAS, termos: [...PUT_UP_WITH, ...PUT_UP_WITH], esperado: aceita('en_new_item', 'put@4', 'up@6', 'with@8'), perguntas: 1,
});
caso('um nome de varias palavras conta como conhecido', {
  texto: 'He saw New York again', vocab: { words: ['he', 'saw', 'again'] }, termos: [termo([2, 3], 'nome')], esperado: recusa('nada_novo'), perguntas: 1,
});
caso('uma giria de uma palavra desconhecida entra como a palavra', {
  texto: "That's lit", vocab: {}, termos: [], esperado: { accept: true, reason: 'en_new_item', keywords: ['lit@2'] }, perguntas: 0,
});
caso('posicao fora da linha conta como sem resposta e o codigo decide pelas palavras soltas', {
  texto: 'The ferry left the harbour.', vocab: { words: ['ferry'] }, termos: [termo([2, 40])], esperado: { ...semIA('nao_e_i_mais_1'), iaPerguntada: true }, perguntas: 1,
});
caso('posicao que nao e um numero inteiro conta como sem resposta', {
  texto: ELA, vocab: TODAS_CONHECIDAS, termos: [termo([2.5, 3])], esperado: { ...semIA('nada_novo'), iaPerguntada: true }, perguntas: 1,
});
caso('sem resposta da IA, sem palavra desconhecida o codigo decide sozinho e nao entra', {
  texto: ELA, vocab: TODAS_CONHECIDAS, termos: null, esperado: { ...semIA('nada_novo'), iaPerguntada: true }, perguntas: 1,
});
caso('sem resposta da IA, duas desconhecidas proximas nao entram', {
  texto: 'The ferry left the harbour.', vocab: { words: ['ferry'] }, termos: null, esperado: { ...semIA('nao_e_i_mais_1'), iaPerguntada: true }, perguntas: 1,
});
caso('a IA que falha por erro tambem e sem resposta', {
  texto: ELA, vocab: TODAS_CONHECIDAS, termos: new Error('rede'), esperado: { ...semIA('nada_novo'), iaPerguntada: true }, perguntas: 1,
});

caso('uma palavra desconhecida so: sem IA', {
  texto: 'The ferry left the harbour.', vocab: { words: ['ferry', 'left'] }, termos: PUT_UP_WITH, esperado: { accept: true, reason: 'en_new_item', keywords: ['harbour@8'] }, perguntas: 0,
});
caso('tres desconhecidas: sem IA', {
  texto: 'zebra yak llama', termos: PUT_UP_WITH, esperado: semIA('nao_e_i_mais_1'), perguntas: 0,
});
caso('duas desconhecidas longe uma da outra (mais de 2 palavras entre elas): sem IA', {
  texto: 'Zebra and the old man saw llama', vocab: { words: ['old', 'man', 'saw'] }, termos: PUT_UP_WITH, esperado: semIA('nao_e_i_mais_1'), perguntas: 0,
});
caso('duas desconhecidas com 2 palavras entre elas ainda sao proximas', {
  texto: 'Zebra and the llama', vocab: {}, termos: [], esperado: recusa('nao_e_i_mais_1'), perguntas: 1,
});
const JA_SABE_200 = Array.from({ length: 200 }, (_, i) => `conhecida${i}`);

caso('no Iniciante a IA nunca e chamada, nem com tudo conhecido', {
  texto: ELA, vocab: { words: [...TODAS_CONHECIDAS.words, ...JA_SABE_200] }, nivel: 'iniciante', termos: PUT_UP_WITH, esperado: semIA('nada_novo'), perguntas: 0,
});
caso('no Iniciante a IA nunca e chamada, nem com duas proximas', {
  texto: 'The ferry left the harbour.', vocab: { words: ['ferry', ...JA_SABE_200] }, nivel: 'iniciante', termos: [termo([2, 3])], esperado: semIA('nao_e_i_mais_1'), perguntas: 0,
});
caso('a linha de uma palavra so, conhecida, nao pergunta: o codigo ja tem certeza', {
  texto: 'Harbour', vocab: { words: ['harbour'] }, termos: [], esperado: semIA('nada_novo'), perguntas: 0,
});
caso('texto lixo nao pergunta', {
  texto: 'skip intro', vocab: {}, termos: [], esperado: semIA('low_quality_text'), perguntas: 0,
});
caso('sem Vocabulario nao pergunta', {
  texto: ELA, vocab: { available: false }, termos: PUT_UP_WITH, esperado: semIA('sem_vocabulario'), perguntas: 0,
});
caso('linha longa demais em ingles nao pergunta', {
  texto: `${'word '.repeat(60)}end`, vocab: TODAS_CONHECIDAS, termos: [], esperado: semIA('too_long_en'), perguntas: 0,
});
caso('linha russa longa demais para a rota nao pergunta', {
  texto: `${'слово '.repeat(120)}конец`, lang: 'ru', vocab: { words: ['слово', 'конец'] }, termos: [], esperado: semIA('nada_novo'), perguntas: 0,
});

caso('russo: a expressao de palavras conhecidas que a IA acha entra inteira', {
  texto: 'Он взял себя в руки', lang: 'ru', vocab: { words: ['он', 'взял', 'себя', 'руки'] }, termos: [termo([1, 2, 3, 4], 'expressao')],
  esperado: { accept: true, reason: 'ru_i_plus_1', keywords: ['взял@2', 'себя@4', 'в@6', 'руки@8'], iaPerguntada: true }, perguntas: 1,
});
caso('russo: a giria Recente no Vocabulario nao entra', {
  texto: 'Он взял себя в руки', lang: 'ru', vocab: { words: ['он', 'взял', 'себя', 'руки'], terms: ['взял себя в руки'], termInfo: { 'взял себя в руки': 'recent' } }, termos: [termo([1, 2, 3, 4], 'expressao')],
  esperado: recusa('nada_novo'), perguntas: 1,
});
caso('russo: duas desconhecidas proximas que a IA diz ser uma giria entram como uma, no Avancado (no Intermediario a giria e fora do Nivel)', {
  texto: 'Он забил болт', lang: 'ru', nivel: 'avancado', vocab: { words: ['он'] }, termos: [termo([1, 2], 'giria', false)],
  esperado: { accept: true, reason: 'ru_i_plus_1', keywords: ['забил@2', 'болт@4'], iaPerguntada: true }, perguntas: 1,
});
caso('russo: a mesma giria no Intermediario e fora do Nivel', {
  texto: 'Он забил болт', lang: 'ru', vocab: { words: ['он'] }, termos: [termo([1, 2], 'giria', false)], esperado: recusa('fora_do_nivel'), perguntas: 1,
});

async function run() {
  const diferentes = [];
  for (const { id, texto, lang, vocab, nivel, termos, esperado, perguntas } of CASOS) {
    let feitas = 0;
    const termosDaIA = async () => {
      feitas++;
      if (termos instanceof Error) throw termos;
      return termos;
    };
    const atual = JSON.parse(JSON.stringify(await PalavraAutomatica.avaliar(texto, lang, { vocabulario: vocabulario(vocab), nivel, termos: termosDaIA })));
    if (JSON.stringify(atual) !== JSON.stringify(esperado) || feitas !== perguntas) diferentes.push([id, atual, `perguntas: ${feitas}`]);
  }
  assert.deepStrictEqual(diferentes, [], 'a regra da dúvida com os Termos da IA mudou');
  console.log(`Termos da IA: ${CASOS.length} casos de linha, Vocabulário, Nível e resposta iguais.`);
}

run().catch(erro => {
  console.error(erro.stack || erro.message);
  process.exit(1);
});
