import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ehArquivoDeTeste, padraoComoRegex, escolherPython, dicaDeModulo, baseDaVersao, trabalhadoresDoGrupo, tetoEmSegundos, estourouOTeto } = require('./grupos-de-teste.js');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
delete process.env.PM_PARALELO;
const testar = (...args) => spawnSync('node', [path.join(RAIZ, 'scripts', 'testar.mjs'), ...args], { cwd: RAIZ, encoding: 'utf8' });

assert.ok(ehArquivoDeTeste('testes/test_sync.js'));
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
assert.match(lista.stdout, /^node: (?:\S+ )*testes\/test_sync\.js(?: \S+)*$/m);
assert.match(lista.stdout, /^e2e \(pesado\): e2e\/tests\/.*\.spec\.js/m);
assert.match(lista.stdout, /^complemento: (?:\S+ )*complemento\/test_servidor\.py(?: \S+)*$/m);

const desconhecido = testar('inexistente');
assert.equal(desconhecido.status, 2);
assert.match(desconhecido.stdout, /grupo desconhecido: inexistente\nhelp: os grupos são node, regras/);

const ferramentas = testar('node');
assert.equal(ferramentas.status, 0, ferramentas.stdout + ferramentas.stderr);
assert.match(ferramentas.stdout, /▶ node: node testes\/test_sync\.js/);
assert.match(ferramentas.stdout, /testes ok: node/);
assert.match(ferramentas.stdout, /^node: \d+ arquivos, 4 em paralelo; ok$/m);

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

{
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-link-'));
  fs.symlinkSync(RAIZ, path.join(pasta, 'repo'));
  const porLink = spawnSync('node', [path.join(pasta, 'repo', 'scripts', 'testar.mjs'), 'inexistente'], { cwd: RAIZ, encoding: 'utf8' });
  fs.rmSync(pasta, { recursive: true, force: true });
  assert.equal(porLink.status, 2, porLink.stdout + porLink.stderr);
  assert.match(porLink.stdout, /error: grupo desconhecido: inexistente/);
}

{
  const { modulosDe, passou, testesDe } = require('./unittest-em-paralelo.js');
  assert.deepEqual(modulosDe(['complemento/test_b.py', 'complemento/test_a.py']), ['test_a', 'test_b']);
  assert.ok(passou({ status: 0, saida: '' }));
  assert.ok(passou({ status: 5, saida: 'NO TESTS RAN\n' }), 'um módulo só de apoio sai com 5 no Python 3.12+');
  assert.ok(!passou({ status: 5, saida: 'outra coisa\n' }));
  assert.ok(!passou({ status: 1, saida: 'FAILED\n' }));
  assert.equal(testesDe('....\nRan 4 tests in 0.1s\n\nOK\n'), 4);
  assert.equal(testesDe('Ran 1 test in 0.0s\n'), 1);
  assert.equal(trabalhadoresDoGrupo({ paralelo: 2 }, {}), 2);
  assert.equal(trabalhadoresDoGrupo({ paralelo: 2 }, { PM_PARALELO: '1' }), 1, 'PM_PARALELO=1 volta à série');
  assert.equal(trabalhadoresDoGrupo({}, { PM_PARALELO: '3' }), 3);
  assert.equal(trabalhadoresDoGrupo({}, {}), 1);
  assert.equal(trabalhadoresDoGrupo({ paralelo: 2 }, { PM_PARALELO: 'muitos' }), 1);
}

{
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-paralelo-'));
  const falso = path.join(pasta, 'python');
  fs.writeFileSync(falso, `#!/bin/sh
if [ "$1 $2" != "-m unittest" ] || [ "$3" = discover ]; then echo "$@" >> "${pasta}/serie"; exit 0; fi
modulo="$3"
echo "$PYTHONPATH" > "${pasta}/pythonpath"
touch "${pasta}/vivo.$modulo"
[ "$(ls "${pasta}" | grep -c '^vivo\\.')" -ge 2 ] && touch "${pasta}/concorrente"
sleep 0.1
rm "${pasta}/vivo.$modulo"
if [ "$modulo" = "$MODULO_VERMELHO" ]; then echo "FAIL: $modulo" >&2; echo "Ran 1 test in 0.0s" >&2; exit 1; fi
echo "Ran 2 tests in 0.0s" >&2
`, { mode: 0o755 });
  const rodarComplemento = (env, ...extras) => spawnSync('node', [path.join(RAIZ, 'scripts', 'testar.mjs'), 'complemento', ...extras], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, PYTHON: falso, ...env } });

  const verde = rodarComplemento({});
  assert.equal(verde.status, 0, verde.stdout + verde.stderr);
  assert.match(verde.stdout, /\(2 em paralelo\)/);
  assert.match(verde.stdout, /✓ test_servidor \(/);
  assert.match(verde.stdout, /\d+ testes em [\d.]+ s, 2 em paralelo; ok/);
  assert.ok(fs.existsSync(path.join(pasta, 'concorrente')), 'dois módulos rodaram ao mesmo tempo');
  assert.ok(!fs.existsSync(path.join(pasta, 'serie')), 'sem discover');
  assert.match(fs.readFileSync(path.join(pasta, 'pythonpath'), 'utf8'), /complemento/, 'o módulo se acha pela pasta do complemento, como no discover');

  const vermelho = rodarComplemento({ MODULO_VERMELHO: 'test_servidor' });
  assert.equal(vermelho.status, 1, 'um módulo vermelho reprova o grupo');
  assert.match(vermelho.stdout, /✗ test_servidor \(/);
  assert.match(vermelho.stdout, /falharam: test_servidor/);
  assert.match(vermelho.stderr, /FAIL: test_servidor/, 'a saída do módulo vermelho aparece');
  assert.match(vermelho.stdout, /error: falharam: complemento/);

  fs.rmSync(path.join(pasta, 'concorrente'), { force: true });
  const emSerie = rodarComplemento({ PM_PARALELO: '1' });
  assert.equal(emSerie.status, 0, emSerie.stdout + emSerie.stderr);
  assert.ok(fs.existsSync(path.join(pasta, 'serie')), 'PM_PARALELO=1 usa o unittest discover');
  fs.rmSync(path.join(pasta, 'serie'));
  const comArgumentos = rodarComplemento({}, '--', '-k', 'algo');
  assert.equal(comArgumentos.status, 0, comArgumentos.stdout + comArgumentos.stderr);
  assert.match(fs.readFileSync(path.join(pasta, 'serie'), 'utf8'), /discover .*-k algo/, 'argumentos depois de -- usam o discover em série');
  fs.rmSync(pasta, { recursive: true, force: true });
}

{
  const { rodarArquivosEmParalelo } = require('./arquivos-em-paralelo.js');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-arquivos-'));
  const marca = nome => JSON.stringify(path.join(pasta, nome));
  const esperarOOutro = (eu, outro) => `const fs = require('fs'); fs.writeFileSync(${marca(eu)}, ''); const fim = Date.now() + 5000;
while (!fs.existsSync(${marca(outro)})) { if (Date.now() > fim) process.exit(3); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20); }\n`;
  const verde = path.join(pasta, 'test_verde.js');
  const vermelho = path.join(pasta, 'test_vermelho.js');
  fs.writeFileSync(verde, `${esperarOOutro('vivo.verde', 'vivo.vermelho')}console.log('o verde passou');\n`);
  fs.writeFileSync(vermelho, `${esperarOOutro('vivo.vermelho', 'vivo.verde')}console.error('o vermelho quebrou'); process.exit(1);\n`);
  let escrito = '';
  const vermelhos = await rodarArquivosEmParalelo({
    nome: 'grupo', trabalhadores: 2, escrever: pedaco => { escrito += pedaco; },
    comandos: [verde, vermelho].map(arquivo => ({ comando: 'node', argumentos: [arquivo], cwd: pasta })),
  });
  fs.rmSync(pasta, { recursive: true, force: true });
  assert.deepEqual(vermelhos, [vermelho], 'os dois rodaram ao mesmo tempo (um esperou o outro) e só o vermelho reprova');
  assert.ok(escrito.includes(`▶ grupo: node ${verde}\no verde passou\n`), escrito);
  assert.ok(escrito.includes(`▶ grupo: node ${vermelho}\no vermelho quebrou\n`), 'a saída do vermelho aparece, com o stderr');
  assert.ok(escrito.includes(`grupo: 2 arquivos, 2 em paralelo; falharam: ${vermelho}`), escrito);
}

{
  assert.equal(tetoEmSegundos({}), null);
  assert.equal(tetoEmSegundos({ PM_TETO_S: '420' }), 420);
  assert.equal(tetoEmSegundos({ PM_TETO_S: 'muito' }), null);
  assert.equal(tetoEmSegundos({ PM_TETO_S: '0' }), null);
  assert.ok(!estourouOTeto(420, 420), 'no teto ainda cabe');
  assert.ok(estourouOTeto(420.5, 420));
  assert.ok(!estourouOTeto(9999, null));

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-teto-'));
  const falso = path.join(pasta, 'python');
  const resumo = path.join(pasta, 'resumo.md');
  fs.writeFileSync(falso, `#!/bin/sh\nsleep 1.2\n[ -z "$FALHAR" ]\n`, { mode: 0o755 });
  const comTeto = env => spawnSync('node', [path.join(RAIZ, 'scripts', 'testar.mjs'), 'engine'], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, PYTHON: falso, GITHUB_STEP_SUMMARY: resumo, ...env } });

  const dentro = comTeto({ PM_TETO_S: '30' });
  assert.equal(dentro.status, 0, dentro.stdout + dentro.stderr);
  assert.match(dentro.stdout, /engine: [\d.]+ s \(teto 30 s\)/);
  assert.doesNotMatch(dentro.stdout, /::error/);
  assert.match(fs.readFileSync(resumo, 'utf8'), /^- engine: [\d.]+ s \(teto 30 s\)$/m, 'o resumo da execução traz o tempo e o teto');

  const fora = comTeto({ PM_TETO_S: '1' });
  assert.equal(fora.status, 1, 'verde mas passou do teto: reprova');
  assert.match(fora.stdout, /::error title=Teto de tempo::engine levou [\d.]+ s, o teto é 1 s/);

  const semTeto = comTeto({});
  assert.equal(semTeto.status, 0, 'sem PM_TETO_S nada muda');
  assert.doesNotMatch(semTeto.stdout, /\(teto/);

  const vermelho = comTeto({ PM_TETO_S: '1', FALHAR: '1' });
  assert.equal(vermelho.status, 1);
  assert.match(vermelho.stdout, /error: falharam: engine/);
  assert.doesNotMatch(vermelho.stdout, /::error title=Teto de tempo/, 'a falha do teste fala sozinha, sem o alarme de tempo por cima');
  fs.rmSync(pasta, { recursive: true, force: true });
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

assert.equal(baseDaVersao({}, 'fm/uma-tarefa', true), 'origin/main');
assert.equal(baseDaVersao({}, 'main', true), null);
assert.equal(baseDaVersao({}, 'HEAD', true), null);
assert.equal(baseDaVersao({ CI: 'true' }, 'fm/uma-tarefa', true), null);
assert.equal(baseDaVersao({ PM_VERSAO_BASE: '' }, 'fm/uma-tarefa', true), null);
assert.equal(baseDaVersao({}, 'fm/uma-tarefa', false), null);

console.log('testar tests passed');
