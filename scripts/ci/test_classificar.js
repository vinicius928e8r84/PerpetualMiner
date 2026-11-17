'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = path.join(__dirname, 'classificar.sh');
const { selecionar } = require('./selecao-de-testes.js');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-classificar-'));
const repo = path.join(pasta, 'repo');
const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(repo, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(repo, arquivo), texto);
};
const commitar = alteracao => {
  alteracao();
  git('add', '-A');
  git('commit', '-q', '-m', 'mudança');
};

function classificar(evento, cwd = repo) {
  const arquivoDoEnv = path.join(pasta, 'github-env');
  fs.rmSync(arquivoDoEnv, { force: true });
  const env = { ...process.env, GITHUB_ENV: arquivoDoEnv };
  if (evento === undefined) delete env.GITHUB_EVENT_NAME; else env.GITHUB_EVENT_NAME = evento;
  const resultado = spawnSync('sh', [script], { cwd, env, encoding: 'utf8' });
  assert.strictEqual(resultado.status, 0, `o passo termina bem (${resultado.stderr})`);
  const gravado = fs.readFileSync(arquivoDoEnv, 'utf8');
  assert(gravado.trim() === resultado.stdout.trim(), 'o que vai ao GITHUB_ENV é o que aparece no log');
  const linhas = gravado.trim().split('\n');
  return linhas.map(l => l.replace(/^RODAR_/, '').replace('CONEXAO_REAL', 'CONEXAO').toLowerCase()).join(' ');
}

const TUDO = 'e2e=true complemento=true conexao=true';
const NADA = 'e2e=false complemento=false conexao=false';
const SO_E2E = 'e2e=true complemento=false conexao=true';
const SO_COMPLEMENTO = 'e2e=false complemento=true conexao=true';

fs.mkdirSync(repo);
git('init', '-q');
escrever('painel.js', '// painel\n');
escrever('docs/leia.md', 'um\n');
git('add', '-A'); git('commit', '-q', '-m', 'base');

assert.strictEqual(classificar('pull_request'), TUDO, 'PR sem como comparar');

commitar(() => escrever('docs/leia.md', 'dois\n'));
assert.strictEqual(classificar('pull_request'), NADA, 'PR só de documentação pula tudo');
commitar(() => escrever('painel.js', '// painel 2\n'));
assert.strictEqual(classificar('pull_request'), SO_E2E, 'PR que muda a extensão roda o e2e e não o complemento');
commitar(() => { escrever('docs/leia.md', 'tres\n'); escrever('painel.js', '// painel 3\n'); });
assert.strictEqual(classificar('pull_request'), SO_E2E, 'documentação e extensão juntas rodam o e2e');
commitar(() => escrever('complemento/envio.py', '# envio\n'));
assert.strictEqual(classificar('pull_request'), SO_COMPLEMENTO, 'PR que muda o complemento roda o complemento e não o e2e');
commitar(() => escrever('.github/workflows/testes.yml', 'name: x\n'));
assert.strictEqual(classificar('pull_request'), TUDO, 'mexer num workflow roda tudo');

assert.strictEqual(classificar('push'), 'e2e=false complemento=true conexao=false', 'push na main');
assert.strictEqual(classificar('schedule'), TUDO, 'evento desconhecido roda tudo');
assert.strictEqual(classificar('workflow_dispatch'), TUDO, 'disparo manual roda tudo');

const semGit = path.join(pasta, 'sem-git');
fs.mkdirSync(semGit);
assert.strictEqual(classificar('pull_request', semGit), TUDO, 'falha ao ler a mudança');

fs.rmSync(pasta, { recursive: true, force: true });

const dar = (arquivos, e2e, complemento, porque) => assert.deepStrictEqual(selecionar(arquivos), { e2e, complemento }, porque);
dar([], true, true, 'sem arquivos não há como saber');
dar(['painel.js'], true, false, 'um arquivo da raiz é da extensão');
dar(['manifest.json'], true, false, 'o manifesto é da extensão');
dar(['e2e/tests/painel.spec.js'], true, false, 'o e2e');
dar(['lib/ajustes-de-envio.js'], true, false, 'lib/');
dar(['veio/componentes.css'], true, false, 'veio/');
dar(['preview/dist.js'], true, false, 'preview/');
dar(['docs/design/voz/catalogo-textos.json'], true, true, 'o catálogo da Voz é lido pelo e2e e pelo complemento');
dar(['docs/loja/texto.html'], true, false, 'a loja é lida pela suíte');
dar(['complemento/envio.py'], false, true, 'o complemento');
dar(['complemento/test_envio.py'], false, true, 'um teste do complemento');
dar(['engine/gerar.py'], false, true, 'o engine');
dar(['complemento/contrato/exemplos.json'], true, true, 'o contrato é dos dois lados');
dar(['complemento/contrato/LEIA-ME.md'], true, true, 'o contrato é dos dois lados, até no texto');
dar(['scripts/ci/classificar.sh'], true, true, 'scripts/ roda tudo');
dar(['.github/workflows/testes.yml'], true, true, '.github/ roda tudo');
dar(['docs/leia.md'], false, false, 'documentação não roda nada');
dar(['CLAUDE.md', 'complemento/LEIA-ME.md'], false, false, 'texto do complemento não roda o complemento');
dar(['painel.js', 'complemento/envio.py'], true, true, 'extensão e complemento juntos rodam os dois');
dar(['docs/leia.md', 'painel.js'], true, false, 'documentação junto de extensão');
dar(['docs/leia.md', 'engine/gerar.py'], false, true, 'documentação junto do complemento');
dar(['lib/ankiweb.js'], true, true, 'o complemento confere o código do AnkiWeb em lib/ankiweb.js');
dar(['docs/design/dentro-do-anki.md'], false, true, 'o complemento lê este texto, mesmo sendo documentação');
dar(['pasta-nova/arquivo.js'], true, true, 'um lugar que o classificador não conhece roda tudo');
dar(['painel.js', 'pasta-nova/arquivo.js'], true, true, 'um desconhecido entre outros roda tudo');

dar(['complemento/modelos_da_ia.json'], true, true, 'o fake do e2e lê a lista de modelos do complemento');
dar(['conexao/perpetualminer.ankiaddon'], true, true, 'o pacote do complemento: o e2e também o serve');
dar(['.gitattributes'], true, true, 'um arquivo oculto da raiz muda o git dos testes do complemento');
dar(['.gitignore'], true, true, 'um arquivo oculto da raiz muda o git dos testes do complemento');
dar(['complemento/NOTAS.md'], false, true, 'um texto que vai no pacote do complemento');
dar(['complemento/LEIA-ME.md'], false, false, 'o LEIA-ME fica fora do pacote');

const LE_FORA_DA_EXTENSAO = [/['"](complemento|engine|conexao)['"]\s*,\s*['"]([^'"]+)['"]/g, /['"](complemento|engine|conexao)\/([^'"]+)['"]/g];
function arquivosJs(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap(entrada => {
    if (entrada.name === 'node_modules' || entrada.name === 'test-results') return [];
    const caminho = path.join(pasta, entrada.name);
    return entrada.isDirectory() ? arquivosJs(caminho) : (entrada.name.endsWith('.js') ? [caminho] : []);
  });
}
const lidosPeloE2e = new Set();
for (const arquivo of arquivosJs(path.join(__dirname, '..', '..', 'e2e'))) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  for (const regra of LE_FORA_DA_EXTENSAO) for (const [, pasta, resto] of texto.matchAll(regra)) lidosPeloE2e.add(`${pasta}/${resto}`);
}
assert(lidosPeloE2e.has('complemento/modelos_da_ia.json'), 'a leitura do e2e que o teste procura existe');
for (const lido of lidosPeloE2e) {
  assert.strictEqual(selecionar([lido]).e2e, true, `o e2e lê ${lido}, então mexer nele roda o e2e (acrescente-o a LIDOS_PELO_E2E)`);
}

console.log('classificar ok');
