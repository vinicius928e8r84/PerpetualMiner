'use strict';

const assert = require('assert');
const fs = require('fs');
const test = require('node:test');
const vm = require('vm');

const ESTADO_DA_PAGINA = [
  'fonte', 'idioma', 'esconderEnviadas', 'busca', 'ordem',
];

function aberto() {
  return new Proxy(function () {}, {
    get: (_, chave) => (chave === Symbol.toPrimitive ? () => '' : aberto()),
    apply: () => aberto(),
    construct: () => aberto(),
  });
}

function abrirAPaginaDeFrases() {
  const contexto = vm.createContext({ document: aberto(), chrome: aberto(), console });
  contexto.globalThis = contexto;
  contexto.PerpetualMiner = {};
  for (const arquivo of ['lib/idioma.js', 'lib/contexto.js', 'lib/filtro-das-frases.js']) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);
  const raiz = contexto.PerpetualMiner;
  for (const nome of ['Atalhos', 'AjustesDeEnvio', 'Mineracao', 'Veio', 'Shell', 'Conta', 'Perigo', 'Envio', 'Sincronizacao', 'ChaveDaOpenAI', 'Historico', 'FrasesNuvem', 'FrasesSelecao']) raiz[nome] = aberto();
  raiz.textoDaVoz = aberto();
  vm.runInContext(fs.readFileSync('painel/painel-frases-filtros.js', 'utf8'), contexto);
  vm.runInContext(fs.readFileSync('painel/painel.js', 'utf8'), contexto);
  return contexto;
}

function idsVisiveis({ frases, filtros }) {
  const pagina = abrirAPaginaDeFrases();
  pagina.entrada = { frases, filtros };
  vm.runInContext(`
    todasFrases = entrada.frases;
    Object.assign(FrasesFiltros.criterio, {
      fonte: entrada.filtros.fonte ?? 'all',
      idioma: entrada.filtros.idioma ?? 'all',
      esconderEnviadas: entrada.filtros.esconder ?? false,
      busca: entrada.filtros.busca ?? '',
      ordem: entrada.filtros.ordem ?? 'novas',
    });
    aplicarFiltro();
  `, pagina);
  return JSON.parse(vm.runInContext('JSON.stringify(frasesVisiveis.map(f => f.id))', pagina));
}

const FRASES = [
  { id: 1, texto: 'The cat sat', contexto: { fonte: 'youtube', titulo: 'Gatos do dia' } },
  { id: 2, texto: 'Привет, мир', idioma: 'Russo', contexto: { fonte: 'netflix', titulo: 'Мир' } },
  { id: 3, texto: 'Hello world', idioma: 'Inglês', streaming: 'amazon', status: 'exported' },
  { id: 4, texto: 'Dog barks', contexto: { fonte: 'primevideo', titulo: 'Cachorros' }, exportadaTxt: true },
  { id: 5, texto: 'Hello again', contexto: { fonte: 'web', titulo: 'Hello Gatos' } },
  { id: 6, texto: 'Как дела', idioma: 'Russo', contexto: { fonte: 'youtube' }, status: 'exported', exportadaTxt: true },
];

const CASOS = [
  { nome: 'sem filtro nenhum: todas, da mais nova para a mais antiga', filtros: {}, esperado: [6, 5, 4, 3, 2, 1] },
  { nome: 'ordem antigas: da mais antiga para a mais nova', filtros: { ordem: 'antigas' }, esperado: [1, 2, 3, 4, 5, 6] },
  { nome: 'ordem desconhecida cai na mais nova primeiro', filtros: { ordem: 'qualquer' }, esperado: [6, 5, 4, 3, 2, 1] },
  { nome: 'fonte sozinha: só a fonte pedida', filtros: { fonte: 'youtube' }, esperado: [6, 1] },
  { nome: 'fonte pelo apelido: amazon vale primevideo, vindo de streaming ou de contexto', filtros: { fonte: 'primevideo' }, esperado: [4, 3] },
  { nome: 'fonte que nenhuma frase tem: lista vazia', filtros: { fonte: 'pdf' }, esperado: [] },
  { nome: 'idioma Russo sozinho', filtros: { idioma: 'Russo' }, esperado: [6, 2] },
  { nome: 'idioma Inglês sozinho: a frase sem idioma conta como Inglês', filtros: { idioma: 'Inglês' }, esperado: [5, 4, 3, 1] },
  { nome: 'esconder: tira só a enviada ao Anki; a marca antiga de exportada em .txt já não conta', filtros: { esconder: true }, esperado: [5, 4, 2, 1] },
  { nome: 'busca no texto sem diferença de maiúscula', filtros: { busca: 'HELLO' }, esperado: [5, 3] },
  { nome: 'busca no título do contexto', filtros: { busca: 'gatos' }, esperado: [5, 1] },
  { nome: 'busca com espaços nas pontas: o termo é aparado', filtros: { busca: '  dog  ' }, esperado: [4] },
  { nome: 'busca só de espaços: não filtra', filtros: { busca: '   ' }, esperado: [6, 5, 4, 3, 2, 1] },
  { nome: 'busca que nada acha: lista vazia', filtros: { busca: 'zebra' }, esperado: [] },
  { nome: 'busca em russo, com a letra maiúscula', filtros: { busca: 'ПРИВЕТ' }, esperado: [2] },
  { nome: 'fonte e idioma juntos', filtros: { fonte: 'youtube', idioma: 'Russo' }, esperado: [6] },
  { nome: 'idioma, esconder e busca juntos', filtros: { idioma: 'Inglês', esconder: true, busca: 'hello' }, esperado: [5] },
  { nome: 'todos os filtros juntos, na ordem das mais nova', filtros: { fonte: 'web', idioma: 'Inglês', esconder: true, busca: 'hello' }, esperado: [5] },
  { nome: 'filtros juntos na ordem das mais antigas', filtros: { idioma: 'Inglês', esconder: true, ordem: 'antigas' }, esperado: [1, 4, 5] },
  { nome: 'fonte e busca juntos na ordem das mais antigas', filtros: { fonte: 'youtube', busca: 'gatos', ordem: 'antigas' }, esperado: [1] },
];

for (const caso of CASOS) {
  test(caso.nome, () => {
    assert.deepStrictEqual(idsVisiveis({ frases: FRASES, filtros: caso.filtros }), caso.esperado);
  });
}

test('frases sem id ficam por último na ordem das mais novas e primeiro na das mais antigas, na ordem em que vieram', () => {
  const frases = [{ id: 7, texto: 'a' }, { texto: 'b' }, { id: 3, texto: 'c' }, { texto: 'd' }];
  assert.deepStrictEqual(idsVisiveis({ frases, filtros: {} }), [7, 3, null, null]);
  assert.deepStrictEqual(idsVisiveis({ frases, filtros: { ordem: 'antigas' } }), [null, null, 3, 7]);
});

test('frases com o mesmo id mantêm a ordem em que vieram, nas duas ordens', () => {
  const frases = [{ id: 1, texto: 'x1' }, { id: 1, texto: 'x2' }, { id: 2, texto: 'y' }];
  const textos = filtros => {
    const pagina = abrirAPaginaDeFrases();
    pagina.entrada = { frases, filtros };
    vm.runInContext(`todasFrases = entrada.frases; FrasesFiltros.criterio.ordem = entrada.filtros.ordem; aplicarFiltro();`, pagina);
    return JSON.parse(vm.runInContext('JSON.stringify(frasesVisiveis.map(f => f.texto))', pagina));
  };
  assert.deepStrictEqual(textos({ ordem: 'novas' }), ['y', 'x1', 'x2']);
  assert.deepStrictEqual(textos({ ordem: 'antigas' }), ['x1', 'x2', 'y']);
});

test('filtrar não muda a lista de todas as frases', () => {
  const pagina = abrirAPaginaDeFrases();
  pagina.entrada = FRASES.map(frase => ({ ...frase }));
  vm.runInContext(`todasFrases = entrada; FrasesFiltros.criterio.ordem = 'antigas'; aplicarFiltro();`, pagina);
  assert.deepStrictEqual(JSON.parse(vm.runInContext('JSON.stringify(todasFrases.map(f => f.id))', pagina)), [1, 2, 3, 4, 5, 6]);
});

test('o estado da página que o teste escreve existe com o valor de partida', () => {
  const pagina = abrirAPaginaDeFrases();
  assert.deepStrictEqual(
    JSON.parse(vm.runInContext(`JSON.stringify([${ESTADO_DA_PAGINA.map(campo => `FrasesFiltros.criterio.${campo}`).join(', ')}])`, pagina)),
    ['all', 'all', false, '', 'novas'],
  );
});

test('o módulo puro filtra e ordena sem tocar na lista que recebe', () => {
  const contexto = vm.createContext({});
  contexto.globalThis = contexto;
  contexto.PerpetualMiner = {};
  for (const arquivo of ['lib/idioma.js', 'lib/contexto.js', 'lib/filtro-das-frases.js']) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);
  const { filtrarFrases } = contexto.PerpetualMiner.FiltroDasFrases;
  const recebidas = FRASES.map(frase => ({ ...frase }));
  const filtros = { fonte: 'all', idioma: 'Inglês', esconderEnviadas: true, busca: 'hello', ordem: 'antigas' };
  assert.deepStrictEqual(filtrarFrases(recebidas, filtros).map(frase => frase.id), [5]);
  assert.deepStrictEqual(recebidas.map(frase => frase.id), [1, 2, 3, 4, 5, 6]);
});
