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
const { PalavraAutomatica, PalavrasFrequentes } = contexto.PerpetualMiner;
const { palavrasDaLinhaCurta, palavrasConhecidasParaALinhaNormal } = PalavraAutomatica.LIMITES_DO_INICIANTE;

const INICIANTE = 'iniciante';
const plano = valor => JSON.parse(JSON.stringify(valor));
const aceita = (reason, ...keywords) => ({ accept: true, reason, keywords });
const recusa = reason => ({ accept: false, reason });

function vocabulario({ conhecidas = [], novas = [], outras = 0, available = true } = {}) {
  const preenchimento = Array.from({ length: outras }, (_, i) => `conhecida${i}`);
  const words = [...conhecidas, ...novas, ...preenchimento];
  const wordInfo = new Map(novas.map(palavra => [palavra, { status: 'new' }]));
  return { available, words: new Set(words), terms: new Set(), wordInfo, termInfo: new Map() };
}

const comOTotalDe = (total, conhecidas) => vocabulario({ conhecidas, outras: total - conhecidas.length });
const avaliar = (texto, lang, vocab, nivel = INICIANTE) => PalavraAutomatica.avaliar(texto, lang, { vocabulario: vocab, nivel }).then(plano);

const SEIS_PALAVRAS = 'The old man left the house';
const SABE_O_RESTO = ['old', 'man', 'left'];

async function osNumerosDoIniciantePorEscritoSaoOsDaSpec() {
  assert.deepStrictEqual(plano(PalavraAutomatica.LIMITES_DO_INICIANTE), { palavrasDaLinhaCurta: 3, palavrasConhecidasParaALinhaNormal: 200 });
}

async function inicianteComPoucoVocabularioILoveYouEntraComAPalavraComumDesconhecida() {
  assert.deepStrictEqual(await avaliar('I love you', 'en', vocabulario()), aceita('en_new_item', 'love@2'));
}

async function aLinhaDoTamanhoDaLinhaCurtaAindaEntra() {
  const linha = 'house old man';
  assert.strictEqual(linha.split(' ').length, palavrasDaLinhaCurta);
  assert.deepStrictEqual(await avaliar(linha, 'en', vocabulario({ conhecidas: ['old', 'man'] })), aceita('en_new_item', 'house@0'));
}

async function inicianteComPoucoVocabularioRecusaALinhaI1MaisLonga() {
  assert.ok(SEIS_PALAVRAS.split(' ').length > palavrasDaLinhaCurta);
  assert.deepStrictEqual(await avaliar(SEIS_PALAVRAS, 'en', comOTotalDe(palavrasConhecidasParaALinhaNormal - 1, SABE_O_RESTO)), recusa('linha_longa'));
}

async function inicianteComOVocabularioDaLinhaNormalAceitaALinhaI1DeSeisPalavras() {
  assert.deepStrictEqual(await avaliar(SEIS_PALAVRAS, 'en', comOTotalDe(palavrasConhecidasParaALinhaNormal, SABE_O_RESTO)), aceita('en_new_item', 'house@10'));
}

async function aPalavraNovaNoBaralhoNaoContaParaOsDuzentosConhecidos() {
  const vocab = vocabulario({ conhecidas: SABE_O_RESTO, novas: Array.from({ length: palavrasConhecidasParaALinhaNormal }, (_, i) => `nova${i}`) });
  assert.deepStrictEqual(await avaliar(SEIS_PALAVRAS, 'en', vocab), recusa('linha_longa'));
}

async function aLinhaLongaEORecusadaAntesDeContarOQueSobra() {
  const vocab = comOTotalDe(palavrasConhecidasParaALinhaNormal - 1, []);
  assert.deepStrictEqual(await avaliar(SEIS_PALAVRAS, 'en', vocab), recusa('linha_longa'));
  assert.deepStrictEqual(await avaliar('The zebra left the yak llama', 'en', vocab), recusa('linha_longa'));
}

async function inicianteSemVocabularioRecusaPorFaltaDeVocabulario() {
  assert.deepStrictEqual(await avaliar(SEIS_PALAVRAS, 'en', vocabulario({ available: false })), recusa('sem_vocabulario'));
}

async function inicianteRecusaAPalavraNovaQueNaoEComum() {
  assert.ok(!PalavrasFrequentes.ehFrequente('en', 'zebra'));
  assert.deepStrictEqual(await avaliar('I see zebra', 'en', vocabulario({ conhecidas: ['see'] })), recusa('fora_do_nivel'));
  const longa = 'The old man left the zebra';
  assert.deepStrictEqual(await avaliar(longa, 'en', comOTotalDe(palavrasConhecidasParaALinhaNormal, SABE_O_RESTO)), recusa('fora_do_nivel'));
}

async function aPalavraNovaNoBaralhoMasComumEntra() {
  const vocab = vocabulario({ conhecidas: ['see'], novas: ['house'] });
  assert.deepStrictEqual(await avaliar('I see house', 'en', vocab), aceita('en_new_item', 'house@4'));
}

async function aPalavraComumEmMaiusculaNoComecoDaFraseEntra() {
  assert.deepStrictEqual(await avaliar('Love you', 'en', vocabulario()), aceita('en_new_item', 'love@0'));
}

async function umaLinhaSemNadaNovoOuComDuasCoisasNovasContinuaComOMotivoDeHoje() {
  assert.deepStrictEqual(await avaliar('I see you', 'en', vocabulario({ conhecidas: ['see'] })), recusa('nada_novo'));
  assert.deepStrictEqual(await avaliar('love house', 'en', vocabulario()), recusa('nao_e_i_mais_1'));
}

async function intermediarioEAvancadoMantemOTetoDeHojeEAceitamQualquerPalavraNova() {
  for (const nivel of ['intermediario', 'avancado']) {
    assert.deepStrictEqual(await avaliar('The old man left the zebra', 'en', comOTotalDe(3, SABE_O_RESTO), nivel), aceita('en_new_item', 'zebra@10'), nivel);
    assert.deepStrictEqual(await avaliar('I see zebra', 'en', vocabulario({ conhecidas: ['see'] }), nivel), aceita('en_new_item', 'zebra@4'), nivel);
  }
}

async function semNivelAAvaliacaoEIgualAoIntermediario() {
  const vocab = comOTotalDe(3, SABE_O_RESTO);
  assert.deepStrictEqual(plano(await PalavraAutomatica.avaliar('The old man left the zebra', 'en', { vocabulario: vocab })), aceita('en_new_item', 'zebra@10'));
}

async function oTetoDeHojeContinuaValendoParaOIniciante() {
  const comprida = `${'old '.repeat(60)}zebra`;
  assert.ok(comprida.length > 240);
  assert.deepStrictEqual(await avaliar(comprida, 'en', comOTotalDe(palavrasConhecidasParaALinhaNormal, ['old'])), recusa('too_long_en'));
}

async function oNivelPodeVirDeUmaFuncaoComoOVocabulario() {
  const resultado = plano(await PalavraAutomatica.avaliar('The old man left the zebra', 'en', { vocabulario: () => comOTotalDe(3, SABE_O_RESTO), nivel: () => INICIANTE }));
  assert.deepStrictEqual(resultado, recusa('linha_longa'));
}

async function emRussoOInicianteAceitaAPalavraComumDeUmaLinhaCurta() {
  assert.deepStrictEqual(await avaliar('Я люблю тебя', 'ru', vocabulario({ conhecidas: ['тебя'] })), aceita('ru_i_plus_1', 'люблю@2'));
}

async function emRussoOInicianteRecusaALinhaLongaEAPalavraIncomum() {
  const conhecidas = ['люблю', 'видел', 'дом'];
  assert.deepStrictEqual(await avaliar('Я видел дом и люблю тебя', 'ru', comOTotalDe(palavrasConhecidasParaALinhaNormal - 1, conhecidas)), recusa('linha_longa'));
  assert.deepStrictEqual(await avaliar('Я видел зебра', 'ru', vocabulario({ conhecidas: ['видел'] })), recusa('fora_do_nivel'));
  assert.deepStrictEqual(await avaliar('Я видел дом и тебя зебра', 'ru', comOTotalDe(palavrasConhecidasParaALinhaNormal, conhecidas)), recusa('fora_do_nivel'));
}

async function emRussoOIntermediarioAceitaQualquerPalavraNova() {
  assert.deepStrictEqual(await avaliar('Я видел зебра', 'ru', vocabulario({ conhecidas: ['видел'] }), 'intermediario'), aceita('ru_i_plus_1', 'зебра@4'));
}

async function aListaDeFrequentesTemInglesERussoEIgnoraOQueNaoELista() {
  assert.ok(PalavrasFrequentes.ehFrequente('en', 'Love'));
  assert.ok(PalavrasFrequentes.ehFrequente('ru', 'люблю'));
  assert.ok(!PalavrasFrequentes.ehFrequente('ru', 'love'));
  assert.ok(!PalavrasFrequentes.ehFrequente('es', 'amor'));
  assert.ok(!PalavrasFrequentes.ehFrequente('en', ''));
  assert.ok(!PalavrasFrequentes.ehFrequente('en', undefined));
}

(async () => {
  const casos = [
    osNumerosDoIniciantePorEscritoSaoOsDaSpec, inicianteComPoucoVocabularioILoveYouEntraComAPalavraComumDesconhecida, aLinhaDoTamanhoDaLinhaCurtaAindaEntra,
    inicianteComPoucoVocabularioRecusaALinhaI1MaisLonga, inicianteComOVocabularioDaLinhaNormalAceitaALinhaI1DeSeisPalavras,
    aPalavraNovaNoBaralhoNaoContaParaOsDuzentosConhecidos, aLinhaLongaEORecusadaAntesDeContarOQueSobra, inicianteSemVocabularioRecusaPorFaltaDeVocabulario,
    inicianteRecusaAPalavraNovaQueNaoEComum, aPalavraNovaNoBaralhoMasComumEntra, aPalavraComumEmMaiusculaNoComecoDaFraseEntra,
    umaLinhaSemNadaNovoOuComDuasCoisasNovasContinuaComOMotivoDeHoje, intermediarioEAvancadoMantemOTetoDeHojeEAceitamQualquerPalavraNova,
    semNivelAAvaliacaoEIgualAoIntermediario, oTetoDeHojeContinuaValendoParaOIniciante, oNivelPodeVirDeUmaFuncaoComoOVocabulario,
    emRussoOInicianteAceitaAPalavraComumDeUmaLinhaCurta, emRussoOInicianteRecusaALinhaLongaEAPalavraIncomum, emRussoOIntermediarioAceitaQualquerPalavraNova,
    aListaDeFrequentesTemInglesERussoEIgnoraOQueNaoELista,
  ];
  let falhas = 0;
  for (const caso of casos) {
    try {
      await caso();
      console.log(`ok  ${caso.name}`);
    } catch (erro) {
      falhas++;
      console.log(`FALHOU  ${caso.name}\n${erro.stack || erro.message}`);
    }
  }
  if (falhas) process.exit(1);
  console.log('test_palavra_automatica_iniciante.js: tudo certo');
})();
