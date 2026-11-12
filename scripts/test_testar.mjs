// O executor dos grupos de teste (scripts/testar.mjs): o que ele lista, recusa e devolve.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ehArquivoDeTeste, padraoComoRegex, escolherPython, dicaDeModulo, baseDaVersao } = require('./grupos-de-teste.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testar = (...args) => spawnSync('node', [path.join(RAIZ, 'scripts', 'testar.mjs'), ...args], { cwd: RAIZ, encoding: 'utf8' });

assert.ok(ehArquivoDeTeste('test_sync.js'));
assert.ok(ehArquivoDeTeste('scripts/test_testar.mjs'));
assert.ok(ehArquivoDeTeste('.agents/skills/x/scripts/test_helpers.sh'));
assert.ok(ehArquivoDeTeste('e2e/tests/sub/algo.spec.js'));
assert.ok(!ehArquivoDeTeste('e2e/fixtures.js'));
assert.ok(!ehArquivoDeTeste('lib/atestado.js'));
assert.ok(padraoComoRegex('engine/test_*.py').test('engine/test_parser_line.py'));
assert.ok(!padraoComoRegex('engine/test_*.py').test('engine/sub/test_parser_line.py'));
assert.ok(padraoComoRegex('e2e/tests/**/*.spec.js').test('e2e/tests/sub/algo.spec.js'));

const lista = testar('--listar');
assert.equal(lista.status, 0, lista.stdout + lista.stderr);
assert.match(lista.stdout, /^node: (?:\S+ )*test_sync\.js(?: \S+)*$/m);
assert.match(lista.stdout, /^e2e \(pesado\): e2e\/tests\/.*\.spec\.js/m);
assert.match(lista.stdout, /^complemento: (?:\S+ )*complemento\/test_servidor\.py(?: \S+)*$/m);

const desconhecido = testar('inexistente');
assert.equal(desconhecido.status, 2);
assert.match(desconhecido.stdout, /grupo desconhecido: inexistente\nhelp: os grupos são node, regras/);

const ferramentas = testar('node');
assert.equal(ferramentas.status, 0, ferramentas.stdout + ferramentas.stderr);
assert.match(ferramentas.stdout, /▶ node: node test_sync\.js/);
assert.match(ferramentas.stdout, /testes ok: node/);

const raizComVenv = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-venv-'));
const raizSemVenv = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-sem-venv-'));
fs.mkdirSync(path.join(raizComVenv, '.venv', 'bin'), { recursive: true });
fs.writeFileSync(path.join(raizComVenv, '.venv', 'bin', 'python'), '');
assert.deepEqual(escolherPython({ PYTHON: 'python' }, raizComVenv), { comando: 'python', origem: 'PYTHON' });
assert.deepEqual(escolherPython({}, raizComVenv), { comando: path.join(raizComVenv, '.venv', 'bin', 'python'), origem: 'venv' });
assert.deepEqual(escolherPython({}, raizSemVenv), { comando: 'python3', origem: 'python3' });
fs.rmSync(raizComVenv, { recursive: true, force: true });
fs.rmSync(raizSemVenv, { recursive: true, force: true });

const semHttpx = "ModuleNotFoundError: No module named 'httpx'\n";
const grupoComPrecisa = { precisa: 'pip install -r engine/requirements.txt' };
const doPython3 = { comando: 'python3', origem: 'python3' };
assert.equal(dicaDeModulo('engine', grupoComPrecisa, 'FAIL: test_x\n', doPython3), '');
assert.equal(dicaDeModulo('engine', grupoComPrecisa, semHttpx, doPython3),
  "✗ engine: falta o módulo httpx; o grupo precisa de: pip install -r engine/requirements.txt\n  numa worktree nova: scripts/preparar-python.sh cria o .venv e instala tudo; este comando passa a usá-lo sozinho");
assert.equal(dicaDeModulo('engine', grupoComPrecisa, semHttpx, { comando: '/x/.venv/bin/python', origem: 'venv' }),
  "✗ engine: falta o módulo httpx; o grupo precisa de: .venv/bin/python -m pip install -r engine/requirements.txt");
assert.equal(dicaDeModulo('engine', grupoComPrecisa, semHttpx, { comando: 'python', origem: 'PYTHON' }),
  "✗ engine: falta o módulo httpx; o grupo precisa de: pip install -r engine/requirements.txt");

const pastaFalsa = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-python-falso-'));
const pythonFalso = path.join(pastaFalsa, 'python');
fs.writeFileSync(pythonFalso, `#!/bin/sh\necho "ModuleNotFoundError: No module named 'httpx'" >&2\nexit 1\n`, { mode: 0o755 });
const semModulo = spawnSync('node', [path.join(RAIZ, 'scripts', 'testar.mjs'), 'engine'], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, PYTHON: pythonFalso } });
fs.rmSync(pastaFalsa, { recursive: true, force: true });
assert.equal(semModulo.status, 1);
assert.match(semModulo.stderr, /ModuleNotFoundError: No module named 'httpx'/);
assert.match(semModulo.stdout, /✗ engine: falta o módulo httpx; o grupo precisa de: pip install -r engine\/requirements\.txt/);
assert.match(semModulo.stdout, /error: falharam: engine/);

// A saída de erro dos grupos Python aparece enquanto o processo roda (o unittest escreve tudo nela): um teste
// que trava não deixa o log vazio. O Python falso só termina bem quando o teste, ao ver a linha, cria o arquivo.
{
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ao-vivo-'));
  const liberar = path.join(pasta, 'liberar');
  const falso = path.join(pasta, 'python');
  fs.writeFileSync(falso, `#!/bin/sh\necho "test_a ... ok" >&2\ni=0\nwhile [ ! -e "${liberar}" ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done\n[ -e "${liberar}" ]\n`, { mode: 0o755 });
  const filho = spawn('node', [path.join(RAIZ, 'scripts', 'testar.mjs'), 'engine'], { cwd: RAIZ, env: { ...process.env, PYTHON: falso }, stdio: ['ignore', 'pipe', 'pipe'] });
  let erro = '';
  filho.stderr.on('data', pedaco => {
    erro += pedaco;
    if (/test_a \.\.\. ok/.test(erro)) fs.writeFileSync(liberar, '');
  });
  filho.stdout.resume();
  const status = await new Promise(resolve => filho.on('close', resolve));
  fs.rmSync(pasta, { recursive: true, force: true });
  assert.equal(status, 0, 'a linha do stderr devia chegar antes de o processo acabar');
}

// Chamado por um caminho com link simbólico, o executor roda do mesmo jeito: nada de sucesso falso.
{
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-link-'));
  fs.symlinkSync(RAIZ, path.join(pasta, 'repo'));
  const porLink = spawnSync('node', [path.join(pasta, 'repo', 'scripts', 'testar.mjs'), 'inexistente'], { cwd: RAIZ, encoding: 'utf8' });
  fs.rmSync(pasta, { recursive: true, force: true });
  assert.equal(porLink.status, 2, porLink.stdout + porLink.stderr);
  assert.match(porLink.stdout, /error: grupo desconhecido: inexistente/);
}

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


// Numa branch de trabalho o complemento não cobra a versão (é dada no merge); na main, no CI e com a variável posta, nada muda.
assert.equal(baseDaVersao({}, 'fm/uma-tarefa', true), 'origin/main');
assert.equal(baseDaVersao({}, 'main', true), null);
assert.equal(baseDaVersao({}, 'HEAD', true), null);
assert.equal(baseDaVersao({ CI: 'true' }, 'fm/uma-tarefa', true), null);
assert.equal(baseDaVersao({ PM_VERSAO_BASE: '' }, 'fm/uma-tarefa', true), null);
assert.equal(baseDaVersao({}, 'fm/uma-tarefa', false), null);

console.log('testar tests passed');
