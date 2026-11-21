'use strict';

const assert = require('assert');
const fs = require('fs');
const { repositorioDeTestes } = require('./apoio-de-testes');

const regra = require('./verificar').REGRAS.find(r => r.id === 'testes-no-portao');

const REGISTRO = `${JSON.stringify({
  grupos: {
    bom: { executor: 'node', arquivos: ['test_a.js'] },
    estranho: { executor: 'bun', arquivos: ['test_a.js'] },
    vazio: { executor: 'node', arquivos: ['nada/test_*.js'] },
    esquecido: { executor: 'node', arquivos: ['test_b.js'] },
    'so-no-manual': { executor: 'unittest', pasta: 'complemento', padrao: 'test_*.py' },
  },
  fora: [
    { arquivo: 'test_c.js', motivo: 'um script avulso' },
    { arquivo: 'nao_existe.js', motivo: 'sumiu' },
    { motivo: 'sem arquivo' },
    { arquivo: 'test_d.js', motivo: '   ' },
  ],
}, null, 2)}\n`;

const PR = [
  'on:',
  '  pull_request:',
  'jobs:',
  '  a:',
  '    steps:',
  '      - run: xvfb-run --auto-servernum env CI=1 nice -n 5 node scripts/testar.mjs bom estranho',
  '      - run: node scripts/testar.mjs vazio',
  '      - run: echo node scripts/testar.mjs esquecido',
  '',
].join('\n');

const MANUAL = 'on:\n  workflow_dispatch:\njobs:\n  b:\n    steps:\n      - run: node scripts/testar.mjs so-no-manual esquecido\n';

const POR_FORA = [
  'on:',
  '  pull_request:',
  'jobs:',
  '  c:',
  '    steps:',
  '      - run: node test_x.js',
  '      # - run: node test_y.js',
  '      - run: python -m unittest discover',
  '      - run: pytest -q',
  '      - run: npx playwright test e2e',
  '      - run: bash scripts/test_h.sh',
  '      - run: node scripts/testar.mjs bom fantasma',
  '      - run: cat scripts/testar.mjs',
  '      - run: node scripts/testar.mjs bom',
  '        continue-on-error: true',
  '',
].join('\n');

const REPOSITORIO = {
  'scripts/testes.json': REGISTRO,
  '.github/workflows/pr.yml': PR,
  '.github/workflows/manual.yaml': MANUAL,
  '.github/workflows/por-fora.yml': POR_FORA,
  'test_a.js': '',
  'test_b.js': '',
  'test_c.js': '',
  'test_d.js': '',
  'complemento/test_e.py': '',
  'scripts/test_f.mjs': '',
};

const ONDE_SE_APLICA = [
  ['test_a.js', true],
  ['scripts/test_x.mjs', true],
  ['complemento/test_y.py', true],
  ['scripts/test_z.sh', true],
  ['e2e/tests/painel.spec.js', true],
  ['scripts/testes.json', true],
  ['.github/workflows/regras.yml', true],
  ['.github/workflows/regras.yaml', true],
  ['.github/workflows/sub/regras.yml', false],
  ['.githubXworkflows/regras.yml', false],
  ['scripts/testar.mjs', false],
  ['README.md', false],
];

const CASOS = [
  { porque: 'um teste num grupo', arquivo: 'test_a.js', esperado: [] },
  { porque: 'um teste em `fora`', arquivo: 'test_c.js', esperado: [] },
  { porque: 'um teste descoberto pela pasta do grupo', arquivo: 'complemento/test_e.py', esperado: [] },
  {
    porque: 'um teste sem grupo',
    arquivo: 'scripts/test_f.mjs',
    esperado: [{ linha: 1, detalhe: 'scripts/test_f.mjs é um teste que nenhum grupo de scripts/testes.json roda; o CI não o executa' }],
  },
  {
    porque: 'um spec sem grupo',
    arquivo: 'e2e/tests/novo.spec.js',
    fonte: '',
    esperado: [{ linha: 1, detalhe: 'e2e/tests/novo.spec.js é um teste que nenhum grupo de scripts/testes.json roda; o CI não o executa' }],
  },
  {
    porque: 'cada problema do cadastro, na linha da sua chave',
    arquivo: 'scripts/testes.json',
    esperado: [
      { linha: 9, detalhe: 'grupo estranho: executor desconhecido (bun); use node, unittest ou playwright' },
      { linha: 15, detalhe: 'grupo vazio: nenhum arquivo do repositório casa com ele; tire o grupo ou conserte o padrão' },
      { linha: 21, detalhe: 'grupo esquecido: nenhum workflow de PR chama `node scripts/testar.mjs esquecido`; os testes dele não rodam no CI' },
      { linha: 27, detalhe: 'grupo so-no-manual: nenhum workflow de PR chama `node scripts/testar.mjs so-no-manual`; os testes dele não rodam no CI' },
      { linha: 39, detalhe: 'fora: nao_existe.js não existe; tire a entrada' },
      { linha: 33, detalhe: 'fora: (sem arquivo) não existe; tire a entrada' },
      { linha: 46, detalhe: 'fora: test_d.js sem motivo; diga por que não é um teste do portão' },
    ],
  },
  {
    porque: 'o workflow que chama o executor por inteiro',
    arquivo: '.github/workflows/pr.yml',
    esperado: [
      { linha: 8, detalhe: 'echo node scripts/testar.mjs esquecido não executa o grupo (só imprime, não executa); o passo precisa rodar `node scripts/testar.mjs <grupo>` e poder barrar o PR' },
    ],
  },
  {
    porque: 'os testes por fora do executor, o grupo que não existe e o executor citado sem rodar',
    arquivo: '.github/workflows/por-fora.yml',
    esperado: [
      { linha: 6, detalhe: 'roda um teste por fora do executor: - run: node test_x.js; chame `node scripts/testar.mjs <grupo>`' },
      { linha: 8, detalhe: 'roda um teste por fora do executor: - run: python -m unittest discover; chame `node scripts/testar.mjs <grupo>`' },
      { linha: 9, detalhe: 'roda um teste por fora do executor: - run: pytest -q; chame `node scripts/testar.mjs <grupo>`' },
      { linha: 10, detalhe: 'roda um teste por fora do executor: - run: npx playwright test e2e; chame `node scripts/testar.mjs <grupo>`' },
      { linha: 11, detalhe: 'roda um teste por fora do executor: - run: bash scripts/test_h.sh; chame `node scripts/testar.mjs <grupo>`' },
      { linha: 12, detalhe: 'chama o grupo fantasma, que scripts/testes.json não tem' },
      { linha: 13, detalhe: 'cat scripts/testar.mjs cita o executor mas não o roda como comando; escreva `node scripts/testar.mjs <grupo>` (com xvfb-run, env ou nice na frente, se precisar)' },
      { linha: 14, detalhe: 'node scripts/testar.mjs bom não executa o grupo (continue-on-error: true no passo: a falha não barra); o passo precisa rodar `node scripts/testar.mjs <grupo>` e poder barrar o PR' },
    ],
  },
];

let total = 0;
for (const [arquivo, esperado] of ONDE_SE_APLICA) {
  assert.strictEqual(regra.seAplica(arquivo), esperado, `seAplica(${arquivo})`);
  total++;
}
const raiz = repositorioDeTestes(REPOSITORIO);
try {
  for (const { porque, arquivo, fonte = REPOSITORIO[arquivo], esperado } of CASOS) {
    assert.deepStrictEqual(regra.verificar(arquivo, fonte, raiz), esperado, porque);
    total++;
  }
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log(`testes-no-portao: ${total} provas passaram`);
