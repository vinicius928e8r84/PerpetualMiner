// O executor dos grupos de teste (scripts/testar.mjs): o que ele lista, recusa e devolve.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ehArquivoDeTeste, padraoComoRegex } = require('./grupos-de-teste.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testar = (...args) => spawnSync('node', [path.join(RAIZ, 'scripts', 'testar.mjs'), ...args], { cwd: RAIZ, encoding: 'utf8' });

// O que é teste e o que um padrão alcança.
assert.ok(ehArquivoDeTeste('test_sync.js'));
assert.ok(ehArquivoDeTeste('scripts/test_divisao_do_claude_md.mjs'));
assert.ok(ehArquivoDeTeste('.agents/skills/x/scripts/test_helpers.sh'));
assert.ok(ehArquivoDeTeste('e2e/tests/sub/algo.spec.js'));
assert.ok(!ehArquivoDeTeste('e2e/fixtures.js'));
assert.ok(!ehArquivoDeTeste('lib/atestado.js'));
assert.ok(padraoComoRegex('bridge/test_*.py').test('bridge/test_envio.py'));
assert.ok(!padraoComoRegex('bridge/test_*.py').test('bridge/sub/test_envio.py'));
assert.ok(padraoComoRegex('e2e/tests/**/*.spec.js').test('e2e/tests/sub/algo.spec.js'));

// O que o executor mostra.
const lista = testar('--listar');
assert.equal(lista.status, 0, lista.stdout + lista.stderr);
assert.match(lista.stdout, /^node: (?:\S+ )*test_sync\.js(?: \S+)*$/m);
assert.match(lista.stdout, /^e2e \(pesado\): e2e\/tests\/.*\.spec\.js/m);
assert.match(lista.stdout, /^complemento: (?:\S+ )*complemento\/test_servidor\.py(?: \S+)*$/m);

// Um grupo que não existe é erro de uso, e a mensagem diz quais existem.
const desconhecido = testar('inexistente');
assert.equal(desconhecido.status, 2);
assert.match(desconhecido.stdout, /grupo desconhecido: inexistente\nhelp: os grupos são node, regras/);

// Um grupo roda de verdade e o código de saída é o do teste.
const ferramentas = testar('node');
assert.equal(ferramentas.status, 0, ferramentas.stdout + ferramentas.stderr);
assert.match(ferramentas.stdout, /▶ node: node test_sync\.js/);
assert.match(ferramentas.stdout, /testes ok: node/);

// O Python: o $PYTHON do CI vence, senão o .venv da raiz, senão python3.
const { escolherPython, dicaDeModulo } = await import('./testar.mjs');
const fs = await import('node:fs');
const os = await import('node:os');
const raizComVenv = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-venv-'));
const raizSemVenv = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-sem-venv-'));
fs.mkdirSync(path.join(raizComVenv, '.venv', 'bin'), { recursive: true });
fs.writeFileSync(path.join(raizComVenv, '.venv', 'bin', 'python'), '');
assert.equal(escolherPython({ PYTHON: 'python' }, raizComVenv), 'python');
assert.equal(escolherPython({}, raizComVenv), path.join(raizComVenv, '.venv', 'bin', 'python'));
assert.equal(escolherPython({}, raizSemVenv), 'python3');
fs.rmSync(raizComVenv, { recursive: true, force: true });
fs.rmSync(raizSemVenv, { recursive: true, force: true });

// Um grupo que falha por falta de módulo diz o que o grupo precisa e, sem venv, o comando de preparo.
const semFlask = "ModuleNotFoundError: No module named 'flask'\n";
const grupoComPrecisa = { precisa: 'pip install -r bridge/requirements.txt' };
assert.equal(dicaDeModulo('bridge', grupoComPrecisa, 'FAIL: test_x\n', 'python3'), '');
assert.equal(dicaDeModulo('bridge', grupoComPrecisa, semFlask, 'python3'),
  "✗ bridge: falta o módulo flask; o grupo precisa de: pip install -r bridge/requirements.txt\n  numa worktree nova: scripts/preparar-python.sh cria o .venv e instala tudo; este comando passa a usá-lo sozinho");
assert.equal(dicaDeModulo('bridge', grupoComPrecisa, semFlask, '/x/.venv/bin/python'),
  "✗ bridge: falta o módulo flask; o grupo precisa de: pip install -r bridge/requirements.txt");

// De ponta a ponta: um Python sem o módulo faz o grupo falhar com a dica, e o erro original continua à vista.
const pastaFalsa = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-python-falso-'));
const pythonFalso = path.join(pastaFalsa, 'python');
fs.writeFileSync(pythonFalso, `#!/bin/sh\necho "ModuleNotFoundError: No module named 'flask'" >&2\nexit 1\n`, { mode: 0o755 });
const semModulo = spawnSync('node', [path.join(RAIZ, 'scripts', 'testar.mjs'), 'bridge'], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, PYTHON: pythonFalso } });
fs.rmSync(pastaFalsa, { recursive: true, force: true });
assert.equal(semModulo.status, 1);
assert.match(semModulo.stderr, /ModuleNotFoundError: No module named 'flask'/);
assert.match(semModulo.stdout, /✗ bridge: falta o módulo flask; o grupo precisa de: pip install -r bridge\/requirements\.txt/);
assert.match(semModulo.stdout, /error: falharam: bridge/);

// O cadastro ausente ou quebrado diz como consertar, em português, com a posição do erro.
const { lerRegistro } = require('./grupos-de-teste.js');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-cadastro-'));
fs.mkdirSync(path.join(pasta, 'scripts'));
assert.throws(() => lerRegistro(pasta), /falta scripts\/testes\.json.*git checkout origin\/main -- scripts\/testes\.json/);
fs.writeFileSync(path.join(pasta, 'scripts', 'testes.json'), '{\n  "grupos": {\n    node: {}\n  }\n}\n');
assert.throws(() => lerRegistro(pasta), erro => /não é um JSON válido \(erro perto da linha 3, coluna 5: vírgula, aspas ou chave fora do lugar\)/.test(erro.message)
  && /node scripts\/testar\.mjs --listar/.test(erro.message) && !/Expected/.test(erro.message));
fs.writeFileSync(path.join(pasta, 'scripts', 'testes.json'), '{ "fora": [] }');
assert.throws(() => lerRegistro(pasta), /não tem o objeto "grupos"/);
fs.rmSync(pasta, { recursive: true, force: true });

console.log('testar tests passed');
