'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PREFIXO, nomeDaTag, avaliar, esperados, conferir, modoDoAmbiente } = require('./commit-verde.js');

const script = path.join(__dirname, 'commit-verde.js');
const SHA = 'ca90cd2f0ad60b36a70847435f919f5951f97177';

assert.strictEqual(nomeDaTag(SHA, new Date('2026-11-17T05:30:00Z')), 'verde/2026-11-17-ca90cd2');

const nomes = ['Testes rápidos', 'e2e (1/8)'];
const run = (name, status, conclusion) => ({ name, status, conclusion });
const passou = name => run(name, 'completed', 'success');
assert.strictEqual(avaliar(nomes.map(passou), { esperados: nomes }).estado, 'verde');
assert.strictEqual(avaliar([passou(nomes[0]), run(nomes[1], 'completed', 'skipped')], { esperados: nomes }).estado, 'verde', 'e2e pulado no push da main conta como passou');
assert.strictEqual(avaliar([passou(nomes[0]), run(nomes[1], 'completed', 'failure')], { esperados: nomes }).estado, 'vermelho');
assert.strictEqual(avaliar([passou(nomes[0]), run(nomes[1], 'completed', 'cancelled')], { esperados: nomes }).estado, 'vermelho', 'o teto de tempo termina cancelled');
assert.strictEqual(avaliar([passou(nomes[0]), run(nomes[1], 'in_progress', null)], { esperados: nomes }).estado, 'pendente');
assert.strictEqual(avaliar([passou(nomes[0])], { esperados: nomes }).estado, 'pendente', 'um check esperado que não apareceu não é verde');
assert.strictEqual(avaliar([...nomes.map(passou), run('Vercel extra', 'completed', 'failure')], { esperados: nomes }).estado, 'vermelho', 'qualquer check vermelho do commit vale');
assert.strictEqual(
  avaliar([...nomes.map(passou), run('Marcar commit verde', 'in_progress', null)], { esperados: nomes, ignorar: ['Marcar commit verde'] }).estado,
  'verde',
  'o próprio job de marcar não conta',
);
assert(!esperados().includes('Registro da PR'), 'o Registro da PR só existe em PR');
assert(esperados().includes('Testes rápidos') && esperados().includes('Regras de revisão'));

assert.strictEqual(modoDoAmbiente({}), 'exigir', 'sem a variável, a regra recusa');
assert.strictEqual(modoDoAmbiente({ PM_COMMIT_VERDE: 'avisar' }), 'avisar');
assert.strictEqual(modoDoAmbiente({ PM_COMMIT_VERDE: 'ignorar' }), 'ignorar');
assert.strictEqual(modoDoAmbiente({ PM_COMMIT_VERDE: 'qualquer coisa' }), 'exigir', 'um valor que ninguém conhece não afrouxa a regra');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-verde-'));
const repo = path.join(pasta, 'repo');
fs.mkdirSync(repo);
const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
git('init', '-q');
fs.writeFileSync(path.join(repo, 'a.txt'), 'um');
git('add', '.');
git('commit', '-q', '-m', 'um');

{
  const r = conferir({ raiz: repo, modo: 'avisar' });
  assert.strictEqual(r.ok, true, 'o aviso não trava');
  assert(/sem registro de verde/.test(r.mensagem) && /git fetch origin --tags/.test(r.mensagem), r.mensagem);
  const recusa = conferir({ raiz: repo, modo: 'exigir' });
  assert.strictEqual(recusa.ok, false, 'a regra recusa SHA sem tag');
  assert.strictEqual(conferir({ raiz: repo, modo: 'ignorar' }).mensagem, '');
}

git('tag', 'v1');
assert.strictEqual(conferir({ raiz: repo, modo: 'exigir' }).ok, false, 'uma tag que não é verde/ não registra nada');

git('tag', `${PREFIXO}2026-11-17-abcdef0`);
{
  const r = conferir({ raiz: repo, modo: 'exigir' });
  assert.strictEqual(r.ok, true, r.mensagem);
  assert(r.mensagem.includes(`${PREFIXO}2026-11-17-abcdef0`));
}

fs.writeFileSync(path.join(repo, 'a.txt'), 'dois');
{
  const r = conferir({ raiz: repo, modo: 'exigir' });
  assert.strictEqual(r.ok, false, 'árvore com mudança não é o SHA marcado');
  assert(/mudanças que não estão nele/.test(r.mensagem), r.mensagem);
}
git('checkout', '-q', 'a.txt');

fs.writeFileSync(path.join(repo, 'novo.txt'), 'não rastreado');
{
  const r = conferir({ raiz: repo, modo: 'exigir' });
  assert.strictEqual(r.ok, false, 'arquivo não rastreado também entra no pacote, então não é o SHA marcado');
  assert(/mudanças que não estão nele/.test(r.mensagem), r.mensagem);
}
fs.rmSync(path.join(repo, 'novo.txt'));
fs.writeFileSync(path.join(repo, '.gitignore'), 'dist/\n');
git('add', '.gitignore');
git('commit', '-q', '-m', 'ignora dist');
git('tag', `${PREFIXO}2026-11-17-abcdef1`);
fs.mkdirSync(path.join(repo, 'dist'));
fs.writeFileSync(path.join(repo, 'dist', 'pacote.zip'), 'saída do empacotador');
assert.strictEqual(conferir({ raiz: repo, modo: 'exigir' }).ok, true, 'o que o .gitignore deixa de fora não sujaria o pacote');
fs.rmSync(path.join(repo, 'dist'), { recursive: true });

git('commit', '-q', '--allow-empty', '-m', 'dois');
assert.strictEqual(conferir({ raiz: repo, modo: 'exigir' }).ok, false, 'o commit seguinte não herda a marca');

{
  const semVariavel = { ...process.env };
  delete semVariavel.PM_COMMIT_VERDE;
  const r = spawnSync('node', [script, 'conferir', '--raiz', repo], { encoding: 'utf8', env: semVariavel });
  assert.strictEqual(r.status, 1, 'a linha de comando sai com 1 quando recusa, sem variável nenhuma');
  assert(/sem registro de verde/.test(r.stderr));
  const aviso = spawnSync('node', [script, 'conferir', '--raiz', repo], { encoding: 'utf8', env: { ...process.env, PM_COMMIT_VERDE: 'avisar' } });
  assert.strictEqual(aviso.status, 0, 'avisar é escolha explícita de quem chama');
  assert(/sem registro de verde/.test(aviso.stderr));
  const exigido = spawnSync('node', [script, 'conferir', '--raiz', repo], { encoding: 'utf8', env: { ...process.env, PM_COMMIT_VERDE: 'exigir' } });
  assert.strictEqual(exigido.status, 1, 'PM_COMMIT_VERDE=exigir recusa');
  const ignorado = spawnSync('node', [script, 'conferir', '--raiz', repo], { encoding: 'utf8', env: { ...process.env, PM_COMMIT_VERDE: 'ignorar' } });
  assert.strictEqual(ignorado.status, 0, 'PM_COMMIT_VERDE=ignorar pula a conferência');
}

{
  const fora = fs.mkdtempSync(path.join(pasta, 'fora-'));
  const r = conferir({ raiz: fora, modo: 'exigir' });
  assert.strictEqual(r.ok, false, 'sem git não dá para provar o SHA');
  assert.strictEqual(conferir({ raiz: fora, modo: 'avisar' }).ok, true);
}

const bin = path.join(pasta, 'bin');
const chamadas = path.join(pasta, 'chamadas.jsonl');
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(chamadas)}, JSON.stringify(args) + '\\n');
const alvo = args.find(a => a.startsWith('repos/')) || '';
if (alvo.includes('/compare/')) { console.log(process.env.GH_COMPARE || 'behind'); process.exit(0); }
if (alvo.includes('/check-runs')) {
  for (const run of JSON.parse(process.env.GH_CHECKS)) console.log(JSON.stringify(run));
  process.exit(0);
}
if (alvo.endsWith('/git/refs')) {
  if (process.env.GH_TAG_EXISTE) { console.error('gh: Reference already exists (HTTP 422)'); process.exit(1); }
  process.exit(0);
}
process.exit(1);
`, { mode: 0o755 });

function marcar({ checks, compare, existe, argumentos = [] }) {
  fs.rmSync(chamadas, { force: true });
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_REPOSITORY: 'dono/repo', GH_CHECKS: JSON.stringify(checks) };
  if (compare) env.GH_COMPARE = compare;
  if (existe) env.GH_TAG_EXISTE = '1';
  const r = spawnSync('node', [script, 'marcar', SHA, ...argumentos], { env, encoding: 'utf8' });
  const todas = fs.existsSync(chamadas) ? fs.readFileSync(chamadas, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  return { status: r.status, saida: r.stdout + r.stderr, criacoes: todas.filter(a => a.includes('POST')) };
}
const tudoVerde = esperados().map(passou);

{
  const r = marcar({ checks: tudoVerde });
  assert.strictEqual(r.status, 0, r.saida);
  assert.strictEqual(r.criacoes.length, 1, 'uma tag');
  const args = r.criacoes[0];
  assert(args.some(a => /^ref=refs\/tags\/verde\/\d{4}-\d{2}-\d{2}-ca90cd2$/.test(a)), JSON.stringify(args));
  assert(args.includes(`sha=${SHA}`));
  assert(args.includes('repos/dono/repo/git/refs'));
}

{
  const r = marcar({ checks: [...tudoVerde.slice(1), run('e2e (3/8)', 'completed', 'failure')] });
  assert.strictEqual(r.status, 0, 'não marcar não reprova o workflow: ' + r.saida);
  assert.deepStrictEqual(r.criacoes, []);
  assert(/não foi marcado: check vermelho/.test(r.saida), r.saida);
}

{
  const r = marcar({ checks: [...tudoVerde.slice(1), run('Testes rápidos', 'in_progress', null)] });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.criacoes, [], 'sem --esperar, o que ainda roda não é marcado');
  assert(/ainda rodando/.test(r.saida), r.saida);
}

{
  const r = marcar({ checks: tudoVerde, compare: 'diverged' });
  assert.strictEqual(r.status, 0, r.saida);
  assert.deepStrictEqual(r.criacoes, [], 'só commit da main é marcado');
  assert(/não está na main/.test(r.saida), r.saida);
}

{
  const r = marcar({ checks: tudoVerde, existe: true });
  assert.strictEqual(r.status, 0, 'marcar de novo o mesmo commit não quebra: ' + r.saida);
  assert(/existia/.test(r.saida), r.saida);
}

{
  const r = spawnSync('node', [script, 'marcar', 'abc'], { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'dono/repo' } });
  assert.strictEqual(r.status, 2, 'SHA curto é recusado');
}

fs.rmSync(pasta, { recursive: true, force: true });
console.log('commit verde ok');
