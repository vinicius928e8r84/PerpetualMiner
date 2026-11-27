'use strict';

const assert = require('assert');

function carregarOFormato() {
  globalThis.PerpetualMiner = {};
  require('../lib/mineracao.js');
  require('../lib/txt-de-frases.js');
  const { TxtDeFrases } = globalThis.PerpetualMiner;
  return {
    ler: linha => JSON.parse(JSON.stringify(TxtDeFrases.ler(linha))),
    escreverParaOAnki: (frase, palavras) => TxtDeFrases.escreverParaOAnki(frase, palavras),
  };
}

const formato = carregarOFormato();
const IMPORTADO = { fonte: 'importado', titulo: '', detalhe: '' };
const frase = (texto, contexto, extras = {}) => ({ id: texto, texto, contexto, ...extras });
const DARK = { fonte: 'netflix', titulo: 'Dark', detalhe: 'S01E02' };

const LIDAS = [
  ['uma linha só com o texto, sem Contexto, vem com a Fonte importado e sem Palavras', 'Break a leg.', { texto: 'Break a leg.', contexto: IMPORTADO }],
  ['as pontas em branco saem', '   Break a leg.  ', { texto: 'Break a leg.', contexto: IMPORTADO }],
  ['com Contexto, o Contexto vem das três partes e as Palavras ficam vazias', 'Break a leg. [Contexto: netflix - Dark - S01E02]', { texto: 'Break a leg.', contexto: DARK, palavras: [] }],
  ['“Desconhecido” e partes que faltam viram vazio, em qualquer caixa', 'Hi there. [Contexto: netflix - desconhecido]', { texto: 'Hi there.', contexto: { fonte: 'netflix', titulo: '', detalhe: '' }, palavras: [] }],
  ['uma Fonte “Desconhecido” cai na Fonte importado', 'Hi there. [Contexto: Desconhecido - Dark - S01]', { texto: 'Hi there.', contexto: { fonte: 'importado', titulo: 'Dark', detalhe: 'S01' }, palavras: [] }],
  ['com mais de três partes, o título fica com as do meio e o detalhe é a última', 'Hi there. [Contexto: livro - Dark - Season 1 - cap. 3]', { texto: 'Hi there.', contexto: { fonte: 'livro', titulo: 'Dark - Season 1', detalhe: 'cap. 3' }, palavras: [] }],
  ['só a Fonte no Contexto', 'Hi there. [Contexto: netflix]', { texto: 'Hi there.', contexto: { fonte: 'netflix', titulo: '', detalhe: '' }, palavras: [] }],
  ['a Palavra antes de “ : ” vira o grupo marcado no texto', 'harbour : The harbour is quiet.', { texto: 'The harbour is quiet.', contexto: IMPORTADO, palavras: ['harbour@2'] }],
  ['a Palavra com Contexto', 'harbour : The harbour is quiet. [Contexto: livro - Dark - Desconhecido]', { texto: 'The harbour is quiet.', contexto: { fonte: 'livro', titulo: 'Dark', detalhe: '' }, palavras: ['harbour@2'] }],
  ['um “ : ” dentro do texto não é separador de Palavra quando o prefixo não está no texto', 'Note : this matters a lot.', { texto: 'Note : this matters a lot.', contexto: IMPORTADO }],
  ['a Palavra que já não está no texto deixa a linha inteira como texto', 'wedding : She finally made it home.', { texto: 'wedding : She finally made it home.', contexto: IMPORTADO }],
  ['“: ” no começo diz que a frase não tem Palavra, mesmo com “ : ” no texto', ': Note : this matters a lot.', { texto: 'Note : this matters a lot.', contexto: IMPORTADO, palavras: [] }],
  ['um texto que termina em “ :” não perde o fim', 'Attention :', { texto: 'Attention :', contexto: IMPORTADO }],
  ['Palavra sem texto e com Contexto não é frase', 'palavra : [Contexto: web - Desconhecido - Desconhecido]', null],
  ['linha vazia não é frase', '', null],
  ['linha só de espaços não é frase', '   ', null],
  ['só “:” não é frase', ':', null],
  ['só o Contexto não é frase', '[Contexto: web - Dark - S01]', null],
];

for (const [nome, linha, esperado] of LIDAS) assert.deepStrictEqual(formato.ler(linha), esperado, nome);

const ESCRITAS_PARA_O_ANKI = [
  ['sem Palavra, o texto e o Contexto com as três partes', frase('Break a leg.', DARK), undefined, 'Break a leg. [Contexto: netflix - Dark - S01E02]'],
  ['partes que faltam ou não valem saem como Desconhecido', frase('Hi there.', { fonte: 'netflix', titulo: ' ', detalhe: 'undefined' }), undefined, 'Hi there. [Contexto: netflix - Desconhecido - Desconhecido]'],
  ['sem Contexto nenhum, a Fonte vem do streaming da frase antiga', { id: 1, texto: 'Hi there.', streaming: 'youtube' }, undefined, 'Hi there. [Contexto: youtube - Desconhecido - Desconhecido]'],
  ['a Palavra vai antes, sem a posição e com os grupos separados por “ | ”', frase('He got cold feet before the wedding.', DARK), ['cold@4', 'feet@6', '|', 'wedding@12'], 'cold feet | wedding : He got cold feet before the wedding. [Contexto: netflix - Dark - S01E02]'],
  ['o grupo que já não está no texto fica na linha do Anki', frase('He got cold feet before the party.', DARK), ['cold@4', 'feet@6', '|', 'wedding@12'], 'cold feet | wedding : He got cold feet before the party. [Contexto: netflix - Dark - S01E02]'],
  ['as quebras e os espaços do texto viram um espaço só', frase('Break   a\nleg.', DARK), undefined, 'Break a leg. [Contexto: netflix - Dark - S01E02]'],
  ['um texto com “ : ” e sem Palavra não leva prefixo na linha do Anki', frase('Note : this matters a lot.', DARK), undefined, 'Note : this matters a lot. [Contexto: netflix - Dark - S01E02]'],
  ['um texto que começa com “:” e sem Palavra não leva prefixo na linha do Anki', frase(':) is a smile', DARK), undefined, ':) is a smile [Contexto: netflix - Dark - S01E02]'],
];

ESCRITAS_PARA_O_ANKI.forEach(([nome, quem, palavras, noAnki], i) => {
  const dela = { ...quem, id: `escrita-${i}` };
  assert.strictEqual(formato.escreverParaOAnki(dela, palavras), noAnki, `Anki: ${nome}`);
});

console.log('formato do .txt tests passed');
