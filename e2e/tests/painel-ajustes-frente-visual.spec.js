'use strict';

// Referência visual da Frente do Cartão (#166), nos Ajustes de envio › Estilo do cartão: Frase com áudio, Ouvir primeiro e Lacuna, cada uma com o
// texto dela, e o aviso de quando a Conexão não trocou a frente. Não há protótipo desta seção: ela reusa o controle segmentado do Estilo do cartão
// (#162) e as notas do campo Imagens (o protótipo aprovado dos Ajustes de envio, `docs/design/painel/anki/prototipo-ajustes-envio.html`), e o dono
// compara estas telas com ele. Todas são PROPOSTAS (`test.fixme`, sem PNG na árvore) até a aprovação dele (CODING_STANDARDS regra 10). Aprovando:
// tirar o `fixme` e `cd e2e && npx playwright test painel-ajustes-frente-visual --update-snapshots`, e a entrada no livro `e2e/aprovados-visuais.json`.

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';
const ilha = page => page.locator('.shell-conteudo');
const frente = page => page.getByRole('form', { name: /^Ajustes de envio · / }).getByRole('radiogroup', { name: 'Frente' });
const escolher = (page, nome) => frente(page).locator('label', { hasText: nome }).click();

async function abrirAFrente(page, extensao, { largura = 1280, idioma = 'Inglês' } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  if (idioma !== 'Inglês') await page.locator('#ajustes-cards').getByRole('button', { name: idioma, exact: true }).click();
  await expect(frente(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('o inglês na Frase com áudio, a frente padrão', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirAFrente(page, extensao);

  await expect(ilha(page)).toHaveScreenshot('ajustes-frente.png');
});

test('o inglês no Ouvir primeiro, escolhido e ainda não salvo', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirAFrente(page, extensao);
  await escolher(page, 'Ouvir primeiro');
  await expect(page.getByRole('status')).toHaveText('Alterações não salvas');

  await expect(ilha(page)).toHaveScreenshot('ajustes-frente-ouvir-primeiro.png');
});

test('o inglês na Lacuna, escolhida e ainda não salva', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirAFrente(page, extensao);
  await escolher(page, 'Lacuna');
  await expect(page.getByRole('status')).toHaveText('Alterações não salvas');

  await expect(ilha(page)).toHaveScreenshot('ajustes-frente-lacuna.png');
});

test('o russo tem a frente dele: Ouvir primeiro no russo, enquanto o inglês fica como está', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirAFrente(page, extensao, { idioma: 'Russo' });
  await escolher(page, 'Ouvir primeiro');

  await expect(ilha(page)).toHaveScreenshot('ajustes-frente-russo.png');
});

test('a Conexão desligada: o resto foi salvo, a frente não mudou e a tela oferece tentar de novo', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirAFrente(page, extensao);
  fakes.anki.desligar();
  await escolher(page, 'Lacuna');
  await page.getByRole('button', { name: 'Salvar ajustes' }).click();
  await expect(page.locator('#ajustes-aviso')).toContainText('a frente não mudou');

  await expect(ilha(page)).toHaveScreenshot('ajustes-frente-conexao-desligada.png');
});

test('na janela estreita as três frentes ficam legíveis', async ({ page, extensao }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirAFrente(page, extensao, { largura: 760 });

  await expect(page).toHaveScreenshot('ajustes-frente-estreita.png', { fullPage: false });
});
