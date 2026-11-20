'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, SACK, abrirPainel, marcar, enviarAoAnki, progresso, resumo, envio, umaVoltaDoEnvio, pedidosDeCriar } = require('../apoio-do-envio');

const ID = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const CORPO = {
  jobId: ID, lang: 'en', deckName: 'CIMV', imageSource: '1', tts: { wordTld: 'com', phraseTld: 'co.uk' },
  entries: [{ phraseId: SACK.id, line: 'sack : She hit the sack early. [Contexto: netflix]' }],
};
const guardado = extras => ({ id: ID, lang: 'en', ids: [SACK.id], baralho: 'CIMV', jobId: null, criadoEm: AGORA.getTime(), falhaAoCriar: null, corpo: CORPO, ...extras });

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test('um Envio guardado que não começou não é refeito sozinho ao reabrir o painel: ele espera o Tentar de novo', async ({ page, extensao, fakes }) => {
  const falhaAoCriar = { semResposta: false, causa: 'POST /jobs → HTTP 500 · job_failed' };
  await extensao.gravarStorage({ frases: INGLESAS, pm_envio: { envios: [guardado({ falhaAoCriar })] } });
  await abrirPainel(page, extensao);
  await umaVoltaDoEnvio(page);

  expect(pedidosDeCriar(fakes)).toHaveLength(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await estadoFinal(extensao, { pm_envio: { envios: [{ id: ID, jobId: null, falhaAoCriar }] } });

  await marcar(page, SACK.texto).check();
  await enviarAoAnki(page).click();
  const cartao = envio(page, 'Envio em inglês · 1 frase');
  await expect(cartao).toContainText('Não começou');
  await cartao.getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(cartao).toContainText('Na fila');
  expect(pedidosDeCriar(fakes).map(r => r.dados)).toEqual([CORPO]);
  await estadoFinal(extensao, { pm_envio: { envios: [{ id: ID, jobId: ID, falhaAoCriar: null }] } });
});

test('um Envio guardado que a Conexão já não conhece não é pedido de novo ao reabrir o painel: o cartão diz que ela não o conhece', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS, pm_envio: { envios: [guardado({ jobId: ID })] } });
  await abrirPainel(page, extensao);

  const cartao = envio(page, 'Envio em inglês · 1 frase');
  await expect(cartao).toContainText('Não encontrado');
  await umaVoltaDoEnvio(page);

  await expect(cartao).toContainText('Não encontrado');
  await expect(resumo(page)).toHaveCount(0);
  await expect(progresso(page)).toBeVisible();
  expect(pedidosDeCriar(fakes)).toHaveLength(0);
  expect(fakes.anki.envios).toHaveLength(0);
  await estadoFinal(extensao, { pm_envio: { envios: [{ id: ID, jobId: ID }] } });
});
