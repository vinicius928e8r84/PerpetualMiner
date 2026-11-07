'use strict';

// Referência visual da aba Custos com a correção das frases da Criação (#169, BRG-29): a linha “Correção das frases” na faixa de
// resumo e no detalhe do Envio. Não há protótipo para ela: segue as linhas de custo da variante C (`docs/design/painel/anki/prototipo-anki.html?variant=C`).
// É PROPOSTA para o dono comparar e aprovar (CODING_STANDARDS regra 10): as imagens não estão na árvore. Aprovando: tirar o `fixme` e
//
//   cd e2e && npx playwright test painel-custos-correcao-visual --update-snapshots

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');

const ENVIOS = [
  { jobId: 'job_a1', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 5, custos: { cartoes: 0.081, correcao: 0.03 } },
];

const ilha = page => page.locator('.shell-conteudo');

async function abrirCustos(page, extensao, gravado = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('listbox', { name: 'Envios recentes' }).getByRole('option', { name: /Envio em inglês/ }).click();
  await expect(page.getByRole('region', { name: 'Envio em inglês · 5 frases' })).toContainText('Correção das frases');
}

test.fixme('Custos com a correção das frases na faixa de resumo e no detalhe do Envio', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
  await abrirCustos(page, extensao);

  await expect(ilha(page)).toHaveScreenshot('custos-correcao.png');
});

test.fixme('Custos com a correção no tema claro', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
  await abrirCustos(page, extensao, { pm_tema: 'claro' });

  await expect(ilha(page)).toHaveScreenshot('custos-correcao-claro.png');
});

test.fixme('Custos com a correção numa janela estreita', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
  await abrirCustos(page, extensao);
  await page.setViewportSize({ width: 560, height: 1100 });

  await expect(ilha(page)).toHaveScreenshot('custos-correcao-estreita.png');
});
