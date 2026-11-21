'use strict';

const assert = require('assert');
const { ErroDeEntrada, lerConfiguracaoDoTexto, lerLinhaDeBaseDoTexto, mensagemDeEntradaInvalida } = require('./entrada-do-gancho.js');

const CONFIGURACAO = {
  limiteDeBytes: 20000, linhaDeBase: 'b.json', linhasDoCabecalho: 5, marcasDeGerado: ['@generated'], ignorar: [{ glob: '*.lock', motivo: 'trava' }],
};
const textoDe = valor => JSON.stringify(valor, null, 2);
const comCampo = (campo, valor) => textoDe({ ...CONFIGURACAO, [campo]: valor });

function erroDe(ler) {
  try {
    ler();
  } catch (erro) {
    assert.ok(erro instanceof ErroDeEntrada && erro instanceof Error, String(erro));
    assert.strictEqual(erro.name, 'ErroDeEntrada');
    return { message: erro.message, detalhe: erro.detalhe };
  }
  return assert.fail('não lançou ErroDeEntrada');
}

const LOCAIS_DO_ERRO = [
  [[], '✗ a.json: ruim', 'ruim'],
  [[3], '✗ a.json, linha 3: ruim', 'ruim (linha 3)'],
  [[3, true], '✗ a.json, perto da linha 3: ruim', 'ruim (perto da linha 3)'],
  [[null, true], '✗ a.json: ruim', 'ruim'],
  [[0], '✗ a.json: ruim', 'ruim'],
];
function confereOLocalNoErro([local, message, detalhe]) {
  assert.deepStrictEqual(erroDe(() => { throw new ErroDeEntrada('a.json', 'ruim', ...local); }), { message, detalhe }, JSON.stringify(local));
}
LOCAIS_DO_ERRO.forEach(confereOLocalNoErro);

const CAMPOS_INVALIDOS = [
  ['limiteDeBytes', '20000', 2, 'um número de bytes maior que zero'],
  ['limiteDeBytes', 0, 2, 'um número de bytes maior que zero'],
  ['limiteDeBytes', -5, 2, 'um número de bytes maior que zero'],
  ['linhaDeBase', '', 3, 'o caminho da linha de base'],
  ['linhaDeBase', 3, 3, 'o caminho da linha de base'],
  ['linhasDoCabecalho', 1.5, 4, 'um número inteiro de linhas'],
  ['linhasDoCabecalho', -1, 4, 'um número inteiro de linhas'],
  ['marcasDeGerado', [1], 5, 'uma lista de textos'],
  ['marcasDeGerado', 'x', 5, 'uma lista de textos'],
  ['ignorar', [{ glob: 'a' }], 8, 'uma lista de { glob, motivo }'],
  ['ignorar', [{ glob: 'a', motivo: 1 }], 8, 'uma lista de { glob, motivo }'],
  ['ignorar', [null], 8, 'uma lista de { glob, motivo }'],
  ['ignorar', {}, 8, 'uma lista de { glob, motivo }'],
  ['bytesPorToken', 0, 14, 'um número maior que zero'],
  ['bytesPorToken', -1, 14, 'um número maior que zero'],
  ['bytesPorToken', '4', 14, 'um número maior que zero'],
  ['bytesPorToken', null, 14, 'um número maior que zero'],
];
function confereOCampoInvalido([campo, valor, linha, esperado]) {
  const detalhe = `"${campo}" tem de ser ${esperado}`;
  assert.deepStrictEqual(erroDe(() => lerConfiguracaoDoTexto(comCampo(campo, valor), 'c.json')),
    { message: `✗ c.json, linha ${linha}: ${detalhe}`, detalhe: `${detalhe} (linha ${linha})` }, `${campo} = ${JSON.stringify(valor)}`);
}
CAMPOS_INVALIDOS.forEach(confereOCampoInvalido);

const CONFIGURACOES_VALIDAS = [CONFIGURACAO, { ...CONFIGURACAO, bytesPorToken: 4 }, { ...CONFIGURACAO, bytesPorToken: 0.5 },
  { ...CONFIGURACAO, linhasDoCabecalho: 0, marcasDeGerado: [], ignorar: [] }];
CONFIGURACOES_VALIDAS.forEach(config => assert.deepStrictEqual(lerConfiguracaoDoTexto(textoDe(config), 'c.json'), config));

const CONFIGURACOES_QUE_NAO_SAO_OBJETO = ['[]', 'null', '"x"', '5'];
function confereAConfiguracaoQueNaoEObjeto(texto) {
  assert.deepStrictEqual(erroDe(() => lerConfiguracaoDoTexto(texto, 'c.json')),
    { message: '✗ c.json, linha 1: esperava um objeto de configuração', detalhe: 'esperava um objeto de configuração (linha 1)' }, texto);
}
CONFIGURACOES_QUE_NAO_SAO_OBJETO.forEach(confereAConfiguracaoQueNaoEObjeto);

const tresCamposInvalidos = textoDe({ bytesPorToken: 0, ...CONFIGURACAO, ignorar: {}, linhaDeBase: '' });
assert.strictEqual(erroDe(() => lerConfiguracaoDoTexto(tresCamposInvalidos, 'c.json')).detalhe, '"linhaDeBase" tem de ser o caminho da linha de base (linha 4)');
const soBytesPorTokenInvalido = textoDe({ bytesPorToken: 0, ...CONFIGURACAO, limiteDeBytes: 1 });
assert.strictEqual(erroDe(() => lerConfiguracaoDoTexto(soBytesPorTokenInvalido, 'c.json')).detalhe, '"bytesPorToken" tem de ser um número maior que zero (linha 2)');

const LINHAS_DE_BASE_VALIDAS = [['{}', {}], ['{"arquivos": {}}', {}], ['{"arquivos": {"a.js": 0, "b.js": 30000}}', { 'a.js': 0, 'b.js': 30000 }]];
LINHAS_DE_BASE_VALIDAS.forEach(([texto, arquivos]) => assert.deepStrictEqual(lerLinhaDeBaseDoTexto(texto, 'b.json'), arquivos, texto));

const LINHAS_DE_BASE_INVALIDAS = [
  ['null', 'esperava um objeto com a chave "arquivos" (linha 1)'],
  ['[]', 'esperava um objeto com a chave "arquivos" (linha 1)'],
  ['{"arquivos": []}', '"arquivos" tem de ser um objeto { caminho: bytes } (linha 1)'],
  ['{\n  "x": 1,\n  "arquivos": null\n}', '"arquivos" tem de ser um objeto { caminho: bytes } (linha 3)'],
  ['{\n  "arquivos": {\n    "a.js": "1"\n  }\n}', 'o tamanho de "a.js" tem de ser um número de bytes (achou "1") (linha 3)'],
  ['{"arquivos": {"a.js": 1, "b.js": -1}}', 'o tamanho de "b.js" tem de ser um número de bytes (achou -1) (linha 1)'],
  ['{\n  "arquivos": {\n    "a.js": -1,\n    "b.js": "x"\n  }\n}', 'o tamanho de "a.js" tem de ser um número de bytes (achou -1) (linha 3)'],
  ['{\n  "arquivos": {\n    "a.js": 1,\n    "b.js": null\n  }\n}', 'o tamanho de "b.js" tem de ser um número de bytes (achou null) (linha 4)'],
];
function confereALinhaDeBaseInvalida([texto, detalhe]) {
  const linha = /\(linha (\d+)\)$/.exec(detalhe)[1];
  assert.deepStrictEqual(erroDe(() => lerLinhaDeBaseDoTexto(texto, 'b.json')),
    { message: `✗ b.json, linha ${linha}: ${detalhe.replace(/ \(linha \d+\)$/, '')}`, detalhe }, texto);
}
LINHAS_DE_BASE_INVALIDAS.forEach(confereALinhaDeBaseInvalida);

const JSONS_QUEBRADOS = [
  ['{\n  "arquivos": {\n    "a.js": 30000,\n  }\n}\n', / \(linha 4\)$/],
  ['{\n "a": 1\n "b": 2}', / \(linha 3\)$/],
  ['{"a":1}\n\n{', / \(linha 3\)$/],
  ['{\n  "a": 1,\n  "b": x\n}', / \(perto da linha 2\)$/],
  ['abc', / \(perto da linha 1\)$/],
  ['\n\n  nada', / \(perto da linha 1\)$/],
  ['undefined', /is not valid JSON\)$/],
  ['', /end of JSON input\)$/],
];
function confereOJsonQuebrado([texto, fim]) {
  const { detalhe } = erroDe(() => lerLinhaDeBaseDoTexto(texto, 'b.json'));
  assert.ok(detalhe.startsWith('não é um JSON válido (') && fim.test(detalhe), detalhe);
  assert.strictEqual(erroDe(() => lerConfiguracaoDoTexto(texto, 'c.json')).detalhe, detalhe);
}
JSONS_QUEBRADOS.forEach(confereOJsonQuebrado);

assert.strictEqual(mensagemDeEntradaInvalida(new ErroDeEntrada('x.json', 'ruim', 2)),
  'Commit barrado: a conferência de tamanho não pôde ler o que precisa.\n\n✗ x.json, linha 2: ruim\n\n'
  + 'Corrija o arquivo (e dê `git add` nele, se for a linha de base) ou restaure o do último commit: '
  + '`git restore --source=HEAD --staged --worktree -- <arquivo>`.\n');

console.log('entrada do gancho ok');
