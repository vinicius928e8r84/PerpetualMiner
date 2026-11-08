'use strict';

// “Já tenho” quando a conversa com o abridor falha por dentro (#242): `oAbridorAbreOAnki`, em
// painel-conexao-passos.js, trata a conversa que rejeita como o caminho manual. Sem isso o botão ficava
// apertado e sem resultado. Os outros casos do passo Ter o Anki estão em ter-o-anki.spec.js.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');

const card = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const jaTenho = page => card(page).getByRole('button', { name: 'Já tenho' });
const resultadoDoAnki = page => page.locator('#apv-anki-resultado');

test.beforeEach(({ fakes }) => {
  fakes.anki.desligar();
});

test.describe('com a permissão que o Chrome guardou depois de Permitir', () => {
  test.use({ permissaoDoAbridor: true });

  test('a conversa com o abridor rejeita: “Já tenho” cai no caminho manual de sempre, e nada é guardado', async ({ page, extensao, fakes }) => {
    // Exceção de teste: chrome-nativo (CLAUDE.md § Testing). Uma conversa que rejeita (o Chrome recusando a pergunta
    // da permissão) não tem como ser pedida pela tela nem pelo fake do abridor, que nunca rejeita: o teste troca
    // `chrome.permissions.contains` por uma função que rejeita, antes de o painel carregar.
    await page.addInitScript(() => {
      chrome.permissions.contains = () => Promise.reject(new Error('o Chrome recusou a pergunta da permissão'));
    });
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(card(page)).toBeVisible();

    await jaTenho(page).click();

    await expect(resultadoDoAnki(page)).toHaveText('Abra o Anki para continuar.');
    await expect(jaTenho(page)).toBeEnabled();
    expect(fakes.abridor.pedidos()).toEqual([]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
    await estadoFinal(extensao, { pm_abridor: null });
  });
});
