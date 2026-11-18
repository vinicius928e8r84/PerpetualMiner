'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { REGRAS } = require('./verificar');
const { regrasDaTabela, divergencias } = require('./apoio-da-tabela-de-regras');

const RAIZ = path.resolve(__dirname, '..', '..');
const SEM_LINHA_NA_TABELA = ['doc-datado', 'link-de-doc', 'limite-de-linhas', 'sem-comentario-novo', 'html-cru', 'dialogo-nativo'];

let total = 0;
const prova = (achadas, esperadas, porque) => { assert.deepStrictEqual(achadas, esperadas, porque); total++; };

const tabela = linhas => ['## Rules and what enforces them', '', '| Rule | Enforced by |', '|---|---|', ...linhas, '', '## Outra seção', '| x | `fora-da-tabela` |'].join('\n');
const doisIds = ['regra-um', 'regra-dois'];
const completa = tabela(['| 1 A | `regra-um` |', '| 2 B | review; `regra-dois` (algo); `test_x.js` |']);

prova(regrasDaTabela(completa), ['regra-um', 'regra-dois'], 'a tabela cita as regras em kebab-case e não conta o resto nem outra seção');
prova(divergencias(completa, doisIds, []), [], 'tabela e regras iguais não divergem');

prova(divergencias(tabela(['| 1 A | `regra-um` |']), doisIds, []).map(d => d.regra), ['regra-dois'],
  'uma regra nova fora da tabela e fora da lista falha');
prova(divergencias(completa, [...doisIds, 'regra-tres'], []).map(d => d.regra), ['regra-tres'], 'a regra que chega depois falha');
prova(divergencias(completa, [...doisIds, 'regra-tres'], ['regra-tres']), [], 'a regra da lista de exceções passa fora da tabela');
prova(divergencias(tabela(['| 1 A | `regra-um` |', '| 2 B | `regra-dois`; `regra-fantasma` |']), doisIds, []).map(d => d.regra), ['regra-fantasma'],
  'a tabela que cita uma regra que não existe falha');
prova(divergencias(completa, doisIds, ['regra-dois']).map(d => d.regra), ['regra-dois'], 'a exceção que passou a constar na tabela falha');
prova(divergencias(completa, doisIds, ['regra-sumida']).map(d => d.regra), ['regra-sumida'], 'a exceção de uma regra que não existe mais falha');
assert.throws(() => regrasDaTabela('# sem a seção'), /Rules and what enforces them/, 'sem a seção, o teste não passa em silêncio');
total++;

const agentes = fs.readFileSync(path.join(RAIZ, 'AGENTS.md'), 'utf8');
const ids = REGRAS.map(regra => regra.id);
prova(divergencias(agentes, ids, SEM_LINHA_NA_TABELA), [], 'a tabela do AGENTS.md e as regras de scripts/regras/ dizem as mesmas regras');
const arquivosDeRegra = fs.readdirSync(__dirname).filter(arquivo => !arquivo.startsWith('apoio-') && /^[a-z0-9]+(-[a-z0-9]+)+\.js$/.test(arquivo)).map(arquivo => arquivo.slice(0, -3)).sort();
prova(arquivosDeRegra, [...ids].sort(), 'cada arquivo de regra de scripts/regras/ está em REGRAS e cada regra de REGRAS tem o seu arquivo');

console.log(`test_tabela_de_regras: ${total} provas ok`);
