'use strict';

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('../lib/ajustes-de-envio.js');
const { AjustesDeEnvio } = globalThis.PerpetualMiner;
const { PADRAO, normalizar } = AjustesDeEnvio;

const emIngles = cru => normalizar({ en: cru }).en;
const comoValor = valor => JSON.parse(JSON.stringify(valor));

function umaTabelaDeCampo(campo, casos) {
  for (const [descricao, entrada, esperado] of casos) {
    const cru = entrada === undefined ? {} : { [campo]: entrada };
    assert.deepStrictEqual(emIngles(cru)[campo], esperado, `${campo}: ${descricao}`);
  }
}

assert.deepStrictEqual(comoValor(normalizar(null)), { en: { ...PADRAO.en, versao: 0 }, ru: { ...PADRAO.ru, versao: 0 } }, 'sem nada gravado vale o padrão dos dois Idiomas');
assert.deepStrictEqual(comoValor(normalizar({ fr: { nivel: 'avancado' } })), comoValor(normalizar(null)), 'um Idioma fora dos Ajustes é ignorado');
assert.strictEqual(normalizar({ ru: { deckName: 'Russo' } }).en.deckName, PADRAO.en.deckName, 'cada Idioma lê só o seu');

for (const campo of ['deckName', 'ttsWordTld', 'ttsPhraseTld']) {
  umaTabelaDeCampo(campo, [
    ['aceito, sem as pontas em branco', '  valor  ', 'valor'],
    ['um número vira texto', 5, '5'],
    ['só espaços volta ao padrão', '   ', PADRAO.en[campo]],
    ['vazio volta ao padrão', '', PADRAO.en[campo]],
    ['null volta ao padrão', null, PADRAO.en[campo]],
    ['ausente volta ao padrão', undefined, PADRAO.en[campo]],
  ]);
}

umaTabelaDeCampo('imageSource', [
  ['a foto real, em texto', '1', '1'],
  ['a gerada por IA, em texto', '2', '2'],
  ['a gerada por IA, em número', 2, '2'],
  ['recusado: um valor que não é uma fonte', '3', PADRAO.en.imageSource],
  ['recusado: texto qualquer', 'foto', PADRAO.en.imageSource],
  ['recusado: null', null, PADRAO.en.imageSource],
  ['ausente', undefined, PADRAO.en.imageSource],
]);

umaTabelaDeCampo('ttsReserva', [
  ['openai', 'openai', 'openai'],
  ['nenhuma', 'nenhuma', 'nenhuma'],
  ['recusado: outra voz', 'google', PADRAO.en.ttsReserva],
  ['recusado: um número', 1, PADRAO.en.ttsReserva],
  ['ausente', undefined, PADRAO.en.ttsReserva],
]);

umaTabelaDeCampo('nivel', [
  ['iniciante', 'iniciante', 'iniciante'],
  ['intermediario', 'intermediario', 'intermediario'],
  ['avancado', 'avancado', 'avancado'],
  ['recusado: com acento', 'avançado', PADRAO.en.nivel],
  ['recusado: texto qualquer', 'expert', PADRAO.en.nivel],
  ['ausente', undefined, PADRAO.en.nivel],
]);

umaTabelaDeCampo('frente', [
  ...['frase_com_audio', 'ouvir_primeiro', 'lacuna', 'producao', 'ditado', 'criacao'].map(frente => [`aceito: ${frente}`, frente, frente]),
  ['recusado: texto qualquer', 'cartao', PADRAO.en.frente],
  ['ausente', undefined, PADRAO.en.frente],
]);

umaTabelaDeCampo('versao', [
  ['um inteiro', 7, 7],
  ['zero', 0, 0],
  ['recusado: decimal', 1.5, 0],
  ['recusado: texto', '3', 0],
  ['ausente', undefined, 0],
]);

const MAPA = { frase: 'Frase', audio_da_frase: 'Áudio', resposta: 'Resposta', palavra: 'Palavra', audio_da_palavra: 'Áudio da palavra', imagem: 'Imagem' };
const tipoProprio = cru => emIngles({ tipoProprio: cru }).tipoProprio;

assert.deepStrictEqual(comoValor(tipoProprio({ nome: '  Meu tipo ', mapa: MAPA })), { nome: 'Meu tipo', mapa: MAPA }, 'um tipo próprio válido guarda o nome sem as pontas em branco');
assert.deepStrictEqual(Object.keys(tipoProprio({ nome: 'T', mapa: { imagem: 'I', frase: 'F' } }).mapa), ['frase', 'imagem'], 'as partes saem na ordem das partes do tipo próprio');
assert.ok(Object.isFrozen(tipoProprio({ nome: 'T', mapa: { frase: 'F' } })) && Object.isFrozen(tipoProprio({ nome: 'T', mapa: { frase: 'F' } }).mapa), 'o tipo próprio é congelado');
for (const [descricao, cru] of [
  ['ausente', undefined],
  ['null', null],
  ['sem nome', { mapa: MAPA }],
  ['nome que não é texto', { nome: 4, mapa: MAPA }],
  ['nome só com espaços', { nome: '   ', mapa: MAPA }],
  ['sem mapa', { nome: 'T' }],
  ['mapa que não é objeto', { nome: 'T', mapa: 'frase' }],
  ['mapa vazio', { nome: 'T', mapa: {} }],
  ['parte que o tipo próprio não tem', { nome: 'T', mapa: { frase: 'F', verso: 'V' } }],
  ['campo que não é texto', { nome: 'T', mapa: { frase: 3 } }],
  ['campo vazio', { nome: 'T', mapa: { frase: '' } }],
]) {
  assert.strictEqual(emIngles({ tipoProprio: cru }).tipoProprio, undefined, `tipo próprio recusado: ${descricao}`);
}

console.log('normalização dos Ajustes de envio tests passed');
