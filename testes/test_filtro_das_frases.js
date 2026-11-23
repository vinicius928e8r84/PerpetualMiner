'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const contexto = { console, CATALOGO_DA_VOZ: { 'PAI-29': {} }, textoDaVoz: texto => texto };
contexto.globalThis = contexto;
vm.createContext(contexto);
for (const arquivo of ['lib/idioma.js', 'lib/contexto.js', 'lib/filtro-das-frases.js']) {
  vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });
}
const { FiltroDasFrases } = contexto.PerpetualMiner;

const frase = (id, texto, extras = {}) => ({ id, texto, data: '18/09/2026', streaming: 'netflix', idioma: 'Inglês', ...extras });
const titulo = (fonte, nome) => ({ contexto: { fonte, titulo: nome, detalhe: '' } });

const FRASES = [
  frase(6, 'Break a leg tonight.', { streaming: 'amazon', idioma: undefined }),
  frase(5, 'Call me tomorrow, Ted.', { exportadaTxt: true, ...titulo('netflix', 'Call Centre') }),
  frase(4, 'That was a close call.', titulo('netflix', 'The Bear')),
  frase(3, 'Я тебе потом перезвоню.', { streaming: 'youtube', idioma: 'Russo', ...titulo('youtube', 'Russian with Max') }),
  frase(2, 'It is a long shot, but worth trying.', { status: 'exported', ...titulo('netflix', 'Ted Lasso') }),
  frase(1, 'Let us call it a day.', { streaming: 'youtube', ...titulo('youtube', 'Veritasium') }),
];

const SEM_FILTRO = { fonte: 'all', idioma: 'all', esconderEnviadasEExportadas: false, busca: '', ordem: 'novas' };
const ids = filtros => FiltroDasFrases.filtrar(FRASES, { ...SEM_FILTRO, ...filtros }).map(f => f.id);

const CASOS = [
  ['sem filtro, as mais novas primeiro', {}, [6, 5, 4, 3, 2, 1]],
  ['só a Fonte', { fonte: 'netflix' }, [5, 4, 2]],
  ['a Fonte pelo nome que o selo mostra: amazon é primevideo', { fonte: 'primevideo' }, [6]],
  ['só o idioma Russo', { idioma: 'Russo' }, [3]],
  ['o idioma Inglês traz a Frase sem idioma', { idioma: 'Inglês' }, [6, 5, 4, 2, 1]],
  ['só ocultar enviadas e exportadas', { esconderEnviadasEExportadas: true }, [6, 4, 3, 1]],
  ['só a busca, sem diferença de maiúsculas, no texto e no Título', { busca: 'CALL' }, [5, 4, 1]],
  ['a busca ignora os espaços nas pontas', { busca: '  ted  ' }, [5, 2]],
  ['só a ordem das mais antigas', { ordem: 'antigas' }, [1, 2, 3, 4, 5, 6]],
  ['Fonte, ocultar e busca juntos', { fonte: 'netflix', esconderEnviadasEExportadas: true, busca: 'call' }, [4]],
  ['idioma e ocultar juntos', { idioma: 'Inglês', esconderEnviadasEExportadas: true }, [6, 4, 1]],
  ['Fonte, idioma e busca juntos', { fonte: 'youtube', idioma: 'Inglês', busca: 'day' }, [1]],
  ['filtros juntos nas mais antigas', { fonte: 'netflix', esconderEnviadasEExportadas: true, ordem: 'antigas' }, [4]],
  ['idioma e ordem juntos', { idioma: 'Inglês', ordem: 'antigas' }, [1, 2, 4, 5, 6]],
  ['filtros que não deixam nada', { fonte: 'youtube', idioma: 'Inglês', esconderEnviadasEExportadas: true, busca: 'tomorrow' }, []],
];

for (const [nome, filtros, esperado] of CASOS) assert.deepStrictEqual(ids(filtros), esperado, nome);

assert.deepStrictEqual(
  FiltroDasFrases.filtrar([frase(0, 'sem id'), frase(2, 'dois'), { texto: 'sem id nenhum' }], SEM_FILTRO).map(f => f.texto),
  ['dois', 'sem id', 'sem id nenhum'],
  'a Frase sem id vale 0 nas duas ordens',
);
assert.deepStrictEqual(
  FiltroDasFrases.filtrar([frase(0, 'sem id'), frase(2, 'dois')], { ...SEM_FILTRO, ordem: 'antigas' }).map(f => f.texto),
  ['sem id', 'dois'],
);

const copia = [...FRASES];
FiltroDasFrases.filtrar(FRASES, { ...SEM_FILTRO, ordem: 'antigas' });
assert.deepStrictEqual(FRASES, copia, 'filtrar devolve uma lista nova e deixa a do Painel como estava');

assert.strictEqual(FiltroDasFrases.foiEnviadaAoAnki(FRASES[4]), true, 'status exported é Enviada ao Anki');
assert.strictEqual(FiltroDasFrases.foiEnviadaAoAnki(FRASES[1]), false, 'exportada no .txt não é Enviada ao Anki');

console.log(`filtro das frases: ${CASOS.length + 4} provas passaram`);
