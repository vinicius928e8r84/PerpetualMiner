'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const path = require('path');
const { ESTIMATIVA_DO_SPEC_NOVO, NUMERO_DE_FATIAS, duracoesDosLogs, duracoesParaOsSpecs, fatiasDe, filtros, ler, montarFatias, problemas, specsDoDisco } = require('./fatias-e2e.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const specs = specsDoDisco();
const arquivo = ler();

assert(specs.length > 100, 'achou os specs do disco');
assert.deepStrictEqual(Object.keys(arquivo).sort(), ['descricao', 'duracoes'], 'o arquivo guarda só a descrição e as durações, não as fatias');
assert.deepStrictEqual(Object.keys(arquivo.duracoes).filter(spec => !specs.includes(spec)), [], 'duração de spec que não existe mais em e2e/tests: tire a linha do arquivo');
const durações = duracoesParaOsSpecs(arquivo.duracoes, specs);
const fatias = fatiasDe(arquivo.duracoes, specs);
assert.deepStrictEqual(problemas({ duracoes: durações, fatias }, specs), [], 'todo spec está em exatamente uma fatia e tem duração');
assert.strictEqual(fatias.length, NUMERO_DE_FATIAS, 'o número de fatias');
assert(fatias.every(lista => lista.length > 0), 'nenhuma fatia vazia');
const outroSpec = 'zz-spec-novo.spec.js';
const comNovo = fatiasDe(arquivo.duracoes, [...specs, outroSpec]);
assert.deepStrictEqual(comNovo.flat().sort(), [...specs, outroSpec].sort(), 'um spec novo, sem duração no arquivo, entra em uma fatia');
assert.strictEqual(duracoesParaOsSpecs(arquivo.duracoes, [...specs, outroSpec])[outroSpec], ESTIMATIVA_DO_SPEC_NOVO, 'o spec novo vale a estimativa');

assert.strictEqual(ESTIMATIVA_DO_SPEC_NOVO, 10, 'a estimativa de um spec novo');

const pastaDeTeste = fs.mkdtempSync(path.join(os.tmpdir(), 'fatias-e2e-'));
try {
  const todosOsSpecs = [...specs, 'zz-spec-novo.spec.js'].sort();
  for (const spec of todosOsSpecs) {
    fs.mkdirSync(path.dirname(path.join(pastaDeTeste, spec)), { recursive: true });
    fs.writeFileSync(path.join(pastaDeTeste, spec), '');
  }
  const doCli = Array.from({ length: NUMERO_DE_FATIAS }, (_, i) => {
    const saida = spawnSync(process.execPath, [path.join(__dirname, 'fatias-e2e.js'), String(i + 1)], { encoding: 'utf8', env: { ...process.env, FATIAS_E2E_PASTA: pastaDeTeste } });
    assert.strictEqual(saida.status, 0, saida.stderr);
    return saida.stdout.trim().split(' ');
  });
  assert.deepStrictEqual(doCli.flat().sort(), filtros(todosOsSpecs).sort(), 'as 8 fatias do CLI juntas são todo spec (o novo também), cada um uma vez');
  assert.deepStrictEqual(doCli, fatiasDe(arquivo.duracoes, todosOsSpecs).map(filtros), 'o CLI <N> imprime as fatias que fatiasDe calcula');
} finally {
  fs.rmSync(pastaDeTeste, { recursive: true, force: true });
}

const segundos = lista => lista.reduce((soma, spec) => soma + durações[spec], 0);
const total = segundos(specs);
const maiorSpec = Math.max(...specs.map(spec => durações[spec]));
const maiorFatia = Math.max(...fatias.map(segundos));
assert(maiorFatia <= Math.max(maiorSpec, (total / NUMERO_DE_FATIAS) * 1.1), `fatia mais lenta ${maiorFatia}s, média ${(total / NUMERO_DE_FATIAS).toFixed(0)}s, maior spec ${maiorSpec}s`);

const configuracao = fs.readFileSync(path.join(RAIZ, 'e2e', 'playwright.config.js'), 'utf8');
assert(/testMatch:\s*'\*\*\/\*\.spec\.js'/.test(configuracao), "e2e/playwright.config.js precisa de testMatch: '**/*.spec.js'");
const quePareceTeste = (function listar(pasta, prefixo = '') {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap(entrada => (entrada.isDirectory()
    ? listar(path.join(pasta, entrada.name), `${prefixo}${entrada.name}/`)
    : (/\.(spec|test)\.[cm]?[jt]sx?$/.test(entrada.name) && !/\.spec\.js$/.test(entrada.name) ? [`${prefixo}${entrada.name}`] : [])));
})(path.join(RAIZ, 'e2e', 'tests'));
assert.deepStrictEqual(quePareceTeste, [], 'um arquivo de e2e/tests que parece teste mas não termina em .spec.js não roda no CI: renomeie para .spec.js');

const workflow = fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'testes.yml'), 'utf8');
const matriz = /^\s*fatia: \[([\d, ]+)\]\s*$/m.exec(workflow);
assert(matriz, 'a matriz de fatias do workflow');
assert.deepStrictEqual(matriz[1].split(',').map(n => Number(n.trim())), fatias.map((_, i) => i + 1), 'a matriz do workflow tem uma entrada por fatia');
assert(workflow.includes(`name: e2e (\${{ matrix.fatia }}/${fatias.length})`), 'o nome do check diz quantas fatias são');
assert(/fatias-e2e\.js \$\{\{ matrix\.fatia \}\}/.test(workflow), 'a fatia roda os specs da lista, não um --shard');
assert(!/--shard/.test(workflow.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')), 'nenhum --shard nos comandos do workflow');

const exemplo = { duracoes: { 'a.spec.js': 5, 'b.spec.js': 3, 'c.spec.js': 2 }, fatias: [['a.spec.js'], ['b.spec.js', 'c.spec.js']] };
const todos = ['a.spec.js', 'b.spec.js', 'c.spec.js'];
assert.deepStrictEqual(problemas(exemplo, todos), []);
assert.deepStrictEqual(problemas({ ...exemplo, fatias: [['a.spec.js'], ['b.spec.js']] }, todos), ['c.spec.js não está em nenhuma fatia'], 'um spec fora');
assert.deepStrictEqual(problemas({ ...exemplo, fatias: [['a.spec.js', 'b.spec.js'], ['b.spec.js', 'c.spec.js']] }, todos), ['b.spec.js está em 2 fatias (1, 2)'], 'um spec em duas fatias');
assert.deepStrictEqual(problemas(exemplo, [...todos, 'd.spec.js']), ['d.spec.js não está em nenhuma fatia', 'd.spec.js não tem duração'], 'um spec novo');
assert.deepStrictEqual(problemas(exemplo, ['a.spec.js', 'b.spec.js']), ['c.spec.js está numa fatia mas não existe em e2e/tests', 'c.spec.js tem duração mas não existe em e2e/tests'], 'um spec apagado');

assert.deepStrictEqual(montarFatias(exemplo.duracoes, 2), [['a.spec.js'], ['b.spec.js', 'c.spec.js']]);
assert.deepStrictEqual(montarFatias({ 'x.spec.js': 4, 'y.spec.js': 4, 'z.spec.js': 4 }, 2), [['x.spec.js', 'z.spec.js'], ['y.spec.js']], 'empate: a fatia de menor número');
assert.deepStrictEqual(fatias, fatiasDe({ ...arquivo.duracoes }, specs), 'repetível');

assert.deepStrictEqual(filtros(['painel.spec.js', 'x/y-z.spec.js']), ['tests/painel\\.spec\\.js$', 'tests/x/y-z\\.spec\\.js$']);
for (const [spec, regex] of specs.map(spec => [spec, new RegExp(filtros([spec])[0], 'i')])) {
  assert.deepStrictEqual(specs.filter(outro => regex.test(`/repo/e2e/tests/${outro}`)), [spec], `o filtro de ${spec} pega só ele`);
}

const log = [
  '2026-11-11T19:00:00.0000000Z   ✓   1 [chromium] › tests/popup.spec.js:10:1 › abre (1.5s)',
  '2026-11-11T19:00:01.0000000Z   ✓   2 tests/popup.spec.js:20:1 › fecha (500ms)',
  '2026-11-11T19:00:02.0000000Z   ✘   3 tests/popup.spec.js:30:1 › cai (2.0s)',
  '2026-11-11T19:00:03.0000000Z   ✓   4 tests/outro.spec.js:5:1 › longo (1.2m)',
  '2026-11-11T19:00:04.0000000Z   -   5 tests/outro.spec.js:9:1 › pulado',
].join('\n');
const medidas = duracoesDosLogs([log]);
assert.deepStrictEqual(Object.keys(medidas).sort(), ['outro.spec.js', 'popup.spec.js']);
assert(Math.abs(medidas['popup.spec.js'] - 2) < 1e-9 && Math.abs(medidas['outro.spec.js'] - 72) < 1e-9, JSON.stringify(medidas));

console.log('fatias e2e ok');
