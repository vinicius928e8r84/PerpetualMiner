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
const { ARQUIVO_DA_LISTA, checksDosWorkflows, checksQueFaltam } = require('./checks-obrigatorios.js');

assert.strictEqual(soDocumentacao(['CLAUDE.md']), true);
assert.strictEqual(soDocumentacao(['docs/instalar-extensao.md', 'complemento/LEIA-ME.md', 'engine/prompts/README.md']), true);
assert.strictEqual(soDocumentacao(['docs/design/painel/anki/prototipo-anki.html', 'docs/design/foto/ref.png']), true);
assert.strictEqual(soDocumentacao(['.agents/skills/popup/SKILL.md', '.claude/skills/x/SKILL.md']), true);

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
  const commitar = (autor, assunto, arquivo = 'arquivo.txt') => {
    fs.writeFileSync(path.join(repoDeAutoria, arquivo), `${assunto}\n`);
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
  execFileSync('git', ['rebase', '-q', '--rebase-merges', '--exec', 'git commit --amend --no-edit --reset-author', 'main'], {
    cwd: repoDeAutoria,
    env: { ...process.env, GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.email', GIT_CONFIG_VALUE_0: EMAIL_DO_DONO, GIT_CONFIG_KEY_1: 'user.name', GIT_CONFIG_VALUE_1: 'n' },
  });
  assert.strictEqual(rodarAutoria().status, 0, 'o comando da mensagem refaz a autoria');
  // Com um merge no meio: o comando refaz a autoria dos dois lados e do próprio merge.
  gitA(EMAIL_DO_DONO, 'checkout', '-q', '-b', 'lateral', 'main');
  commitar('agente@exemplo.com', 'lateral do agente', 'lateral.txt');
  gitA(EMAIL_DO_DONO, 'checkout', '-q', 'ramo');
  gitA('agente@exemplo.com', 'merge', '-q', '--no-ff', '--no-edit', 'lateral');
  const comMerge = rodarAutoria();
  assert.strictEqual(comMerge.status, 1, 'o merge e o lado de outro e-mail barram');
  assert(comMerge.stdout.includes('lateral do agente') && /Merge branch/.test(comMerge.stdout), 'a mensagem nomeia o commit do lado e o merge');
  execFileSync('git', ['rebase', '-q', '--rebase-merges', '--exec', 'git commit --amend --no-edit --reset-author', 'main'], {
    cwd: repoDeAutoria,
    env: { ...process.env, GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.email', GIT_CONFIG_VALUE_0: EMAIL_DO_DONO, GIT_CONFIG_KEY_1: 'user.name', GIT_CONFIG_VALUE_1: 'n' },
  });
  assert.strictEqual(rodarAutoria().status, 0, 'o comando da mensagem refaz a autoria também com merge');
  assert(gitA(EMAIL_DO_DONO, 'log', '--merges', '--format=%H', 'main..HEAD').trim(), 'o merge continua no histórico');

  // Uma ponta que o clone não tem (checkout raso): uma mensagem que manda conferir o fetch-depth, não o stack do Node.
  const semPonta = spawnSync('node', [path.join(__dirname, 'autoria.js'), 'origin/main', 'HEAD'], { cwd: repoDeAutoria, encoding: 'utf8' });
  assert.strictEqual(semPonta.status, 2, 'ponta ausente é erro de uso');
  assert(/origin\/main/.test(semPonta.stdout) && /fetch-depth/.test(semPonta.stdout), 'a mensagem nomeia a ponta e o fetch-depth');
  assert(!/at |node:internal/.test(semPonta.stderr), 'sem stack do Node');
  fs.rmSync(repoDeAutoria, { recursive: true, force: true });
}

// O passo de autoria roda mesmo quando um passo anterior falha, para o erro dela aparecer na mesma rodada.
{
  const regrasYml = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'regras.yml'), 'utf8');
  const passo = regrasYml.split('- name: Autoria dos commits')[1].split('run:')[0];
  assert(/if: \$\{\{ !cancelled\(\) && /.test(passo), 'o passo de autoria tem !cancelled()');
}

// Os checks obrigatórios: cada nome da lista sai de algum workflow. O erro real é o do #262/#263, em que o
// revisor conferiu à mão que "nenhum nome de check mudou".
{
  const RAIZ = path.resolve(__dirname, '..', '..');
  assert.deepStrictEqual(checksQueFaltam(RAIZ), [], 'todo check obrigatório sai de um workflow (ou a lista e a proteção da main mudam juntas)');
  assert(checksDosWorkflows(RAIZ).has('e2e (8/8)') && checksDosWorkflows(RAIZ).has('Testes do complemento (Python 3.13)'), 'a matriz é expandida');

  const copia = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-checks-'));
  fs.mkdirSync(path.join(copia, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(copia, 'scripts', 'ci'), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, ARQUIVO_DA_LISTA), path.join(copia, ARQUIVO_DA_LISTA));
  for (const arquivo of fs.readdirSync(path.join(RAIZ, '.github', 'workflows'))) {
    fs.copyFileSync(path.join(RAIZ, '.github', 'workflows', arquivo), path.join(copia, '.github', 'workflows', arquivo));
  }
  const reescrever = (arquivo, de, para) => {
    const caminho = path.join(copia, '.github', 'workflows', arquivo);
    const antes = fs.readFileSync(caminho, 'utf8');
    assert(antes.includes(de), `${arquivo} tem "${de}"`);
    fs.writeFileSync(caminho, antes.replace(de, para));
  };
  reescrever('regras.yml', 'name: Regras de revisão', 'name: Regras');
  assert.deepStrictEqual(checksQueFaltam(copia), ['Regras de revisão'], 'um job renomeado deixa o merge esperando um check que não existe');
  reescrever('regras.yml', '    name: Regras\n', '    name: Regras de revisão\n');
  reescrever('testes.yml', 'name: e2e (${{ matrix.fatia }}/8)', 'name: e2e ${{ matrix.fatia }}');
  assert.strictEqual(checksQueFaltam(copia).length, 8, 'a matriz renomeada perde as oito fatias');
  reescrever('testes.yml', 'name: e2e ${{ matrix.fatia }}', 'name: e2e (${{ matrix.fatia }}/8)');
  reescrever('testes.yml', 'fatia: [1, 2, 3, 4, 5, 6, 7, 8]', 'fatia: [1, 2, 3, 4, 5, 6, 7]');
  assert.deepStrictEqual(checksQueFaltam(copia), ['e2e (8/8)'], 'uma fatia a menos');
  reescrever('testes.yml', 'fatia: [1, 2, 3, 4, 5, 6, 7]', 'fatia: [1, 2, 3, 4, 5, 6, 7, 8]');
  reescrever('testes.yml', '"ubuntu-24.04"', '"ubuntu-22.04"');
  assert.deepStrictEqual(checksQueFaltam(copia), [], 'trocar o runner (CI_RUNS_ON) não muda nenhum nome');
  fs.rmSync(copia, { recursive: true, force: true });
}

console.log('ci ok');
