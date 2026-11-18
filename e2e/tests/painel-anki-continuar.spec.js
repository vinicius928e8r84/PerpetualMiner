'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');

const AGORA = new Date('2026-10-12T15:00:00Z');
const JOB = 'c7d1e2f3-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const INTERVALO_DA_LEITURA_MS = 2000;

const detalhe = page => page.getByRole('region', { name: 'Envio em inglês · 2 frases' });
const leiturasDoEnvio = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/get' && r.dados?.jobId === JOB).length;

test('Continuar envio na aba Custos acompanha o Envio até o fim: o detalhe anda sozinho de Na fila a Concluído, e para de ler', async ({ page, extensao, fakes, relogioParado }) => {
  fakes.anki.definirFila('um Envio que terminou em parte');
  fakes.anki.usarRelogio(() => AGORA);
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  const relogio = await relogioParado({ em: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(detalhe(page)).toContainText('Concluído em parte · 1 de 2 frases');

  await detalhe(page).getByRole('button', { name: 'Continuar envio' }).click();
  await expect(page.getByText('Envio retomado')).toBeVisible();
  await expect(detalhe(page)).toContainText('Enviando… · Na fila');
  await expect.poll(() => leiturasDoEnvio(fakes)).toBe(1);

  fakes.anki.moverEnvio(JOB, { stage: 'generate_cards', progress: { done: 1, total: 2 } });
  await relogio.avancar(INTERVALO_DA_LEITURA_MS);
  await expect(detalhe(page)).toContainText('Enviando… · Criando cartões');

  fakes.anki.concluirEnvio(JOB);
  await relogio.avancar(INTERVALO_DA_LEITURA_MS);
  await expect(detalhe(page)).toContainText('Concluído');
  await expect(detalhe(page)).not.toContainText('Concluído em parte');
  await expect(detalhe(page).getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);

  const lidas = leiturasDoEnvio(fakes);
  await relogio.avancar(3 * INTERVALO_DA_LEITURA_MS);
  expect(leiturasDoEnvio(fakes)).toBe(lidas);
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry')).toHaveLength(1);
  await estadoFinal(extensao, { pm_anki_custos: { envios: [{ jobId: JOB, status: 'completed', successfulCards: 2 }] } });
});
