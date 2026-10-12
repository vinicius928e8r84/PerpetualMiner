'use strict';

// As três decisões que os workflows tomam com código: quando a suíte e2e pode ser pulada e quais
// testes passaram só na segunda tentativa (workflow Testes), e a autoria dos commits (workflow Regras).

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { soDocumentacao, arquivosMudados } = require('./so-documentacao.js');
const { instaveis, resumo } = require('./instaveis.js');
const { EMAIL_DO_DONO, commitsForaDaRegra, mensagem } = require('./autoria.js');

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

// --- Todo commit do PR é do dono? ---
const linha = (sha, autor, committer, assunto = 'x') => [sha, autor, committer, assunto].join('\t');
assert.deepStrictEqual(commitsForaDaRegra([linha('a1', EMAIL_DO_DONO, EMAIL_DO_DONO), '']), [], 'autor e committer do dono');
assert.deepStrictEqual(commitsForaDaRegra([linha('a2', EMAIL_DO_DONO, 'noreply@github.com')]), [], 'o committer GitHub dos merges do site');
assert.deepStrictEqual(commitsForaDaRegra([linha('a3', 'agente@exemplo.com', EMAIL_DO_DONO)]).map(c => c.sha), ['a3'], 'autor de outra pessoa');
assert.deepStrictEqual(commitsForaDaRegra([linha('a4', EMAIL_DO_DONO, 'agente@exemplo.com')]).map(c => c.sha), ['a4'], 'committer de outra pessoa');
assert.deepStrictEqual(commitsForaDaRegra([linha('a5', 'noreply@github.com', EMAIL_DO_DONO)]).map(c => c.sha), ['a5'], 'o autor não tem a exceção do GitHub');
assert.deepStrictEqual(commitsForaDaRegra([linha('a6', EMAIL_DO_DONO, EMAIL_DO_DONO, 'com\ttabulação')]), [], 'tabulação no assunto');
assert.match(mensagem(commitsForaDaRegra([linha('abcdef0123', 'agente@exemplo.com', EMAIL_DO_DONO, 'um assunto')]), 'origin/main'),
  /abcdef0 um assunto[^]*git rebase --rebase-merges --exec 'git commit --amend --no-edit --reset-author' origin\/main/, 'a mensagem dá o comando');

// Sobre um repositório de verdade, pelo mesmo comando que o workflow roda.
{
  const repoDeAutoria = fs.mkdtempSync(path.join(os.tmpdir(), 'autoria-'));
  const gitA = (autor, ...args) => execFileSync('git', args, {
    cwd: repoDeAutoria, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'n', GIT_AUTHOR_EMAIL: autor, GIT_COMMITTER_NAME: 'n', GIT_COMMITTER_EMAIL: autor },
  });
  const rodarAutoria = () => spawnSync('node', [path.join(__dirname, 'autoria.js'), 'main', 'HEAD'], { cwd: repoDeAutoria, encoding: 'utf8' });
  const commitar = (autor, assunto) => {
    fs.writeFileSync(path.join(repoDeAutoria, 'arquivo.txt'), `${assunto}\n`);
    gitA(autor, 'add', '-A');
    gitA(autor, 'commit', '-q', '-m', assunto);
  };
  gitA(EMAIL_DO_DONO, 'init', '-q', '-b', 'main');
  commitar(EMAIL_DO_DONO, 'base');
  gitA(EMAIL_DO_DONO, 'checkout', '-q', '-b', 'ramo');
  commitar(EMAIL_DO_DONO, 'feito certo');
  assert.strictEqual(rodarAutoria().status, 0, 'só commits do dono');
  commitar('agente@exemplo.com', 'do agente');
  const falha = rodarAutoria();
  assert.strictEqual(falha.status, 1, 'um commit de outro e-mail barra');
  assert(falha.stdout.includes('do agente') && !falha.stdout.includes('feito certo'), 'a mensagem nomeia só o commit errado');
  // O comando da mensagem conserta: depois dele a autoria passa.
  execFileSync('git', ['rebase', '-q', '--rebase-merges', '--exec', 'git commit --amend --no-edit --reset-author', 'main'], {
    cwd: repoDeAutoria,
    env: { ...process.env, GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.email', GIT_CONFIG_VALUE_0: EMAIL_DO_DONO, GIT_CONFIG_KEY_1: 'user.name', GIT_CONFIG_VALUE_1: 'n' },
  });
  assert.strictEqual(rodarAutoria().status, 0, 'o comando da mensagem refaz a autoria');
  fs.rmSync(repoDeAutoria, { recursive: true, force: true });
}

console.log('ci ok');
