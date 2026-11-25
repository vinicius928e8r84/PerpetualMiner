'use strict';

const assert = require('assert');
const path = require('path');

const regra = require('./verificar').REGRAS.find(r => r.id === 'e2e-estado-final');
const RAIZ = path.resolve(__dirname, '..', '..');

const FORMAS_DE_TESTE = [
  {
    nome: 'a ação que mora numa função declarada do arquivo e nenhuma leitura',
    fonte: [
      'async function agir(page) {',
      '  await page.getByRole(\'button\').click();',
      '}',
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await agir(page);',
      '  await expect(page).toHaveURL(/x/);',
      '});',
    ].join('\n'),
    achados: [
      { linha: 4, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'a ação numa função de seta de corpo em expressão e a leitura depois',
    fonte: [
      'const agir = page => page.getByRole(\'button\').click();',
      'const ler = extensao => extensao.lerStorage([\'pm_tema\']);',
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await agir(page);',
      '  expect((await ler(extensao)).pm_tema).toBe(\'claro\');',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'a função que age chamando outra que age',
    fonte: [
      'function clicar(page) { return page.locator(\'a\').click(); }',
      'function agir(page) { return clicar(page); }',
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await agir(page);',
      '});',
    ].join('\n'),
    achados: [
      { linha: 3, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'a ação com a leitura de uma função sem corpo achável',
    fonte: [
      'function ler(extensao)',
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator("a").click();',
      '  expect(await extensao.frases()).toHaveLength(1);',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'duas ações e o título comprido',
    fonte: [
      'test(\'um título que passa de setenta caracteres para ser cortado no detalhe do achado do teste\', async ({ page }) => {',
      '  await page.locator(\'a\').click();',
      '  await page.locator(\'b\').fill(\'x\');',
      '});',
    ].join('\n'),
    achados: [
      { linha: 1, detalhe: 'o teste age (2 ação(ões)) e depois da última não lê e compara o que ficou guardado: “um título que passa de setenta caracteres para ser cortado no detalhe ”' },
    ],
  },
  {
    nome: 'test.only e título em crase',
    fonte: [
      'test.only(`com crase`, async ({ page }) => {',
      '  await page.locator(\'a\').check();',
      '});',
    ].join('\n'),
    achados: [
      { linha: 1, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “com crase”' },
    ],
  },
  {
    nome: 'o teste sem título literal',
    fonte: [
      'test(titulo, async ({ page }) => {',
      '  await page.locator(\'a\').check();',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'a marca dentro do corpo do teste',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  // Exceção de teste: sem-estado-guardado — só a aba muda.',
      '  await page.locator(\'a\').click();',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'a marca a três linhas acima, sem instrução entre elas',
    fonte: [
      '// Exceção de teste: sem-estado-guardado — um filtro.',
      '',
      '// outra nota',
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'a marca acima de uma instrução que termina em ponto e vírgula',
    fonte: [
      '// Exceção de teste: sem-estado-guardado — um filtro.',
      'const x = 1;',
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '});',
    ].join('\n'),
    achados: [
      { linha: 3, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'a marca a doze linhas acima do teste',
    fonte: [
      '// Exceção de teste: sem-estado-guardado — um filtro.',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'a marca depois de mais de doze linhas',
    fonte: [
      '// Exceção de teste: sem-estado-guardado — um filtro.',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      '// vazio',
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '});',
    ].join('\n'),
    achados: [
      { linha: 15, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'a leitura dentro de um if guardada numa variável',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '  if (precisa) {',
      '    const gravado = await extensao.lerStorage([\'pm_tema\']);',
      '    expect(gravado.pm_tema).toBe(\'claro\');',
      '  }',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'a leitura num else guardada numa variável que ninguém usa',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '  if (precisa) { await outro(); } else {',
      '    const gravado = await extensao.lerStorage([\'pm_tema\']);',
      '  }',
      '  expect(precisa).toBe(true);',
      '});',
    ].join('\n'),
    achados: [
      { linha: 1, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'o valor lido que passa por duas variáveis e a terceira sobrescrita',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '  const bruto = await extensao.lerStorage([\'pm_tema\']);',
      '  const tema = bruto.pm_tema; let outro = tema;',
      '  outro = \'x\';',
      '  expect(outro).toBe(\'x\');',
      '});',
    ].join('\n'),
    achados: [
      { linha: 1, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'o valor lido em desestruturação de lista',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '  const [primeiro] = await extensao.frases();',
      '  expect(primeiro).toBeTruthy();',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'o poll em função comum que devolve o valor lido depois do return',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '  await expect.poll(async function () {',
      '    return (await extensao.frases()).length;',
      '  }).toBe(1);',
      '});',
    ].join('\n'),
    achados: [
      { linha: 1, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'o poll com seta de bloco cujo return vem antes da leitura',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '  await expect.poll(async () => {',
      '    if (cedo) return 0;',
      '    const g = await extensao.frases();',
      '    return g.length;',
      '  }).toBe(1);',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'o poll com leitura que escapa por um return de outra variável',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '  await expect.poll(async () => {',
      '    const g = await extensao.frases();',
      '    return outra.length;',
      '  }).toBe(1);',
      '});',
    ].join('\n'),
    achados: [
      { linha: 1, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'o estadoFinalInalterado depois da última ação e antes dela',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await estadoFinalInalterado(extensao, [\'pm_tema\'], async () => { await botao.click(); });',
      '  await outro.click();',
      '});',
    ].join('\n'),
    achados: [
      { linha: 1, detalhe: 'o teste age (2 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'a leitura do fake marcado só conta com a marca',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '  expect(fakes.anki.itemInstalado()).toBe(true);',
      '});',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'um corpo de teste com chaves que não fecham',
    fonte: [
      'test(\'quebrado\', async ({ page }) => {',
      '  await page.locator(\'a\').click();',
      '',
    ].join('\n'),
    achados: [],
  },
  {
    nome: 'duas ações no mesmo teste com uma leitura entre elas',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await page.locator(\'a\').click();',
      '  expect(await extensao.frases()).toHaveLength(1);',
      '  await page.locator(\'b\').click();',
      '});',
    ].join('\n'),
    achados: [
      { linha: 1, detalhe: 'o teste age (2 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'a ação dentro de uma função de seta de um parâmetro sem parênteses',
    fonte: [
      'const agir = async page => { await page.locator(\'a\').click(); };',
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await agir(page);',
      '});',
    ].join('\n'),
    achados: [
      { linha: 2, detalhe: 'o teste age (1 ação(ões)) e depois da última não lê e compara o que ficou guardado: “titulo do teste”' },
    ],
  },
  {
    nome: 'o teste sem ação nenhuma',
    fonte: [
      'test(\'titulo do teste\', async ({ page, extensao, fakes }) => {',
      '  await expect(page).toHaveURL(/x/);',
      '});',
    ].join('\n'),
    achados: [],
  },
];

for (const { nome, fonte, achados } of FORMAS_DE_TESTE) {
  assert.deepStrictEqual(regra.verificar('e2e/tests/probe.spec.js', fonte, RAIZ), achados, nome);
}

console.log(`e2e-estado-final: ${FORMAS_DE_TESTE.length} formas de teste conferidas`);
