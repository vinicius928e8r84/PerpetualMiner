'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ehDaExtensao, PASTAS_DA_EXTENSAO, PASTAS_DE_RUNTIME } = require('../arquivos-do-pacote.js');
const regras = Object.fromEntries(require('../regras/verificar').REGRAS.map(regra => [regra.id, regra]));
const { selecionar } = require('./selecao-de-testes.js');
const { soDocumentacao } = require('./so-documentacao.js');

assert.deepStrictEqual(PASTAS_DA_EXTENSAO, ['lib', 'veio']);
assert.deepStrictEqual(PASTAS_DE_RUNTIME, ['lib', 'veio', 'conexao'], 'o pacote leva as pastas da extensão e o .ankiaddon de conexao/');

const casos = [
  ['background.js', true], ['painel.css', true], ['lib/historico.js', true], ['veio/icones/icone.svg', true],
  ['conexao/perpetualminer.ankiaddon', false], ['e2e/fixtures.js', false], ['scripts/testar.mjs', false], ['complemento/servidor.py', false],
];
for (const [caminho, esperado] of casos) assert.strictEqual(ehDaExtensao(caminho), esperado, caminho);

const jaConferidos = {
  'html-cru': ['background.js', 'lib/historico.js', 'veio/componentes.js'],
  'tokens-veio': ['painel.css', 'popup.html', 'veio/componentes.css', 'lib/historico.js'],
  'indice-de-arquivos': ['background.js', 'lib/historico.js', 'veio/tema.js', 'scripts/testar.mjs'],
};
const deFora = {
  'html-cru': ['testes/test_sync.js', 'e2e/fixtures.js', 'scripts/testar.mjs', 'conexao/x.js'],
  'tokens-veio': ['veio/tokens.css', 'e2e/tests/x.css', 'docs/design/x.html'],
  'indice-de-arquivos': ['testes/test_sync.js', 'lib/voz/catalogo.js', 'veio/fontes/manrope-latin.woff2', 'e2e/fixtures.js', 'AGENTS.md'],
};
for (const [id, arquivos] of Object.entries(jaConferidos)) {
  for (const arquivo of arquivos) assert.strictEqual(regras[id].seAplica(arquivo), true, `${id} confere ${arquivo}`);
}
for (const [id, arquivos] of Object.entries(deFora)) {
  for (const arquivo of arquivos) assert.strictEqual(regras[id].seAplica(arquivo), false, `${id} não confere ${arquivo}`);
}
assert.deepStrictEqual(selecionar(['lib/historico.js']), { e2e: true, complemento: false });
assert.deepStrictEqual(selecionar(['painel.js']), { e2e: true, complemento: false });

function funcoesAcusadasNumEvaluate(arquivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pastas-'));
  const nomes = arquivos.map((arquivo, i) => {
    fs.mkdirSync(path.dirname(path.join(raiz, arquivo)), { recursive: true });
    fs.writeFileSync(path.join(raiz, arquivo), `function funcao${i}() {}\n`);
    return `funcao${i}`;
  });
  const spec = nomes.map(nome => `await page.evaluate(() => ${nome}());`).join('\n');
  const achados = regras['e2e-funcao-interna'].verificar('e2e/tests/x.spec.js', spec, raiz);
  fs.rmSync(raiz, { recursive: true, force: true });
  return achados.map(achado => arquivos[achado.linha - 1]);
}
assert.deepStrictEqual(
  funcoesAcusadasNumEvaluate(['background.js', 'lib/historico.js', 'lib/voz/textos.js', 'veio/tema.js', 'testes/test_sync.js', 'e2e/fixtures.js', 'conexao/x.js']),
  ['background.js', 'lib/historico.js', 'lib/voz/textos.js', 'veio/tema.js'],
  'e2e-funcao-interna conhece as funções da raiz e das pastas da extensão, com as subpastas');
assert.deepStrictEqual(soDocumentacao(['lib/LEIA-ME.md']), false);
assert.deepStrictEqual(soDocumentacao(['conexao/LEIA-ME.md']), false);
assert.deepStrictEqual(soDocumentacao(['LEIA-ME.md']), true);

const quemConferePainel = () => ({
  'html-cru': regras['html-cru'].seAplica('painel/painel.js'),
  'gravacao-de-frases': regras['gravacao-de-frases'].seAplica('painel/painel.js'),
  'tokens-veio no js': regras['tokens-veio'].seAplica('painel/painel.js'),
  'tokens-veio no css': regras['tokens-veio'].seAplica('painel/painel.css'),
  'indice-de-arquivos': regras['indice-de-arquivos'].seAplica('painel/painel.js'),
  'só o e2e no CI': !selecionar(['painel/painel.js']).complemento,
  'e2e-funcao-interna': funcoesAcusadasNumEvaluate(['painel/painel.js']).length === 1,
  'um .md da pasta não é só documentação': !soDocumentacao(['painel/LEIA-ME.md']),
});
const todas = valor => Object.fromEntries(Object.keys(quemConferePainel()).map(chave => [chave, valor]));

assert.deepStrictEqual(quemConferePainel(), todas(false), 'painel/ fora de PASTAS_DA_EXTENSAO: nenhuma ferramenta a trata como extensão');
PASTAS_DA_EXTENSAO.push('painel');
PASTAS_DE_RUNTIME.push('painel');
try {
  assert.deepStrictEqual(quemConferePainel(), todas(true),
    'uma pasta que entra em PASTAS_DA_EXTENSAO passa a ser conferida sem outra lista para editar');
  assert.strictEqual(regras['html-cru'].verificar('painel/painel.js', "el.innerHTML = '<b>oi</b>';\n", process.cwd()).length, 1);
} finally {
  PASTAS_DA_EXTENSAO.pop();
  PASTAS_DE_RUNTIME.pop();
}
assert.deepStrictEqual(PASTAS_DA_EXTENSAO, ['lib', 'veio']);
assert.deepStrictEqual(PASTAS_DE_RUNTIME, ['lib', 'veio', 'conexao']);

console.log('ok: uma pasta só em PASTAS_DA_EXTENSAO (scripts/arquivos-do-pacote.js) liga as regras, o índice e a seleção do CI');
