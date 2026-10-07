'use strict';

// As duas decisões que o workflow Testes toma com código: quando a suíte e2e pode ser pulada
// e quais testes passaram só na segunda tentativa.

const assert = require('assert');
const { soDocumentacao } = require('./so-documentacao.js');
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

console.log('ci ok');
