'use strict';

// Referência visual da coluna Conta do ChatGPT do card IA dos cartões com o login (#155): “Usando o plano do ChatGPT ·
// Gerenciar uso” e Sair do ChatGPT, ao lado da chave. O dono compara com o protótipo do #101 (desenho A, ticket de origem do mapa
// #87); até ele aprovar, o teste fica em `test.fixme` e não há PNG (regra 10, e2e/aprovados-visuais.json). Depois:
//
//   cd e2e && npx playwright test configuracoes-chatgpt-visual --update-snapshots

const { test, expect } = require('../fixtures');
const { semearComoNoPrototipo, abrirConfiguracoes } = require('../apoio-das-configuracoes');

const AGUARDA_O_DONO = 'a referência visual da coluna do ChatGPT com o login espera a aprovação do dono (regra 10)';

test('IA dos cartões com o plano do ChatGPT: a linha de quem paga e Sair do ChatGPT', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.chatgpt.definir('conectada');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia').getByRole('region', { name: /Conta do ChatGPT/ })).toContainText('Usando o plano do ChatGPT');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('ia-chatgpt-conectada.png', { animations: 'disabled' });
});

test('IA dos cartões com o ChatGPT recusado: a faixa da Conta do ChatGPT', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.chatgpt.definir('recusou');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia').getByRole('alert')).toContainText('Conta do ChatGPT:');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('ia-chatgpt-recusado.png', { animations: 'disabled' });
});
