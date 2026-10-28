'use strict';

// Referência visual de Baralhos e termos e Vocabulário (#34), na
// arrumação C · Por idioma do protótipo travado
// (docs/design/painel/anki/prototipo-anki.html?variant=C, “⚙ Estados do
// protótipo”), com os números do protótipo. O dono revisa estas telas lado a
// lado com o protótipo; depois de aprovadas, uma mudança visual faz o teste
// falhar até alguém olhar e atualizar a referência:
//
//   cd e2e && npx playwright test painel-anki-baralhos-visual --update-snapshots

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');

const VOCABULARIO_EN = [
  { word: 'take for granted', type: 'term', maduros: 3, recentes: 1 },
  { word: 'reluctant', recentes: 2, novos: 1 },
  { word: 'close call', type: 'term', maduros: 1, novos: 1 },
  { word: 'cut corners', type: 'term', novos: 1 },
  { word: 'barely', maduros: 6 },
  { word: 'overwhelming', recentes: 2 },
  { word: 'get away with', type: 'term', maduros: 1, recentes: 1, novos: 1 },
  { word: 'stubborn', maduros: 4 },
];
const VOCABULARIO_RU = [
  { word: 'спасибо', maduros: 5 },
  { word: 'наверное', recentes: 3 },
  { word: 'как будто', type: 'term', maduros: 1, novos: 1 },
];

const baralhos = page => page.locator('.shell-aba[data-aba="baralhos"]');
const vocabulario = page => page.locator('.shell-aba[data-aba="vocabulario"]');
// A sidebar é a do shell, que tem a própria referência: aqui só a ilha da área.
const ilha = page => page.locator('.shell-conteudo');

test.beforeEach(({ fakes }) => {
  fakes.anki.definirBaralho('English Mining', { palavras: 3412, cartoes: 2140, termos: 1870, porCartao: 1.62, novos: 310, aprendendo: 20, recentes: 400, maduros: 1410 });
  fakes.anki.definirBaralho('RUSSIAN', { palavras: 612, cartoes: 480, termos: 455, porCartao: 1.27, novos: 120, aprendendo: 4, recentes: 140, maduros: 216 });
  fakes.anki.definirVocabulario('en', VOCABULARIO_EN);
  fakes.anki.definirVocabulario('ru', VOCABULARIO_RU);
});

async function abrirAnki(page, extensao, hash, { largura = 1280, gravado = {} } = {}) {
  await extensao.gravarStorage({
    pm_anki_ja_conectou: true,
    ankiBridgePresets: { en: { deckName: 'English Mining' }, ru: { deckName: 'RUSSIAN' } },
    ...gravado,
  });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1000 });
  await page.goto(extensao.url(`painel.html${hash}`));
  await page.evaluate(() => document.fonts.ready);
}

test('baralhos: azulejos, anel de maturidade e os números', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, '#anki/baralhos');
  await expect(baralhos(page).getByRole('img', { name: /de maturidade/ })).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('baralhos.png');
});

test('baralhos lidos do arquivo local (BRG-13) e o baralho que não existe (BRG-14)', async ({ page, extensao, fakes }) => {
  fakes.anki.lerBaralhosDoArquivo();
  await abrirAnki(page, extensao, '#anki/baralhos', { gravado: { ankiBridgePresets: { en: { deckName: 'CIMV' }, ru: { deckName: 'RUSSIAN' } } } });
  await expect(baralhos(page).getByRole('button', { name: 'Abrir Ajustes de envio' })).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('baralhos-local-e-sem-baralho.png');
});

test('baralhos que falham: BRG-11 com Tentar de novo', async ({ page, extensao, fakes }) => {
  fakes.anki.falharBaralhos({ status: 503 });
  await abrirAnki(page, extensao, '#anki/baralhos');
  await expect(baralhos(page).getByRole('alert')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('baralhos-erro.png');
});

test('vocabulário: azulejos, filtros, lista × detalhe', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, '#anki/vocabulario');
  await expect(vocabulario(page).getByRole('listbox').getByRole('option')).toHaveCount(8);

  await expect(ilha(page)).toHaveScreenshot('vocabulario.png');
});

test('vocabulário sem resultado: BRG-21 com Limpar busca', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, '#anki/vocabulario');
  await page.getByRole('searchbox', { name: 'Buscar no vocabulário' }).fill('zzz');
  await expect(vocabulario(page).locator('.veio-vazio')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('vocabulario-vazio.png');
});

test('vocabulário que falha: BRG-20 com Tentar de novo', async ({ page, extensao, fakes }) => {
  fakes.anki.falharVocabulario({ status: 503 });
  await abrirAnki(page, extensao, '#anki/vocabulario');
  await expect(vocabulario(page).getByRole('alert')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('vocabulario-erro.png');
});

test('vocabulário carregando: “Lendo o vocabulário…” e o esqueleto', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/anki/vocabulary', () => new Promise(() => {}));
  await abrirAnki(page, extensao, '#anki/vocabulario');
  await expect(vocabulario(page).getByText('Lendo o vocabulário…')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('vocabulario-carregando.png', { animations: 'disabled' });
});

test('desligada: o último vocabulário com o selo BRG-12', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao, '#anki/vocabulario');
  await expect(vocabulario(page).getByRole('listbox').getByRole('option')).toHaveCount(8);
  fakes.anki.desligar();
  await page.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600_000));
  await page.reload();
  await expect(vocabulario(page)).toContainText('Mostrando dados de há 2 h.');

  await expect(ilha(page)).toHaveScreenshot('vocabulario-desligada.png');
});

test('desligada, sem nenhuma leitura: “— esperando o Anki” em Baralhos e termos e em Vocabulário', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, '#anki/baralhos');
  await expect(baralhos(page)).toContainText('— esperando o Anki');
  await expect(ilha(page)).toHaveScreenshot('baralhos-esperando.png');

  await page.locator('label.veio-segmentado__opcao').filter({ hasText: /^Vocabulário$/ }).click();
  await expect(vocabulario(page)).toContainText('Começa depois que o Anki abrir uma vez.');
  await expect(ilha(page)).toHaveScreenshot('vocabulario-esperando.png');
});

test('janela estreita: baralhos e vocabulário numa coluna', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, '#anki/baralhos', { largura: 760 });
  await expect(baralhos(page).getByRole('img', { name: /de maturidade/ })).toBeVisible();
  await expect(page).toHaveScreenshot('baralhos-estreita.png', { fullPage: false });

  await page.locator('label.veio-segmentado__opcao').filter({ hasText: /^Vocabulário$/ }).click();
  await expect(vocabulario(page).getByRole('listbox').getByRole('option')).toHaveCount(8);
  await expect(page).toHaveScreenshot('vocabulario-estreita.png', { fullPage: false });
});

test('o tema claro', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, '#anki/baralhos', { gravado: { pm_tema: 'claro' } });
  await expect(baralhos(page).getByRole('img', { name: /de maturidade/ })).toBeVisible();
  await expect(ilha(page)).toHaveScreenshot('baralhos-claro.png');

  await page.locator('label.veio-segmentado__opcao').filter({ hasText: /^Vocabulário$/ }).click();
  await expect(vocabulario(page).getByRole('listbox').getByRole('option')).toHaveCount(8);
  await expect(ilha(page)).toHaveScreenshot('vocabulario-claro.png');
});
