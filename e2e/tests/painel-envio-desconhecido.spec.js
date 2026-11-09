'use strict';

// O Envio que a Conexão não conhece (#245): veio do bridge, ou a pasta de dados dela foi apagada. O cartão não o dá por não concluído:
// diz que a Conexão não o conhece e oferece Esquecer, que o tira do acompanhamento sem tocar nas Frases.

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, abrirPainel, envio, progresso, resumo } = require('../apoio-do-envio');

const JOB_DE_OUTRA_INSTALACAO = 'job-do-bridge-1';

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test('um Envio que a Conexão não conhece: o cartão diz isso e oferece Esquecer, em vez de “Não concluído”', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: INGLESAS, pm_envio: { envios: [{ id: JOB_DE_OUTRA_INSTALACAO, lang: 'en', ids: INGLESAS.map(f => f.id), jobId: JOB_DE_OUTRA_INSTALACAO, criadoEm: AGORA.getTime() }] } });
  await abrirPainel(page, extensao);

  const cartao = envio(page, 'Envio em inglês · 3 frases');
  await expect(cartao).toContainText('Não encontrado');
  await expect(cartao).toContainText('A Conexão com o Anki não conhece este Envio. Ele pode ser de outra instalação, ou os dados dela foram apagados.');
  await expect(cartao).not.toContainText('Não concluído');
  await expect(cartao.getByRole('button', { name: 'Continuar envio' })).toBeHidden();
  await expect(resumo(page)).toBeHidden();
  await estadoFinal(extensao, { pm_envio: { envios: [{ jobId: JOB_DE_OUTRA_INSTALACAO }] } });
});

test('Esquecer tira o Envio do acompanhamento e deixa as Frases no histórico', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: INGLESAS, pm_envio: { envios: [{ id: JOB_DE_OUTRA_INSTALACAO, lang: 'en', ids: INGLESAS.map(f => f.id), jobId: JOB_DE_OUTRA_INSTALACAO, criadoEm: AGORA.getTime() }] } });
  await abrirPainel(page, extensao);

  await envio(page, 'Envio em inglês · 3 frases').getByRole('button', { name: 'Esquecer' }).click();

  await expect(progresso(page)).toBeHidden();
  await expect(resumo(page)).toBeHidden();
  await estadoFinal(extensao, { pm_envio: null });
  await estadoFinal(extensao, { frases: INGLESAS });
});
