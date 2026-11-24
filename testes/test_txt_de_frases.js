'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function fantasma() {
  return new Proxy(function () {}, {
    get: (_, chave) => (chave === Symbol.toPrimitive ? () => '' : chave === 'then' ? undefined : fantasma()),
    apply: () => fantasma(),
    construct: () => fantasma(),
    has: () => true,
    set: () => true,
  });
}

function carregarOFormato() {
  const contexto = { console, document: fantasma(), chrome: fantasma(), window: fantasma(), navigator: fantasma(), Blob, URL, setTimeout, clearTimeout, Date, Promise };
  contexto.PerpetualMiner = new Proxy({}, { get: (alvo, chave) => (chave in alvo ? alvo[chave] : fantasma()), set: (alvo, chave, valor) => { alvo[chave] = valor; return true; } });
  contexto.globalThis = contexto;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync('lib/mineracao.js', 'utf8'), contexto, { filename: 'lib/mineracao.js' });
  vm.runInContext(fs.readFileSync('painel/painel.js', 'utf8'), contexto, { filename: 'painel/painel.js' });
  const comoPlano = valor => JSON.parse(JSON.stringify(valor));
  const guardar = (frase, palavras) => vm.runInContext('(frase, palavras) => { keywords[frase.id] = palavras; }', contexto)(frase, palavras);
  return {
    ler: linha => comoPlano(contexto.lerLinhaDoTxt(linha)),
    escrever: (frase, palavras) => { guardar(frase, palavras); return contexto.linhaDoTxt(frase); },
    escreverParaOAnki: (frase, palavras) => { guardar(frase, palavras); return contexto.linhaParaOAnki(frase); },
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

const ESCRITAS = [
  ['sem Palavra, o texto e o Contexto com as três partes', frase('Break a leg.', DARK), undefined, 'Break a leg. [Contexto: netflix - Dark - S01E02]', 'Break a leg. [Contexto: netflix - Dark - S01E02]'],
  ['partes que faltam ou não valem saem como Desconhecido', frase('Hi there.', { fonte: 'netflix', titulo: ' ', detalhe: 'undefined' }), undefined, 'Hi there. [Contexto: netflix - Desconhecido - Desconhecido]', 'Hi there. [Contexto: netflix - Desconhecido - Desconhecido]'],
  ['sem Contexto nenhum, a Fonte vem do streaming da frase antiga', { id: 1, texto: 'Hi there.', streaming: 'youtube' }, undefined, 'Hi there. [Contexto: youtube - Desconhecido - Desconhecido]', 'Hi there. [Contexto: youtube - Desconhecido - Desconhecido]'],
  ['a Palavra vai antes, sem a posição e com os grupos separados por “ | ”', frase('He got cold feet before the wedding.', DARK), ['cold@4', 'feet@6', '|', 'wedding@12'], 'cold feet | wedding : He got cold feet before the wedding. [Contexto: netflix - Dark - S01E02]', 'cold feet | wedding : He got cold feet before the wedding. [Contexto: netflix - Dark - S01E02]'],
  ['o grupo que já não está no texto sai do .txt, mas fica na linha do Anki', frase('He got cold feet before the party.', DARK), ['cold@4', 'feet@6', '|', 'wedding@12'], 'cold feet : He got cold feet before the party. [Contexto: netflix - Dark - S01E02]', 'cold feet | wedding : He got cold feet before the party. [Contexto: netflix - Dark - S01E02]'],
  ['as quebras e os espaços do texto viram um espaço só', frase('Break   a\nleg.', DARK), undefined, 'Break a leg. [Contexto: netflix - Dark - S01E02]', 'Break a leg. [Contexto: netflix - Dark - S01E02]'],
  ['um texto com “ : ” e sem Palavra leva o prefixo vazio no .txt, e nenhum na linha do Anki', frase('Note : this matters a lot.', DARK), undefined, ': Note : this matters a lot. [Contexto: netflix - Dark - S01E02]', 'Note : this matters a lot. [Contexto: netflix - Dark - S01E02]'],
  ['um texto que começa com “:” e sem Palavra leva o prefixo vazio no .txt', frase(':) is a smile', DARK), undefined, ': :) is a smile [Contexto: netflix - Dark - S01E02]', ':) is a smile [Contexto: netflix - Dark - S01E02]'],
];

ESCRITAS.forEach(([nome, quem, palavras, noTxt, noAnki], i) => {
  const dela = { ...quem, id: `escrita-${i}` };
  assert.strictEqual(formato.escrever(dela, palavras), noTxt, `.txt: ${nome}`);
  assert.strictEqual(formato.escreverParaOAnki(dela, palavras), noAnki, `Anki: ${nome}`);
});

const IDA_E_VOLTA = [
  [frase('The harbour : a quiet place.', { fonte: 'livro', titulo: 'Dark - Season 1', detalhe: 'cap. 3' }), ['harbour@2']],
  [frase('Note : this matters a lot.', { fonte: 'netflix', titulo: 'Dark', detalhe: '' }), undefined],
  [frase('He got cold feet before the wedding.', { fonte: 'youtube', titulo: 'Vsauce', detalhe: 'canal' }), ['cold@4', 'feet@6', '|', 'wedding@12']],
  [frase('Attention :', DARK), undefined],
  [frase('Он так и не сказал спасибо.', { fonte: 'web', titulo: '', detalhe: '' }), ['спасибо@10']],
];

IDA_E_VOLTA.forEach(([original, palavras], i) => {
  const dela = { ...original, id: `volta-${i}` };
  const lida = formato.ler(formato.escrever(dela, palavras));
  assert.strictEqual(lida.texto, original.texto, `ida e volta: o texto de “${original.texto}”`);
  assert.deepStrictEqual(lida.contexto, original.contexto, `ida e volta: o Contexto de “${original.texto}”`);
  const esperadas = (palavras || []).filter(item => item === '|' || original.texto.includes(item.replace(/@\d+$/, '')));
  assert.deepStrictEqual(lida.palavras, palavras ? esperadas : [], `ida e volta: as Palavras de “${original.texto}”`);
});

console.log('formato do .txt tests passed');
