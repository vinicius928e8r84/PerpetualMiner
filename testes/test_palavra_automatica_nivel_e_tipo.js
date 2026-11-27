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
const { PalavraAutomatica, PalavraEmDuvida, PalavrasFrequentes } = contexto.PerpetualMiner;

const INICIANTE = 'iniciante';
const INTERMEDIARIO = 'intermediario';
const AVANCADO = 'avancado';
const NIVEIS = [INICIANTE, INTERMEDIARIO, AVANCADO];
const IDIOMAS = ['en', 'ru'];
const TIPOS_DE_VARIAS_PALAVRAS = ['phrasal_verb', 'expressao', 'giria'];
const COMUNS = [true, false];
const plano = valor => JSON.parse(JSON.stringify(valor));

const ENTRA = 'entra';
const FORA = 'fora_do_nivel';
const NADA_NOVO = 'nada_novo';
const TABELA_DA_SPEC = {
  palavra: { true: { iniciante: ENTRA, intermediario: ENTRA, avancado: ENTRA }, false: { iniciante: FORA, intermediario: ENTRA, avancado: ENTRA } },
  phrasal_verb: { true: { intermediario: ENTRA, avancado: ENTRA }, false: { intermediario: FORA, avancado: ENTRA } },
  expressao: { true: { intermediario: ENTRA, avancado: ENTRA }, false: { intermediario: FORA, avancado: ENTRA } },
  giria: { true: { intermediario: FORA, avancado: ENTRA }, false: { intermediario: FORA, avancado: ENTRA } },
};

const LINHAS = {
  en: {
    phrasal_verb: { texto: "She can't put up with him", conhecidas: ['she', "can't", 'put', 'up', 'with', 'him'], posicoes: [2, 3, 4], keywords: ['put@4', 'up@6', 'with@8'] },
    expressao: { texto: "Don't spill the beans", conhecidas: ["don't", 'spill', 'the', 'beans'], posicoes: [1, 2, 3], keywords: ['spill@2', 'the@4', 'beans@6'] },
    giria: { texto: 'She threw shade at him', conhecidas: ['she', 'threw', 'shade', 'at', 'him'], posicoes: [1, 2], keywords: ['threw@2', 'shade@4'] },
  },
  ru: {
    phrasal_verb: { texto: 'Он сдался и ушёл прочь', conhecidas: ['он', 'сдался', 'ушёл', 'прочь'], posicoes: [1, 3], keywords: ['сдался@2', 'ушёл@6'] },
    expressao: { texto: 'Он взял себя в руки', conhecidas: ['он', 'взял', 'себя', 'руки'], posicoes: [1, 2, 3, 4], keywords: ['взял@2', 'себя@4', 'в@6', 'руки@8'] },
    giria: { texto: 'Он забил болт', conhecidas: ['он', 'забил', 'болт'], posicoes: [1, 2], keywords: ['забил@2', 'болт@4'] },
  },
};

const PALAVRAS_SOLTAS = {
  en: { true: { texto: 'I see love', conhecidas: ['see'], keywords: ['love@4'] }, false: { texto: 'I see zebra', conhecidas: ['see'], keywords: ['zebra@4'] } },
  ru: { true: { texto: 'Я видел дом', conhecidas: ['видел'], keywords: ['дом@4'] }, false: { texto: 'Я видел зебра', conhecidas: ['видел'], keywords: ['зебра@4'] } },
};

const MOTIVO_DO_ACEITO = { en: 'en_new_item', ru: 'ru_i_plus_1' };
const { palavrasConhecidasParaALinhaNormal } = PalavraAutomatica.LIMITES_DO_INICIANTE;
const JA_SABE_O_BASTANTE_PARA_A_LINHA_NORMAL = Array.from({ length: palavrasConhecidasParaALinhaNormal }, (_, i) => `conhecida${i}`);

function vocabulario(conhecidas) {
  return { available: true, words: new Set([...conhecidas, ...JA_SABE_O_BASTANTE_PARA_A_LINHA_NORMAL]), terms: new Set(), wordInfo: new Map(), termInfo: new Map() };
}

async function avaliar({ texto, lang, conhecidas, nivel, termos }) {
  let perguntas = 0;
  const termosDaIA = async () => { perguntas++; return termos; };
  const resultado = await PalavraAutomatica.avaliar(texto, lang, { vocabulario: vocabulario(conhecidas), nivel, termos: termosDaIA });
  return { resultado: plano(resultado), perguntas };
}

function esperadoDaCelula(celula, lang, keywords, perguntou) {
  const base = celula === ENTRA ? { accept: true, reason: MOTIVO_DO_ACEITO[lang], keywords } : { accept: false, reason: FORA };
  return perguntou ? { ...base, iaPerguntada: true } : base;
}

const CASOS = [];
const caso = (nome, funcao) => CASOS.push({ nome, funcao });

function casoDaPalavraSolta(lang, comum, nivel) {
  caso(`${lang}: palavra ${comum ? 'comum' : 'incomum'} no ${nivel}`, async () => {
    const { texto, conhecidas, keywords } = PALAVRAS_SOLTAS[lang][comum];
    assert.strictEqual(PalavrasFrequentes.ehFrequente(lang, keywords[0].split('@')[0]), comum, 'a palavra do caso mudou de lista');
    const { resultado, perguntas } = await avaliar({ texto, lang, conhecidas, nivel, termos: [] });
    assert.deepStrictEqual(resultado, esperadoDaCelula(TABELA_DA_SPEC.palavra[comum][nivel], lang, keywords, false));
    assert.strictEqual(perguntas, 0, 'a palavra solta nunca pergunta à IA');
  });
}

function casoDoTermoDeVariasPalavras(lang, tipo, comum, nivel) {
  caso(`${lang}: ${tipo} ${comum ? 'comum' : 'incomum'} no ${nivel}`, async () => {
    const { texto, conhecidas, posicoes, keywords } = LINHAS[lang][tipo];
    const { resultado, perguntas } = await avaliar({ texto, lang, conhecidas, nivel, termos: [{ posicoes, tipo, comum }] });
    assert.deepStrictEqual(resultado, esperadoDaCelula(TABELA_DA_SPEC[tipo][comum][nivel], lang, keywords, true));
    assert.strictEqual(perguntas, 1);
  });
}

function casoDoInicianteSemIA(lang, tipo, comum) {
  caso(`${lang}: ${tipo} ${comum ? 'comum' : 'incomum'} no ${INICIANTE} nem chega à IA`, async () => {
    const { texto, conhecidas, posicoes } = LINHAS[lang][tipo];
    const { resultado, perguntas } = await avaliar({ texto, lang, conhecidas, nivel: INICIANTE, termos: [{ posicoes, tipo, comum }] });
    assert.deepStrictEqual(resultado, { accept: false, reason: NADA_NOVO });
    assert.strictEqual(perguntas, 0);
  });
}

function casosDoIdioma(lang) {
  for (const comum of COMUNS) {
    NIVEIS.forEach(nivel => casoDaPalavraSolta(lang, comum, nivel));
    for (const tipo of TIPOS_DE_VARIAS_PALAVRAS) {
      casoDoInicianteSemIA(lang, tipo, comum);
      [INTERMEDIARIO, AVANCADO].forEach(nivel => casoDoTermoDeVariasPalavras(lang, tipo, comum, nivel));
    }
  }
}

IDIOMAS.forEach(casosDoIdioma);

const ACEITOS_PELO_CODIGO = {
  iniciante: { palavra: [true] },
  intermediario: { palavra: [true, false], phrasal_verb: [true], expressao: [true] },
  avancado: { palavra: [true, false], phrasal_verb: [true, false], expressao: [true, false], giria: [true, false] },
};

function casoDaTabelaDoCodigo(nivel, tipo, comum) {
  caso(`a tabela do código: ${nivel} ${tipo} comum=${comum}`, () => {
    const esperado = (ACEITOS_PELO_CODIGO[nivel][tipo] || []).includes(comum);
    assert.strictEqual(PalavraEmDuvida.nivelAceita(nivel, tipo, comum), esperado);
  });
}

for (const nivel of NIVEIS) {
  for (const tipo of ['palavra', 'phrasal_verb', 'expressao', 'giria', 'nome']) {
    COMUNS.forEach(comum => casoDaTabelaDoCodigo(nivel, tipo, comum));
  }
}

caso('sem Nível, ou com um Nível que não existe, vale o Intermediário', () => {
  for (const nivel of [undefined, null, 'mestre']) {
    assert.strictEqual(PalavraEmDuvida.nivelAceita(nivel, 'phrasal_verb', true), true);
    assert.strictEqual(PalavraEmDuvida.nivelAceita(nivel, 'giria', true), false);
  }
});

caso('a gíria de uma palavra só que a IA reconhece conta como gíria: no Intermediário é fora do Nível, no Avançado entra', async () => {
  const texto = 'Zebra and the llama';
  const termos = [{ posicoes: [0], tipo: 'nome', comum: false }, { posicoes: [3], tipo: 'giria', comum: true }];
  const intermediario = await avaliar({ texto, lang: 'en', conhecidas: [], nivel: INTERMEDIARIO, termos });
  assert.deepStrictEqual(intermediario, { resultado: { accept: false, reason: FORA, iaPerguntada: true }, perguntas: 1 });
  const avancado = await avaliar({ texto, lang: 'en', conhecidas: [], nivel: AVANCADO, termos });
  assert.deepStrictEqual(avancado, { resultado: { accept: true, reason: 'en_new_item', keywords: ['llama@6'], iaPerguntada: true }, perguntas: 1 });
});

caso('duas coisas, mesmo uma fora do Nível, continuam sendo nao_e_i_mais_1', async () => {
  const termos = [{ posicoes: [1, 2], tipo: 'giria', comum: true }, { posicoes: [4], tipo: 'palavra', comum: true }];
  const { resultado } = await avaliar({ texto: 'She threw shade at zebra', lang: 'en', conhecidas: ['she', 'threw', 'at'], nivel: INTERMEDIARIO, termos });
  assert.deepStrictEqual(resultado, { accept: false, reason: 'nao_e_i_mais_1', iaPerguntada: true });
});

async function rodar({ nome, funcao }) {
  try {
    await funcao();
    return 0;
  } catch (erro) {
    console.log(`FALHOU  ${nome}\n${erro.stack || erro.message}`);
    return 1;
  }
}

(async () => {
  let falhas = 0;
  for (const umCaso of CASOS) falhas += await rodar(umCaso);
  if (falhas) process.exit(1);
  console.log(`test_palavra_automatica_nivel_e_tipo.js: ${CASOS.length} casos, tudo certo`);
})();
