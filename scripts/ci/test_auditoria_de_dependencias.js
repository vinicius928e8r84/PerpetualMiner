'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { raizTemporaria } = require('../regras/apoio-sem-comentario');

const CLI = path.join(__dirname, 'auditoria-de-dependencias.js');
const FERRAMENTAS = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-auditoria-ferramentas-'));
const FALSO_NPM = path.join(FERRAMENTAS, 'npm.js');
const FALSO_PIP = path.join(FERRAMENTAS, 'pip-audit.js');

fs.writeFileSync(FALSO_NPM, `const fs = require('fs');
process.stdout.write(fs.readFileSync('package-lock.json', 'utf8'));
`);
fs.writeFileSync(FALSO_PIP, `const fs = require('fs');
process.stdout.write(fs.readFileSync(process.argv[process.argv.indexOf('-r') + 1], 'utf8'));
`);

const vulnerabilidades = (...itens) => JSON.stringify({ vulnerabilities: Object.fromEntries(itens.map(([nome, severity]) => [nome, { severity, range: '<2.0.0', via: [{ title: `falha em ${nome}` }] }])) });
const pacote = '{ "name": "x", "version": "1.0.0" }\n';
const dependencias = (...itens) => JSON.stringify({ dependencies: itens.map(([name, id]) => ({ name, version: '1.0', vulns: id ? [{ id }] : [] })) });

function rodar({ base, depois }) {
  const { raiz, git, gravar, commit } = raizTemporaria();
  try {
    gravar(base);
    commit('base');
    git('checkout', '-q', '-b', 'pr');
    gravar(depois);
    commit('pr');
    const r = spawnSync(process.execPath, [CLI, '--raiz', raiz, '--base', 'main'], {
      encoding: 'utf8', env: { PATH: process.env.PATH, NPM_BIN: FALSO_NPM, PIP_AUDIT_BIN: FALSO_PIP },
    });
    return { status: r.status, saida: r.stdout + r.stderr };
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}

const trava = (pasta, texto) => ({ [`${pasta}/package.json`]: pacote, [`${pasta}/package-lock.json`]: texto });
const SEM_FALHA = vulnerabilidades(['velho', 'moderate']);

let r = rodar({ base: { 'LEIAME.md': 'x\n' }, depois: { 'docs/a.md': 'y\n' } });
assert.strictEqual(r.status, 0, r.saida);
assert.match(r.saida, /nenhuma trava do npm nem requirements\.txt mudou/);

r = rodar({ base: trava('e2e', SEM_FALHA), depois: trava('e2e', vulnerabilidades(['velho', 'moderate'], ['novo', 'high'])) });
assert.strictEqual(r.status, 1, 'o pacote alto que a PR introduz barra');
assert.match(r.saida, /✗ e2e\/package-lock\.json: novo \(high, <2\.0\.0\) falha em novo/);

r = rodar({ base: trava('e2e', SEM_FALHA), depois: trava('e2e', vulnerabilidades(['velho', 'moderate'], ['novo', 'critical'])) });
assert.strictEqual(r.status, 1, 'o crítico também');

r = rodar({ base: trava('e2e', SEM_FALHA), depois: trava('e2e', vulnerabilidades(['velho', 'moderate'], ['novo', 'low'], ['outro', 'moderate'])) });
assert.strictEqual(r.status, 0, `só alto e crítico barram: ${r.saida}`);
assert.match(r.saida, /auditoria ok: e2e\/package-lock\.json/);

const COM_ALTA_ANTIGA = vulnerabilidades(['antigo', 'high']);
r = rodar({ base: trava('e2e', COM_ALTA_ANTIGA), depois: trava('e2e', `${COM_ALTA_ANTIGA}\n`) });
assert.strictEqual(r.status, 0, `a falha alta que a base já tinha não conta: ${r.saida}`);

r = rodar({ base: { 'LEIAME.md': 'x\n' }, depois: trava('novo', vulnerabilidades(['recem-chegado', 'high'])) });
assert.strictEqual(r.status, 1, 'uma trava nova com falha alta barra');

r = rodar({ base: trava('e2e', SEM_FALHA), depois: trava('e2e', 'isto não é JSON') });
assert.strictEqual(r.status, 1, 'se o npm audit não responde, falha em vez de passar');
assert.match(r.saida, /✗ npm audit não devolveu JSON/);

const ERRO_DO_REGISTRO = JSON.stringify({ error: { code: 'ENOAUDIT', summary: 'registro fora do ar' } });
r = rodar({ base: trava('e2e', SEM_FALHA), depois: trava('e2e', ERRO_DO_REGISTRO) });
assert.strictEqual(r.status, 1, 'o erro do registro falha');
assert.match(r.saida, /registro fora do ar/);

const REQUISITOS_LIMPOS = dependencias(['pillow']);
r = rodar({ base: { 'engine/requirements.txt': REQUISITOS_LIMPOS }, depois: { 'engine/requirements.txt': dependencias(['pillow'], ['velha', 'PYSEC-1']) } });
assert.strictEqual(r.status, 1, 'a dependência Python com falha nova barra');
assert.match(r.saida, /✗ engine\/requirements\.txt: velha 1\.0 PYSEC-1/);

const REQUISITOS_COM_FALHA = dependencias(['pillow', 'PYSEC-0']);
r = rodar({ base: { 'engine/requirements.txt': REQUISITOS_COM_FALHA }, depois: { 'engine/requirements.txt': `${REQUISITOS_COM_FALHA}\n` } });
assert.strictEqual(r.status, 0, `a falha que a base já tinha não conta: ${r.saida}`);

fs.rmSync(FERRAMENTAS, { recursive: true, force: true });
console.log('test_auditoria_de_dependencias: ok');
