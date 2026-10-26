'use strict';

// Referência visual do Apagar tudo recusado (CFG-17.conexaoNaoResponde, #142 / #259): a Conexão com o Anki não responde, então nada é
// apagado e a faixa da Zona de perigo pede para abrir o Anki, com Tentar de novo e Detalhes. O dono aprovou a tela como está, na
// janela larga e na estreita (e2e/aprovados-visuais.json).

const { test, expect } = require('../fixtures');
const { semearComoNoPrototipo, abrirConfiguracoes } = require('../apoio-das-configuracoes');

async function recusarOApagarTudo(page, extensao, fakes, largura, altura) {
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.desligar();
  await abrirConfiguracoes(page, extensao, '#configuracoes/perigo', largura, altura);
  await page.locator('#cfg-perigo').getByRole('button', { name: /^Apagar todas as/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Apagar .* frases$/ }).click();
  await expect(page.locator('#cfg-perigo').getByRole('alert')).toContainText('Não deu para apagar agora');
}

test('Apagar tudo recusado: a Conexão não responde', async ({ page, extensao, fakes }) => {
  await recusarOApagarTudo(page, extensao, fakes, 1280, 800);

  await expect(page).toHaveScreenshot('apagar-tudo-recusado-conexao-fora.png', { animations: 'disabled' });
});

test('Apagar tudo recusado na janela estreita', async ({ page, extensao, fakes }) => {
  await recusarOApagarTudo(page, extensao, fakes, 390, 844);

  await expect(page).toHaveScreenshot('apagar-tudo-recusado-conexao-fora-estreita.png', { animations: 'disabled' });
});
