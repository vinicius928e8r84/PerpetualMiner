'use strict';

// #372: o Envio que a retenção já apagou volta da Conexão só como ficha (terminado, sem Continuar envio, só o que entrou).

const { test, expect } = require('../fixtures');
const { AGORA, INGLESAS, SACK, ARM, abrirPainel, baralho, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test('um Envio retido pela retenção, com Frases fora do sucesso, ganha um Envio novo só com elas no Tentar de novo do resumo', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto]);
  const [job] = await enviosCriados(fakes, 1);

  // Depois da retenção a Conexão só guarda a ficha: terminado, sem Continuar envio, e só o que entrou.
  fakes.anki.concluirEnvio(job.jobId);
  fakes.anki.responder('POST', '/jobs/list', () => ({
    json: {
      jobs: fakes.anki.envios.map(e => ({
        jobId: e.jobId,
        lang: e.lang,
        status: 'completed',
        state: { ...e.state, status: 'completed', stage: 'completed', successfulPhraseIds: [ARM.id], failedPhraseIds: [] },
      })),
    },
  }));
  await expect(baralho(page, 'Inglês')).toContainText('1 não entrou', { timeout: 10_000 });

  await baralho(page, 'Inglês').getByRole('button', { name: 'Tentar de novo' }).click();

  await expect.poll(() => fakes.anki.envios.length).toBe(2);
  expect(fakes.anki.envios[1].jobId).not.toBe(job.jobId);
  expect(fakes.anki.envios[1].entries.map(e => e.phraseId)).toEqual([SACK.id]);
});
