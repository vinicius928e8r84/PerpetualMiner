'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const regra = require('./sem-codescene-no-repositorio');
const { REGRAS } = require('./verificar');
const { repositorioDeTestes } = require('./apoio-de-testes');

const DIRETIVA = ['@code', 'scene'].join('');
const DIRETIVA_COM_MAIUSCULAS = ['@Code', 'Scene'].join('');
const achados = (arquivo, fonte) => regra.verificar(arquivo, fonte);
const linhas = (arquivo, fonte) => achados(arquivo, fonte).map(achado => achado.linha);

assert(REGRAS.includes(regra), 'a regra está registrada em verificar.js');

for (const arquivo of ['lib/a.js', 'popup/popup.js', 'scripts/ferramenta.mjs', 'e2e/tests/a.spec.js', 'complemento/a.py', 'engine/b.py', 'painel/painel.css',
  'popup/popup.html', 'scripts/ganchos/pre-push', 'scripts/x.sh', '.github/workflows/regras.yml']) {
  assert.strictEqual(regra.seAplica(arquivo), true, `${arquivo}: arquivo de código entra na regra`);
}
assert.deepStrictEqual(linhas('lib/a.js', `const a = 1;\n// ${DIRETIVA}(disable:"Complex Method")\nfunction f() {}\n`), [2], 'a diretiva num comentário JS barra');
assert.deepStrictEqual(linhas('lib/a.js', `/* ${DIRETIVA_COM_MAIUSCULAS}(disable:"Bumpy Road") */\n`), [1], 'a diretiva com maiúsculas barra');
assert.deepStrictEqual(linhas('complemento/a.py', `x = 1\n# ${DIRETIVA}(disable:"Large Method")\n`), [2], 'a diretiva num comentário Python barra');
assert.deepStrictEqual(linhas('lib/a.js', `${DIRETIVA}(disable:"X")\n${DIRETIVA}(disable:"Y")\n`), [1, 2], 'cada linha com a diretiva é um achado');
assert.match(achados('lib/a.js', `// ${DIRETIVA}(disable:"X")\n`)[0].detalhe, /diretiva do CodeScene/);

assert.deepStrictEqual(linhas('lib/a.js', 'const nome = "CodeScene";\n'), [], 'o nome do CodeScene sem a arroba passa');
assert.deepStrictEqual(linhas('lib/a.js', 'const a = 1;\n'), [], 'código sem a diretiva passa');
assert.strictEqual(regra.seAplica('docs/adr/0001.md'), false, 'a documentação pode falar da diretiva');
assert.strictEqual(regra.seAplica('AGENTS.md'), false);
assert.strictEqual(regra.seAplica('e2e/tests/a-snapshots/x.png'), false);

for (const arquivo of ['.codescene/code-health-rules.json', '.codescene/regras.yml', '.codescene/LEIAME.md', 'code-health-rules.json', 'pasta/code-health-rules.json']) {
  assert.strictEqual(regra.seAplica(arquivo), true, `${arquivo}: a configuração do CodeScene entra na regra`);
  const achado = achados(arquivo, '{}\n');
  assert.deepStrictEqual(achado.map(a => a.linha), [1], `${arquivo}: a configuração do CodeScene barra`);
  assert.match(achado[0].detalhe, /configuração do CodeScene/);
}
assert.strictEqual(regra.seAplica('docs/codescene.md'), false);
assert.deepStrictEqual(linhas('scripts/qualidade/notas-do-codescene.json', '{}\n'), [], 'um arquivo que só tem o nome na pasta não é a configuração');
assert.deepStrictEqual(linhas('scripts/ci/codescene-em-toda-pr.js', 'const a = 1;\n'), [], 'o script do check do CodeScene na PR passa');

const rodar = arquivos => {
  const pasta = repositorioDeTestes({ 'scripts/regras/linha-de-base.json': '{}\n', ...arquivos });
  try {
    const saida = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', pasta], {
      encoding: 'utf8', env: { ...process.env, REGRAS_BASE: '0'.repeat(40) },
    });
    return { status: saida.status, texto: `${saida.stdout}${saida.stderr}` };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
};

const limpo = rodar({ 'lib/a.js': 'const a = 1;\n' });
assert.strictEqual(limpo.status, 0, `um repositório sem CodeScene não reprova por esta regra\n${limpo.texto}`);

const comDiretiva = rodar({ 'lib/a.js': `const a = 1;\n// ${DIRETIVA}(disable:"Complex Method")\n` });
assert.strictEqual(comDiretiva.status, 1, 'a diretiva no código reprova o verificar.js');
assert.match(comDiretiva.texto, /✗ sem-codescene-no-repositorio — lib\/a\.js: 1 ocorrência/);
assert.match(comDiretiva.texto, /lib\/a\.js:2: diretiva do CodeScene no código/);

const comPasta = rodar({ '.codescene/code-health-rules.json': '{}\n' });
assert.strictEqual(comPasta.status, 1, 'um arquivo em .codescene/ reprova o verificar.js');
assert.match(comPasta.texto, /✗ sem-codescene-no-repositorio — \.codescene\/code-health-rules\.json/);
assert.match(comPasta.texto, /configuração do CodeScene/);

const comExcecao = rodar({
  'lib/a.js': `// ${DIRETIVA}(disable:"X") exceção sem-codescene-no-repositorio até 2999-12-31, aprovada por o dono: prova da regra\n`,
});
assert(!/✗ sem-codescene-no-repositorio/.test(comExcecao.texto), `a exceção de linha vale\n${comExcecao.texto}`);

console.log('test_sem_codescene_no_repositorio: ok');
