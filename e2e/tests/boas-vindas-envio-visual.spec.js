'use strict';

// Referência visual do primeiro Envio da Boas-vindas (#173, ONB-23): o Cartão pronto (com a Frase minerada e com a Frase de teste) e a falha. Não há
// protótipo deste passo: ele reusa o card de passo do protótipo aprovado da Boas-vindas (`docs/design/painel/boas-vindas/prototipo-onboarding.html`), a prévia do
// Cartão de Ajustes de envio e o aviso de falha do Veio, e o dono compara estas telas com ele. Todas são PROPOSTAS (`test.fixme`, sem PNG na árvore) até
// a aprovação dele (CODING_STANDARDS regra 10). Aprovando: tirar o `fixme` e `cd e2e && npx playwright test boas-vindas-envio-visual --update-snapshots`, e a
// entrada no livro `e2e/aprovados-visuais.json`.

const { test, expect } = require('../fixtures');
const { INGLESAS, enviosCriados } = require('../apoio-do-envio');

const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';
const SO_O_INGLES = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } };

async function abrir(page, extensao, { frases = [], largura = 1100, tema } = {}) {
  await extensao.gravarStorage({ frases, pm_auto_miner_settings: SO_O_INGLES, ...(tema && { pm_tema: tema }) });
  await page.setViewportSize({ width: largura, height: 900 });
  await page.goto(extensao.url('painel.html#boas-vindas/envio'));
  await expect(page.locator('.bv-card h2')).toHaveText('Enviar o primeiro cartão');
  await page.evaluate(() => document.fonts.ready);
}

async function chegarAoAnki(page, fakes) {
  const [envio] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(envio.jobId, { stage: 'send_to_anki', cartoes: { [`${envio.entries[0].phraseId}-0`]: 'added' } });
  fakes.anki.concluirEnvio(envio.jobId);
  await expect(page.locator('.bv-envio')).toContainText('Cartão enviado ao Anki');
  await expect(page.locator('.bv-envio .previa iframe').contentFrame().locator('.card')).toBeVisible();
}

test('o primeiro Cartão enviado, com a Frase minerada: o Baralho, o Cartão como o Anki o mostra, Abrir no Anki e Concluir', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, { frases: INGLESAS });
  await chegarAoAnki(page, fakes);

  await expect(page).toHaveScreenshot('envio-cartao-pronto.png', { fullPage: true, animations: 'disabled' });
});

test('o primeiro Cartão enviado, com a Frase de teste: o aviso da etiqueta', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao);
  await chegarAoAnki(page, fakes);

  await expect(page).toHaveScreenshot('envio-cartao-de-teste.png', { fullPage: true, animations: 'disabled' });
});

test('o primeiro Cartão que não foi: o motivo, Tentar de novo e Trocar a chave', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, { frases: INGLESAS });
  const [envio] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(envio.jobId, { stage: 'generate_cards', cartoes: { [`${envio.entries[0].phraseId}-0`]: { status: 'failed', error: 'openai_key_rejected' } } });
  fakes.anki.concluirEnvio(envio.jobId, { erro: 'openai_key_rejected' });
  await expect(page.locator('.bv-envio').getByRole('alert')).toContainText('Este cartão não foi');

  await expect(page).toHaveScreenshot('envio-cartao-falhou.png', { fullPage: true, animations: 'disabled' });
});

test('o primeiro Cartão enviado, na janela estreita e no tema claro', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrir(page, extensao, { frases: INGLESAS, largura: 560, tema: 'claro' });
  await chegarAoAnki(page, fakes);

  await expect(page).toHaveScreenshot('envio-cartao-estreita-claro.png', { fullPage: true, animations: 'disabled' });
});
