'use strict';

const fs = require('fs');
const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const contrato = require('../../complemento/contrato/exemplos.json');
const { AGORA, INGLESAS, RUSSA, SACK, ARM, abrirPainel, cartoesDe, enviarAoAnki, marcarEEnviar, envio, progresso, enviosCriados, umaVoltaDoEnvio, toasts } = require('../apoio-do-envio');

const aberturas = fakes => fakes.abridor.pedidos().filter(p => p.mensagem.acao === 'abrir');
const ABRIR = { mensagem: { acao: 'abrir' }, origem: `${contrato.origemDaExtensao}/` };
const retomadas = fakes => fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/jobs/retry');

test.beforeEach(({ fakes }) => {
  test.slow();
  fakes.anki.usarRelogio(() => AGORA);
});

test.use({ permissaoDoAbridor: true });

async function fecharOAnkiNoMeio(page, extensao, fakes, prontos = 3) {
  await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, INGLESAS.map(f => f.texto));
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', progress: { done: prontos, total: 10 }, cartoes: cartoesDe(prontos) });
  await expect(envio(page, 'Envio em inglês · 3 frases')).toContainText('Criando cartões', { timeout: 10_000 });
  fakes.anki.desligar();
  return job;
}

test('o Anki fechado no meio: o cartão diz quantos já estão no Anki e que o Envio continua sozinho, e o abridor não é chamado', async ({ page, extensao, fakes }) => {
  const job = await fecharOAnkiNoMeio(page, extensao, fakes);

  await expect(envio(page, 'Envio em inglês · 3 frases')).toContainText('3 de 10 no Anki. Quando o Anki abrir, o Envio continua sozinho.', { timeout: 20_000 });
  await expect(envio(page, 'Envio em inglês · 3 frases').getByRole('button', { name: 'Continuar envio' })).toBeVisible();
  await expect(progresso(page).getByText('Sem resposta da Conexão com o Anki. Tentando de novo…')).toBeHidden();
  await umaVoltaDoEnvio(page);
  expect(aberturas(fakes)).toEqual([]);
  expect(retomadas(fakes)).toEqual([]);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('o progresso fechado com o Anki fechado: Enviar ao Anki de novo o reabre com o Envio parado, sem chamar o abridor', async ({ page, extensao, fakes }) => {
  const job = await fecharOAnkiNoMeio(page, extensao, fakes);
  await expect(envio(page, 'Envio em inglês · 3 frases')).toContainText('Quando o Anki abrir', { timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(progresso(page)).toBeHidden();

  await enviarAoAnki(page).click();

  await expect(envio(page, 'Envio em inglês · 3 frases')).toContainText('3 de 10 no Anki. Quando o Anki abrir, o Envio continua sozinho.');
  expect(aberturas(fakes)).toEqual([]);
  expect(fakes.anki.envios).toHaveLength(1);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('Continuar envio abre o Anki pelo abridor, uma vez; quando o Anki abre o Envio continua sozinho, sem pedir nada à Conexão', async ({ page, extensao, fakes }) => {
  const job = await fecharOAnkiNoMeio(page, extensao, fakes);
  const cartao = envio(page, 'Envio em inglês · 3 frases');
  await expect(cartao).toContainText('Quando o Anki abrir, o Envio continua sozinho.', { timeout: 20_000 });

  await cartao.getByRole('button', { name: 'Continuar envio' }).click();

  await expect(cartao).toContainText('Abrindo o Anki para enviar…');
  await expect.poll(() => aberturas(fakes)).toEqual([ABRIR]);
  fakes.anki.ligar();
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', progress: { done: 5, total: 10 }, cartoes: cartoesDe(5) });
  await expect(cartao).not.toContainText('Quando o Anki abrir', { timeout: 20_000 });
  await expect(cartao).toContainText('Criando cartões');
  await expect(cartao.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);
  expect(retomadas(fakes)).toEqual([]);
  expect(aberturas(fakes)).toEqual([ABRIR]);
  await umaVoltaDoEnvio(page);
  await expect(cartao).not.toContainText('Não deu para abrir');
  await cartao.getByText('Detalhes').click();
  await expect(cartao).not.toContainText('abridor ·');
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('Continuar envio com o Anki que travou: o abridor o reinicia pelo consertar, o toast conta e o cartão não diz que falhou', async ({ page, extensao, fakes }) => {
  fakes.abridor.definirConserto('anki_travado');
  const job = await fecharOAnkiNoMeio(page, extensao, fakes);
  const cartao = envio(page, 'Envio em inglês · 3 frases');
  await expect(cartao).toContainText('Quando o Anki abrir, o Envio continua sozinho.', { timeout: 20_000 });

  await cartao.getByRole('button', { name: 'Continuar envio' }).click();

  await expect(cartao).toContainText('Abrindo o Anki para enviar…');
  fakes.anki.ligar();
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', progress: { done: 5, total: 10 }, cartoes: cartoesDe(5) });
  await expect(toasts(page)).toHaveText('O Anki travou e foi reiniciado.', { timeout: 20_000 });
  await expect(cartao).not.toContainText('Quando o Anki abrir');
  await umaVoltaDoEnvio(page);
  await expect(cartao).not.toContainText('Não deu para abrir');
  await cartao.getByText('Detalhes').click();
  await expect(cartao).not.toContainText('abridor ·');
  expect(aberturas(fakes)).toEqual([]);
  expect(retomadas(fakes)).toEqual([]);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('Continuar envio com o conserto que falhou: o cartão conta, oferece Baixar diagnóstico e guarda o motivo no Detalhes', async ({ page, extensao, fakes }) => {
  fakes.abridor.definirConserto('anki_nao_fecha');
  const job = await fecharOAnkiNoMeio(page, extensao, fakes);
  const cartao = envio(page, 'Envio em inglês · 3 frases');
  await expect(cartao).toContainText('Quando o Anki abrir, o Envio continua sozinho.', { timeout: 20_000 });

  await cartao.getByRole('button', { name: 'Continuar envio' }).click();

  await expect(cartao).toContainText('Não deu para consertar. Feche o Anki e abra de novo.');
  await expect(cartao).not.toContainText('Não deu para abrir');
  await expect(cartao).toContainText('Quando o Anki abrir, o Envio continua sozinho.');
  await cartao.getByText('Detalhes').click();
  await expect(cartao).toContainText('abridor · falhou · nao_fechou');
  expect(aberturas(fakes)).toEqual([]);
  await expect(cartao.getByRole('button', { name: 'Continuar envio' })).toBeVisible();

  const baixando = page.waitForEvent('download');
  await cartao.getByRole('button', { name: 'Baixar diagnóstico' }).click();
  const download = await baixando;
  expect(download.suggestedFilename()).toBe('diagnostico-do-conserto.json');
  expect(JSON.parse(fs.readFileSync(await download.path(), 'utf8'))).toMatchObject({ tipo: 'diagnostico-do-conserto', desfecho: 'falhou', motivo: 'nao_fechou' });
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('Continuar envio com a Conexão que sumiu do Anki: o cartão conta e o botão Instalar de novo leva ao passo da primeira conexão', async ({ page, extensao, fakes }) => {
  fakes.abridor.definirConserto('complemento_sumiu');
  const job = await fecharOAnkiNoMeio(page, extensao, fakes);
  const cartao = envio(page, 'Envio em inglês · 3 frases');
  await expect(cartao).toContainText('Quando o Anki abrir, o Envio continua sozinho.', { timeout: 20_000 });

  await cartao.getByRole('button', { name: 'Continuar envio' }).click();

  await expect(cartao).toContainText('A Conexão com o Anki não está mais no Anki.');
  await expect(cartao).not.toContainText('Não deu para abrir');
  expect(aberturas(fakes)).toEqual([]);
  await cartao.getByRole('button', { name: 'Instalar de novo' }).click();

  await expect(page).toHaveURL(/painel\.html#anki$/);
  await estadoFinal(extensao, { pm_anki_ja_conectou: false });
});

test('a pessoa abre o Anki por conta própria: o Envio continua e o abridor nunca é chamado', async ({ page, extensao, fakes }) => {
  const job = await fecharOAnkiNoMeio(page, extensao, fakes, 0);
  const cartao = envio(page, 'Envio em inglês · 3 frases');
  await expect(cartao).toContainText('0 de 10 no Anki. Quando o Anki abrir, o Envio continua sozinho.', { timeout: 20_000 });

  fakes.anki.ligar();
  fakes.anki.concluirEnvio(job.jobId);

  await expect(progresso(page)).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('dialog', { name: 'Envio concluído' })).toBeVisible();
  expect(aberturas(fakes)).toEqual([]);
  expect(retomadas(fakes)).toEqual([]);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('Continuar envio sem o abridor que abra o Anki diz que não deu, e a frase de que o Envio continua sozinho segue', async ({ page, extensao, fakes }) => {
  fakes.abridor.definir('achei_sem_abrir');
  const job = await fecharOAnkiNoMeio(page, extensao, fakes);
  const cartao = envio(page, 'Envio em inglês · 3 frases');
  await expect(cartao).toContainText('Quando o Anki abrir, o Envio continua sozinho.', { timeout: 20_000 });

  await cartao.getByRole('button', { name: 'Continuar envio' }).click();

  await expect(cartao).toContainText('Não deu para abrir o Anki. Abra-o você mesmo.');
  await expect(cartao).toContainText('Quando o Anki abrir, o Envio continua sozinho.');
  await cartao.getByText('Detalhes').click();
  await expect(cartao).toContainText('abridor · nao_abriu');
  expect(aberturas(fakes)).toEqual([ABRIR]);
  await expect(cartao.getByRole('button', { name: 'Continuar envio' })).toBeVisible();
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('Tentar de novo no cartão do Envio que ficou em parte pede só o que falta: o Cartão pronto segue pronto', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto, RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);
  fakes.anki.moverEnvio(russo.jobId, { stage: 'generate_cards' });
  fakes.anki.moverEnvio(ingles.jobId, { stage: 'send_to_anki', cartoes: { [`${SACK.id}-0`]: 'added', [`${ARM.id}-0`]: 'failed' } });
  fakes.anki.concluirEnvio(ingles.jobId, { falhas: [ARM.id] });
  const cartao = envio(page, 'Envio em inglês · 2 frases');
  await expect(cartao).toContainText('Concluído em parte', { timeout: 10_000 });
  await expect(cartao.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);

  await cartao.getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(cartao).toContainText('Na fila');
  expect(retomadas(fakes).map(r => r.dados.jobId)).toEqual([ingles.jobId]);
  await estadoFinalEm('os Cartões do Envio na Conexão', () => Object.fromEntries(Object.entries(fakes.anki.envios[0].state.cards).map(([id, c]) => [id, c.status])),
    { [`${SACK.id}-0`]: 'added', [`${ARM.id}-0`]: 'pending' });
});
