'use strict';

// Cada regra de scripts/regras/ acusa o erro real que a fez existir (o trecho
// copiado do commit indicado) e deixa passar o jeito certo. No fim, a catraca
// inteira roda num repositório temporário: uma ocorrência nova falha, uma
// exceção válida passa, uma vencida falha e a linha de base não pode subir.

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const regras = Object.fromEntries(require('./verificar').REGRAS.map(regra => [regra.id, regra]));
const { excecaoNaLinha } = require('./verificar');
const RAIZ = path.resolve(__dirname, '..', '..');

let total = 0;
function acusa(id, arquivo, fonte, quantas, porque) {
  const achados = regras[id].verificar(arquivo, fonte, RAIZ);
  assert.strictEqual(achados.length, quantas, `${id} em ${arquivo}: ${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
  return achados;
}

// ─── tokens-veio ─────────────────────────────────────────────────────────────

// 8d13cc7^ overlay.css: o raio da linha do overlay solto, que a revisão do #41 tirou.
acusa('tokens-veio', 'overlay.css', '.pm-linha {\n  height: 3px;\n  border-radius: 2px;\n  background: var(--veio-accent);\n}\n', 1,
  'raio em px fora dos tokens (8d13cc7)');
// 0510e37^ vitrine e painel: o tamanho do nome em rem e o raio do ícone em px.
acusa('tokens-veio', 'e2e/vitrine/vitrine.html',
  '<style>\n  .marca span {\n    font-size: 22px;\n  }\n  .icone { border-radius: 7px; }\n</style>\n', 2, 'tamanho e raio soltos na vitrine (0510e37)');
acusa('tokens-veio', 'painel.css', '.marca-nome {\n  font-size: 1.35rem;\n}\n', 1, 'tamanho em rem no painel (0510e37)');
// b1a3664^ painel.css: os tamanhos de tipo do shell, que a revisão trocou por tokens.
acusa('tokens-veio', 'painel.css', '.ilha h2 { font-size: 16px; }\n.ilha p { font-size: 12px; }\n', 2, 'tipo do shell (b1a3664)');
// O mesmo erro escrito pelo JavaScript (o toast legado do painel.js).
acusa('tokens-veio', 'painel.js', "Object.assign(toast.style, {\n  background: '#7c3aed', borderRadius: '8px',\n  fontSize: '13px', transition: 'opacity 0.3s',\n});\n", 4,
  'objeto de estilo com cor, raio, letra e duração soltos');
acusa('tokens-veio', 'popup.js', "el.style.color = '#F5B83D';\n", 1, 'cor solta no JS');
// O jeito certo passa.
acusa('tokens-veio', 'painel.css', [
  '.pm-linha { border-radius: var(--veio-raio-linha); font-size: var(--veio-tam-pagina); }',
  'a:hover { color: var(--veio-text); }',
  '.ponto { border-radius: 50%; transition: none; animation: piscar var(--veio-piscar) steps(2) infinite; }',
  '.zero { border-radius: 0; box-shadow: 0 0 0 2px var(--veio-accent); }',
  '/* font-size: 22px no comentário não conta */',
].join('\n'), 0, 'tokens, 50%, 0 e comentários');

// ─── exceções na linha ───────────────────────────────────────────────────────

const HOJE = '2026-10-04';
assert.deepStrictEqual(excecaoNaLinha('  font-size: 9px; /* exceção tokens-veio até 2026-12-31, aprovada por Vinicius: imitação do badge */', HOJE),
  { regra: 'tokens-veio', valida: true });
assert.match(excecaoNaLinha('x // exceção tokens-veio até 2026-01-31, aprovada por Vinicius: antiga', HOJE).erro, /vencida/);
assert.match(excecaoNaLinha('x // exceção tokens-veio porque sim', HOJE).erro, /formato/);
assert.strictEqual(excecaoNaLinha('// a exceção de teste do menu', HOJE), null);
total += 4;

// ─── a catraca, de ponta a ponta ─────────────────────────────────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-regras-'));
const git = (...args) => execFileSync('git', args, { cwd: tmp, stdio: 'pipe' });
const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(tmp, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(tmp, arquivo), texto);
};
const rodar = () => spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', tmp], {
  cwd: tmp, encoding: 'utf8', env: { ...process.env, REGRAS_BASE: 'main' },
});

git('init', '-q', '-b', 'main');
git('config', 'user.email', 'regras@teste');
git('config', 'user.name', 'regras');
escrever('overlay.css', '.pm-linha {\n  border-radius: var(--veio-raio-linha);\n}\n');
escrever('painel.css', '.velho { color: #374151; }\n');
escrever('scripts/regras/linha-de-base.json', `${JSON.stringify({ 'tokens-veio': { 'painel.css': 1 } }, null, 2)}\n`);
git('add', '.');
git('commit', '-q', '-m', 'base');
git('checkout', '-q', '-b', 'mudanca');

let r = rodar();
assert.strictEqual(r.status, 0, `a base passa:\n${r.stdout}${r.stderr}`);

escrever('overlay.css', '.pm-linha {\n  border-radius: 2px;\n}\n');
r = rodar();
assert.strictEqual(r.status, 1, 'o raio solto novo falha');
assert.match(r.stderr, /overlay\.css:2: raio literal/);
assert.match(r.stderr, /var\(--veio-…\)/, 'a mensagem diz o que usar');

const valida = '.pm-linha {\n  border-radius: 2px; /* exceção tokens-veio até 2099-01-01, aprovada por Vinicius: teste */\n}\n';
escrever('overlay.css', valida);
assert.strictEqual(rodar().status, 0, 'a exceção válida na linha passa');

escrever('overlay.css', valida.replace('2099-01-01', '2026-01-01'));
r = rodar();
assert.strictEqual(r.status, 1, 'a exceção vencida falha');
assert.match(r.stderr, /vencida/);

escrever('overlay.css', '.pm-linha {\n  border-radius: 2px;\n}\n');
escrever('scripts/regras/linha-de-base.json', `${JSON.stringify({ 'tokens-veio': { 'painel.css': 1, 'overlay.css': 1 } }, null, 2)}\n`);
r = rodar();
assert.strictEqual(r.status, 1, 'subir a linha de base falha');
assert.match(r.stderr, /só desce/);

escrever('scripts/regras/linha-de-base.json', `${JSON.stringify({ 'tokens-veio': { 'painel.css': 1 } }, null, 2)}\n`);
escrever('overlay.css', '.pm-linha {\n  border-radius: var(--veio-raio-linha);\n}\n');
escrever('painel.css', '.velho { color: var(--veio-text); }\n');
r = rodar();
assert.strictEqual(r.status, 0, 'consertar passa');
assert.match(r.stdout, /pode descer/, 'e avisa que a linha de base pode descer');
r = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', tmp, '--atualizar'], { cwd: tmp, encoding: 'utf8' });
assert.strictEqual(r.status, 0, r.stderr);
assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'scripts/regras/linha-de-base.json'), 'utf8'))['tokens-veio'], {});
total += 7;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`regras: ${total} provas passaram`);
