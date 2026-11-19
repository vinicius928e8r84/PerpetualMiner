'use strict';

const assert = require('assert');

const { ehDaExtensao, PASTAS_DA_EXTENSAO, PASTAS_DE_RUNTIME } = require('../arquivos-do-pacote.js');
const regras = Object.fromEntries(require('../regras/verificar').REGRAS.map(regra => [regra.id, regra]));
const { selecionar } = require('./selecao-de-testes.js');

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
  'html-cru': ['test_sync.js', 'e2e/fixtures.js', 'scripts/testar.mjs', 'conexao/x.js'],
  'tokens-veio': ['veio/tokens.css', 'e2e/tests/x.css', 'docs/design/x.html'],
  'indice-de-arquivos': ['test_sync.js', 'lib/voz/catalogo.js', 'veio/fontes/manrope-latin.woff2', 'e2e/fixtures.js', 'AGENTS.md'],
};
for (const [id, arquivos] of Object.entries(jaConferidos)) {
  for (const arquivo of arquivos) assert.strictEqual(regras[id].seAplica(arquivo), true, `${id} confere ${arquivo}`);
}
for (const [id, arquivos] of Object.entries(deFora)) {
  for (const arquivo of arquivos) assert.strictEqual(regras[id].seAplica(arquivo), false, `${id} não confere ${arquivo}`);
}
assert.deepStrictEqual(selecionar(['lib/historico.js']), { e2e: true, complemento: false });
assert.deepStrictEqual(selecionar(['painel.js']), { e2e: true, complemento: false });

const quemConferePainel = () => ({
  'html-cru': regras['html-cru'].seAplica('painel/painel.js'),
  'gravacao-de-frases': regras['gravacao-de-frases'].seAplica('painel/painel.js'),
  'tokens-veio no js': regras['tokens-veio'].seAplica('painel/painel.js'),
  'tokens-veio no css': regras['tokens-veio'].seAplica('painel/painel.css'),
  'indice-de-arquivos': regras['indice-de-arquivos'].seAplica('painel/painel.js'),
  'só o e2e no CI': !selecionar(['painel/painel.js']).complemento,
});
const todas = valor => Object.fromEntries(Object.keys(quemConferePainel()).map(chave => [chave, valor]));

assert.deepStrictEqual(quemConferePainel(), todas(false), 'painel/ fora de PASTAS_DA_EXTENSAO: nenhuma ferramenta a trata como extensão');
PASTAS_DA_EXTENSAO.push('painel');
try {
  assert.deepStrictEqual(quemConferePainel(), todas(true),
    'uma pasta que entra em PASTAS_DA_EXTENSAO passa a ser conferida sem outra lista para editar');
  assert.strictEqual(regras['html-cru'].verificar('painel/painel.js', "el.innerHTML = '<b>oi</b>';\n", process.cwd()).length, 1);
} finally {
  PASTAS_DA_EXTENSAO.pop();
}
assert.deepStrictEqual(PASTAS_DA_EXTENSAO, ['lib', 'veio']);

console.log('ok: uma pasta só em PASTAS_DA_EXTENSAO (scripts/arquivos-do-pacote.js) liga as regras, o índice e a seleção do CI');
