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
// Achados da revisão do #186: a cor num token paralelo e a cor no reserva do var().
acusa('tokens-veio', 'painel.css', '.x { --red: #f00; color: var(--red); }\n', 1, 'cor numa variável fora de veio/tokens.css');
acusa('tokens-veio', 'painel.css', '.y { color: var(--veio-missing, #f00); }\n', 1, 'cor no reserva do var()');
acusa('tokens-veio', 'painel.css', '.z { --largura: 240px; gap: var(--veio-espaco, 8px); }\n', 0, 'variável local de tamanho não é regra');
// Achado SP-4 da revisão final do #186: a cor com nome é a mesma cor literal que #f00.
acusa('tokens-veio', 'overlay.css', '.x { color: red; background: rebeccapurple; }\n', 2, 'cores com nome');
acusa('tokens-veio', 'overlay.css', '.x { --alerta: red; }\n.y { color: var(--veio-missing, Red); }\n', 2, 'cor com nome numa variável e no reserva');
acusa('tokens-veio', 'popup.js', "el.style.color = 'tomato';\n", 1, 'cor com nome no JS');
acusa('tokens-veio', 'overlay.css', [
  '.red-text { color: currentColor; background: transparent; border-color: inherit; }',
  '.x { --tom-red: var(--veio-accent); animation: piscar-red var(--veio-piscar) steps(2); }',
].join('\n'), 0, 'currentColor, transparent, inherit e nomes que só contêm uma cor');
// O jeito certo passa.
acusa('tokens-veio', 'painel.css', [
  '.pm-linha { border-radius: var(--veio-raio-linha); font-size: var(--veio-tam-pagina); }',
  'a:hover { color: var(--veio-text); }',
  '.ponto { border-radius: 50%; transition: none; animation: piscar var(--veio-piscar) steps(2) infinite; }',
  '.zero { border-radius: 0; box-shadow: 0 0 0 2px var(--veio-accent); }',
  '/* font-size: 22px no comentário não conta */',
].join('\n'), 0, 'tokens, 50%, 0 e comentários');

// ─── gravacao-de-frases ──────────────────────────────────────────────────────

// b2188a1 (#126) lib/sincronizacao.js: escritas de `frases` e `pm_pending_sync` fora da fila.
acusa('gravacao-de-frases', 'lib/sincronizacao.js', [
  'async function sincronizar(local) {',
  '  if (restantes.length !== pm_pending_sync.length) await local.set({ pm_pending_sync: restantes });',
  '  if (localPrecisaAtualizar) await local.set({ frases: localAtualizado });',
  '}',
].join('\n'), 2, 'as escritas que a B2 levou para fora da fila (b2188a1)');
// 0ade3d1 painel.js: a página regravando `pm_pending_sync` com uma cópia lida antes.
acusa('gravacao-de-frases', 'painel.js',
  'if (restantes.length !== pm_pending_sync.length) await chromeSet({ pm_pending_sync: restantes });\n', 1, 'chromeSet da página (0ade3d1)');
acusa('gravacao-de-frases', 'painel.js', "chrome.storage.local.set({\n  frases: todasFrases,\n}, () => {});\nchrome.storage.local.remove('frases');\n", 2,
  'objeto em várias linhas e remove');
// Dentro da fila, e outras chaves, passam.
acusa('gravacao-de-frases', 'background.js', [
  'function naFilaDeGravacao(tarefa) { return fila.then(tarefa); }',
  'async function salvarFrase(nova) {',
  '  await naFilaDeGravacao(async () => {',
  '    const data = await chromeGet({ frases: [], pm_pending_sync: [] });',
  '    await chromeSet({',
  '      frases: [nova, ...data.frases],',
  '      pm_pending_sync: [...data.pm_pending_sync, String(nova.id)],',
  '    });',
  '  });',
  "  chrome.storage.local.set({ pm_tema: 'claro', frasesDoDia: 3 });",
  '}',
].join('\n'), 0, 'a escrita dentro de naFilaDeGravacao e outra chave');

// ─── idioma-solto ────────────────────────────────────────────────────────────

// bf640d9^ popup.js: uma das cinco cópias do detector que divergiram.
acusa('idioma-solto', 'popup.js', "  const idioma = /[\\u0400-\\u04FF]/.test(texto) ? 'Russo' : 'Inglês';\n", 3, 'o detector copiado (bf640d9)');
// 25e0b21 painel.js: a revisão do passo 1 ainda achou o nome solto.
acusa('idioma-solto', 'painel.js', "const classe = (f.idioma === 'Russo' || detectarIdioma(f.texto || '') === 'Russo') ? ' frase-ru' : '';\n", 2,
  'o nome solto que a segunda revisão tirou (73163ce)');
// f9a8821^:painel.js:1198, transplantada para o módulo de hoje: o nome já divergido, sem acento.
acusa('idioma-solto', 'painel-anki-baralhos.js', "const label = deck.lang === 'ru' ? 'Russo' : 'Ingles';\n", 2, "'Ingles' sem acento (f9a8821)");
acusa('idioma-solto', 'painel.js', [
  "const { IDIOMAS, detectarIdioma, ehRussa } = PerpetualMiner;",
  'const lang = ehRussa(frase) ? "ru" : "en";',
  "// 'Russo' no comentário não conta",
  'const rotulo = "Frases em russo";',
].join('\n'), 0, 'o jeito de lib/idioma.js');
assert.strictEqual(regras['idioma-solto'].seAplica('lib/idioma.js'), false, 'lib/idioma.js é o dono');

// ─── teste-le-codigo ─────────────────────────────────────────────────────────

const LEITOR = [
  'SERVER_PATH = Path(__file__).with_name("server.py")',
  'CONFIG_PATH = Path(__file__).with_name("config.json")',
  '',
  'def _function_source(name: str) -> str:',
  '    source = SERVER_PATH.read_text(encoding="utf-8")',
  '    return source',
  '',
  'class T(unittest.TestCase):',
].join('\n');
// 656690d bridge/test_anki_launcher.py: o teste da duplicata lendo o texto de _process_job.
acusa('teste-le-codigo', 'bridge/test_anki_launcher.py', `${LEITOR}
    def test_duplicate_is_reported(self) -> None:
        process_fn = _function_source("_process_job")
        self.assertIn("results.get(stem) == send_mod.DUPLICATE", process_fn)
`, 1, 'o teste que lê o código (656690d)');
acusa('teste-le-codigo', 'engine/test_qualquer.py', 'import inspect\n\ndef test_x():\n    assert "foo" in inspect.getsource(bar)\n', 1, 'getsource direto');
acusa('teste-le-codigo', 'bridge/test_anki_launcher.py', `${LEITOR}
    def test_repair_route(self) -> None:
        response = bridge.app.test_client().post("/anki/repair")
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        self.assertEqual(response.status_code, 503)
`, 0, 'o teste pela rota e a leitura de um .json');

// ─── e2e-funcao-interna ──────────────────────────────────────────────────────

// 86b8bff (#129, achado S2): o callback do menu chamado sem dizer qual exceção usa.
const MENU = [
  'const minerarPeloMenu = (extensao, { selecao, pageUrl, titulo }) => extensao.serviceWorker.evaluate(',
  '  ({ selecao, pageUrl, titulo }) => minerarSelecaoDoMenu(',
  "    { menuItemId: 'minerar-perpetualminer', selectionText: selecao, pageUrl },",
  '    { title: titulo },',
  '  ),',
  '  { selecao, pageUrl, titulo },',
  ');',
].join('\n');
acusa('e2e-funcao-interna', 'e2e/tests/mineracao-unica.spec.js', MENU, 1, 'o callback do menu sem a exceção nomeada (86b8bff)');
// d2ab0da^ componentes-veio.spec.js: o teste lendo uma constante interna.
acusa('e2e-funcao-interna', 'e2e/tests/componentes-veio.spec.js',
  'const rotulos = await page.evaluate(() => PerpetualMiner.Veio.ROTULOS_DO_PADRAO);\n', 1, 'constante interna (d2ab0da)');
acusa('e2e-funcao-interna', 'e2e/tests/mineracao-unica.spec.js',
  `// Exceção de teste: chrome-nativo (CLAUDE.md § Testing).\n// O Playwright não abre o menu de contexto nativo do Chrome.\n${MENU}`, 0, 'a exceção nomeada');
// Achado da revisão do #186: a marca dentro de uma string não nomeia exceção.
acusa('e2e-funcao-interna', 'e2e/tests/review-probe.spec.js',
  'const texto = await page.evaluate(() => { const nota = "Exceção de teste: catálogo"; return PerpetualMiner.textoDaVoz("PAI-05", { n: 2 }); });\n',
  1, 'a marca numa string');
acusa('e2e-funcao-interna', 'e2e/tests/review-probe.spec.js',
  'const nota = "// Exceção de teste: catálogo";\nconst texto = await page.evaluate(() => PerpetualMiner.textoDaVoz("PAI-05"));\n',
  1, 'a marca numa string da linha de cima');
// Achado SP-2 da revisão final do #186: a instrução anterior, já fechada, não empresta o comentário.
const [segunda] = acusa('e2e-funcao-interna', 'e2e/tests/review-probe.spec.js', [
  '// Exceção de teste: catálogo (CLAUDE.md § Testing).',
  'const texto = await page.evaluate(() => PerpetualMiner.textoDaVoz("PAI-05"));',
  'const ligado = await page.evaluate(() => PerpetualMiner.ConexaoAnki.conferir());',
].join('\n'), 1, 'a chamada seguinte, sem exceção própria');
assert.strictEqual(segunda.linha, 3);
total++;
// O formato que componentes-veio.spec.js:441 tinha: a marca acima de um `const` preparatório.
acusa('e2e-funcao-interna', 'e2e/tests/componentes-veio.spec.js', [
  '// Exceção de teste: componente-base (CLAUDE.md § Testing).',
  "const texto = '<b>Hold</b> the line.';",
  'await page.evaluate(texto => PerpetualMiner.Veio.escreverFrase(corpo, texto), texto);',
].join('\n'), 1, 'a marca acima de outra instrução');
acusa('e2e-funcao-interna', 'e2e/tests/componentes-veio.spec.js', [
  '// Exceção de teste: componente-base (CLAUDE.md § Testing).',
  'const texto = await page',
  '  .evaluate(() => PerpetualMiner.Veio.escreverFrase(corpo, "x"));',
].join('\n'), 0, 'a marca acima da mesma instrução, quebrada em linhas');
acusa('e2e-funcao-interna', 'e2e/tests/popup.spec.js', [
  "const texto = await extensao.serviceWorker.evaluate(() => chrome.action.getBadgeText({}));",
  "const frases = await page.evaluate(() => document.querySelectorAll('.veio-frase').length);",
].join('\n'), 0, 'chrome.* e o DOM não são código da extensão');

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
const git = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8', stdio: 'pipe' }).trim();
const escrever = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(path.join(tmp, arquivo)), { recursive: true });
  fs.writeFileSync(path.join(tmp, arquivo), texto);
};
const linhaDeBase = permitido => escrever('scripts/regras/linha-de-base.json', `${JSON.stringify({ 'tokens-veio': permitido }, null, 2)}\n`);
const commit = mensagem => { git('add', '.'); git('commit', '-q', '-m', mensagem); return git('rev-parse', 'HEAD'); };
const rodar = (base, ...args) => spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', tmp, ...args], {
  cwd: tmp, encoding: 'utf8', env: { ...process.env, REGRAS_BASE: base },
});
const RAIO_TOKEN = '.pm-linha {\n  border-radius: var(--veio-raio-linha);\n}\n';
const RAIO_SOLTO = '.pm-linha {\n  border-radius: 2px;\n}\n';

git('init', '-q', '-b', 'main');
git('config', 'user.email', 'regras@teste');
git('config', 'user.name', 'regras');
escrever('overlay.css', RAIO_TOKEN);
escrever('painel.css', '.velho { color: #374151; }\n');
commit('antes das regras');
linhaDeBase({ 'painel.css': 1 });
const inicial = commit('base');
git('checkout', '-q', '-b', 'mudanca');

let r = rodar('main');
assert.strictEqual(r.status, 0, `a base passa:\n${r.stdout}${r.stderr}`);

// A primeira linha de base: a base ainda não tem uma, e isso é dito, não escondido.
r = rodar(git('rev-parse', 'HEAD~1'));
assert.strictEqual(r.status, 0, r.stdout);
assert.match(r.stdout, /primeira linha de base/);

escrever('overlay.css', RAIO_SOLTO);
r = rodar('main');
assert.strictEqual(r.status, 1, 'o raio solto novo falha');
assert.match(r.stdout, /overlay\.css:2: raio literal/, 'o erro sai no stdout');
assert.match(r.stdout, /var\(--veio-…\)/, 'a mensagem diz o que usar');

const valida = '.pm-linha {\n  border-radius: 2px; /* exceção tokens-veio até 2099-01-01, aprovada por Vinicius: teste */\n}\n';
escrever('overlay.css', valida);
assert.strictEqual(rodar('main').status, 0, 'a exceção válida na linha passa');

escrever('overlay.css', valida.replace('2099-01-01', '2026-01-01'));
r = rodar('main');
assert.strictEqual(r.status, 1, 'a exceção vencida falha');
assert.match(r.stdout, /vencida/);

// Achado da revisão do #186: a exceção escrita numa string não vale.
escrever('overlay.js', 'const idioma = "Russo"; const nota = "exceção idioma-solto até 2099-01-01, aprovada por Vinicius: teste";\n');
escrever('overlay.css', RAIO_TOKEN);
r = rodar('main');
assert.strictEqual(r.status, 1, 'a exceção dentro de uma string não vale');
assert.match(r.stdout, /idioma-solto — overlay\.js/);
fs.rmSync(path.join(tmp, 'overlay.js'));

// Achado SP-1 da revisão final do #186: uma string de CSS e um atributo de HTML também não são comentário.
const EXCECAO_FALSA = 'exceção tokens-veio até 2099-01-01, aprovada por Vinicius: teste';
escrever('overlay.css', `.x { content: "/* ${EXCECAO_FALSA} */"; color: #f00; }\n`);
r = rodar('main');
assert.strictEqual(r.status, 1, `a exceção dentro de uma string de CSS não vale:\n${r.stdout}`);
assert.match(r.stdout, /tokens-veio — overlay\.css/);
escrever('overlay.css', RAIO_TOKEN);
escrever('probe.html', `<div data-note="<!-- ${EXCECAO_FALSA} -->" style="color:#f00">x</div>\n`);
r = rodar('main');
assert.strictEqual(r.status, 1, `a exceção dentro de um atributo de HTML não vale:\n${r.stdout}`);
assert.match(r.stdout, /tokens-veio — probe\.html/);
escrever('probe.html', `<div style="color:#f00">x</div> <!-- ${EXCECAO_FALSA} -->\n`
  + `<style>\n  .y { content: "/*"; color: #0f0; } /* ${EXCECAO_FALSA} */\n</style>\n`);
r = rodar('main');
assert.strictEqual(r.status, 0, `os comentários de verdade, no HTML e no <style>, valem:\n${r.stdout}`);
fs.rmSync(path.join(tmp, 'probe.html'));

escrever('overlay.css', RAIO_SOLTO);
linhaDeBase({ 'painel.css': 1, 'overlay.css': 1 });
r = rodar('main');
assert.strictEqual(r.status, 1, 'subir a linha de base falha');
assert.match(r.stdout, /só desce/);
assert.strictEqual(rodar('main', '--base', 'main').status, 1, '--base faz o mesmo que REGRAS_BASE');
// Achado ST-1/SP-3 da revisão final do #186: uma base pedida que não resolve é erro, não um verde sem teto.
r = rodar('main', '--base', 'maim');
assert.strictEqual(r.status, 2, `--base com erro de digitação:\n${r.stdout}`);
assert.match(r.stdout, /error: --base maim: não é um commit/);
r = rodar('missing-ref');
assert.strictEqual(r.status, 1, `REGRAS_BASE que não resolve:\n${r.stdout}`);
assert.match(r.stdout, /error: REGRAS_BASE=missing-ref não é um commit/);
r = rodar('');
assert.strictEqual(r.status, 0, 'sem base pedida e sem origin/main, a comparação fica de fora, com aviso');
assert.match(r.stdout, /aviso: sem base de comparação/);

// Achado da revisão do #186, a receita do push na main: o CI compara com o commit
// anterior (github.event.before), não com o próprio commit.
git('checkout', '-q', 'main');
const antes = git('rev-parse', 'HEAD');
commit('sobe a linha de base direto na main');
git('update-ref', 'refs/remotes/origin/main', 'HEAD');
r = rodar(antes);
assert.strictEqual(r.status, 1, 'no push, subir a linha de base falha');
assert.match(r.stdout, /só desce/);
assert.strictEqual(rodar('0000000000000000000000000000000000000000').status, 0, 'o primeiro push de um ramo não tem base');
git('reset', '-q', '--hard', antes);
git('update-ref', '-d', 'refs/remotes/origin/main');

// Achado da revisão do #186: um ramo antigo não ressuscita a permissão que a main tirou.
git('checkout', '-q', '-b', 'antigo', inicial);
escrever('painel.css', '.velho { color: #374151; }\n.outro { color: #111827; }\n');
linhaDeBase({ 'painel.css': 2 });
commit('ramo que ainda permite 2');
git('checkout', '-q', 'main');
git('reset', '-q', '--hard', inicial);
escrever('painel.css', '.velho { color: var(--veio-text); }\n');
linhaDeBase({});
commit('a main conserta e baixa a linha de base');
git('checkout', '-q', 'antigo');
r = rodar('main');
assert.strictEqual(r.status, 1, 'o ramo antigo é comparado com a ponta da main, não com o merge-base');
assert.match(r.stdout, /traga-o para cá/);

git('checkout', '-q', 'main');
r = rodar('main');
assert.strictEqual(r.status, 0, r.stdout);
escrever('painel.css', '.velho { color: var(--veio-text); }\n');
r = rodar('main', '--atualizar');
assert.strictEqual(r.status, 0, r.stdout);
assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'scripts/regras/linha-de-base.json'), 'utf8'))['tokens-veio'], {});
total += 18;

// ─── a linha de comando ──────────────────────────────────────────────────────

r = rodar('main', '--raizz', tmp);
assert.strictEqual(r.status, 2, 'bandeira desconhecida é erro de uso');
assert.match(r.stdout, /error: bandeira desconhecida: --raizz/);
r = spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz'], { encoding: 'utf8' });
assert.strictEqual(r.status, 2);
assert.match(r.stdout, /--raiz precisa de um valor/);
assert.strictEqual(rodar('main', '--atualizar', '--criar-linha-de-base').status, 2, 'as duas não andam juntas');
// Achado ST-2 da revisão final do #186: nomes que todo objeto herda não são bandeiras.
const linhaDeBaseAntes = fs.readFileSync(path.join(tmp, 'scripts/regras/linha-de-base.json'), 'utf8');
for (const herdado of ['constructor', 'toString', '__proto__']) {
  r = rodar('main', '--atualizar', herdado, 'lixo');
  assert.strictEqual(r.status, 2, `${herdado} não é bandeira:\n${r.stdout}`);
  assert.match(r.stdout, new RegExp(`bandeira desconhecida: ${herdado}`));
}
assert.strictEqual(fs.readFileSync(path.join(tmp, 'scripts/regras/linha-de-base.json'), 'utf8'), linhaDeBaseAntes,
  'o erro de uso não toca a linha de base');
r = rodar('main', '--help');
assert.strictEqual(r.status, 0);
assert.match(r.stdout, /exceção <regra> até AAAA-MM-DD/);
total += 8;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`regras: ${total} provas passaram`);
