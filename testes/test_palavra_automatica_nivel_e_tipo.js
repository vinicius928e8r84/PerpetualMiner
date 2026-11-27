'use strict';

// A tabela Nível × tipo de Termo (#908): cada célula da spec #903 é um caso, em inglês e em russo.
// A tabela escrita aqui é a da spec; a do código é PalavraEmDuvida.TIPOS_POR_NIVEL, e os dois têm de bater.

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
const plano = valor => JSON.parse(JSON.stringify(valor));

const SIM = 'entra';
const NAO = 'fora_do_nivel';
// O que a spec #903 diz de cada Nível, por tipo e por "comum": 'entra' ou 'fora_do_nivel'.
// O Iniciante só aceita palavra comum e nunca pergunta à IA: os tipos de várias palavras não chegam a ser vistos.
const SPEC = {
  palavra: { comum: { iniciante: SIM, intermediario: SIM, avancado: SIM }, incomum: { iniciante: NAO, intermediario: SIM, avancado: SIM } },
  phrasal_verb: { comum: { iniciante: null, intermediario: SIM, avancado: SIM }, incomum: { iniciante: null, intermediario: NAO, avancado: SIM } },
  expressao: { comum: { iniciante: null, intermediario: SIM, avancado: SIM }, incomum: { iniciante: null, intermediario: NAO, avancado: SIM } },
  giria: { comum: { iniciante: null, intermediario: NAO, avancado: SIM }, incomum: { iniciante: null, intermediario: NAO, avancado: SIM } },
};

// Uma linha por tipo e Idioma, com tudo conhecido: só o Termo que a IA acha pode ser a coisa nova.
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

// A palavra solta é decidida pelo código, sem IA: "comum" é estar na lista de frequentes do Idioma.
const PALAVRAS = {
  en: { comum: { texto: 'I see love', conhecidas: ['see'], keywords: ['love@4'] }, incomum: { texto: 'I see zebra', conhecidas: ['see'], keywords: ['zebra@4'] } },
  ru: { comum: { texto: 'Я видел дом', conhecidas: ['видел'], keywords: ['дом@4'] }, incomum: { texto: 'Я видел зебра', conhecidas: ['видел'], keywords: ['зебра@4'] } },
};

const { palavrasConhecidasParaALinhaNormal } = PalavraAutomatica.LIMITES_DO_INICIANTE;
const JA_SABE_O_BASTANTE = Array.from({ length: palavrasConhecidasParaALinhaNormal }, (_, i) => `conhecida${i}`);

// O Iniciante com pouco Vocabulário só lê linha curta (#906); aqui ele já sabe o bastante para a linha normal.
function vocabulario(conhecidas) {
  return { available: true, words: new Set([...conhecidas, ...JA_SABE_O_BASTANTE]), terms: new Set(), wordInfo: new Map(), termInfo: new Map() };
}

async function avaliar({ texto, lang, conhecidas, nivel, termos }) {
  let perguntas = 0;
  const termosDaIA = async () => { perguntas++; return termos; };
  const resultado = await PalavraAutomatica.avaliar(texto, lang, { vocabulario: vocabulario(conhecidas), nivel, termos: termosDaIA });
  return { resultado: plano(resultado), perguntas };
}

function esperadoDaCelula(celula, motivoDoAceito, keywords, perguntou) {
  const base = celula === SIM ? { accept: true, reason: motivoDoAceito, keywords } : { accept: false, reason: NAO };
  return perguntou ? { ...base, iaPerguntada: true } : base;
}

const MOTIVO_DO_ACEITO = { en: 'en_new_item', ru: 'ru_i_plus_1' };
const CASOS = [];
function caso(nome, funcao) { CASOS.push({ nome, funcao }); }

for (const lang of ['en', 'ru']) {
  for (const comum of ['comum', 'incomum']) {
    for (const nivel of NIVEIS) {
      caso(`${lang}: palavra ${comum} no ${nivel}`, async () => {
        const { texto, conhecidas, keywords } = PALAVRAS[lang][comum];
        assert.strictEqual(PalavrasFrequentes.ehFrequente(lang, keywords[0].split('@')[0]), comum === 'comum', 'a palavra do caso mudou de lista');
        const { resultado, perguntas } = await avaliar({ texto, lang, conhecidas, nivel, termos: [] });
        assert.deepStrictEqual(resultado, esperadoDaCelula(SPEC.palavra[comum][nivel], MOTIVO_DO_ACEITO[lang], keywords, false));
        assert.strictEqual(perguntas, 0, 'a palavra solta nunca pergunta à IA');
      });
    }
  }
  for (const tipo of ['phrasal_verb', 'expressao', 'giria']) {
    for (const comum of ['comum', 'incomum']) {
      for (const nivel of NIVEIS) {
        caso(`${lang}: ${tipo} ${comum} no ${nivel}`, async () => {
          const { texto, conhecidas, posicoes, keywords } = LINHAS[lang][tipo];
          const termos = [{ posicoes, tipo, comum: comum === 'comum' }];
          const { resultado, perguntas } = await avaliar({ texto, lang, conhecidas, nivel, termos });
          const celula = SPEC[tipo][comum][nivel];
          if (nivel === INICIANTE) {
            assert.deepStrictEqual(resultado, { accept: false, reason: 'nada_novo' }, 'o Iniciante não vê Termos de várias palavras');
            assert.strictEqual(perguntas, 0, 'o Iniciante nunca chama a IA');
          } else {
            assert.deepStrictEqual(resultado, esperadoDaCelula(celula, MOTIVO_DO_ACEITO[lang], keywords, true));
            assert.strictEqual(perguntas, 1);
          }
        });
      }
    }
  }
}

caso('a tabela do código é a da spec: cada célula, tipo por tipo', () => {
  const esperada = { iniciante: ['palavra'], intermediario: ['palavra', 'phrasal_verb', 'expressao'], avancado: ['palavra', 'phrasal_verb', 'expressao', 'giria'] };
  for (const nivel of NIVEIS) {
    for (const tipo of ['palavra', 'phrasal_verb', 'expressao', 'giria', 'nome']) {
      for (const comum of [true, false]) {
        const entra = esperada[nivel].includes(tipo) && (comum || (nivel !== INICIANTE && (tipo === 'palavra' || nivel === AVANCADO)));
        assert.strictEqual(PalavraEmDuvida.nivelAceita(nivel, tipo, comum), entra, `${nivel} ${tipo} comum=${comum}`);
      }
    }
  }
});

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
  assert.deepStrictEqual(intermediario, { resultado: { accept: false, reason: NAO, iaPerguntada: true }, perguntas: 1 });
  const avancado = await avaliar({ texto, lang: 'en', conhecidas: [], nivel: AVANCADO, termos });
  assert.deepStrictEqual(avancado, { resultado: { accept: true, reason: 'en_new_item', keywords: ['llama@6'], iaPerguntada: true }, perguntas: 1 });
});

caso('duas coisas, mesmo uma fora do Nível, continuam sendo nao_e_i_mais_1', async () => {
  const termos = [{ posicoes: [1, 2], tipo: 'giria', comum: true }, { posicoes: [4], tipo: 'palavra', comum: true }];
  const { resultado } = await avaliar({ texto: 'She threw shade at zebra', lang: 'en', conhecidas: ['she', 'threw', 'at'], nivel: INTERMEDIARIO, termos });
  assert.deepStrictEqual(resultado, { accept: false, reason: 'nao_e_i_mais_1', iaPerguntada: true });
});

(async () => {
  let falhas = 0;
  for (const { nome, funcao } of CASOS) {
    try {
      await funcao();
    } catch (erro) {
      falhas++;
      console.log(`FALHOU  ${nome}\n${erro.stack || erro.message}`);
    }
  }
  if (falhas) process.exit(1);
  console.log(`test_palavra_automatica_nivel_e_tipo.js: ${CASOS.length} casos, tudo certo`);
})();
