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

const nulo = (achados, quantas, porque) => { assert.strictEqual(achados.length, quantas, `${porque}\n${JSON.stringify(achados, null, 2)}`); total++; return achados; };

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

// ─── e2e-estado-final ────────────────────────────────────────────────────────

const achadosDoEstado = fonte => regras['e2e-estado-final'].verificar('e2e/tests/probe.spec.js', fonte, RAIZ);

// 7996b48 (#190) painel-anki-baralhos.spec.js:546: o cenário da coleção terminava nas fotos, sem conferir pm_anki_baralhos nem pm_anki_vocabulario.
const SO_AS_FOTOS = [
  "test('com a coleção do contrato aberta, Baralhos e termos e Vocabulário mostram o que o complemento leu', async ({ page, extensao, fakes }) => {",
  "  fakes.anki.abrirColecao('inglês com subbaralho');",
  "  await abrirAnki(page, extensao, '#anki/baralhos');",
  '  const azulejos = azulejosDosBaralhos(page).getByRole(\'button\');',
  "  await expect(azulejos.nth(0)).toContainText('EN · Inglês');",
  "  await fotografar(page, 'baralhos-da-colecao-do-contrato.png');",
  "  await aba(page, 'Vocabulário').click();",
  "  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(12);",
  "  await fotografar(page, 'vocabulario-da-colecao-do-contrato.png');",
  '});',
].join('\n');
const [semEstado] = acusa('e2e-estado-final', 'e2e/tests/painel-anki-baralhos.spec.js', SO_AS_FOTOS, 1, 'o cenário que termina na foto (7996b48)');
assert.strictEqual(semEstado.linha, 1);
total++;
// O conserto de 05b7eb8: depois da foto, lê os dois caches e compara com o que a tela mostrou.
acusa('e2e-estado-final', 'e2e/tests/painel-anki-baralhos.spec.js', SO_AS_FOTOS.replace(/\n\}\);$/, [
  '',
  "  const gravado = await extensao.lerStorage(['pm_anki_baralhos', 'pm_anki_vocabulario']);",
  "  expect(gravado.pm_anki_baralhos.nomes).toEqual({ en: 'Inglês', ru: 'Alemão' });",
  "  expect(gravado.pm_anki_vocabulario.dados.en).toMatchObject({ deckName: 'Inglês', total: 12, source: 'colecao' });",
  '});',
].join('\n')), 0, 'o mesmo cenário conferindo os dois caches (05b7eb8)');
// A leitura sem comparar, e a leitura antes de agir, não bastam.
acusa('e2e-estado-final', 'e2e/tests/painel-anki-baralhos.spec.js', SO_AS_FOTOS.replace(/\n\}\);$/, "\n  await extensao.lerStorage(['pm_anki_baralhos']);\n});"), 1,
  'a leitura sem comparar com nada');
acusa('e2e-estado-final', 'e2e/tests/painel-anki-baralhos.spec.js',
  SO_AS_FOTOS.replace("  const azulejos", "  expect((await extensao.lerStorage(['pm_anki_baralhos'])).pm_anki_baralhos).toBeUndefined();\n  const azulejos").replace("await aba(page, 'Vocabulário').click();", "await aba(page, 'Vocabulário').hover();"),
  0, 'sem ação nenhuma o teste só mostra: não é um cenário que grava');
// 5c391cb (#189) configuracoes-abrir-anki.spec.js: o interruptor confere a tela, não o item que a Conexão tem.
const SO_O_INTERRUPTOR = [
  "test('ao reabrir o painel o interruptor mostra o que a Conexão tem, não o que ficou na tela', async ({ page, extensao }) => {",
  '  await abrirCard(page, extensao);',
  '  await expect(interruptor(page)).toBeEnabled();',
  '  await trilho(page).click();',
  '  await expect(interruptor(page)).toBeChecked();',
  '',
  '  await page.reload();',
  '',
  "  await expect(resumo(page)).toHaveText('Abre com o computador');",
  '  await expect(interruptor(page)).toBeChecked();',
  '});',
].join('\n');
acusa('e2e-estado-final', 'e2e/tests/configuracoes-abrir-anki.spec.js', SO_O_INTERRUPTOR, 1, 'o interruptor sem o item que a Conexão tem (5c391cb)');
// O fake declara o leitor com `@estado-guardado` (fc0f416: o item de login que a Conexão tem); sem a marca, o leitor não conta.
const raizComFake = marcado => {
  const pasta = repositorioDeTestes({
    'e2e/fakes/anki.js': `return {\n  ${marcado ? '/** @estado-guardado O item de login que a Conexão tem. */\n  ' : ''}itemInstalado() { return item; },\n  /** @estado-guardado A chave da OpenAI que a Conexão guardou. */\n  chaveNaConexao() { return chave; },\n};\n`,
  });
  return pasta;
};
const comOFake = (marcado, arquivo, fonte) => {
  const pasta = raizComFake(marcado);
  try {
    return regras['e2e-estado-final'].verificar(arquivo, fonte, pasta);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
};
const DEPOIS_DO_ITEM = SO_O_INTERRUPTOR.replace(/\n\}\);$/, '\n  expect(fakes.anki.itemInstalado()).toBe(true);\n});').replace('{ page, extensao }', '{ page, extensao, fakes }');
nulo(comOFake(true, 'e2e/tests/configuracoes-abrir-anki.spec.js', DEPOIS_DO_ITEM), 0, 'o mesmo teste conferindo o item que o fake marca como guardado (fc0f416)');
nulo(comOFake(false, 'e2e/tests/configuracoes-abrir-anki.spec.js', DEPOIS_DO_ITEM), 1, 'o mesmo leitor sem a marca @estado-guardado no fake não conta');
// #191: o leitor da chave que a Conexão guardou, declarado pelo fake, é a fonte certa depois de agir.
nulo(comOFake(true, 'e2e/tests/configuracoes-ia.spec.js', [
  "test('conferir e salvar entrega a chave à Conexão', async ({ page, extensao, fakes }) => {",
  "  await page.getByRole('button', { name: 'Conferir e salvar' }).click();",
  "  expect(fakes.anki.chaveNaConexao()).toBe('sk-teste');",
  '});',
].join('\n')), 0, 'o leitor da PR 191, declarado pelo fake');
acusa('e2e-estado-final', 'e2e/tests/configuracoes-abrir-anki.spec.js',
  SO_O_INTERRUPTOR.replace(/\n\}\);$/, '\n  await estadoFinalEm(\'o item de login\', () => fakes.anki.itemInstalado(), true);\n});'), 0, 'o helper estadoFinalEm');
// Um helper do próprio arquivo que lê o storage conta como leitura.
acusa('e2e-estado-final', 'e2e/tests/painel-anki-baralhos.spec.js', [
  "const lerGravado = async (extensao, chave) => (await extensao.lerStorage(chave))[chave];",
  "test('salvar grava o baralho', async ({ page, extensao }) => {",
  "  await page.getByRole('button', { name: 'Salvar ajustes' }).click();",
  "  expect((await lerGravado(extensao, 'pm_anki_baralhos')).nomes).toEqual({ en: 'Mining EN' });",
  '});',
].join('\n'), 0, 'uma função do arquivo que lê o storage');
// Achados da revisão do #194: a leitura descartada, a conferência antes da última ação e o pedido que chegou ao fake não são o estado final.
const NO_ESTADO = (...meio) => ["test('guarda o tema', async ({ page, extensao, fakes }) => {", ...meio, '});'].join('\n');
nulo(achadosDoEstado(NO_ESTADO('  await botao.click();', "  await extensao.lerStorage(['pm_tema']);", '  await expect(botao).toBeVisible();')), 1,
  'a leitura cujo resultado ninguém usa');
nulo(achadosDoEstado(NO_ESTADO(
  '  await botao.click();', "  expect((await extensao.lerStorage(['pm_tema'])).pm_tema).toBe('claro');", '  await outro.click();', '  await expect(outro).toBeVisible();')), 1,
  'a conferência certa antes de uma segunda ação que grava');
nulo(achadosDoEstado(NO_ESTADO('  await botao.click();', "  expect(fakes.anki.requisicoes).toHaveLength(1);")), 1, 'o pedido que chegou ao fake não é o que ficou guardado');
nulo(achadosDoEstado(NO_ESTADO('  await botao.click();', "  expect(fakes.gemini.chamadas).toHaveLength(1);")), 1, 'as chamadas ao fake do Gemini também são transporte');
nulo(achadosDoEstado(NO_ESTADO('  await botao.click();', "  const gravado = await extensao.lerStorage(['pm_tema']);", "  expect(gravado.pm_tema).toBe('claro');")), 0,
  'a leitura guardada numa variável que o expect usa');
nulo(achadosDoEstado(NO_ESTADO('  await botao.click();', "  const { pm_tema: tema } = await extensao.lerStorage(['pm_tema']);", "  const claro = tema === 'claro';", '  expect(claro).toBe(true);')), 0,
  'a leitura que passa por outra variável até o expect');
nulo(achadosDoEstado(NO_ESTADO('  await botao.click();', "  const gravado = await extensao.lerStorage(['pm_tema']);", '  await expect(botao).toBeVisible();')), 1,
  'a leitura guardada numa variável que nenhum expect usa');
nulo(achadosDoEstado(NO_ESTADO('  await botao.click();', "  expect(fakes.anki.requisicoes).toHaveLength(1);", "  expect(await extensao.frases()).toHaveLength(1);")), 0,
  'o pedido e, depois, o que ficou guardado');
nulo(achadosDoEstado(NO_ESTADO('  await botao.click();', '  await outro.click();', "  await estadoFinal(extensao, { pm_tema: 'claro' });")), 0, 'a conferência do helper depois da última ação');

// A exceção nomeada, para o que não guarda nada, e o spec de aparência, que a regra não olha.
acusa('e2e-estado-final', 'e2e/tests/painel-anki-baralhos.spec.js',
  `// Exceção de teste: sem-estado-guardado — a aba só muda o que a tela mostra.\n${SO_AS_FOTOS}`, 0, 'a exceção nomeada');
assert.strictEqual(regras['e2e-estado-final'].seAplica('e2e/tests/painel-anki-baralhos-visual.spec.js'), false);
total++;

// ─── contrato-fechado ────────────────────────────────────────────────────────

// 7996b48 (#190) painel-anki-baralhos.js: o pedido da Conexão com o caminho e o corpo montados à mão, que o contrato
// não tinha como conferir (o corpo de Atualizar tinha os dois Baralhos e o exemplo só o de Inglês).
acusa('contrato-fechado', 'painel-anki-baralhos.js', [
  '  async function pedirJson(caminho, corpo) {',
  '    const resposta = await fetch(`${ENDERECO_DA_CONEXAO}${caminho}`, {',
  "      method: 'POST',",
  "      headers: { 'Content-Type': 'application/json' },",
  '      body: JSON.stringify(corpo),',
  '    });',
  '    return resposta.json();',
  '  }',
].join('\n'), 1, 'o POST com o caminho numa variável (7996b48)');
// A saúde pedida por um fetch direto, que o contrato tem (conexao-anki.js antes do construtor): o conserto é o construtor.
const [saude] = acusa('contrato-fechado', 'lib/conexao-anki.js',
  "const resposta = await fetch(`${ENDERECO}/health`, { signal: AbortSignal.timeout(TEMPO_DA_RESPOSTA) });\n", 1, 'a saúde por fetch direto');
assert.match(saude.detalhe, /fetch direto a GET \/health, que o contrato tem: peça por PedidoAoAnki\.pedir/);
total++;
// Uma rota que o contrato não tem (as do bridge de hoje): a extensão não a pede antes do exemplo.
const [retomar] = acusa('contrato-fechado', 'painel-envio.js',
  "const resposta = await fetch(`${ENDERECO_DA_CONEXAO}/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });\n", 1, 'rota fora do contrato');
assert.match(retomar.detalhe, /POST \/jobs\/:id\/retry: a rota não tem exemplo no contrato/);
total++;
acusa('contrato-fechado', 'background.js', "await fetch('http://127.0.0.1:8766/anki/status');\n", 1, 'o endereço por extenso');
// O jeito certo, e o que não é da Conexão, passam.
acusa('contrato-fechado', 'painel-ajustes.js',
  'const resposta = await raiz.PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, raiz.PedidoAoAnki.baralhos());\n', 0, 'o construtor');
acusa('contrato-fechado', 'lib/sincronizacao.js', "const r = await fetch(`${URL_DO_FIRESTORE}/documents/frases`, { method: 'POST' });\n", 0, 'outro servidor');
acusa('contrato-fechado', 'background.js', "// fetch(`${BRIDGE_URL}/jobs`)\n", 0, 'um comentário');

// ─── testes-no-portao ────────────────────────────────────────────────────────

// Um repositório mínimo (só o que a regra lê: o cadastro, os arquivos e os workflows).
function repositorioDeTestes(arquivos) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-portao-'));
  execFileSync('git', ['init', '-q'], { cwd: pasta });
  for (const [arquivo, texto] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(pasta, arquivo)), { recursive: true });
    fs.writeFileSync(path.join(pasta, arquivo), texto);
  }
  return pasta;
}
function achadosDoPortao(arquivos, arquivo) {
  const pasta = repositorioDeTestes(arquivos);
  try {
    return regras['testes-no-portao'].verificar(arquivo, arquivos[arquivo], pasta);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
const CADASTRO = JSON.stringify({
  grupos: {
    node: { executor: 'node', arquivos: ['test_sync.js', 'test_fake_anki.js'] },
    complemento: { executor: 'unittest', pasta: 'complemento', padrao: 'test_*.py' },
  },
  fora: [{ arquivo: 'test_gemini.js', motivo: 'um script avulso, não um teste' }],
}, null, 2);
const TESTES = { 'test_sync.js': '', 'test_fake_anki.js': '', 'test_gemini.js': '', 'complemento/test_servidor.py': '' };
const CHAMA_TUDO = 'on:\n  pull_request:\njobs:\n  a:\n    steps:\n      - run: node scripts/testar.mjs node\n      - run: node scripts/testar.mjs complemento\n';
const comOPortao = (extra = {}) => ({ 'scripts/testes.json': CADASTRO, ...TESTES, '.github/workflows/testes.yml': CHAMA_TUDO, ...extra });
const achadosDe = (arquivos, arquivo) => achadosDoPortao(arquivos, arquivo);

// O jeito certo passa: todo teste num grupo (ou em `fora`), todo grupo num workflow de PR.
nulo(achadosDe(comOPortao(), 'scripts/testes.json'), 0, 'o cadastro em dia');
nulo(achadosDe(comOPortao(), '.github/workflows/testes.yml'), 0, 'o workflow que só chama o executor');
nulo(achadosDe(comOPortao(), 'test_gemini.js'), 0, 'um arquivo em `fora`, com o motivo');
nulo(achadosDe(comOPortao(), 'complemento/test_servidor.py'), 0, 'um teste descoberto pela pasta do grupo');

// #188 (0de5d66): os testes da divisão do CLAUDE.md existiam e o CI não os rodava.
nulo(achadosDe(comOPortao({ 'scripts/test_divisao_do_claude_md.mjs': '' }), 'scripts/test_divisao_do_claude_md.mjs'), 1,
  'um teste sem grupo (0de5d66)');
// Um teste novo na pasta do grupo de Python entra sozinho; um .mjs novo só entra cadastrado.
nulo(achadosDe(comOPortao({ 'complemento/test_novo.py': '' }), 'complemento/test_novo.py'), 0, 'um teste novo da pasta de um grupo');

// #185 (83fda05, o testes.yml de antes do complemento e do fake): os mesmos testes, rodados à mão no workflow.
const WORKFLOW_DO_83FDA05 = [
  'on:', '  pull_request:', 'jobs:', '  node:', '    steps:',
  '      - run: node test_auto_keyword.js', '      - run: node test_sync.js', '      - run: node test_empacotar.js',
  '  bridge:', '    steps:', '      - run: python -m unittest discover -s bridge -p "test_*.py"', '',
].join('\n');
const doWorkflow = nulo(achadosDe(comOPortao({ '.github/workflows/testes.yml': WORKFLOW_DO_83FDA05 }), '.github/workflows/testes.yml'), 4,
  'os testes rodados por fora do executor (83fda05)');
assert.match(doWorkflow[0].detalhe, /roda um teste por fora do executor.*node scripts\/testar\.mjs <grupo>/);
total++;
// O mesmo workflow, sem o job do complemento: o cadastro acusa o grupo que ninguém chama.
const semOComplemento = nulo(achadosDe(comOPortao({
  '.github/workflows/testes.yml': CHAMA_TUDO.replace('      - run: node scripts/testar.mjs complemento\n', ''),
}), 'scripts/testes.json'), 1, 'um grupo que nenhum workflow chama (o job do complemento que faltava)');
assert.match(semOComplemento[0].detalhe, /grupo complemento: nenhum workflow de PR chama `node scripts\/testar\.mjs complemento`/);
total++;
// Um workflow que não roda em PR não é portão.
nulo(achadosDe(comOPortao({ '.github/workflows/testes.yml': CHAMA_TUDO.replace('pull_request', 'workflow_dispatch') }), 'scripts/testes.json'), 2,
  'workflow que não roda em PR não conta');
// Um comentário não conta como chamada.
nulo(achadosDe(comOPortao({ '.github/workflows/testes.yml': 'on:\n  pull_request:\n# node scripts/testar.mjs node\n# node scripts/testar.mjs complemento\n' }), 'scripts/testes.json'), 2,
  'o comentário não chama grupo');
// Achados da revisão do #194: citar o comando não é executá-lo. O workflow é lido como YAML.
const JOB = (extra = '', passo = '      - run: node scripts/testar.mjs complemento\n') => `on:\n  pull_request:\njobs:\n  node:\n    steps:\n      - run: node scripts/testar.mjs node\n  complemento:\n${extra}    steps:\n${passo}`;
const semOComplementoNoPortao = (workflow, quantos, porque) => {
  const achados = achadosDe(comOPortao({ '.github/workflows/testes.yml': workflow }), 'scripts/testes.json');
  nulo(achados.filter(a => /grupo complemento/.test(a.detalhe)), quantos, porque);
};
semOComplementoNoPortao(JOB(), 0, 'o job que executa o grupo');
semOComplementoNoPortao(JOB('', '      - run: echo node scripts/testar.mjs complemento\n'), 1, 'um echo não executa o grupo');
semOComplementoNoPortao(JOB('    if: false\n'), 1, 'job com if: false');
semOComplementoNoPortao(JOB("    if: ${{ false }}\n"), 1, 'job com if: ${{ false }}');
semOComplementoNoPortao(JOB('', '      - if: false\n        run: node scripts/testar.mjs complemento\n'), 1, 'passo com if: false');
semOComplementoNoPortao(JOB('', "      - if: github.event_name == 'push'\n        run: node scripts/testar.mjs complemento\n"), 1, 'passo que só roda no push');
semOComplementoNoPortao(JOB('    continue-on-error: true\n'), 1, 'job que pode falhar sem barrar');
semOComplementoNoPortao(JOB('', '      - continue-on-error: true\n        run: node scripts/testar.mjs complemento\n'), 1, 'passo que pode falhar sem barrar');
semOComplementoNoPortao(JOB('', '      - run: node scripts/testar.mjs complemento || true\n'), 1, 'a falha engolida por || true');
semOComplementoNoPortao(JOB('', "      - if: github.event_name == 'pull_request'\n        run: node scripts/testar.mjs complemento\n"), 0, 'um if que vale no pull request');
semOComplementoNoPortao(JOB('', '      - run: |\n          echo preparando\n          node scripts/testar.mjs complemento\n'), 0, 'o comando numa linha de um bloco');
semOComplementoNoPortao(JOB('', '      - run: xvfb-run --auto-servernum node scripts/testar.mjs complemento -- --workers=1\n'), 0, 'o executor atrás do xvfb-run');
// E o workflow acusa a linha: o passo que cita o executor e não o executa.
const doEcho = nulo(achadosDe(comOPortao({ '.github/workflows/testes.yml': JOB('', '      - run: echo node scripts/testar.mjs complemento\n') }), '.github/workflows/testes.yml'), 1,
  'o passo que só cita o executor');
assert.match(doEcho[0].detalhe, /não executa o grupo \(só imprime, não executa\)/);
total++;
nulo(achadosDe(comOPortao({ '.github/workflows/testes.yml': JOB('    if: false\n') }), '.github/workflows/testes.yml'), 1, 'o job desligado que chama o executor');

// O cadastro que mente.
nulo(achadosDe(comOPortao({ 'scripts/testes.json': CADASTRO.replace('"test_gemini.js"', '"test_inexistente.js"') }), 'scripts/testes.json'), 1, 'fora com um arquivo que não existe');
nulo(achadosDe(comOPortao({ 'scripts/testes.json': CADASTRO.replace('um script avulso, não um teste', ' ') }), 'scripts/testes.json'), 1, 'fora sem motivo');
nulo(achadosDe(comOPortao({ 'scripts/testes.json': CADASTRO.replace('test_*.py', 'prova_*.py') }), 'scripts/testes.json'), 1, 'grupo cujo padrão não casa com nada');
nulo(achadosDe(comOPortao({ '.github/workflows/testes.yml': `${CHAMA_TUDO}      - run: node scripts/testar.mjs engine\n` }), '.github/workflows/testes.yml'), 1,
  'workflow que chama um grupo que o cadastro não tem');

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
assert.match(r.stdout, /ainda não tem a regra testes-no-portao/, 'uma regra que a base não tem entra com a primeira linha de base, dita no aviso');

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
