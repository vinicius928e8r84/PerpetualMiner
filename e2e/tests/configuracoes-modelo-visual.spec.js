'use strict';

// Referência visual do Avançado do card IA dos cartões com o modelo (#157): o seletor com “Pago pela sua chave”, o aviso âmbar antes da
// saída e a linha verde da troca. O dono compara com o protótipo do #123 (ticket de origem do mapa #87); até ele aprovar, os testes ficam
// em `test.fixme` e não há PNG (regra 10, e2e/aprovados-visuais.json). Depois:
//
//   cd e2e && npx playwright test configuracoes-modelo-visual --update-snapshots

const { test, expect } = require('../fixtures');
const { semearComoNoPrototipo, abrirConfiguracoes } = require('../apoio-das-configuracoes');

const AGUARDA_O_DONO = 'a referência visual do modelo dos cartões espera a aprovação do dono (regra 10)';

async function abrirComAChave(page, extensao, fakes, cenario) {
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.guardarChaveNaConexao('9f3a');
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
  fakes.anki.modelo.definir(cenario);
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  await expect(page.locator('#cfg-ia').getByRole('combobox', { name: 'Modelo dos cartões' })).toBeVisible();
}

test('IA dos cartões com a chave: o Avançado aberto, o Modelo dos cartões em Automático e Pago pela sua chave', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.guardarChaveNaConexao('9f3a');
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await page.locator('#cfg-ia details.ia-avancado summary').click();
  await expect(page.locator('#cfg-ia')).toContainText('Pago pela sua chave');

  await expect(page).toHaveScreenshot('ia-modelo-chave.png', { animations: 'disabled' });
});

test('IA dos cartões antes da saída de um modelo: o aviso âmbar com a data, Trocar agora e Escolher outro', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirComAChave(page, extensao, fakes, 'gpt-4.1-mini sai em 20/11');
  await expect(page.locator('#cfg-ia').getByRole('status').filter({ hasText: 'sai do ar em' })).toBeVisible();

  await expect(page).toHaveScreenshot('ia-modelo-aviso.png', { animations: 'disabled' });
});

test('IA dos cartões depois da troca: a linha verde conta que o Envio passou para o Automático', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirComAChave(page, extensao, fakes, 'gpt-4.1 sumiu da conta');
  await expect(page.locator('#cfg-ia')).toContainText('O Envio passou para o Automático.');

  await expect(page).toHaveScreenshot('ia-modelo-trocou.png', { animations: 'disabled' });
});
