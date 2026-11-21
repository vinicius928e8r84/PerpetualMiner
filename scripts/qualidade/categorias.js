'use strict';

const NAS_DUAS = [
  {
    id: 'complexidade',
    nome: 'complexidade da função',
    medidor: 'complexidade',
    qlty: ['qlty:function-complexity'],
    porFuncao: true,
    soMedidor: 'o medidor conta a complexidade ciclomática, em que cada desvio vale 1 mesmo numa sequência plana; '
      + 'a cognitiva do Qlty quase não pesa uma sequência plana',
    soQlty: 'a cognitiva do Qlty multiplica o peso do desvio pelo aninhamento, então poucos desvios bem fundos passam da linha dele e não da ciclomática',
    soQltyComFuncoesDentro: 'o Qlty soma à função a complexidade das funções que ela tem dentro (e ainda mede cada uma à parte); '
      + 'o medidor, como o CodeScene, mede à parte cada função com nome',
  },
  {
    id: 'argumentos',
    nome: 'argumentos',
    medidor: 'argumentos',
    qlty: ['qlty:function-parameters'],
    porFuncao: true,
    soMedidor: 'o medidor e o Qlty contam os parâmetros de jeitos diferentes nessa função',
    soQlty: 'o Qlty conta os parâmetros de outro jeito: o `*` que abre os argumentos só nomeados do Python, por exemplo, vale um argumento para ele',
  },
  {
    id: 'aninhamento',
    nome: 'aninhamento',
    medidor: 'aninhamento',
    qlty: ['qlty:nested-control-flow'],
    porFuncao: false,
    soMedidor: 'o medidor conta o aninhamento dentro da função toda; o Qlty, por trecho de controle',
    soQlty: 'o Qlty conta o ternário (e o `x if c else y` do Python) como mais um nível; o medidor, como o CodeScene, só `if`, `switch` e laços',
  },
  {
    id: 'condicao',
    nome: 'condição composta',
    medidor: 'operadores',
    qlty: ['qlty:boolean-logic'],
    porFuncao: false,
    soMedidor: 'o medidor conta os operadores lógicos de cada condição; o Qlty acusa a expressão a partir de outra contagem',
    soQlty: 'o Qlty acusa qualquer expressão lógica composta (num `return`, numa atribuição, numa seta); '
      + 'o medidor, como o CodeScene, só a condição de `if`, laço e ternário',
  },
  {
    id: 'arquivo',
    nome: 'complexidade do arquivo',
    medidor: 'media',
    qlty: ['qlty:file-complexity'],
    porFuncao: false,
    soMedidor: 'o medidor acusa a média da complexidade ciclomática das funções (4 ou mais), num arquivo pequeno também; '
      + 'o Qlty, a soma da cognitiva do arquivo (50 ou mais)',
    soQlty: 'o Qlty soma a cognitiva de todas as funções, e um arquivo grande de funções simples passa de 50 com média baixa',
  },
];

const SO_NO_MEDIDOR = [
  { id: 'funcao-longa', nome: 'função longa', medidor: 'linhas', porque: 'o Qlty não mede o tamanho da função' },
  { id: 'blocos', nome: 'blocos aninhados', medidor: 'blocos', porque: 'o Qlty não tem a regra dos vários blocos aninhados na mesma função (Bumpy Road)' },
  { id: 'arquivo-longo', nome: 'arquivo Python longo', medidor: 'tamanho', porque: 'o Qlty não mede as linhas do arquivo' },
  { id: 'leitura', nome: 'arquivo que o medidor não leu', medidor: 'leitura', porque: 'o medidor não conseguiu ler o arquivo' },
];

const SO_NO_QLTY = [
  { id: 'retornos', nome: 'muitos retornos', qlty: ['qlty:return-statements'], porque: 'o medidor e o CodeScene não têm essa regra' },
  {
    id: 'duplicacao',
    nome: 'código duplicado',
    qlty: ['qlty:identical-code', 'qlty:similar-code'],
    porque: 'o medidor não mede duplicação (o CodeScene mede, com outra régua)',
  },
  { id: 'outra-do-qlty', nome: 'outra regra do Qlty', qlty: [], porque: 'o medidor não tem essa regra' },
];

const TODAS = [...NAS_DUAS, ...SO_NO_MEDIDOR, ...SO_NO_QLTY];

const categoriaDaRegra = new Map(TODAS.flatMap(categoria => (categoria.qlty || []).map(regra => [regra, categoria.id])));
const categoriaDaMedida = new Map(TODAS.filter(categoria => categoria.medidor).map(categoria => [categoria.medidor, categoria.id]));

module.exports = { NAS_DUAS, SO_NO_MEDIDOR, SO_NO_QLTY, TODAS, categoriaDaRegra, categoriaDaMedida };
