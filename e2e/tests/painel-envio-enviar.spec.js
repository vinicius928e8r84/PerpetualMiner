'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, SACK, ARM, LATE, abrirPainel, marcar, enviarAoAnki, progresso, resumo, envio, marcarEEnviar, enviosCriados, pedidosDeCriar, apagarAFrase } = require('../apoio-do-envio');

const faixaDoAnkiFechado = page => page.locator('#frases-avisos [data-aviso="envio-anki-fechado"]');

async function segurarOsPedidosDeCriar(context) {
  let soltar;
  const solto = new Promise(resolve => { soltar = resolve; });
  const seguros = [];
  await context.route('**/jobs', async route => {
    seguros.push(route.request().postDataJSON());
    await solto;
    await route.fallback();
  });
  return { seguros, soltar };
}

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test('fechar o progresso antes de a Conexão responder ao pedido: outro Enviar ao Anki espera, e o Envio criado segue acompanhado até o resumo', async ({ page, context, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  const pedidos = await segurarOsPedidosDeCriar(context);
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  await expect.poll(() => pedidos.seguros.length).toBe(1);
  await page.keyboard.press('Escape');
  await expect(progresso(page)).toHaveCount(0);

  await marcarEEnviar(page, [ARM.texto]);
  await expect(progresso(page)).toHaveCount(0);
  pedidos.soltar();

  const [job] = await enviosCriados(fakes, 1);
  expect(job.entries.map(e => e.phraseId)).toEqual([SACK.id]);
  await expect(progresso(page)).toHaveCount(0);
  fakes.anki.concluirEnvio(job.jobId);
  await expect(resumo(page)).toContainText('1 frase · 1 baralho', { timeout: 10_000 });
  expect(pedidos.seguros).toHaveLength(1);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
});

test('fechar o progresso antes de a Conexão recusar o pedido: o Envio que não começou é esquecido, e Enviar ao Anki manda as Frases de novo', async ({ page, context, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  fakes.anki.recusarEnvios('en');
  const pedidos = await segurarOsPedidosDeCriar(context);
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  await expect.poll(() => pedidos.seguros.length).toBe(1);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: null }] } });
  await page.keyboard.press('Escape');

  pedidos.soltar();
  await expect.poll(() => pedidosDeCriar(fakes).length).toBe(1);
  await estadoFinal(extensao, { pm_envio: null });
  await expect(page.getByRole('dialog')).toHaveCount(0);

  fakes.anki.aceitarEnvios('en');
  await enviarAoAnki(page).click();
  await expect(envio(page, 'Envio em inglês · 1 frase')).toContainText('Na fila');
  const [job] = await enviosCriados(fakes, 1);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
});

test('uma Frase enviada enquanto o Envio anda entra na mesma remessa: o progresso mostra os dois Envios, e o resumo conta os dois', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [primeiro] = await enviosCriados(fakes, 1);
  await page.keyboard.press('Escape');

  await marcarEEnviar(page, [ARM.texto]);

  await expect(progresso(page)).toContainText('2 envios · inglês');
  await expect(envio(page, 'Envio em inglês · 1 frase')).toHaveCount(2);
  const [, segundo] = await enviosCriados(fakes, 2);
  expect(segundo.entries.map(e => e.phraseId)).toEqual([ARM.id]);
  fakes.anki.concluirEnvio(primeiro.jobId);
  fakes.anki.concluirEnvio(segundo.jobId);
  await expect(resumo(page)).toContainText('2 frases · 1 baralho', { timeout: 10_000 });
  await expect(resumo(page)).toContainText('Tirar as 2 enviadas do histórico?');
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: primeiro.jobId }, { ids: [ARM.id], jobId: segundo.jobId }] } });
});

test('com a marca do Apagar tudo ainda esperando a Conexão, um Envio novo segue acompanhado até o resumo, e a marca fica', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS, pm_envio: { envios: [], apagarFrases: true } });
  fakes.anki.falharApagarFrases();
  await abrirPainel(page, extensao);
  await expect.poll(() => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/apagar-frases').length).toBeGreaterThan(0);

  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }], apagarFrases: true } });
  await expect(envio(page, 'Envio em inglês · 1 frase')).toContainText('Na fila');

  fakes.anki.concluirEnvio(job.jobId);
  await expect(resumo(page)).toContainText('1 frase · 1 baralho', { timeout: 10_000 });
  await resumo(page).getByRole('button', { name: 'Manter' }).click();
  await estadoFinal(extensao, { pm_envio: { envios: [], apagarFrases: true } });
});

test.describe('com o Anki fechado e a permissão do abridor', () => {
  test.use({ permissaoDoAbridor: true });

  test.beforeEach(async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
    fakes.anki.desligar();
    await abrirPainel(page, extensao);
    await marcarEEnviar(page, [SACK.texto]);
    await expect(faixaDoAnkiFechado(page)).toHaveText('Abrindo o Anki para enviar…');
  });

  test('as Frases que esperam o Anki abrir são as do clique: mudar a seleção enquanto ele abre não muda o Envio', async ({ page, extensao, fakes }) => {
    await marcar(page, SACK.texto).uncheck();
    await marcar(page, ARM.texto).check();

    fakes.anki.ligar();

    await expect(faixaDoAnkiFechado(page)).toBeHidden({ timeout: 10_000 });
    const [job] = await enviosCriados(fakes, 1);
    expect(job.entries.map(e => e.phraseId)).toEqual([SACK.id]);
    await expect(envio(page, 'Envio em inglês · 1 frase')).toBeVisible();
    await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
  });

  test('a Frase apagada enquanto o Anki abre não vai: quando ele abre, nenhum Envio sai e o progresso não abre', async ({ page, extensao, fakes }) => {
    await apagarAFrase(page, SACK.texto);

    fakes.anki.ligar();

    await expect(faixaDoAnkiFechado(page)).toBeHidden({ timeout: 10_000 });
    await expect(progresso(page)).toHaveCount(0);
    expect(pedidosDeCriar(fakes)).toHaveLength(0);
    await estadoFinal(extensao, { pm_envio: null });
    await estadoFinal(extensao, { frases: [ARM, LATE] });
  });
});
