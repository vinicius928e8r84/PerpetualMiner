'use strict';

// O que as referências visuais de Configurações (configuracoes-*visual.spec.js) repetem: os dados do protótipo e abrir a área.

const { expect } = require('@playwright/test');

const AGORA = new Date('2026-09-18T12:00:00');
const TOTAL_DO_PROTOTIPO = 1284;

const FRASES_DO_PROTOTIPO = Array.from({ length: TOTAL_DO_PROTOTIPO }, (_, i) => ({
  id: 1_700_000_000_000 + (TOTAL_DO_PROTOTIPO - i),
  texto: `Sentence number ${TOTAL_DO_PROTOTIPO - i} about the harbour.`,
  data: AGORA.toLocaleDateString('pt-BR'),
  streaming: 'netflix',
  idioma: 'Inglês',
}));

/**
 * As frases, a chave do Gemini e o atalho de seleção do protótipo. Com a conta,
 * as frases já estão na nuvem, então abrir o painel não vira uma primeira subida.
 */
async function semearComoNoPrototipo(extensao, fakes, uid = null) {
  await extensao.gravarStorage({
    frases: FRASES_DO_PROTOTIPO,
    geminiApiKey: 'AIzaSyD4kQ7wL2mXe9pRtB8nVfH0cJ3kQ9',
    pm_atalho: { type: 'mouse', button: 3, code: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Mouse Back' },
  });
  if (uid) fakes.google.gravarFrases(uid, FRASES_DO_PROTOTIPO);
}

async function abrirConfiguracoes(page, extensao, endereco, largura = 1280, altura = 800) {
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: altura });
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await expect(page.locator('#cfg-perigo-resumo')).toHaveText('1.284 frases', { timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
}

module.exports = { AGORA, FRASES_DO_PROTOTIPO, semearComoNoPrototipo, abrirConfiguracoes };
