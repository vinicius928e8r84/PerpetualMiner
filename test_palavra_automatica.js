'use strict';

// Caracterização da escolha da Palavra automática: a saída para um conjunto fixo
// de textos em inglês e em russo, gravada ANTES de mover o código para
// lib/palavra-automatica.js. Tem de passar igual antes e depois da mudança.
// PALAVRA_GRAVAR=1 imprime a saída atual em vez de comparar.

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function carregarBackground(storage) {
  const context = {
    console, navigator: globalThis.navigator, fetch: async () => ({ ok: false }),
    setTimeout, clearTimeout, Date,
    chrome: {
      contextMenus: { create() {}, onClicked: { addListener() {} } },
      runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} }, lastError: null },
      storage: { local: {
        get(defaults, callback) {
          const result = {};
          for (const [key, value] of Object.entries(defaults || {})) {
            result[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : value;
          }
          callback(result);
        },
        set(values, callback) { Object.assign(storage, values || {}); if (callback) callback(); },
      } },
      tabs: { query(_query, callback) { callback([]); } },
    },
  };
  context.importScripts = (...arquivos) => {
    for (const arquivo of arquivos) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), context, { filename: arquivo });
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), context, { filename: 'background.js' });
  return context;
}

function leitura(deckName, { words = [], terms = [], wordInfo = {}, termInfo = {} }) {
  return { cacheVersion: 2, deckName, createdAt: Date.now(), words, terms, wordInfo, termInfo };
}

const CONHECIDAS_EN = [
  'aside', 'babies', 'children', 'clock', 'dependence', 'exposed', 'farmers', 'fed', 'fields', 'lay',
  'left', 'porridge', 'rain', 'required', 'seed', 'settle', 'villages', 'wheat', 'women',
];

const VOCABULARIOS = {
  en: leitura('PerpetualMiner::Inglês', {
    words: CONHECIDAS_EN,
    terms: ['as soon as'],
    termInfo: {
      'as soon as': { status: 'mature' },
      'around the clock': { status: 'new' },
      'in order to': { status: 'recent' },
      'out of': { status: 'mixed' },
      'give up': { status: 'seen' },
    },
  }),
  ru: leitura('PerpetualMiner::Russo', { words: ['привет', 'мир', 'дом'] }),
};

const TEXTOS_EN = [
  'Its dependence on rain left it exposed to the depredations of drought.',
  'Women did so by nursing their babies around the clock.',
  'They began to settle in villages, ploughing fields, sowing wheat.',
  'After being weaned, children were fed on porridge and gruel.',
  'Farmers had to lay aside some seed to sow.',
  'He frittered away the money and gave up on the plan in order to rest.',
  'She turned out to be a remarkable cartographer, as soon as it rained.',
  'We ran out of patience because of the relentless bureaucracy.',
  'They put up with the noise, look forward to it, and get used to it.',
  'The harvest of wheat and the reaping of grain, rather than hunting.',
  'Even though it was late, she was about to leave; no matter what.',
  'a b c 12 3d it is',
  '',
  '   ',
];

const TEXTOS_RU = [
  'Я улыбаюсь',
  'Привет мир дом',
  'Он внезапно исчез в тумане.',
  'Это очень интересная и необычная история.',
  'и в на',
  '',
];

const AVALIAR = [
  ['Its dependence on rain left it exposed to the depredations of drought.', 'en'],
  ['Women did so by nursing their babies around the clock.', 'en'],
  ['Farmers had to lay aside some seed to sow.', 'en'],
  ['skip intro', 'en'],
  ['12:30', 'en'],
  ['x'.repeat(30) + ' unfathomable ' + 'y '.repeat(130), 'en'],
  ['Я улыбаюсь', 'ru'],
  ['Он внезапно исчез в тумане.', 'ru'],
  ['Привет мир дом', 'ru'],
];

const ESPERADO = {
 "en": [
  [
   "Its dependence on rain left it exposed to the depredations of drought.",
   {
    "limite2": [
     "depredations@18",
     "of@20",
     "drought@22"
    ],
    "limite1": [
     "depredations@18",
     "of@20",
     "drought@22"
    ]
   }
  ],
  [
   "Women did so by nursing their babies around the clock.",
   {
    "limite2": [
     "nursing@8",
     "|",
     "around@14",
     "the@16",
     "clock@18"
    ],
    "limite1": [
     "nursing@8"
    ]
   }
  ],
  [
   "They began to settle in villages, ploughing fields, sowing wheat.",
   {
    "limite2": [
     "ploughing@13",
     "fields@15",
     "|",
     "sowing@18",
     "wheat@20"
    ],
    "limite1": [
     "ploughing@13",
     "fields@15"
    ]
   }
  ],
  [
   "After being weaned, children were fed on porridge and gruel.",
   {
    "limite2": [
     "weaned@4",
     "|",
     "gruel@19"
    ],
    "limite1": [
     "weaned@4"
    ]
   }
  ],
  [
   "Farmers had to lay aside some seed to sow.",
   {
    "limite2": [
     "sow@16"
    ],
    "limite1": [
     "sow@16"
    ]
   }
  ],
  [
   "He frittered away the money and gave up on the plan in order to rest.",
   {
    "limite2": [
     "frittered@2",
     "away@4",
     "|",
     "money@8"
    ],
    "limite1": [
     "frittered@2",
     "away@4"
    ]
   }
  ],
  [
   "She turned out to be a remarkable cartographer, as soon as it rained.",
   {
    "limite2": [
     "cartographer@14",
     "|",
     "remarkable@12"
    ],
    "limite1": [
     "cartographer@14"
    ]
   }
  ],
  [
   "We ran out of patience because of the relentless bureaucracy.",
   {
    "limite2": [
     "bureaucracy@18",
     "|",
     "relentless@16"
    ],
    "limite1": [
     "bureaucracy@18"
    ]
   }
  ],
  [
   "They put up with the noise, look forward to it, and get used to it.",
   {
    "limite2": [
     "forward@15",
     "|",
     "noise@10"
    ],
    "limite1": [
     "forward@15"
    ]
   }
  ],
  [
   "The harvest of wheat and the reaping of grain, rather than hunting.",
   {
    "limite2": [
     "harvest@2",
     "of@4",
     "wheat@6",
     "|",
     "reaping@12",
     "of@14",
     "grain@16"
    ],
    "limite1": [
     "harvest@2",
     "of@4",
     "wheat@6"
    ]
   }
  ],
  [
   "Even though it was late, she was about to leave; no matter what.",
   {
    "limite2": [
     "though@2",
     "|",
     "matter@24"
    ],
    "limite1": [
     "though@2"
    ]
   }
  ],
  [
   "a b c 12 3d it is",
   {
    "limite2": [],
    "limite1": []
   }
  ],
  [
   "",
   {
    "limite2": [],
    "limite1": []
   }
  ],
  [
   "   ",
   {
    "limite2": [],
    "limite1": []
   }
  ]
 ],
 "ru": [
  [
   "Я улыбаюсь",
   {
    "limite1": [
     "улыбаюсь@2"
    ],
    "limite2": [
     "улыбаюсь@2"
    ]
   }
  ],
  [
   "Привет мир дом",
   {
    "limite1": [],
    "limite2": []
   }
  ],
  [
   "Он внезапно исчез в тумане.",
   {
    "limite1": [
     "внезапно@2"
    ],
    "limite2": [
     "внезапно@2",
     "|",
     "тумане@8"
    ]
   }
  ],
  [
   "Это очень интересная и необычная история.",
   {
    "limite1": [
     "интересная@4"
    ],
    "limite2": [
     "интересная@4",
     "|",
     "необычная@8"
    ]
   }
  ],
  [
   "и в на",
   {
    "limite1": [],
    "limite2": []
   }
  ],
  [
   "",
   {
    "limite1": [],
    "limite2": []
   }
  ]
 ],
 "avaliar": [
  [
   "Its dependence on rain left it exposed t",
   "en",
   {
    "accept": true,
    "reason": "en_new_item",
    "keywords": [
     "depredations@18",
     "of@20",
     "drought@22"
    ]
   }
  ],
  [
   "Women did so by nursing their babies aro",
   "en",
   {
    "accept": true,
    "reason": "en_multi_new_items",
    "keywords": [
     "nursing@8",
     "|",
     "around@14",
     "the@16",
     "clock@18"
    ]
   }
  ],
  [
   "Farmers had to lay aside some seed to so",
   "en",
   {
    "accept": true,
    "reason": "en_new_item",
    "keywords": [
     "sow@16"
    ]
   }
  ],
  [
   "skip intro",
   "en",
   {
    "accept": false,
    "reason": "low_quality_text"
   }
  ],
  [
   "12:30",
   "en",
   {
    "accept": false,
    "reason": "low_quality_text"
   }
  ],
  [
   "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx unfathoma",
   "en",
   {
    "accept": false,
    "reason": "too_long_en"
   }
  ],
  [
   "Я улыбаюсь",
   "ru",
   {
    "accept": true,
    "reason": "ru_i_plus_1",
    "keywords": [
     "улыбаюсь@2"
    ]
   }
  ],
  [
   "Он внезапно исчез в тумане.",
   "ru",
   {
    "accept": false,
    "reason": "not_i_plus_1"
   }
  ],
  [
   "Привет мир дом",
   "ru",
   {
    "accept": false,
    "reason": "no_new_item"
   }
  ]
 ],
 "semVocabulario": []
};

async function saidaAtual() {
  const storage = { pm_auto_keyword_vocab_en: VOCABULARIOS.en, pm_auto_keyword_vocab_ru: VOCABULARIOS.ru };
  const context = carregarBackground(storage);
  const saida = { en: [], ru: [], avaliar: [] };
  for (const texto of TEXTOS_EN) {
    saida.en.push([texto, {
      limite2: await context.autoKeywordsForPhraseByLang({ texto }, 'en', { limit: 2, requireVocabulary: true }),
      limite1: await context.autoKeywordsForPhraseByLang({ texto }, 'en', { limit: 1 }),
    }]);
  }
  for (const texto of TEXTOS_RU) {
    saida.ru.push([texto, {
      limite1: await context.autoKeywordsForPhraseByLang({ texto }, 'ru', {}),
      limite2: await context.autoKeywordsForPhraseByLang({ texto }, 'ru', { limit: 2 }),
    }]);
  }
  for (const [texto, lang] of AVALIAR) saida.avaliar.push([texto.slice(0, 40), lang, await context.evaluateAutoMinerPhrase(texto, lang)]);

  const semVocabulario = carregarBackground({});
  saida.semVocabulario = await semVocabulario.autoKeywordsForPhraseByLang({ texto: TEXTOS_EN[0] }, 'en', { limit: 2, requireVocabulary: true });
  return JSON.parse(JSON.stringify(saida));
}

// Depois da mudança, a função pura dá a mesma saída sem passar pelo service worker.
const plano = valor => JSON.parse(JSON.stringify(valor));

async function escolherDireto() {
  const { PalavraAutomatica } = carregarBackground({}).PerpetualMiner;
  if (!PalavraAutomatica) return;
  const contexto = carregarBackground({});
  const vocab = lang => contexto.autoVocabularyFromCache(VOCABULARIOS[lang]);
  for (const [texto, saidas] of ESPERADO.en) {
    assert.deepStrictEqual(plano(PalavraAutomatica.escolher(texto, 'en', vocab('en'), { limit: 2, requireVocabulary: true })), saidas.limite2, texto);
    assert.deepStrictEqual(plano(PalavraAutomatica.escolher(texto, 'en', vocab('en'), { limit: 1 })), saidas.limite1, texto);
  }
  for (const [texto, saidas] of ESPERADO.ru) {
    assert.deepStrictEqual(plano(PalavraAutomatica.escolher(texto, 'ru', vocab('ru'), {})), saidas.limite1, texto);
    assert.deepStrictEqual(plano(PalavraAutomatica.escolher(texto, 'ru', vocab('ru'), { limit: 2 })), saidas.limite2, texto);
  }
  for (const [texto, lang, avaliacao] of ESPERADO.avaliar) {
    const completo = AVALIAR.find(([t]) => t.slice(0, 40) === texto)[0];
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await PalavraAutomatica.avaliar(completo, lang, vocab(lang)))), avaliacao, texto);
  }
}

async function run() {
  const atual = await saidaAtual();
  if (process.env.PALAVRA_GRAVAR) {
    console.log(JSON.stringify(atual, null, 1));
    return;
  }
  assert.deepStrictEqual(atual, ESPERADO, 'a escolha da Palavra automática mudou');
  await escolherDireto();
  console.log('Palavra automática: a escolha fixada continua igual.');
}

run().catch(erro => { console.error(erro); process.exit(1); });
