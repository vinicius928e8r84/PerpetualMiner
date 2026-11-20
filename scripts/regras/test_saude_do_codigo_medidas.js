'use strict';

const assert = require('assert');

const { medirJs } = require('./analisador/medir-js');
const { rodarOPython } = require('./analisador/medir');
const { pontuar } = require('./analisador/pontos');

let total = 0;
const prova = (achado, esperado, porque) => { assert.deepStrictEqual(achado, esperado, porque); total++; };

const js = (...linhas) => `${linhas.join('\n')}\n`;
const py = js;
const TRINTA_IFS = Array.from({ length: 30 }, (_, i) => `    if (a === ${i}) return ${i};`);
const corpo = (...linhas) => [...linhas, ...TRINTA_IFS, '    return a;'];
const medidas = fonte => medirJs(fonte).unidades.map(({ nome, cc }) => [nome, cc]);

prova(medidas(js("test('guarda o tema', async ({ a }) => {", ...corpo(), '});')), [["test('guarda o tema')", 31]],
  'o callback de um test() no topo é uma função medida, com o título do teste no nome');
prova(medidas(js("botao.addEventListener('click', function (a) {", ...corpo(), '});')), [["addEventListener('click')", 31]],
  'o callback anônimo de uma chamada no topo é medido, com o nome da chamada');
prova(medidas(js('p.then(function depoisDoPedido(a) {', ...corpo(), '});')), [['depoisDoPedido', 31]], 'a função com nome passada como argumento leva o seu nome');
prova(medidas(js('const tabela = {', '  ler: (a) => {', ...corpo(), '  },', '  gravar: function (a) {', ...corpo(), '  },', '};')), [['ler', 31], ['gravar', 31]],
  'a seta e a função numa chave de objeto levam o nome da chave: a tabela de setas não esconde a cascata');
prova(medidas(js('module.exports = (a) => {', ...corpo(), '};')), [['module.exports', 31]], 'module.exports = () => {} é medido');
prova(medidas(js('exports.ler = function (a) {', ...corpo(), '};')), [['exports.ler', 31]], 'exports.x = function () {} é medido');
prova(medidas(js('export default (a) => {', ...corpo(), '};')), [['default', 31]], 'export default () => {} é medido');
prova(medidas(js('export default function (a) {', ...corpo(), '}')), [['default', 31]], 'export default function () {} é medido');
prova(medidas(js('class Leitor {', '  ler = (a) => {', ...corpo(), '  };', '}')), [['ler', 31]], 'a propriedade de classe com seta é medida');
prova(medidas(js("describe('tela', () => {", "  test('um', () => {", ...corpo(), '  });', '});')), [["describe('tela')", 1], ["test('um')", 31]],
  'fora de uma função com nome, cada callback é medido à parte');
prova(medidas(js('function nomeada(lista) {', '  return lista.map((a) => {', ...corpo(), '  });', '}')), [['nomeada', 31]],
  'dentro de uma função com nome, o callback continua contando nela');

const SOLTO = TRINTA_IFS.map(linha => linha.replace('return', 'gravar(').replace(';', ');'));
prova(medirJs(js('const a = ler();', ...SOLTO)).topo.cc, 31, 'o código solto no topo do arquivo é medido');
prova(pontuar(medirJs(js('const a = ler();', ...SOLTO))).map(({ unidade, medida, pontos }) => [unidade, medida, pontos]), [['(topo do arquivo)', 'complexidade', 23]],
  'e pontua como uma função, sem entrar na média');
prova(medirJs(js('(async () => {', '  const a = ler();', ...SOLTO, '})();')).topo.cc, 31,
  'o invólucro (async () => { … })() do módulo é transparente, e o que está nele conta no topo do arquivo');
const TABELA = js('const PASSOS = {', ...Array.from({ length: 12 }, (_, i) => `  p${i}: (a) => (a ? ${i} : 0),`), '};', 'const dobro = x => (x ? 2 : 0);');
prova([medidas(TABELA).length, medirJs(TABELA).topo.cc], [13, 1], 'fora de uma função, a seta curta com nome é função à parte: a tabela de setas simples não se acumula no topo');
prova(pontuar(medirJs(js('function sem() {', '  return 1;', '}'))), [], 'o topo sem desvio não pontua');
prova(pontuar(rodarOPython({ 'a.py': py('import sys', ...Array.from({ length: 10 }, (_, i) => `if sys.argv[${i}]:`).flatMap(linha => [linha, '    pass'])) })['a.py'])
  .map(({ unidade, medida, pontos }) => [unidade, medida, pontos]), [['(topo do arquivo)', 'complexidade', 3]], 'no Python, o topo do módulo também');

prova(medidas(js('function padroes(a, b, c) {', '  a ||= 1;', '  b &&= 2;', '  c ??= 3;', '  a += 1;', '  return [a, b, c];', '}')), [['padroes', 4]],
  '||=, &&= e ??= são desvios; += não');
const ESCOLHA = js('function escolher(a, b) {', '  if (a) {', '    switch (b) {', '      case 1:', '        if (a > 1) return 1;', '        break;', '      default:', '        break;', '    }', '  }', '  return 0;', '}');
prova(medirJs(ESCOLHA).unidades[0].aninhamento, 3, 'o switch aninha: if, switch e if dão profundidade 3');
prova(medirJs(js('function f(a, b, c, d) {', '  if ((a ?? b) && c || d) return 1;', '  return 0;', '}')).unidades[0].condicoes, [2],
  'na condição, ?? não conta como operador lógico; && e || contam');

console.log(`saude-do-codigo (medidas): ${total} provas passaram`);
