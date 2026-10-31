'use strict';

// Referência visual da aba Custos com o plano do ChatGPT (#159, BRG-40): o card acima da faixa de resumo (Cartões feitos,
// “Você economizou”, Gerenciar uso ↗). Não há protótipo para ele: o desenho segue o card das imagens da variante C
// (`docs/design/painel/anki/prototipo-anki.html?variant=C`). É PROPOSTA para o dono comparar e aprovar (CODING_STANDARDS regra 10):
// as imagens não estão na árvore. Aprovando: tirar o `fixme` e
//
//   cd e2e && npx playwright test painel-custos-plano-visual --update-snapshots

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');

const ENVIOS = [
  { jobId: 'job_a1', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 12, plano: { cartoes: 12, economia: 0.054 } },
  { jobId: 'job_b2', lang: 'ru', createdAt: '2026-09-18T09:00:00', status: 'completed', pedidas: 4, plano: { cartoes: 4, economia: 0.018 } },
];

const ilha = page => page.locator('.shell-conteudo');

async function abrirCustos(page, extensao, gravado = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('region', { name: 'Plano do ChatGPT' })).toBeVisible();
}

test.fixme('Custos com o plano: os Cartões feitos, Você economizou e Gerenciar uso', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
  await abrirCustos(page, extensao);

  await expect(ilha(page)).toHaveScreenshot('custos-plano.png');
});

test.fixme('Custos com o plano no tema claro', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
  await abrirCustos(page, extensao, { pm_tema: 'claro' });

  await expect(ilha(page)).toHaveScreenshot('custos-plano-claro.png');
});

test.fixme('Custos com o plano numa janela estreita', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
  await abrirCustos(page, extensao);
  await page.setViewportSize({ width: 560, height: 1100 });

  await expect(ilha(page)).toHaveScreenshot('custos-plano-estreita.png');
});
