'use strict';

// Referência visual do Consertar sozinho (#152): a faixa do Envio com o abridor conferindo a Conexão, a Conexão que sumiu
// do Anki (Instalar de novo) e o conserto que falhou (Baixar diagnóstico). As cópias são as da tabela da spec do #138 na Voz
// (BRG-39); o protótipo da tabela (#102) é a referência que o dono compara. Os três testes são PROPOSTAS (`test.fixme`) até o
// dono aprovar as telas olhando; depois de aprovadas, tire o `.fixme` e acrescente a entrada em e2e/aprovados-visuais.json:
//
//   cd e2e && npx playwright test painel-conserto-visual --update-snapshots

const { test, expect } = require('../fixtures');
const { AGORA, INGLESAS, SACK, marcar, enviarAoAnki, abrirPainel } = require('../apoio-do-envio');

const faixa = page => page.locator('#frases-avisos [data-aviso="envio-anki-fechado"]');

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test.describe('com a permissão do abridor', () => {
  test.use({ permissaoDoAbridor: true });

  async function enviarComAConexaoMuda(page, extensao, fakes, conserto, opcoes) {
    fakes.abridor.definirConserto(conserto, opcoes);
    await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
    fakes.anki.desligar();
    await page.setViewportSize({ width: 1280, height: 900 });
    await abrirPainel(page, extensao);
    await page.evaluate(() => document.fonts.ready);
    await marcar(page, SACK.texto).check();
    await enviarAoAnki(page).click();
  }

  test.fixme('o abridor demora: “Conferindo a Conexão com o Anki…”', async ({ page, extensao, fakes }) => {
    await enviarComAConexaoMuda(page, extensao, fakes, 'anki_travado', { atrasoMs: 60_000 });
    await expect(faixa(page)).toHaveText('Conferindo a Conexão com o Anki…', { timeout: 6_000 });

    await expect(page).toHaveScreenshot('conserto-conferindo.png');
  });

  test.fixme('a Conexão sumiu do Anki: o único botão é Instalar de novo', async ({ page, extensao, fakes }) => {
    await enviarComAConexaoMuda(page, extensao, fakes, 'complemento_sumiu');
    await expect(faixa(page)).toContainText('A Conexão com o Anki não está mais no Anki.');

    await expect(page).toHaveScreenshot('conserto-sumiu.png');
  });

  test.fixme('o conserto falhou: “Não deu para consertar…” com Baixar diagnóstico', async ({ page, extensao, fakes }) => {
    await enviarComAConexaoMuda(page, extensao, fakes, 'anki_nao_fecha');
    await expect(faixa(page)).toContainText('Não deu para consertar. Feche o Anki e abra de novo.');

    await expect(page).toHaveScreenshot('conserto-falhou.png');
  });
});
