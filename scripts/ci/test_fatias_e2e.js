'use strict';

// As fatias da suíte e2e (scripts/ci/fatias-e2e.json): todo spec de e2e/tests roda em exatamente uma fatia, as fatias são as que
// as durações dão e o workflow Testes usa a lista. Um spec que ficasse fora (ou em duas) deixaria o CI verde sem rodá-lo
// (ou rodaria duas vezes) sem que ninguém visse.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { NUMERO_DE_FATIAS, duracoesDosLogs, filtros, ler, montarFatias, problemas, specsDoDisco } = require('./fatias-e2e.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const specs = specsDoDisco();
const arquivo = ler();

// O que está commitado.
assert(specs.length > 100, 'achou os specs do disco');
assert.deepStrictEqual(problemas(arquivo, specs), [], 'todo spec está em exatamente uma fatia e tem duração (node scripts/ci/fatias-e2e.js --gerar)');
assert.strictEqual(arquivo.fatias.length, NUMERO_DE_FATIAS, 'o número de fatias');
assert.deepStrictEqual(arquivo.fatias, montarFatias(arquivo.duracoes), 'as fatias são o que --gerar faz das durações (node scripts/ci/fatias-e2e.js --gerar)');
assert(arquivo.fatias.every(lista => lista.length > 0), 'nenhuma fatia vazia');

// Equilíbrio: a fatia mais lenta não passa de 10% acima da média, nem do maior spec quando ele já é maior que isso.
const segundos = lista => lista.reduce((soma, spec) => soma + arquivo.duracoes[spec], 0);
const total = segundos(specs);
const maiorSpec = Math.max(...specs.map(spec => arquivo.duracoes[spec]));
const maiorFatia = Math.max(...arquivo.fatias.map(segundos));
assert(maiorFatia <= Math.max(maiorSpec, (total / NUMERO_DE_FATIAS) * 1.1), `fatia mais lenta ${maiorFatia}s, média ${(total / NUMERO_DE_FATIAS).toFixed(0)}s, maior spec ${maiorSpec}s`);

// O Playwright e este script enxergam os mesmos arquivos: o `testMatch` do Playwright é só `*.spec.js` (senão um
// `zz.test.js` rodaria no Playwright sem estar em fatia nenhuma), e nenhum arquivo de e2e/tests parece teste sem ser `.spec.js`.
const configuracao = fs.readFileSync(path.join(RAIZ, 'e2e', 'playwright.config.js'), 'utf8');
assert(/testMatch:\s*'\*\*\/\*\.spec\.js'/.test(configuracao), "e2e/playwright.config.js precisa de testMatch: '**/*.spec.js'");
const quePareceTeste = (function listar(pasta, prefixo = '') {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap(entrada => (entrada.isDirectory()
    ? listar(path.join(pasta, entrada.name), `${prefixo}${entrada.name}/`)
    : (/\.(spec|test)\.[cm]?[jt]sx?$/.test(entrada.name) && !/\.spec\.js$/.test(entrada.name) ? [`${prefixo}${entrada.name}`] : [])));
})(path.join(RAIZ, 'e2e', 'tests'));
assert.deepStrictEqual(quePareceTeste, [], 'um arquivo de e2e/tests que parece teste mas não termina em .spec.js não roda no CI: renomeie para .spec.js');

// O workflow: a matriz tem uma entrada por fatia, o nome do check diz quantas são, e o job pede a lista desta fatia.
const workflow = fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'testes.yml'), 'utf8');
const matriz = /^\s*fatia: \[([\d, ]+)\]\s*$/m.exec(workflow);
assert(matriz, 'a matriz de fatias do workflow');
assert.deepStrictEqual(matriz[1].split(',').map(n => Number(n.trim())), arquivo.fatias.map((_, i) => i + 1), 'a matriz do workflow tem uma entrada por fatia');
assert(workflow.includes(`name: e2e (\${{ matrix.fatia }}/${arquivo.fatias.length})`), 'o nome do check diz quantas fatias são');
assert(/fatias-e2e\.js \$\{\{ matrix\.fatia \}\}/.test(workflow), 'a fatia roda os specs da lista, não um --shard');
assert(!/--shard/.test(workflow.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')), 'nenhum --shard nos comandos do workflow');

// A conferência pega o erro de verdade.
const exemplo = { duracoes: { 'a.spec.js': 5, 'b.spec.js': 3, 'c.spec.js': 2 }, fatias: [['a.spec.js'], ['b.spec.js', 'c.spec.js']] };
const todos = ['a.spec.js', 'b.spec.js', 'c.spec.js'];
assert.deepStrictEqual(problemas(exemplo, todos), []);
assert.deepStrictEqual(problemas({ ...exemplo, fatias: [['a.spec.js'], ['b.spec.js']] }, todos), ['c.spec.js não está em nenhuma fatia'], 'um spec fora');
assert.deepStrictEqual(problemas({ ...exemplo, fatias: [['a.spec.js', 'b.spec.js'], ['b.spec.js', 'c.spec.js']] }, todos), ['b.spec.js está em 2 fatias (1, 2)'], 'um spec em duas fatias');
assert.deepStrictEqual(problemas(exemplo, [...todos, 'd.spec.js']), ['d.spec.js não está em nenhuma fatia', 'd.spec.js não tem duração'], 'um spec novo');
assert.deepStrictEqual(problemas(exemplo, ['a.spec.js', 'b.spec.js']), ['c.spec.js está numa fatia mas não existe em e2e/tests', 'c.spec.js tem duração mas não existe em e2e/tests'], 'um spec apagado');

// A montagem: cada spec uma vez, a fatia mais cheia recebe o próximo, repetível.
assert.deepStrictEqual(montarFatias(exemplo.duracoes, 2), [['a.spec.js'], ['b.spec.js', 'c.spec.js']]);
assert.deepStrictEqual(montarFatias({ 'x.spec.js': 4, 'y.spec.js': 4, 'z.spec.js': 4 }, 2), [['x.spec.js', 'z.spec.js'], ['y.spec.js']], 'empate: a fatia de menor número');
assert.deepStrictEqual(montarFatias(arquivo.duracoes), montarFatias({ ...arquivo.duracoes }), 'repetível');

// Os filtros do Playwright: o caminho do spec, ancorado, sem pegar outro spec de nome parecido.
assert.deepStrictEqual(filtros(['painel.spec.js', 'x/y-z.spec.js']), ['tests/painel\\.spec\\.js$', 'tests/x/y-z\\.spec\\.js$']);
for (const [spec, regex] of specs.map(spec => [spec, new RegExp(filtros([spec])[0], 'i')])) {
  assert.deepStrictEqual(specs.filter(outro => regex.test(`/repo/e2e/tests/${outro}`)), [spec], `o filtro de ${spec} pega só ele`);
}

// A leitura dos logs do CI (reporter `list`): soma os testes que passaram, em ms, s e m, e ignora os que falharam.
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
