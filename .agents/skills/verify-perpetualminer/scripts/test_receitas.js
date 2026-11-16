const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');

function receitasDoTexto(texto) {
  const receitas = [];
  for (const m of texto.matchAll(/drive\.sh (\S+) ([\w.<>-]+)( -g "([^"]*)")?/g)) {
    if (m[2].includes('<') || m[2].startsWith('zz-scratch')) continue;
    receitas.push({ spec: m[2], titulo: m[4] });
  }
  return receitas;
}

function titulosDoSpec(codigo) {
  const titulos = [];
  for (const m of codigo.matchAll(/\btest(?:\.\w+)*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) titulos.push(m[2].replace(/\\(.)/g, '$1'));
  return titulos;
}

function receitasQuebradas(raiz) {
  const pastaDoMapa = path.join(raiz, '.agents', 'skills', 'verify-perpetualminer', 'features');
  const pastaDosSpecs = path.join(raiz, 'e2e', 'tests');
  const specs = fs.readdirSync(pastaDosSpecs).filter(f => f.endsWith('.spec.js'));
  const quebradas = [];
  for (const arquivo of fs.readdirSync(pastaDoMapa).filter(f => f.endsWith('.md'))) {
    for (const { spec, titulo } of receitasDoTexto(fs.readFileSync(path.join(pastaDoMapa, arquivo), 'utf8'))) {
      const achados = specs.filter(f => new RegExp(spec).test(`e2e/tests/${f}`));
      const onde = `${arquivo}: drive.sh … ${spec}${titulo === undefined ? '' : ` -g "${titulo}"`}`;
      if (!achados.length) { quebradas.push(`${onde} (nenhum spec casa)`); continue; }
      if (titulo === undefined) continue;
      const casam = achados.some(f => titulosDoSpec(fs.readFileSync(path.join(pastaDosSpecs, f), 'utf8')).some(t => new RegExp(titulo).test(t)));
      if (!casam) quebradas.push(`${onde} (nenhum teste tem esse título)`);
    }
  }
  return quebradas;
}

assert.deepEqual(receitasDoTexto('Run `drive.sh a x.spec -g "um|dois"` e `drive.sh b y.spec`; `drive.sh <run-id> <spec>`, `drive.sh c zz-scratch-c.spec`'),
  [{ spec: 'x.spec', titulo: 'um|dois' }, { spec: 'y.spec', titulo: undefined }]);
assert.deepEqual(titulosDoSpec("test('um \\'a\\'', async () => {});\ntest.fixme(\"dois\", () => {});\ntest(\n  `três`, () => {});"), ["um 'a'", 'dois', 'três']);

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'receitas-'));
try {
  fs.mkdirSync(path.join(pasta, 'e2e', 'tests'), { recursive: true });
  fs.mkdirSync(path.join(pasta, '.agents', 'skills', 'verify-perpetualminer', 'features'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'e2e', 'tests', 'a.spec.js'), "test('abre o painel', async () => {});\n");
  const mapa = texto => fs.writeFileSync(path.join(pasta, '.agents', 'skills', 'verify-perpetualminer', 'features', 'f.md'), texto);
  mapa('`drive.sh r a.spec -g "abre o painel"` e `drive.sh r a.spec`');
  assert.deepEqual(receitasQuebradas(pasta), []);
  mapa('`drive.sh r a.spec -g "fecha o painel"`');
  assert.deepEqual(receitasQuebradas(pasta), ['f.md: drive.sh … a.spec -g "fecha o painel" (nenhum teste tem esse título)']);
  mapa('`drive.sh r b.spec`');
  assert.deepEqual(receitasQuebradas(pasta), ['f.md: drive.sh … b.spec (nenhum spec casa)']);
} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}

assert.ok(receitasDoTexto(fs.readFileSync(path.join(RAIZ, '.agents/skills/verify-perpetualminer/features/anki.md'), 'utf8')).length > 10);
assert.deepEqual(receitasQuebradas(RAIZ), [], 'receitas do mapa de features que não levam a um teste');
console.log('ok test_receitas');
