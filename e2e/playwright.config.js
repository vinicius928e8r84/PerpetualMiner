'use strict';

const { defineConfig } = require('@playwright/test');

// O navegador é lançado pelo fixture `context` (e2e/fixtures.js), porque a
// extensão só carrega num perfil persistente.
module.exports = defineConfig({
  testDir: './tests',
  // Só `*.spec.js`: é o que scripts/ci/fatias-e2e.js põe nas fatias do CI (o padrão do Playwright aceitaria também `*.test.js`).
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'test-results/relatorio.json' }]]
    : 'list',
});
