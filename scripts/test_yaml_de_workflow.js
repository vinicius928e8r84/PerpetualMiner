'use strict';

const assert = require('assert');
const { lerYaml, rodaNoPR, comandos } = require('./yaml-de-workflow');

function retrato(valor) {
  if (Array.isArray(valor)) return valor.map(retrato);
  if (!valor || typeof valor !== 'object') return valor;
  const saida = {};
  for (const [chave, dentro] of Object.entries(valor)) saida[chave] = retrato(dentro);
  for (const simbolo of Object.getOwnPropertySymbols(valor)) saida[`@${simbolo.description}`] = retrato(valor[simbolo]);
  return saida;
}

const LEITURAS = [
  { nome: 'só comentário e linhas em branco', yaml: ['# só comentário', '', '   '], esperado: {} },
  {
    nome: 'escalares: aspas, comentário no fim, chave entre aspas, chave sem valor e linha sem dois pontos',
    yaml: [
      'nome: "Testes"  # com aspas', "simples: 'um # dois'", 'nu: valor # comentário', 'colado: a#b',
      '"chave com aspas": 1', 'sem_valor:', 'oco: ""', 'linha solta sem dois pontos', 'fim: ok',
    ],
    esperado: {
      nome: '"Testes"', simples: 'um # dois', nu: 'valor', colado: 'a#b', 'chave com aspas': '1', sem_valor: null, oco: '', fim: 'ok',
      '@linhasDasChaves': { nome: 1, simples: 2, nu: 3, colado: 4, 'chave com aspas': 5, sem_valor: 6, oco: 7, fim: 9 },
    },
  },
  {
    nome: 'mapas aninhados, lista no recuo da chave, itens escalares e itens que abrem mapa',
    yaml: [
      'on:', '  pull_request:', '    branches: [main]', '  push:', 'jobs:', '  um:', '    runs-on: ubuntu',
      '    steps:', '    - uses: actions/checkout@v4', '    - name: Rodar', '      run: node a.js', '      env:', '        X: "1"',
      '    - solto', '    - "entre aspas"', '    - [a, b]', '    - chave: valor', '  dois: # comentário que abre filho', '    a: b',
    ],
    esperado: {
      on: {
        pull_request: { branches: '[main]', '@linhasDasChaves': { branches: 3 } },
        push: null,
        '@linhasDasChaves': { pull_request: 2, push: 4 },
      },
      jobs: {
        um: {
          'runs-on': 'ubuntu',
          steps: [
            { uses: 'actions/checkout@v4', '@linhasDasChaves': { uses: 9 }, '@linha': 9 },
            {
              name: 'Rodar', run: 'node a.js', env: { X: '1', '@linhasDasChaves': { X: 13 } },
              '@linhasDasChaves': { name: 10, run: 11, env: 12 }, '@linha': 10,
            },
            'solto', 'entre aspas', '[a, b]',
            { chave: 'valor', '@linhasDasChaves': { chave: 17 }, '@linha': 17 },
          ],
          '@linhasDasChaves': { 'runs-on': 7, steps: 8 },
        },
        dois: { a: 'b', '@linhasDasChaves': { a: 19 } },
        '@linhasDasChaves': { um: 6, dois: 18 },
      },
      '@linhasDasChaves': { on: 1, jobs: 5 },
    },
  },
  {
    nome: 'blocos de texto: | guarda as linhas, > junta as seguidas, e cada um anota de que linhas veio',
    yaml: [
      'literal: |', '  primeira', '', '    recuada', '  ultima', 'dobrado: >-', '  um', '  dois', '', '  tres', '', '',
      '  quatro', 'guardado: |+', '  so', 'vazio: >', 'depois: fim',
    ],
    esperado: {
      literal: 'primeira\n\nrecuada\nultima', literal$linhas: [2, 3, 4, 5],
      dobrado: 'um dois\ntres\nquatro', dobrado$linhas: [7, 10, 13],
      guardado: 'so', guardado$linhas: [15],
      vazio: '', vazio$linhas: [],
      depois: 'fim',
      '@linhasDasChaves': { literal: 1, dobrado: 6, guardado: 14, vazio: 16, depois: 17 },
    },
  },
  {
    nome: 'lista no topo: o item com recuo a mais depois do traço fecha a lista',
    yaml: ['- a', '- b: 1', '  c: 2', '-   d: 3', '- - interna', '-  e', '- "f: g"', '- h:', '    - i'],
    esperado: [
      'a',
      { b: '1', c: '2', '@linhasDasChaves': { b: 2, c: 3 }, '@linha': 2 },
      { '@linhasDasChaves': {}, '@linha': 4 },
    ],
  },
  {
    nome: 'CRLF',
    yaml: ['jobs:\r', '  x:\r', '    steps:\r', '      - run: |\r', '          echo um\r', '          node b.js\r', '      - run: node c.js\r'],
    esperado: {
      jobs: {
        x: {
          steps: [
            { run: 'echo um\nnode b.js', run$linhas: [5, 6], '@linhasDasChaves': { run: 4 }, '@linha': 4 },
            { run: 'node c.js', '@linhasDasChaves': { run: 7 }, '@linha': 7 },
          ],
          '@linhasDasChaves': { steps: 3 },
        },
        '@linhasDasChaves': { x: 2 },
      },
      '@linhasDasChaves': { jobs: 1 },
    },
  },
];

for (const { nome, yaml, esperado } of LEITURAS) assert.deepStrictEqual(retrato(lerYaml(yaml.join('\n'))), esperado, nome);

const GATILHOS = [
  [null, false], [{}, false], [{ on: 'pull_request' }, true], [{ on: 'push' }, false], [{ on: 'pull_request_target' }, false],
  [{ on: ['push', 'pull_request'] }, true], [{ on: ['push'] }, false], [{ on: { pull_request: null } }, true], [{ on: { push: {} } }, false],
  [{ on: null }, false], [{ true: ['pull_request'] }, true], [{ on: 'push', true: 'pull_request' }, false], [{ on: false }, false],
];

for (const [workflow, esperado] of GATILHOS) assert.strictEqual(rodaNoPR(workflow), esperado, JSON.stringify(workflow));

const WORKFLOW = [
  'on: [push, pull_request]', 'env:', '  GLOBAL: "true"', 'jobs:', '  basico:', '    steps:', '      - uses: actions/checkout@v4',
  '      - name: Vários', '        run: |', '          # comentário do shell', '          node scripts/testar.mjs node', '',
  '          echo "só imprime"', '          npm test || true', '          printf x', '          : nada', '          true', '          exit 0',
  '          node a.js || exit 0', '      - run: node sem-nome.js', '      - name: Dobrado', '        run: >', '          node um.js',
  '          --flag', '', '          node dois.js', '      - name: Condicionado', "        if: github.event_name == 'push'",
  '        run: node push.js', '      - name: Desconhecido', '        if: ${{ !cancelled() }}', '        run: node x.js',
  '      - name: Tolerante', '        continue-on-error: ${{ true }}', '        run: node y.js', '      - name: Sem run', '        with:',
  '          a: b', '      - run:', '  com_if:', "    if: ${{ always() && github.event_name != 'schedule' }}", '    env:',
  '      LOCAL: false', '      DO_OUTRO: ${{ needs.a.outputs.b }}', '      OUTRO: talvez', '    steps:', "      - if: env.GLOBAL == 'true'",
  '        run: node global.js', "      - if: env.LOCAL == 'true'", '        run: node local.js', "      - if: env.LOCAL != 'true'",
  '        run: node local-nao.js', "      - if: env.DO_OUTRO == 'true'", '        run: node do-outro.js', "      - if: env.DO_OUTRO != 'true'",
  '        run: node do-outro-nao.js', "      - if: env.OUTRO == 'true'", '        run: node outro.js', "      - if: env.NINGUEM == 'false'",
  '        run: node ninguem.js', '      - if: false || 0 || \'\' || ""', '        run: node falso.js',
  "      - if: success() || github.event_name == 'pull_request' && cancelled()", '        run: node misto.js',
  "      - if: github.event_name == 'pull_request' && cancelled()", '        run: node e-desconhecido.js', '      - if: TRUE',
  '        run: node maiusculo.js', '  falso:', "    if: github.event_name == 'push'", '    steps:', '      - run: node nunca.js',
  '  tolerante:', '    continue-on-error: true', '    steps:', '      - run: node tolerado.js', '  sem_passos:', '    runs-on: ubuntu',
  '  passos_nao_lista:', '    steps: nada', '  escalar: texto', '  nulo:', '  desconhecido_no_job:',
  "    if: ${{ github.ref == 'refs/heads/main' }}", '    steps:', '      - continue-on-error: true', '        run: node fica-com-o-do-job.js',
  '  sobrescreve:', '    env:', '      GLOBAL: false', '    steps:', '      - texto solto', "      - if: env.GLOBAL == 'true'",
  '        run: node global-no-job.js', '',
].join('\n');

const SO_IMPRIME = 'só imprime, não executa';
const ENGOLIDA = 'a falha é engolida por `|| true`';
const naoEVerdade = condicao => `if: ${condicao} não é verdade no pull request`;
const naoSabe = condicao => `if: ${condicao} é uma condição que o leitor não sabe interpretar (use true/false, `
  + "github.event_name ==/!= 'evento' ou env.NOME ==/!= 'true' com NOME definido no job); não conta como portão";

const COMANDOS = [
  ['basico', 'Vários', 11, 'node scripts/testar.mjs node', true, null],
  ['basico', 'Vários', 13, 'echo "só imprime"', false, SO_IMPRIME],
  ['basico', 'Vários', 14, 'npm test || true', false, ENGOLIDA],
  ['basico', 'Vários', 15, 'printf x', false, SO_IMPRIME],
  ['basico', 'Vários', 16, ': nada', true, null],
  ['basico', 'Vários', 17, 'true', false, SO_IMPRIME],
  ['basico', 'Vários', 18, 'exit 0', true, null],
  ['basico', 'Vários', 19, 'node a.js || exit 0', false, ENGOLIDA],
  ['basico', 'node sem-nome.js', 20, 'node sem-nome.js', true, null],
  ['basico', 'Dobrado', 23, 'node um.js --flag', true, null],
  ['basico', 'Dobrado', 26, 'node dois.js', true, null],
  ['basico', 'Condicionado', 29, 'node push.js', false, naoEVerdade("github.event_name == 'push'")],
  ['basico', 'Desconhecido', 32, 'node x.js', false, naoSabe('${{ !cancelled() }}')],
  ['basico', 'Tolerante', 35, 'node y.js', false, 'continue-on-error: true no passo: a falha não barra'],
  ['com_if', 'node global.js', 48, 'node global.js', true, null],
  ['com_if', 'node local.js', 50, 'node local.js', false, naoEVerdade("env.LOCAL == 'true'")],
  ['com_if', 'node local-nao.js', 52, 'node local-nao.js', true, null],
  ['com_if', 'node do-outro.js', 54, 'node do-outro.js', true, null],
  ['com_if', 'node do-outro-nao.js', 56, 'node do-outro-nao.js', false, naoEVerdade("env.DO_OUTRO != 'true'")],
  ['com_if', 'node outro.js', 58, 'node outro.js', false, naoSabe("env.OUTRO == 'true'")],
  ['com_if', 'node ninguem.js', 60, 'node ninguem.js', false, naoSabe("env.NINGUEM == 'false'")],
  ['com_if', 'node falso.js', 62, 'node falso.js', false, naoEVerdade('false || 0 || \'\' || ""')],
  ['com_if', 'node misto.js', 64, 'node misto.js', true, null],
  ['com_if', 'node e-desconhecido.js', 66, 'node e-desconhecido.js', false, naoSabe("github.event_name == 'pull_request' && cancelled()")],
  ['com_if', 'node maiusculo.js', 68, 'node maiusculo.js', true, null],
  ['falso', 'node nunca.js', 72, 'node nunca.js', false, naoEVerdade("github.event_name == 'push'")],
  ['tolerante', 'node tolerado.js', 76, 'node tolerado.js', false, 'continue-on-error: true no job: a falha não barra'],
  ['desconhecido_no_job', 'node fica-com-o-do-job.js', 87, 'node fica-com-o-do-job.js', false, naoSabe("${{ github.ref == 'refs/heads/main' }}")],
  ['sobrescreve', 'node global-no-job.js', 94, 'node global-no-job.js', false, naoEVerdade("env.GLOBAL == 'true'")],
];

const comoComando = ([job, passo, linha, texto, executa, motivo]) => ({ job, passo, linha, texto, executa, motivo });

assert.deepStrictEqual(comandos(lerYaml(WORKFLOW)), COMANDOS.map(comoComando));

const SEM_O_LEITOR = [
  [null, []], [{}, []], [{ jobs: null }, []],
  [
    { jobs: { j: { steps: [{ run: 'node a\nnode b', 'run$linhas': [7] }, { name: 'n', run: 3 }, { run: { a: 1 } }] } } },
    [
      ['j', 'node a\nnode b', 7, 'node a', true, null],
      ['j', 'node a\nnode b', undefined, 'node b', true, null],
      ['j', 'n', undefined, '3', true, null],
      ['j', { a: 1 }, undefined, '[object Object]', true, null],
    ].map(comoComando),
  ],
];

for (const [workflow, esperado] of SEM_O_LEITOR) assert.deepStrictEqual(comandos(workflow), esperado, JSON.stringify(workflow));

console.log('yaml-de-workflow ok');
