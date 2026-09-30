'use strict';

// Só o gerador das imagens da Chrome Web Store (`docs/loja/`). Fica fora de
// `e2e/tests` para o `npm test` não regerar as imagens a cada rodada:
//
//   cd e2e && npx playwright test -c loja --workers=1
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: /gerar-imagens\.spec\.js/,
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
