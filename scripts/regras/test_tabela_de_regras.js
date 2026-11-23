'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { REGRAS } = require('./verificar');
const { regrasDaTabela, divergencias } = require('./apoio-da-tabela-de-regras');

const RAIZ = path.resolve(__dirname, '..', '..');
const FERRAMENTAS_DA_PASTA = ['baixar-no-merge'];
const SEM_LINHA_NA_TABELA = ['doc-datado', 'link-de-doc', 'limite-de-linhas', 'sem-comentario-novo', 'saude-do-codigo'];

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
prova(divergencias(tabela(['| 1 A | `regra-um` |', '| 2 B | `regra-fantasma` |']), ['regra-um', 'regra-nova', 'regra-sobra'], ['regra-um', 'regra-sumida']),
  [
    { regra: 'regra-nova', detalhe: 'existe em scripts/regras/ e a tabela não a cita; ponha a linha na tabela do AGENTS.md ou, com a aprovação do dono, na lista do teste' },
    { regra: 'regra-sobra', detalhe: 'existe em scripts/regras/ e a tabela não a cita; ponha a linha na tabela do AGENTS.md ou, com a aprovação do dono, na lista do teste' },
    { regra: 'regra-fantasma', detalhe: 'a tabela cita e não existe em scripts/regras/' },
    { regra: 'regra-um', detalhe: 'já consta na tabela; tire-a da lista de exceções do teste' },
    { regra: 'regra-sumida', detalhe: 'a exceção é de uma regra que não existe mais em scripts/regras/; tire-a da lista' },
  ], 'as divergências saem na ordem: sem linha, só na tabela, exceções inúteis, com a mensagem de cada uma');
assert.throws(() => regrasDaTabela('# sem a seção'), /Rules and what enforces them/, 'sem a seção, o teste não passa em silêncio');
total++;

const agentes = fs.readFileSync(path.join(RAIZ, 'AGENTS.md'), 'utf8');
const ids = REGRAS.map(regra => regra.id);
prova(divergencias(agentes, ids, SEM_LINHA_NA_TABELA), [], 'a tabela do AGENTS.md e as regras de scripts/regras/ dizem as mesmas regras');
const arquivosDeRegra = fs.readdirSync(__dirname).filter(arquivo => !arquivo.startsWith('apoio-') && /^[a-z0-9]+(-[a-z0-9]+)+\.js$/.test(arquivo)).map(arquivo => arquivo.slice(0, -3)).filter(arquivo => !FERRAMENTAS_DA_PASTA.includes(arquivo)).sort();
prova(arquivosDeRegra, [...ids].sort(), 'cada arquivo de regra de scripts/regras/ (fora as ferramentas da pasta) está em REGRAS e cada regra de REGRAS tem o seu arquivo');

console.log(`test_tabela_de_regras: ${total} provas ok`);
