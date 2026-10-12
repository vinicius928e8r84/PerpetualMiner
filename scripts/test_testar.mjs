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
assert.ok(ehArquivoDeTeste('scripts/test_testar.mjs'));
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

// O cadastro ausente ou quebrado diz como consertar, em português, com a posição do erro.
const { lerRegistro } = require('./grupos-de-teste.js');
const fs = await import('node:fs');
const os = await import('node:os');
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
