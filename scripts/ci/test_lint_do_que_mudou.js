'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { raizTemporaria } = require('../regras/apoio-sem-comentario');

const CLI = path.join(__dirname, 'lint-do-que-mudou.js');
const FERRAMENTAS = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pm-lint-ferramentas-'));
const FALSO_ESLINT = path.join(FERRAMENTAS, 'eslint.js');
const FALSO_RUFF = path.join(FERRAMENTAS, 'ruff.js');

fs.writeFileSync(FALSO_ESLINT, `const achados = JSON.parse(process.env.ACHADOS_DO_ESLINT || '[]');
const arquivos = process.argv.slice(2).filter(a => /\.(?:js|mjs|cjs)$/.test(a));
console.log(JSON.stringify(arquivos.map(a => ({ filePath: require('path').resolve(a), messages: achados.filter(x => x.arquivo === a).map(x => ({ line: x.linha, ruleId: x.regra, message: x.texto || 'x', fatal: x.fatal })) }))));
`);
fs.writeFileSync(FALSO_RUFF, `const achados = JSON.parse(process.env.ACHADOS_DO_RUFF || '[]');
console.log(JSON.stringify(achados.map(x => ({ filename: require('path').resolve(x.arquivo), location: { row: x.linha }, code: x.regra === undefined ? 'F811' : x.regra, message: x.texto || 'x' }))));
`);

function rodar({ base, depois, eslint = [], ruff = [], ambiente = {} }) {
  const { raiz, git, gravar, commit } = raizTemporaria();
  try {
    gravar(base);
    commit('base');
    git('checkout', '-q', '-b', 'pr');
    gravar(depois);
    commit('pr');
    const r = spawnSync(process.execPath, [CLI, '--raiz', raiz, '--base', 'main'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ESLINT_BIN: FALSO_ESLINT, RUFF_BIN: FALSO_RUFF, ACHADOS_DO_ESLINT: JSON.stringify(eslint), ACHADOS_DO_RUFF: JSON.stringify(ruff), ...ambiente },
    });
    return { status: r.status, saida: r.stdout + r.stderr };
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}

const VELHO = 'const velho = 1;\nconst outro = 2;\n';
const LEGADO = [{ arquivo: 'lib/a.js', linha: 1, regra: 'no-dupe-keys' }];

let r = rodar({ base: { 'lib/a.js': VELHO }, depois: { 'lib/a.js': `${VELHO}module.exports = outro;\n` }, eslint: LEGADO });
assert.strictEqual(r.status, 0, `o achado antigo, numa linha que a mudança não acrescentou, não conta: ${r.saida}`);
assert.match(r.saida, /lint ok: 1 arquivo/);

r = rodar({ base: { 'lib/a.js': VELHO }, depois: { 'lib/a.js': `${VELHO}const novo = 3;\n` }, eslint: [{ arquivo: 'lib/a.js', linha: 3, regra: 'no-dupe-keys', texto: "'novo' is assigned a value but never used" }] });
assert.strictEqual(r.status, 1, 'a variável sem uso que a mudança acrescentou barra');
assert.match(r.saida, /✗ lib\/a\.js:3: no-dupe-keys: 'novo' is assigned/);
assert.match(r.saida, /Conserto: corrija as 1 linha/);

r = rodar({ base: { 'LEIAME.md': 'x\n' }, depois: { 'lib/b.js': 'const x = ;\n' }, eslint: [{ arquivo: 'lib/b.js', linha: 1, regra: null, fatal: true, texto: 'Parsing error' }] });
assert.strictEqual(r.status, 1, 'um arquivo novo que nem lê barra');

r = rodar({ base: { 'lib/a.js': VELHO }, depois: { 'lib/a.js': `${VELHO}const novo = 3;\n` }, eslint: [{ arquivo: 'lib/a.js', linha: 1, regra: null, fatal: true }] });
assert.strictEqual(r.status, 1, 'o erro de sintaxe vale mesmo fora das linhas acrescentadas: o arquivo inteiro não lê');

r = rodar({ base: { 'complemento/a.py': 'import os\n' }, depois: { 'complemento/a.py': 'import os\nimport sys\n' }, ruff: [{ arquivo: 'complemento/a.py', linha: 1 }, { arquivo: 'complemento/a.py', linha: 2 }] });
assert.strictEqual(r.status, 1, 'o import sem uso que o ruff acha na linha acrescentada barra');
assert(r.saida.includes('complemento/a.py:2: F811') && !r.saida.includes('complemento/a.py:1:'), r.saida);

r = rodar({ base: { 'complemento/a.py': 'import os\n' }, depois: { 'complemento/a.py': 'import os\nx = 1\n' }, ruff: [{ arquivo: 'complemento/a.py', linha: 1 }] });
assert.strictEqual(r.status, 0, `o import antigo não conta: ${r.saida}`);

r = rodar({ base: { 'LEIAME.md': 'x\n' }, depois: { 'docs/b.md': 'y\n' }, eslint: [{ arquivo: 'docs/b.md', linha: 1, regra: 'x' }] });
assert.strictEqual(r.status, 0, 'o que não é JavaScript nem Python não passa pelo lint');

const ondeEstaOGit = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(String.fromCharCode(10))[0].trim();
r = rodar({ base: { 'lib/a.js': VELHO }, depois: { 'lib/a.js': `${VELHO}const novo = 3;
` }, eslint: [{ arquivo: 'lib/a.js', linha: 3, regra: 'no-unused-vars', texto: 'x' }] });
assert.strictEqual(r.status, 0, 'a variável sem uso só avisa: os lotes em andamento ainda deixam algumas');
assert(r.saida.includes('aviso: lib/a.js:3: no-unused-vars') && r.saida.includes('1 aviso(s)'), r.saida);
r = rodar({ base: { 'complemento/a.py': 'x = 1\n' }, depois: { 'complemento/a.py': 'x = 1\ny = 2\n' }, ruff: [{ arquivo: 'complemento/a.py', linha: 2, regra: 'F841' }, { arquivo: 'complemento/a.py', linha: 2, regra: 'F401' }] });
assert.strictEqual(r.status, 0, 'o mesmo no Python: F841 e F401 só avisam');

const SEM_FERRAMENTA = { ESLINT_BIN: '', RUFF_BIN: '', PATH: [path.dirname(process.execPath), path.dirname(ondeEstaOGit)].join(path.delimiter) };
r = rodar({ base: { 'LEIAME.md': 'x\n' }, depois: { 'lib/c.js': 'const a = 1;\nmodule.exports = a;\n' }, ambiente: { ...SEM_FERRAMENTA, REGRAS_EXIGE_FERRAMENTAS: '1' } });
assert.strictEqual(r.status, 1, 'no CI a falta do ESLint barra em vez de passar sem conferir');
assert.match(r.saida, /✗ eslint não está instalado/);
r = rodar({ base: { 'LEIAME.md': 'x\n' }, depois: { 'lib/c.js': 'const a = 1;\nmodule.exports = a;\n' }, ambiente: SEM_FERRAMENTA });
assert.strictEqual(r.status, 0, 'fora do CI a falta da ferramenta só avisa');
assert.match(r.saida, /aviso: eslint não está instalado/);

const inexistente = spawnSync(process.execPath, [CLI, '--raiz', __dirname, '--base', 'origem-que-nao-existe'], { encoding: 'utf8' });
assert.strictEqual(inexistente.status, 1, 'sem a base, falha em vez de dizer que está tudo certo');

fs.rmSync(FERRAMENTAS, { recursive: true, force: true });
console.log('test_lint_do_que_mudou: ok');
