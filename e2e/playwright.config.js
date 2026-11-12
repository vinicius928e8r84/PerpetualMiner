'use strict';

const { defineConfig } = require('@playwright/test');

// O navegador é lançado pelo fixture `context` (e2e/fixtures.js), porque a
// extensão só carrega num perfil persistente.
module.exports = defineConfig({
  testDir: './tests',
  // Só `*.spec.js`: é o que scripts/ci/fatias-e2e.js põe nas fatias do CI (o padrão do Playwright aceitaria também `*.test.js`).
  // Spec novo, renomeado ou apagado: `node scripts/ci/fatias-e2e.js --gerar`.
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No CI um teste que falha roda mais uma vez. Se passar, o Playwright o marca "flaky" e
  // `scripts/ci/instaveis.js` o lista no resumo do job (o relatório JSON); se cair de novo, é falha.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'test-results/relatorio.json' }]]
    : 'list',
});
