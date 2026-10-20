'use strict';

// Referência visual do Apagar tudo recusado (CFG-17.conexaoNaoResponde, #142 / #259): a Conexão com o Anki não responde, então nada é
// apagado e a faixa da Zona de perigo pede para abrir o Anki, com Tentar de novo e Detalhes. A cópia é a que o dono propôs e ainda
// não viu na tela: `fixme` e sem PNG até ele aprovar o visual implementado (regra 10). Aprovado: tire o `test.fixme` e rode
// `cd e2e && npx playwright test configuracoes-perigo-visual --update-snapshots`.

const { test, expect } = require('../fixtures');
const { semearComoNoPrototipo, abrirConfiguracoes } = require('../apoio-das-configuracoes');

test('Apagar tudo recusado: a Conexão não responde', async ({ page, extensao, fakes }) => {
  test.fixme(true, 'a referência visual da recusa do Apagar tudo espera a aprovação do dono (regra 10)');
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.desligar();
  await abrirConfiguracoes(page, extensao, '#configuracoes/perigo');
  await page.locator('#cfg-perigo').getByRole('button', { name: /^Apagar todas as/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Apagar .* frases$/ }).click();
  await expect(page.locator('#cfg-perigo').getByRole('alert')).toContainText('Não deu para apagar agora');

  await expect(page).toHaveScreenshot('apagar-tudo-recusado-conexao-fora.png', { animations: 'disabled' });
});
