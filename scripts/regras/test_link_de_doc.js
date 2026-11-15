'use strict';

// A prova da regra link-de-doc (scripts/regras/link-de-doc.js): acusa os erros reais que a fez existir e deixa passar
// o jeito certo, e o comando inteiro (verificar.js) falha dizendo qual arquivo e qual link consertar.

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { repositorioDeTestes } = require('./apoio-de-testes');

const regra = require('./verificar').REGRAS.find(r => r.id === 'link-de-doc');
let total = 0;

const alvos = {
  'docs/arquitetura.md': '# Arquitetura\n',
  'docs/design/painel/shell/README.md': '# Shell\n\n## Casos de borda\n',
  'docs/design/painel/boas-vindas/README.md': '# Boas-vindas\n\n## Conexão com o Anki: como ligar (F1)\n',
  'docs/design/popup/README.md': '# Popup\n',
  'docs/publicar-chrome-web-store.md': '# Loja\n\n## Justificativa de cada permissão\n',
  'docs/com-codigo.md': '# Tipos\n\n### IA dos cartões (`painel-ia.js`, `lib/chave-da-openai.js`)\n\n## `pm_envio` e a fila\n\n## O `Fila.mudar` portão\n\n```md\n## `no cerco`\n```\n',
  'docs/design/identidade-veio/README.md': '# Identidade\n\n## Movimento (da C)\n\n## Forma (da D)\n\n## Forma (da D)\n\n<a id="Explicita"></a>\n',
  'popup.js': '// popup\n',
  'docs/pasta/vazia.txt': 'x\n',
};
const raiz = repositorioDeTestes(alvos);
const achados = (arquivo, fonte) => regra.verificar(arquivo, fonte, raiz);
const acusa = (arquivo, fonte, quantas, porque) => {
  const a = achados(arquivo, fonte);
  assert.strictEqual(a.length, quantas, `${arquivo}: ${porque}\n${JSON.stringify(a, null, 2)}`);
  total++;
  return a;
};

// Os erros reais. fc1c5d05, docs/arquitetura.md (revisão do #446): links escritos a partir da raiz, num arquivo de docs/.
const doArquitetura = [
  'Edge cases: [shell](docs/design/painel/shell/README.md#casos-de-borda); the common retry: [Boas-vindas § F1](docs/design/painel/boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1).',
  'The user-visible rollover behavior is in [the popup spec](docs/design/popup/README.md).',
  '(for the `alarms` rationale, see [the store guide](docs/publicar-chrome-web-store.md#justificativa-de-cada-permissão); the unpacked-folder auto-reload also uses it)',
].join('\n');
const a = acusa('docs/arquitetura.md', doArquitetura, 4, 'os 4 links de docs/arquitetura.md no fc1c5d05');
assert.deepStrictEqual(a.map(x => x.linha), [1, 1, 2, 3]);
assert.match(a[0].detalhe, /\[shell\]\(docs\/design\/painel\/shell\/README\.md#casos-de-borda\).*docs\/docs\/design\/painel\/shell\/README\.md.*não existe.*conserte o link em docs\/arquitetura\.md/);
total += 2;
// Como o conserto os escreve: relativos à pasta do arquivo.
acusa('docs/arquitetura.md', doArquitetura.replaceAll('](docs/', ']('), 0, 'os mesmos links relativos a docs/');
// Hoje na main: `[Movimento](#movimento)` num arquivo cujo título é "Movimento (da C)".
const b = acusa('docs/design/identidade-veio/README.md', 'ver [Movimento](#movimento).\n\n## Movimento (da C)\n', 1, 'a âncora #movimento (identidade-veio/README.md:23)');
assert.match(b[0].detalhe, /âncora `#movimento`.*títulos parecidos: #movimento-da-c.*conserte o link em docs\/design\/identidade-veio\/README\.md/);
total++;
acusa('docs/design/identidade-veio/README.md', 'ver [Movimento](#movimento-da-c).\n\n## Movimento (da C)\n', 0, 'o título inteiro, como o GitHub o escreve');

// O que vale como link bom.
acusa('docs/x.md', [
  '[popup](../popup.js) [pasta](pasta/) [de novo](design/popup/README.md "título") [raiz](/popup.js)',
  '[forma](design/identidade-veio/README.md#forma-da-d) [forma 2](design/identidade-veio/README.md#forma-da-d-1)',
  '[explícita](design/identidade-veio/README.md#explicita) [linha](../popup.js#L1-L3) [consulta](../popup.js?plain=1#L2)',
  '![img](<../popup.js>) [com espaço](pasta/vazia.txt) [parênteses](../popup.js#L(1))',
  '[loja](https://example.com/x.md) [mail](mailto:a@b.c) [protocolo](//example.com/x) <https://example.com/nada.md>',
  '<a href="../popup.js">html</a> <img src="design/popup/README.md">',
  '[ancora no mesmo](#título-aqui)',
  '## Título aqui',
].join('\n'), 0, 'links que existem');
// O que não é link de verdade: código cercado, código em linha, definição de referência que existe.
acusa('docs/x.md', [
  '```md',
  '[exemplo](nao-existe.md)',
  '```',
  'escreva `[exemplo](nao-existe.md)` assim, e ``[outro](nao-existe.md)`` também',
  '~~~',
  '[exemplo](nao-existe.md#x)',
  '~~~',
  '[ref]: ../popup.js',
].join('\n'), 0, 'código não é link');

// Um clone do Windows (core.autocrlf=true) entrega o Markdown com CRLF: o título com `\r` no fim ainda é o título.
acusa('docs/x.md', '[a](design/identidade-veio/README.md#movimento-da-c) [b](#aqui)\r\n\r\n## Aqui\r\n', 0, 'CRLF');
acusa('docs/x.md', '[a](nao-existe.md)\r\n[b](#aqui)\r\n## Aqui\r\n', 1, 'CRLF com um erro na linha certa');
assert.strictEqual(achados('docs/x.md', '[a](nao-existe.md)\r\n[b](#aqui)\r\n## Aqui\r\n')[0].linha, 1);
// O alvo também chega com CRLF.
fs.writeFileSync(path.join(raiz, 'docs/crlf.md'), '# Topo\r\n\r\n## Título com CRLF\r\n');
acusa('docs/x.md', '[a](crlf.md#título-com-crlf) [b](crlf.md#nao-tem)\n', 1, 'destino com CRLF');
total++;

// Um título com código em linha: o GitHub tira só as crases e mantém o texto (achado M1 da revisão do #451).
acusa('docs/x.md', [
  '[IA](com-codigo.md#ia-dos-cartões-painel-iajs-libchave-da-openaijs) [fila](com-codigo.md#pm_envio-e-a-fila)',
  '[mudar](com-codigo.md#o-filamudar-portão) [no mesmo arquivo](#o-x-aqui)',
  '## O `x` aqui',
].join('\n'), 0, 'âncora de título com código em linha');
acusa('docs/x.md', '[a](com-codigo.md#o----portão) [b](com-codigo.md#no-cerco)\n', 2, 'o título com o código apagado e o título dentro de um bloco cercado não são âncoras');

// Os erros de cada forma.
acusa('docs/x.md', '[a](nao-existe.md)\n', 1, 'arquivo que não existe');
acusa('docs/x.md', '![a](assets/nao-existe.png)\n', 1, 'imagem que não existe');
acusa('docs/x.md', '[ref]: sumiu.md "título"\n', 1, 'definição de referência para arquivo que não existe');
acusa('docs/x.md', '<a href="sumiu.md">a</a>\n', 1, 'href de HTML');
acusa('docs/x.md', '[a](../../../fora.md)\n', 1, 'fora do repositório');
acusa('docs/x.md', '[a](design/popup/README.md#nao-tem)\n', 1, 'âncora que o destino não tem');
acusa('docs/x.md', '[a](design/identidade-veio/README.md#forma-da-d-2)\n', 1, 'terceira repetição que não existe');
acusa('docs/x.md', '[a](#nao-tem)\n# Tem\n', 1, 'âncora do mesmo arquivo que ele não tem');
acusa('docs/x.md', '[a](nao-existe.md) e [b](outro-que-sumiu.md)\n', 2, 'dois na mesma linha');
acusa('docs/x.md', '[a](../popup.js#qualquer) [b](pasta/vazia.txt#x)\n', 0, 'âncora em arquivo que não é Markdown não é conferida');
acusa('docs/x.md', 'Setext\n------\n[a](#setext) [b](#outro)\n', 1, 'título sublinhado');

// O comando inteiro, num repositório com a linha de base vazia: falha, e a mensagem diz o arquivo e o link.
const tmp = repositorioDeTestes({
  ...alvos,
  'docs/arquitetura.md': doArquitetura,
  'scripts/regras/linha-de-base.json': `${JSON.stringify({ 'link-de-doc': {} }, null, 2)}\n`,
});
const verificar = () => spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', tmp, '--base', 'HEAD'], { cwd: tmp, encoding: 'utf8' });
execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'x'], { cwd: tmp, stdio: 'pipe' });
let r = verificar();
assert.strictEqual(r.status, 1, r.stdout);
assert.match(r.stdout, /✗ link-de-doc — docs\/arquitetura\.md: 4 ocorrência\(s\)/);
assert.match(r.stdout, /docs\/arquitetura\.md:3: o link \[the store guide\]\(docs\/publicar-chrome-web-store\.md#justificativa-de-cada-permissão\)/);
assert.match(r.stdout, /Conserto: Aponte o link para o arquivo ou o título que existe hoje/);
fs.writeFileSync(path.join(tmp, 'docs/arquitetura.md'), doArquitetura.replaceAll('](docs/', ']('));
r = verificar();
assert.strictEqual(r.status, 0, r.stdout);
assert.match(r.stdout, /link-de-doc 0/);
total += 5;

console.log(`link-de-doc: ${total} provas passaram`);
