'use strict';

const { test, expect } = require('../fixtures');
const { AGORA, INGLESAS, RUSSA, SACK, ARM, abrirPainel, cartoesDe, resumo, envio, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');
const { copiaDoCatalogo } = require('../apoio-da-copia-do-catalogo');

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test('as telas do Envio com a Conexão dentro do Anki só dizem o que o catálogo da Voz tem, e chamam-na de Conexão com o Anki', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  fakes.anki.recusarEnvios('ru', { status: 404, erro: 'not_found' });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto, RUSSA.texto]);
  const [ingles] = await enviosCriados(fakes, 1);

  fakes.anki.moverEnvio(ingles.jobId, { stage: 'wait_anki' });
  await expect(envio(page, 'Envio em inglês · 2 frases')).toContainText('Esperando o Anki');
  await expect(envio(page, 'Envio em russo · 1 frase')).toContainText('A Conexão com o Anki respondeu com erro.');
  await copiaDoCatalogo(page, '#modal-envio');

  fakes.anki.concluirEnvio(ingles.jobId, { falhas: [ARM.id] });
  await expect(envio(page, 'Envio em inglês · 2 frases').getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await copiaDoCatalogo(page, '#modal-envio');

  fakes.anki.aceitarEnvios('ru');
  await envio(page, 'Envio em russo · 1 frase').getByRole('button', { name: 'Tentar de novo' }).click();
  await expect.poll(() => fakes.anki.enviosEm('ru').length).toBe(1);
  const [russo] = fakes.anki.enviosEm('ru');
  fakes.anki.concluirEnvio(russo.jobId);
  await expect(resumo(page)).toHaveAccessibleName('Envio concluído em parte');
  await copiaDoCatalogo(page, '#modal-resumo');

  const { pm_envio: guardado } = await extensao.lerStorage('pm_envio');
  expect(guardado.envios.map(e => [e.lang, e.jobId])).toEqual([['en', ingles.jobId], ['ru', russo.jobId]]);
  expect(fakes.anki.enviosEm('ru')).toHaveLength(1);
});

test('a espera pelo Anki só diz o que fazer depois de 5 minutos, sem fazer o Envio falhar (#246)', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  test.skip(Boolean(conexaoDoTeste), 'a Conexão real carimba a hora de cada mudança do Envio (Fila.mudar): só o fake volta o updatedAt no tempo');
  const haMinutos = n => new Date(AGORA.getTime() - n * 60 * 1000);
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, INGLESAS.map(f => f.texto));
  const [ingles] = await enviosCriados(fakes, 1);
  const cartao = envio(page, 'Envio em inglês · 3 frases');
  const orientacao = 'O Anki segue sem responder. Se ele estiver na tela de perfis, abra o perfil; se estiver sincronizando, espere a sincronização terminar. O Envio continua sozinho.';

  fakes.anki.moverEnvio(ingles.jobId, { stage: 'wait_anki', atualizadoEm: haMinutos(4) });
  await expect(cartao).toContainText('Esperando o Anki');
  await expect(cartao).not.toContainText(orientacao);

  fakes.anki.moverEnvio(ingles.jobId, { stage: 'wait_anki', atualizadoEm: haMinutos(6) });
  await expect(cartao).toContainText(orientacao);
  await expect(cartao).toContainText('Esperando o Anki');
  await expect(cartao.getByRole('button')).toHaveCount(0);
  await copiaDoCatalogo(page, '#modal-envio');
});

test.describe('o Envio parado porque o Anki fechou (#151)', () => {
  test.use({ permissaoDoAbridor: true });

  test('só diz o que o catálogo da Voz tem: a espera e o Anki que não abre', async ({ page, extensao, fakes }) => {
    test.slow();
    fakes.abridor.definir('achei_sem_abrir');
    await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
    await abrirPainel(page, extensao);
    await marcarEEnviar(page, INGLESAS.map(f => f.texto));
    const [job] = await enviosCriados(fakes, 1);
    fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', cartoes: cartoesDe(3) });
    await expect(envio(page, 'Envio em inglês · 3 frases')).toContainText('Criando cartões');
    fakes.anki.desligar();
    const cartao = envio(page, 'Envio em inglês · 3 frases');
    await expect(cartao).toContainText('3 de 10 no Anki. Quando o Anki abrir, o Envio continua sozinho.', { timeout: 20_000 });
    await copiaDoCatalogo(page, '#modal-envio');

    await cartao.getByRole('button', { name: 'Continuar envio' }).click();
    await expect(cartao).toContainText('Não deu para abrir o Anki. Abra-o você mesmo.');
    await copiaDoCatalogo(page, '#modal-envio');

    const { pm_envio: guardado } = await extensao.lerStorage('pm_envio');
    expect(guardado.envios.map(e => e.jobId)).toEqual([job.jobId]);
  });
});

test('o Envio no limite do plano do ChatGPT só diz o que o catálogo da Voz tem (#158)', async ({ page, extensao, fakes }) => {
  test.slow();
  await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, INGLESAS.map(f => f.texto));
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', cartoes: cartoesDe(3), esperando: { reason: 'plan_limit' } });
  await expect(envio(page, 'Envio em inglês · 3 frases')).toContainText('Limite de uso atingido · Faltam 7 cartões', { timeout: 20_000 });
  await copiaDoCatalogo(page, '#modal-envio');

  const { pm_envio: guardado } = await extensao.lerStorage('pm_envio');
  expect(guardado.envios.map(e => e.jobId)).toEqual([job.jobId]);
});
