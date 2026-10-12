'use strict';

// As duas decisões que o workflow Testes toma com código: quando a suíte e2e pode ser pulada
// e quais testes passaram só na segunda tentativa.

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { soDocumentacao, arquivosMudados } = require('./so-documentacao.js');
const { instaveis, resumo } = require('./instaveis.js');

// --- Mudou só documentação? ---
assert.strictEqual(soDocumentacao(['CLAUDE.md']), true);
assert.strictEqual(soDocumentacao(['docs/instalar-extensao.md', 'bridge/README.md', 'engine/prompts/README.md']), true);
assert.strictEqual(soDocumentacao(['docs/design/painel/anki/prototipo-anki.html', 'docs/design/foto/ref.png']), true);
assert.strictEqual(soDocumentacao(['.agents/skills/popup/SKILL.md', '.claude/skills/x/SKILL.md']), true);

// Qualquer arquivo de código na lista basta para rodar a suíte.
assert.strictEqual(soDocumentacao(['CLAUDE.md', 'painel.js']), false);
assert.strictEqual(soDocumentacao(['e2e/tests/popup.spec.js']), false);
assert.strictEqual(soDocumentacao(['.github/workflows/testes.yml']), false);
assert.strictEqual(soDocumentacao(['.agents/skills/verify-perpetualminer/scripts/doctor.sh']), false);
assert.strictEqual(soDocumentacao(['scripts/ci/so-documentacao.js']), false);

// Lista vazia (não deu para ver o que mudou): roda tudo.
assert.strictEqual(soDocumentacao([]), false);

// A suíte lê estes arquivos de documentação: mudá-los muda o que ela confere.
assert.strictEqual(soDocumentacao(['docs/design/voz/README.md']), false);
assert.strictEqual(soDocumentacao(['docs/design/identidade-veio/assets/veio.svg']), false);
assert.strictEqual(soDocumentacao(['docs/loja/pequena.png']), false);

// Nada que a suíte, o CI ou a extensão usam passa por documentação, nem com extensão de texto.
assert.strictEqual(soDocumentacao(['e2e/pages/fixture.md']), false);
assert.strictEqual(soDocumentacao(['e2e/tests/painel-visual.spec.js-snapshots/a.png']), false);
assert.strictEqual(soDocumentacao(['e2e/tests/referencia.png']), false);
assert.strictEqual(soDocumentacao(['.github/workflows/testes.md']), false);
assert.strictEqual(soDocumentacao(['scripts/ci/LEIA-ME.md']), false);
assert.strictEqual(soDocumentacao(['lib/voz/catalogo.md']), false);
assert.strictEqual(soDocumentacao(['docs/scripts/check.js']), false);
assert.strictEqual(soDocumentacao(['docs/overlay.spec.js']), false);
assert.strictEqual(soDocumentacao(['.agents/skills/x/check.ts']), false);
assert.strictEqual(soDocumentacao(['.agents/skills/x/dados.yaml']), false);
assert.strictEqual(soDocumentacao(['painel.png']), false);
assert.strictEqual(soDocumentacao(['CLAUDE.md', 'docs/design/foto/ref.png']), true);

// --- Sobre um diff de verdade: apagar ou mover um teste não é só documentação ---
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ci-'));
const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(repo, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(repo, arquivo), texto);
};
git('init', '-q');
const teste = Array.from({ length: 30 }, (_, i) => `test('caso ${i}', async () => {});`).join('\n');
escrever('e2e/tests/overlay.spec.js', teste);
escrever('docs/leia.md', 'um\n');
escrever('painel.js', '// painel\n');
git('add', '-A'); git('commit', '-q', '-m', 'base');
const classificar = alteracao => {
  alteracao();
  git('add', '-A'); git('commit', '-q', '-m', 'mudança');
  return soDocumentacao(arquivosMudados('HEAD~1', 'HEAD', repo));
};
assert.strictEqual(classificar(() => escrever('docs/leia.md', 'dois\n')), true, 'editar um texto');
assert.strictEqual(classificar(() => escrever('CLAUDE.md', 'novo\n')), true, 'criar um texto');
assert.strictEqual(classificar(() => {
  fs.renameSync(path.join(repo, 'e2e/tests/overlay.spec.js'), path.join(repo, 'docs/overlay.spec.js'));
}), false, 'mover um teste para docs/ (o Git diz "renomeado": só o destino aparece sem --no-renames)');
assert.strictEqual(classificar(() => {
  fs.renameSync(path.join(repo, 'docs/overlay.spec.js'), path.join(repo, 'e2e/tests/overlay.spec.js'));
}), false, 'trazer um teste de volta');
assert.strictEqual(classificar(() => fs.rmSync(path.join(repo, 'e2e/tests/overlay.spec.js'))), false, 'apagar um teste');
assert.strictEqual(classificar(() => escrever('.github/workflows/testes.yml', 'name: x\n')), false, 'mexer num workflow');
assert.strictEqual(classificar(() => escrever('e2e/tests/ref.png', 'png')), false, 'uma referência visual');
assert.strictEqual(classificar(() => fs.rmSync(path.join(repo, 'painel.js'))), false, 'apagar código');
fs.rmSync(repo, { recursive: true, force: true });

// --- Quem passou só na segunda tentativa? ---
const relatorio = {
  suites: [{
    title: 'a.spec.js',
    specs: [
      { title: 'passa de primeira', file: 'a.spec.js', line: 3, tests: [{ status: 'expected', results: [{ status: 'passed' }] }] },
      { title: 'oscila', file: 'a.spec.js', line: 9, tests: [{ status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] }] },
    ],
    suites: [{
      title: 'grupo',
      specs: [
        { title: 'cai sempre', file: 'a.spec.js', line: 20, tests: [{ status: 'unexpected', results: [{ status: 'failed' }, { status: 'failed' }] }] },
        { title: 'oscila no grupo', file: 'a.spec.js', line: 30, tests: [{ status: 'flaky', results: [{ status: 'timedOut' }, { status: 'passed' }] }] },
      ],
    }],
  }],
};
assert.deepStrictEqual(
  instaveis(relatorio).map(t => `${t.arquivo}:${t.linha} ${t.titulo}`),
  ['a.spec.js:9 oscila', 'a.spec.js:30 oscila no grupo'],
  'só os que passaram na segunda tentativa; quem caiu nas duas é falha, não instável');
assert.deepStrictEqual(instaveis({ suites: [] }), []);

assert.strictEqual(resumo([]), '');
const texto = resumo(instaveis(relatorio));
assert(texto.includes('a.spec.js:9') && texto.includes('oscila no grupo'), 'o resumo nomeia cada teste');
assert(/2/.test(texto.split('\n')[0]), 'o título conta quantos foram');

// O job guarda e2e/test-results quando algum teste oscilou: o passo diz isso pela saída `achou`.
function saidaDoPasso(conteudo) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'instaveis-'));
  const arquivoRelatorio = path.join(pasta, 'relatorio.json');
  const arquivoSaida = path.join(pasta, 'saida');
  fs.writeFileSync(arquivoRelatorio, JSON.stringify(conteudo));
  execFileSync('node', [path.join(__dirname, 'instaveis.js'), arquivoRelatorio], {
    env: { ...process.env, GITHUB_OUTPUT: arquivoSaida, GITHUB_STEP_SUMMARY: path.join(pasta, 'resumo') },
    stdio: 'ignore',
  });
  const saida = fs.readFileSync(arquivoSaida, 'utf8');
  fs.rmSync(pasta, { recursive: true, force: true });
  return saida;
}
assert.strictEqual(saidaDoPasso(relatorio), 'achou=true\n', 'com um teste instável o job guarda os resultados');
assert.strictEqual(saidaDoPasso({ suites: [] }), 'achou=false\n', 'sem nenhum, não guarda');

console.log('ci ok');
