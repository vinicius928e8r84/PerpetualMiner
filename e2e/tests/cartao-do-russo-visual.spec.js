'use strict';

// Referência visual do Cartão do russo no Anki, um por nível (#163): a frente com as cores e o verso de cada nível. O Cartão não é uma tela da
// extensão: `docs/design/cartao-do-russo.html` é o que o renderizador do Anki de verdade devolve para a nota que a Conexão grava (a página diz
// como foi feita), e o dono compara estas imagens com o que o #138 pede (as 4 cores, o verso sem a Frase, as palavras da mesma raiz no Avançado).
// São PROPOSTAS (`test.fixme`, sem PNG na árvore) até a aprovação dele (CODING_STANDARDS regra 10). Aprovando: tirar o `fixme` e
// `cd e2e && npx playwright test cartao-do-russo-visual --update-snapshots`, e a entrada no livro `e2e/aprovados-visuais.json`.

const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('../fixtures');

const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';
const PAGINA = pathToFileURL(path.join(__dirname, '..', '..', 'docs', 'design', 'cartao-do-russo.html')).href;

async function abrirOCartao(page, nivel) {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(PAGINA);
  await page.evaluate(() => document.fonts.ready);
  return page.locator('section', { has: page.getByRole('heading', { name: nivel }) });
}

for (const [nivel, arquivo] of [['Iniciante', 'cartao-do-russo-iniciante.png'], ['Intermediário', 'cartao-do-russo-intermediario.png'], ['Avançado', 'cartao-do-russo-avancado.png']]) {
  test(`o Cartão do russo no ${nivel}: a frente e o verso`, async ({ page }) => {
    test.fixme(true, AGUARDA_O_DONO);
    await expect(await abrirOCartao(page, nivel)).toHaveScreenshot(arquivo);
  });
}
