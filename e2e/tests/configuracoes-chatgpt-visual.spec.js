'use strict';

const { test, expect } = require('../fixtures');
const { semearComoNoPrototipo, abrirConfiguracoes } = require('../apoio-das-configuracoes');

const AGUARDA_O_DONO = 'a referência visual da coluna do ChatGPT com o login espera a aprovação do dono (regra 10)';

test('IA dos cartões com o plano do ChatGPT: a linha de quem paga e Sair do ChatGPT', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await extensao.gravarStorage({ pm_plano_do_chatgpt_avisado: true });
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

test('IA dos cartões: o modal da primeira vez com o plano do ChatGPT', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.chatgpt.definir('conectada');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.getByRole('dialog', { name: 'Você está usando o seu plano do ChatGPT' })).toBeVisible();

  await expect(page).toHaveScreenshot('ia-chatgpt-primeira-vez.png', { animations: 'disabled' });
});

test('IA dos cartões com a conta grátis ou Go: a faixa diz que o plano não serve e leva à chave', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.chatgpt.definir('nao_serve');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia').getByRole('alert')).toContainText('não serve para a conta grátis ou Go');

  await expect(page).toHaveScreenshot('ia-chatgpt-nao-serve.png', { animations: 'disabled' });
});

test('IA dos cartões com o plano e sem chave: a nota de que o cartão sai com foto real ou sem imagem gerada', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await extensao.gravarStorage({ pm_plano_do_chatgpt_avisado: true });
  fakes.anki.chatgpt.definir('conectada');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia')).toContainText('Sem a chave da OpenAI, o cartão sai com foto real ou sem imagem gerada.');

  await expect(page).toHaveScreenshot('ia-chatgpt-sem-chave.png', { animations: 'disabled' });
});
