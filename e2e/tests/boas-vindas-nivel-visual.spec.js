'use strict';

// Referência visual do passo do nível do cartão da Boas-vindas (#164, ONB-20): o controle do nível de cada idioma ligado com a prévia do Cartão,
// e “Mais estilos em Ajustes de envio”. Não há protótipo deste passo: ele reusa o card de passo e o controle segmentado do protótipo aprovado da
// Boas-vindas (`docs/design/painel/boas-vindas/prototipo-onboarding.html`) e a prévia de Ajustes de envio, e o dono compara estas telas com ele.
// Todas são PROPOSTAS (`test.fixme`, sem PNG na árvore) até a aprovação dele (CODING_STANDARDS regra 10). Aprovando: tirar o `fixme` e
// `cd e2e && npx playwright test boas-vindas-nivel-visual --update-snapshots`, e a entrada no livro `e2e/aprovados-visuais.json`.

const { test, expect } = require('../fixtures');

const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';
const SO_O_INGLES = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } };
const OS_DOIS = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } };
const NENHUM = { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } };

async function abrir(page, extensao, { automatica = SO_O_INGLES, largura = 1100, tema, gravado = {} } = {}) {
  await extensao.gravarStorage({ pm_auto_miner_settings: automatica, ...(tema && { pm_tema: tema }), ...gravado });
  await page.setViewportSize({ width: largura, height: 900 });
  await page.goto(extensao.url('painel.html#boas-vindas/nivel'));
  await expect(page.locator('.bv-card h2')).toHaveText('Escolher o nível do cartão');
  await page.evaluate(() => document.fonts.ready);
}

const cartoes = page => page.locator('.bv-card .previa iframe');
async function esperarOsCartoes(page, quantos) {
  await expect(cartoes(page)).toHaveCount(quantos);
  for (let i = 0; i < quantos; i++) await expect(cartoes(page).nth(i).contentFrame().locator('.card')).toBeVisible();
}

test('o passo do nível com o inglês no Iniciante: o controle, o texto e a prévia do Cartão', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao);
  await esperarOsCartoes(page, 1);

  await expect(page).toHaveScreenshot('nivel-ingles-iniciante.png', { fullPage: true, animations: 'disabled' });
});

test('o passo do nível com os dois idiomas ligados e o inglês no Avançado', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, { automatica: OS_DOIS });
  await page.locator('.bv-card').getByRole('group', { name: 'Inglês' }).locator('label', { hasText: 'Avançado' }).click();
  await esperarOsCartoes(page, 2);

  await expect(page).toHaveScreenshot('nivel-dois-idiomas.png', { fullPage: true, animations: 'disabled' });
});

test('a prévia na Frente do Cartão', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao);
  await esperarOsCartoes(page, 1);
  await page.locator('.bv-card .previa label', { hasText: 'Frente' }).click();

  await expect(page).toHaveScreenshot('nivel-frente.png', { fullPage: true, animations: 'disabled' });
});

test('sem idioma ligado: o passo diz onde ligar', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, { automatica: NENHUM });

  await expect(page).toHaveScreenshot('nivel-sem-idioma.png', { fullPage: true, animations: 'disabled' });
});

test('a prévia quando a Conexão com o Anki não responde', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  fakes.anki.desligar();
  await abrir(page, extensao);
  await expect(page.locator('.bv-card .previa')).toContainText('A prévia aparece com a Conexão com o Anki ligada.');

  await expect(page).toHaveScreenshot('nivel-sem-conexao.png', { fullPage: true, animations: 'disabled' });
});

test('a janela estreita empilha a lista sobre o card, com a prévia inteira', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, { largura: 520 });
  await esperarOsCartoes(page, 1);

  await expect(page).toHaveScreenshot('nivel-estreita.png', { fullPage: true, animations: 'disabled' });
});

test('o tema claro', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, { tema: 'claro' });
  await esperarOsCartoes(page, 1);

  await expect(page).toHaveScreenshot('nivel-claro.png', { fullPage: true, animations: 'disabled' });
});
