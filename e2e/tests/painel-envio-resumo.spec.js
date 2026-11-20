'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, RUSSA, SACK, ARM, LATE, abrirPainel, progresso, resumo, envio, baralho, toasts, marcarEEnviar, enviosCriados, umaVoltaDoEnvio, apagarAFrase } = require('../apoio-do-envio');

const leiturasDoTeto = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/custos/teto').length;

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test('com o relógio parado, o Envio que terminou na Boas-vindas abre o resumo no instante em que a pessoa volta ao painel', async ({ page, extensao, fakes, relogioParado }) => {
  const relogio = await relogioParado({ em: AGORA });
  await extensao.gravarStorage({ frases: INGLESAS });
  await page.goto(extensao.url('painel.html#frases'));
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  await page.keyboard.press('Escape');
  await expect(progresso(page)).toHaveCount(0);

  await page.goto(extensao.url('painel.html#boas-vindas'));
  await expect(page.locator('.bv-card h2')).toHaveText('Boas-vindas ao PerpetualMiner');
  fakes.anki.concluirEnvio(job.jobId);
  const antes = leiturasDoTeto(fakes);
  await relogio.avancar(2_000);
  await expect.poll(() => leiturasDoTeto(fakes)).toBeGreaterThan(antes);
  await expect(resumo(page)).toHaveCount(0);

  await page.locator('.bv-card').getByRole('button', { name: 'Pular a configuração' }).click();

  await expect(resumo(page)).toBeVisible();
  await resumo(page).getByRole('button', { name: 'Manter' }).click();
  await estadoFinal(extensao, { frases: [{ ...SACK, status: 'exported' }, ARM, LATE] });
});

test('o resumo de uma remessa em dois idiomas conta as Frases e os baralhos, e só pergunta pelas que ainda estão no histórico', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [...INGLESAS.map(f => f.texto), RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);
  await page.keyboard.press('Escape');
  await apagarAFrase(page, SACK.texto);

  fakes.anki.concluirEnvio(ingles.jobId);
  fakes.anki.concluirEnvio(russo.jobId);

  await expect(resumo(page)).toHaveAccessibleName('Envio concluído', { timeout: 10_000 });
  await expect(resumo(page)).toContainText('4 frases · 2 baralhos');
  await expect(baralho(page, 'Inglês')).toContainText('+3 cartões');
  await expect(baralho(page, 'Russo')).toContainText('+1 cartão');
  await expect(resumo(page)).toContainText('Tirar as 3 enviadas do histórico?');
  await expect(resumo(page)).toContainText('Elas já estão no Anki. Manter deixa no histórico, marcadas como enviadas. 1 enviada você já tinha apagado.');
  await resumo(page).getByRole('button', { name: 'Tirar do histórico' }).click();

  await expect(toasts(page)).toHaveText('3 frases apagadas');
  await estadoFinal(extensao, { frases: [], pm_envio: null });
});

test('um Envio em que nenhuma Frase entrou: o resumo não tem o que tirar nem a ajuda do Manter, e Pronto deixa as Frases como estavam', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);

  fakes.anki.concluirEnvio(job.jobId, { falhas: [SACK.id] });

  await expect(resumo(page)).toHaveAccessibleName('Envio concluído em parte', { timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).toContainText('1 não entrou');
  await expect(resumo(page)).toContainText('Nada para tirar do histórico.');
  await expect(resumo(page)).not.toContainText('Manter deixa');
  await expect(resumo(page).getByRole('button', { name: 'Tirar do histórico' })).toHaveCount(0);
  await expect(resumo(page).getByRole('button', { name: 'Pronto' })).toBeFocused();
  await resumo(page).getByRole('button', { name: 'Pronto' }).click();

  await expect(resumo(page)).toHaveCount(0);
  await estadoFinal(extensao, { frases: INGLESAS, pm_envio: null });
});

test('um Envio que a Conexão não conhece e outro andando: o progresso só abre sozinho quando o outro termina, e o resumo conta só o outro', async ({ page, extensao, fakes }) => {
  const russo = '7b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
  const corpo = { jobId: russo, lang: 'ru', deckName: 'RUSSIAN', imageSource: '1', tts: { wordTld: 'ru', phraseTld: 'ru' }, entries: [{ phraseId: RUSSA.id, line: RUSSA.texto }] };
  const desconhecido = { id: 'envio-de-outra-instalacao', lang: 'en', ids: [SACK.id], jobId: 'envio-de-outra-instalacao', criadoEm: AGORA.getTime() };
  await extensao.gravarStorage({
    frases: [...INGLESAS, RUSSA],
    pm_envio: { envios: [desconhecido, { id: russo, lang: 'ru', ids: [RUSSA.id], baralho: 'RUSSIAN', jobId: russo, criadoEm: AGORA.getTime(), falhaAoCriar: null, corpo }] },
  });
  fakes.anki.receberEnvio(corpo);
  await abrirPainel(page, extensao);
  await umaVoltaDoEnvio(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  fakes.anki.concluirEnvio(russo);

  await expect(envio(page, 'Envio em inglês · 1 frase')).toContainText('Não encontrado', { timeout: 10_000 });
  await expect(envio(page, 'Envio em russo · 1 frase')).toContainText('Concluído');
  await expect(resumo(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(resumo(page)).toContainText('1 frase · 1 baralho');
  await expect(baralho(page, 'Russo')).toContainText('+1 cartão');
  await expect(baralho(page, 'Inglês')).toHaveCount(0);
  await resumo(page).getByRole('button', { name: 'Manter' }).click();
  await estadoFinal(extensao, { frases: [...INGLESAS, { ...RUSSA, status: 'exported' }], pm_envio: null });
});

test('depois de fechar o progresso com um Envio que a Conexão não conhece, um Envio novo deixa o progresso aberto até a pessoa fechá-lo, e só então o resumo abre', async ({ page, extensao, fakes }) => {
  const desconhecido = { id: 'envio-de-outra-instalacao', lang: 'en', ids: [SACK.id], jobId: 'envio-de-outra-instalacao', criadoEm: AGORA.getTime() };
  await extensao.gravarStorage({ frases: INGLESAS, pm_envio: { envios: [desconhecido] } });
  await abrirPainel(page, extensao);
  await expect(envio(page, 'Envio em inglês · 1 frase')).toContainText('Não encontrado');
  await page.keyboard.press('Escape');
  await expect(progresso(page)).toHaveCount(0);

  await marcarEEnviar(page, [ARM.texto]);
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.concluirEnvio(job.jobId);

  await expect(envio(page, 'Envio em inglês · 1 frase').last()).toContainText('Concluído', { timeout: 10_000 });
  await umaVoltaDoEnvio(page);
  await expect(progresso(page)).toBeVisible();
  await expect(resumo(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(resumo(page)).toContainText('1 frase · 1 baralho');
  await resumo(page).getByRole('button', { name: 'Manter' }).click();
  await estadoFinal(extensao, { frases: [SACK, { ...ARM, status: 'exported' }, LATE], pm_envio: null });
});

test('o resumo aberto fica como a pessoa o deixou: a leitura seguinte dos Envios não devolve o foco ao botão seguro', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.concluirEnvio(job.jobId);
  await expect(resumo(page).getByRole('button', { name: 'Tirar do histórico' })).toBeFocused({ timeout: 10_000 });

  const manter = resumo(page).getByRole('button', { name: 'Manter' });
  await manter.focus();
  await umaVoltaDoEnvio(page);

  await expect(manter).toBeFocused();
  await expect(resumo(page)).toHaveCount(1);
  await manter.click();
  await expect(resumo(page)).toHaveCount(0);
  await estadoFinal(extensao, { frases: [{ ...SACK, status: 'exported' }, ARM, LATE], pm_envio: null });
});
