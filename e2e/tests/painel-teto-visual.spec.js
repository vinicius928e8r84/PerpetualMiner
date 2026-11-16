'use strict';

const { test, expect } = require('../fixtures');
const { AGORA, INGLESAS, abrirPainel, cartoesDe, marcarEEnviar, enviosCriados, progresso } = require('../apoio-do-envio');

const ilha = page => page.locator('.shell-conteudo');

test.beforeEach(async ({ page, extensao, fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.setViewportSize({ width: 1280, height: 900 });
});

test.fixme('Custos com o teto do mês aos 80%: o aviso no alto e o card para ajustar', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 8.5 });
  await abrirPainel(page, extensao, '#anki/custos');
  await expect(page.locator('#painel-teto-aviso')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('teto-80.png');
});

test.fixme('Custos com o teto do mês chegado: o aviso de pausa', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 10 });
  await abrirPainel(page, extensao, '#anki/custos');
  await expect(page.locator('#painel-teto-aviso')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('teto-100.png');
});

test.fixme('Custos com o teto do mês no tema claro', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 8.5 });
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrirPainel(page, extensao, '#anki/custos');
  await expect(page.locator('#painel-teto-aviso')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('teto-claro.png');
});

test.fixme('o Envio pausado pelo teto do mês: o cartão com Ver Custos', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 10 });
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, INGLESAS.map(f => f.texto));
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', progress: { done: 3, total: 10 }, cartoes: cartoesDe(3), esperando: { reason: 'monthly_cap' } });
  await expect(progresso(page)).toContainText('Envio pausado: o teto do mês chegou', { timeout: 20_000 });

  await expect(progresso(page)).toHaveScreenshot('envio-no-teto.png');
});
