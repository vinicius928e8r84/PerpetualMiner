'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const TEXTO = 'I barely made it, and then barely left.';

const CASOS = [
  { nome: 'a primeira Palavra de uma frase sem Palavra', antes: undefined, clica: ['barely', 2], depois: ['barely@2'] },
  { nome: 'uma segunda Palavra entra no mesmo grupo', antes: ['barely@2'], clica: ['made', 4], depois: ['barely@2', 'made@4'] },
  { nome: 'o grupo sai na ordem do texto, e não na ordem do clique', antes: ['made@4', 'barely@2'], clica: ['left', 15], depois: ['barely@2', 'made@4', 'left@15'] },
  { nome: 'clicar de novo numa Palavra do grupo a desmarca', antes: ['barely@2', 'made@4'], clica: ['barely', 2], depois: ['made@4'] },
  { nome: 'desmarcar a única Palavra tira a Palavra da frase', antes: ['barely@2'], clica: ['barely', 2], depois: undefined },
  { nome: 'depois de um separador, a Palavra abre o grupo novo', antes: ['barely@2', '|'], clica: ['made', 4], depois: ['barely@2', '|', 'made@4'] },
  { nome: 'desmarcar a única Palavra do último grupo leva o separador junto', antes: ['barely@2', '|', 'made@4'], clica: ['made', 4], depois: ['barely@2'] },
  { nome: 'só o último grupo muda, e os de trás ficam como estão', antes: ['barely@2', '|', 'made@4'], clica: ['left', 15], depois: ['barely@2', '|', 'made@4', 'left@15'] },
  { nome: 'a mesma palavra em outra posição do último grupo tira só essa', antes: ['barely@2', '|', 'barely@13'], clica: ['barely', 13], depois: ['barely@2'] },
  { nome: 'uma Palavra de um grupo anterior entra no último grupo como outra Palavra', antes: ['barely@2', '|', 'made@4'], clica: ['barely', 2], depois: ['barely@2', '|', 'barely@2', 'made@4'] },
  { nome: 'um separador sozinho some quando o grupo seguinte fica vazio', antes: ['|', 'made@4'], clica: ['made', 4], depois: undefined },
  { nome: 'sem a palavra limpa, nada muda', antes: ['barely@2'], clica: [null, 2], depois: ['barely@2'] },
];

function mudo() {
  return new Proxy(function () {}, {
    get: (_, chave) => (chave === Symbol.toPrimitive ? () => '' : mudo()),
    apply: () => mudo(),
    construct: () => mudo(),
  });
}

function oPainelDeMentira() {
  const contexto = vm.createContext({
    console, chrome: mudo(),
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null, activeElement: null },
    PerpetualMiner: new Proxy({}, { get: (alvo, chave) => (chave in alvo ? alvo[chave] : mudo()) }),
  });
  vm.runInContext(fs.readFileSync('lib/mineracao.js', 'utf8'), contexto);
  vm.runInContext(`${fs.readFileSync('painel/painel.js', 'utf8')}
this.sonda = { toggleWord, frases(lista) { todasFrases = lista; }, keywords };`, contexto);
  return contexto.sonda;
}

function aPalavraMarcada({ antes, clica: [palavra, posicao] }) {
  const painel = oPainelDeMentira();
  painel.frases([{ id: 1, texto: TEXTO }]);
  if (antes) painel.keywords[1] = [...antes];
  painel.toggleWord(1, posicao, palavra);
  const marcadas = painel.keywords[1];
  return marcadas && [...marcadas];
}

for (const caso of CASOS) {
  assert.deepStrictEqual(aPalavraMarcada(caso), caso.depois, caso.nome);
}

console.log(`marcar palavra: ${CASOS.length} casos ok`);
