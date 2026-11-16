'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: /gerar-imagens\.spec\.js/,
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
