'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { INGLESAS, enviosCriados } = require('../apoio-do-envio');

const PREVIA = '/anki/card-preview';
const SO_O_INGLES = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } };
const [MAIS_RECENTE] = INGLESAS;

const passo = page => page.locator('.bv-envio');
const previa = page => passo(page).locator('.previa');

async function chegarAoPrimeiroCartao(page, extensao, fakes) {
  await extensao.gravarStorage({ frases: [MAIS_RECENTE], pm_auto_miner_settings: SO_O_INGLES });
  await page.goto(extensao.url('painel.html#boas-vindas/envio'));
  const [envio] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(envio.jobId, { stage: 'send_to_anki', cartoes: { [`${envio.entries[0].phraseId}-0`]: 'added' } });
  fakes.anki.concluirEnvio(envio.jobId);
  await expect(passo(page)).toContainText('Cartão enviado ao Anki');
}

test('o Cartão apagado no Anki: a prévia diz que ele não está mais lá, sem mandar atualizar a Conexão, e Tentar de novo o mostra quando ele volta', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', PREVIA, () => ({ status: 404, json: { error: 'note_not_found' } }));
  await chegarAoPrimeiroCartao(page, extensao, fakes);

  await expect(previa(page)).toContainText('Este cartão não está mais no Anki.');
  await expect(previa(page)).not.toContainText('Atualize a Conexão com o Anki');
  fakes.anki.pararDeResponder('POST', PREVIA);
  await previa(page).getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(previa(page)).toHaveAttribute('data-estado', 'pronta');
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true } } });
});

test('a Conexão que não tem a rota da prévia segue pedindo a atualização, sem Tentar de novo', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', PREVIA, () => ({ status: 404, json: { error: 'not_found' } }));
  await chegarAoPrimeiroCartao(page, extensao, fakes);

  await expect(previa(page)).toContainText('Atualize a Conexão com o Anki para ver a prévia.');
  await expect(previa(page).getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true } } });
});
