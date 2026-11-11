'use strict';

// Referência visual de Conectar este navegador ao Anki (#192, BRG-52): o aviso com Conectar, o card do código, o código errado, o código que venceu e a porta
// que não se confirmou, e o aviso no tema claro. Não há protótipo: o desenho segue os avisos do alto do Painel (como a versão da Conexão, BRG-50, e o teto do
// mês) e o card do teto (o campo e o botão numa linha). É PROPOSTA para o dono comparar e aprovar (CODING_STANDARDS regra 10): as imagens não estão na árvore.
// Aprovando: tirar o `fixme`, rodar
//
//   cd e2e && npx playwright test pareamento-visual --update-snapshots
//
// e anotar a aprovação em e2e/aprovados-visuais.json.

const { test, expect } = require('../fixtures');
const { AGORA, abrirPainel } = require('../apoio-do-envio');

test.use({ pareada: false });

const faixa = page => page.locator('#painel-pareamento');
const ilha = page => page.locator('.shell-conteudo');

test.beforeEach(async ({ page, extensao, fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
  fakes.anki.pareamento.sortearCodigo('K7M4PX');
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.setViewportSize({ width: 1280, height: 900 });
});

test.fixme('a parear: o aviso Conecte este navegador ao Anki, com Conectar', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#anki');
  await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('pareamento-conectar.png');
});

test.fixme('o código: o campo e Confirmar', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#anki');
  await faixa(page).getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('textbox', { name: 'Digite o código que apareceu no Anki' })).toBeFocused();
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('pareamento-codigo.png');
});

test.fixme('o código errado: quantas tentativas restam', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#anki');
  await faixa(page).getByRole('button', { name: 'Conectar' }).click();
  await page.getByRole('textbox', { name: 'Digite o código que apareceu no Anki' }).fill('AAA-AAA');
  await faixa(page).getByRole('button', { name: 'Confirmar' }).click();
  await expect(faixa(page)).toContainText('Código errado. Restam 4 tentativas');
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('pareamento-errado.png');
});

test.fixme('o código venceu: Peça outro, com Conectar', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#anki');
  await faixa(page).getByRole('button', { name: 'Conectar' }).click();
  fakes.anki.pareamento.vencerOCodigo();
  await page.getByRole('textbox', { name: 'Digite o código que apareceu no Anki' }).fill('K7M-4PX');
  await faixa(page).getByRole('button', { name: 'Confirmar' }).click();
  await expect(faixa(page)).toContainText('O código venceu. Peça outro');
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('pareamento-venceu.png');
});

test.describe('a porta que não se confirmou', () => {
  test.use({ pareada: true });

  test.fixme('o aviso Algo na porta do Anki não se confirmou, com Tentar de novo', async ({ page, extensao, context, fakes }) => {
    await context.route(fakes.anki.padrao, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).pathname === '/health' ? { ok: true, versao: '9.9.9', perfil: 'X' } : {}) }));
    await abrirPainel(page, extensao, '#anki');
    await expect(faixa(page)).toContainText('Algo na porta do Anki não se confirmou');
    await page.evaluate(() => document.fonts.ready);

    await expect(ilha(page)).toHaveScreenshot('pareamento-nao-confirmada.png');
  });
});

test.fixme('o aviso Conectar no tema claro', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrirPainel(page, extensao, '#anki');
  await expect(faixa(page)).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('pareamento-conectar-claro.png');
});
