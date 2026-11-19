'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
require(path.join(RAIZ, 'lib', 'arquivos-da-extensao.js'));
const { arquivosDaExtensao } = globalThis.PerpetualMiner;
const { PASTAS_DE_RUNTIME } = require(path.join(RAIZ, 'scripts', 'arquivos-do-pacote.js'));

const SCRIPT = path.join(RAIZ, 'preview', 'ignorar-build.sh');
const lerTexto = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');

function andar(pasta) {
  return fs.readdirSync(path.join(RAIZ, pasta), { withFileTypes: true }).flatMap(item => {
    const alvo = `${pasta}/${item.name}`;
    return item.isDirectory() ? andar(alvo) : [alvo];
  });
}

const vercel = JSON.parse(lerTexto('vercel.json'));
assert.strictEqual(vercel.ignoreCommand, 'sh preview/ignorar-build.sh', 'o Vercel pula o build pelo script');
assert.deepStrictEqual(vercel.git && vercel.git.deploymentEnabled, { '**': false, main: true, 'vitrine/**': true },
  'o Vercel publica só a main e as branches vitrine/*: cada push de outra branch gastaria o limite de 100 deployments por dia, mesmo pulado pelo ignoreCommand');
assert(!fs.existsSync(path.join(RAIZ, '.github', 'workflows', 'vitrine.yml')), 'nenhum workflow publica no Vercel: ele pediria um token');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ignorar-'));
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const escrever = (repo, arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(repo, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(repo, arquivo), texto);
};
const decidir = (repo, anterior) => spawnSync('sh', [SCRIPT], {
  cwd: repo, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: pasta, VERCEL_GIT_PREVIOUS_SHA: anterior || '' },
}).status;
const PULA = 0;
const CONSTROI = 1;

(async () => {
  const mostrados = new Set(await arquivosDaExtensao(async arquivo => lerTexto(arquivo)));
  for (const dir of [...PASTAS_DE_RUNTIME, 'docs/design', 'e2e/vitrine', 'preview']) {
    for (const arquivo of andar(dir)) if (!arquivo.startsWith('preview/dist/')) mostrados.add(arquivo);
  }
  mostrados.add('vercel.json');
  assert(mostrados.size > 100, 'a lista do que o preview mostra veio vazia');

  const naoMostrados = [
    'complemento/servidor.py', 'engine/CLAUDE.md', 'e2e/tests/popup.spec.js', 'e2e/fixtures.js', 'testes/test_voz.js',
    'scripts/ci/test_ci.js', 'scripts/testes.json', 'docs/arquivos/testes-e-ferramentas.md', 'AGENTS.md', 'docs/glossary.md',
    '.agents/skills/popup/SKILL.md', '.github/workflows/testes.yml',
  ];

  const repo = path.join(pasta, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  for (const arquivo of [...mostrados, ...naoMostrados]) escrever(repo, arquivo, 'base\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');

  const errados = [];
  const mexer = (arquivo, esperado) => {
    escrever(repo, arquivo, 'mudou\n');
    git(repo, 'commit', '-q', '-am', `muda ${arquivo}`);
    if (decidir(repo, base) !== esperado) errados.push(`${arquivo} devia ${esperado === PULA ? 'pular' : 'construir'}`);
    git(repo, 'reset', '-q', '--hard', base);
  };
  for (const arquivo of mostrados) mexer(arquivo, CONSTROI);
  for (const arquivo of naoMostrados) mexer(arquivo, PULA);
  assert.deepStrictEqual(errados, [], 'o script de ignorar o build erra o que o preview mostra');

  escrever(repo, 'docs/novo.md', 'x\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'doc');
  assert.strictEqual(decidir(repo, base), PULA, 'um commit sem nada do preview pula o build');
  assert.strictEqual(decidir(repo, 'ffffffffffffffffffffffffffffffffffffffff'), CONSTROI, 'sem conseguir comparar (commit fora do clone raso), constrói');

  const remoto = path.join(pasta, 'remoto.git');
  git(pasta, 'clone', '-q', '--bare', repo, remoto);
  const clone = path.join(pasta, 'clone');
  git(pasta, 'clone', '-q', remoto, clone);
  git(clone, 'checkout', '-q', '-b', 'fm/so-doc');
  escrever(clone, 'docs/a.md', 'a\n'); git(clone, 'add', '-A'); git(clone, 'commit', '-q', '-m', 'a');
  escrever(clone, 'engine/b.py', 'b\n'); git(clone, 'add', '-A'); git(clone, 'commit', '-q', '-m', 'b');
  assert.strictEqual(decidir(clone, ''), PULA, 'primeiro deploy da branch: compara com a main, e a PR não toca o preview');
  git(clone, 'checkout', '-q', '-b', 'fm/visual', 'main');
  escrever(clone, 'popup.css', 'x\n'); git(clone, 'add', '-A'); git(clone, 'commit', '-q', '-m', 'css');
  escrever(clone, 'engine/c.py', 'c\n'); git(clone, 'add', '-A'); git(clone, 'commit', '-q', '-m', 'c');
  assert.strictEqual(decidir(clone, ''), CONSTROI, 'primeiro deploy da branch: o commit do meio mexeu no preview, o último não, e constrói');
  git(clone, 'remote', 'remove', 'origin');
  assert.strictEqual(decidir(clone, ''), CONSTROI, 'sem a main para comparar, constrói');

  fs.rmSync(pasta, { recursive: true, force: true });
  console.log(`ok: ${mostrados.size} arquivos do preview constroem, ${naoMostrados.length} de fora pulam`);
})().catch(erro => { console.error(erro); process.exit(1); });
