'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const contexto = vm.createContext({});
contexto.globalThis = contexto;
vm.runInContext(fs.readFileSync('lib/ajustes-de-envio.js', 'utf8'), contexto);
const { normalizar, PADRAO } = contexto.PerpetualMiner.AjustesDeEnvio;
const comoValor = valor => JSON.parse(JSON.stringify(valor));
const doIdioma = (cru, lang = 'en') => comoValor(normalizar({ [lang]: cru })[lang]);
const padrao = (lang = 'en') => ({ ...comoValor(PADRAO[lang]), versao: 0 });

for (const cru of [null, undefined, {}, 'texto', 7, []]) {
  assert.deepStrictEqual(comoValor(normalizar(cru)), { en: padrao('en'), ru: padrao('ru') }, `cru ${JSON.stringify(cru)}`);
}
assert.deepStrictEqual(Object.keys(normalizar({ fr: { deckName: 'x' } })), ['en', 'ru']);
assert.deepStrictEqual(doIdioma({ deckName: 'Meu baralho' }, 'ru'), { ...padrao('ru'), deckName: 'Meu baralho' });
assert.deepStrictEqual(doIdioma({ deckName: 'Do inglês' }, 'ru'), { ...padrao('ru'), deckName: 'Do inglês' });

const CAMPOS = {
  versao: { aceitos: [[3, 3], [0, 0], [-2, -2]], recusados: ['3', 1.5, null, NaN, true] },
  deckName: { aceitos: [['Baralho', 'Baralho'], ['  Com espaço  ', 'Com espaço'], [12, '12']], recusados: ['', '   ', null, undefined] },
  ttsWordTld: { aceitos: [['co.uk', 'co.uk'], [' ca ', 'ca']], recusados: ['', '  ', null] },
  ttsPhraseTld: { aceitos: [['ie', 'ie'], [' co.za ', 'co.za']], recusados: ['', '  ', null] },
  imageSource: { aceitos: [['2', '2'], [2, '2'], ['1', '1'], [1, '1']], recusados: ['3', 0, '', null, 'foto'] },
  ttsReserva: { aceitos: [['nenhuma', 'nenhuma'], ['openai', 'openai']], recusados: ['gemini', '', null, 1] },
  nivel: { aceitos: [['intermediario', 'intermediario'], ['avancado', 'avancado'], ['iniciante', 'iniciante']], recusados: ['expert', '', null, 'Avancado'] },
  frente: { aceitos: [['ditado', 'ditado'], ['lacuna', 'lacuna'], ['criacao', 'criacao']], recusados: ['quiz', '', null, 'Ditado'] },
};

for (const [campo, { aceitos, recusados }] of Object.entries(CAMPOS)) {
  for (const [entrada, esperado] of aceitos) {
    assert.deepStrictEqual(doIdioma({ [campo]: entrada })[campo], esperado, `${campo} aceita ${JSON.stringify(entrada)}`);
  }
  for (const entrada of recusados) {
    assert.deepStrictEqual(doIdioma({ [campo]: entrada }), padrao(), `${campo} recusa ${JSON.stringify(entrada)}`);
  }
  assert.deepStrictEqual(doIdioma({}), padrao(), `${campo} ausente`);
}

const tipo = { nome: 'Meu tipo', mapa: { frase: 'Frente', resposta: 'Verso' } };
assert.deepStrictEqual(doIdioma({ tipoProprio: tipo }).tipoProprio, tipo);
assert.deepStrictEqual(doIdioma({ tipoProprio: { nome: '  Meu tipo ', mapa: tipo.mapa } }).tipoProprio, tipo, 'o nome sai aparado');
assert.deepStrictEqual(
  doIdioma({ tipoProprio: { nome: 'T', mapa: { imagem: 'Img', palavra: 'P', frase: 'F' } } }).tipoProprio.mapa,
  { frase: 'F', palavra: 'P', imagem: 'Img' },
  'as partes saem na ordem do tipo, não na da entrada',
);
for (const tipoRecusado of [
  null, 'texto', {}, { nome: 'T' }, { mapa: { frase: 'F' } }, { nome: '', mapa: { frase: 'F' } }, { nome: '  ', mapa: { frase: 'F' } },
  { nome: 7, mapa: { frase: 'F' } }, { nome: 'T', mapa: null }, { nome: 'T', mapa: 'frase' }, { nome: 'T', mapa: {} },
  { nome: 'T', mapa: { frase: '' } }, { nome: 'T', mapa: { frase: 3 } }, { nome: 'T', mapa: { outra: 'X' } },
  { nome: 'T', mapa: { frase: 'F', outra: 'X' } },
]) {
  assert.deepStrictEqual(doIdioma({ tipoProprio: tipoRecusado }), padrao(), `tipo próprio recusado ${JSON.stringify(tipoRecusado)}`);
}
const guardado = normalizar({ en: { tipoProprio: tipo } }).en.tipoProprio;
assert.ok(Object.isFrozen(guardado) && Object.isFrozen(guardado.mapa), 'o tipo próprio guardado é congelado');

console.log('AjustesDeEnvio.normalizar tests passed');
