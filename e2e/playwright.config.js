'use strict';

const { defineConfig } = require('@playwright/test');

// O navegador é lançado pelo fixture `context` (e2e/fixtures.js), porque a
// extensão só carrega num perfil persistente.
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
});
