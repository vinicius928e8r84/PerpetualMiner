'use strict';

// Referência visual do Estilo do cartão (#162), nos Ajustes de envio: o nível de cada idioma (Iniciante, Intermediário, Avançado), com o
// texto do nível. Não há protótipo desta seção: ela reusa o controle segmentado e as notas do campo Imagens (o
// protótipo aprovado dos Ajustes de envio, `docs/design/painel/anki/prototipo-ajustes-envio.html`), e o dono compara estas telas com ele.
// Desde o #164 cada card traz a prévia do Cartão do nível sob o controle (BRG-43); a mesma prévia está no passo do nível da Boas-vindas
// (`boas-vindas-nivel-visual.spec.js`). Todas são PROPOSTAS (`test.fixme`, sem PNG na árvore) até a aprovação dele (CODING_STANDARDS regra 10). Aprovando: tirar o `fixme` e
// `cd e2e && npx playwright test painel-ajustes-estilo-visual --update-snapshots`, e a entrada no livro `e2e/aprovados-visuais.json`.

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';
const ilha = page => page.locator('.shell-conteudo');
const estilo = page => page.getByRole('form', { name: /^Ajustes de envio · / }).getByRole('radiogroup', { name: 'Estilo do cartão' });

async function abrirOEstilo(page, extensao, { largura = 1280, gravado = {}, idioma = 'Inglês' } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  if (idioma !== 'Inglês') await page.locator('#ajustes-cards').getByRole('button', { name: idioma, exact: true }).click();
  await expect(estilo(page)).toBeVisible();
  await expect(page.locator('.shell-conteudo .previa:visible iframe').first().contentFrame().locator('.card')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('o inglês no Iniciante: os três níveis, o texto do nível', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao);

  await expect(ilha(page)).toHaveScreenshot('ajustes-estilo.png');
});

test('o inglês no Avançado, escolhido e ainda não salvo', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao);
  await estilo(page).locator('label', { hasText: 'Avançado' }).click();
  await expect(page.getByRole('status')).toHaveText('Alterações não salvas');

  await expect(ilha(page)).toHaveScreenshot('ajustes-estilo-avancado.png');
});

test('o inglês no Intermediário: a prévia muda com o nível, antes de salvar', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao);
  await estilo(page).locator('label', { hasText: 'Intermediário' }).click();
  await expect(page.locator('.shell-conteudo .previa:visible')).toContainText('Exemplo do Intermediário em inglês');
  await expect(page.locator('.shell-conteudo .previa:visible iframe').first().contentFrame().getByText('Desistir de fazer algo')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('ajustes-estilo-intermediario.png');
});

test('o russo, só com o Iniciante escolhível', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao, { idioma: 'Russo' });

  await expect(ilha(page)).toHaveScreenshot('ajustes-estilo-russo.png');
});

test('na janela estreita os níveis ficam legíveis', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOEstilo(page, extensao, { largura: 760 });

  await expect(page).toHaveScreenshot('ajustes-estilo-estreita.png', { fullPage: false });
});
