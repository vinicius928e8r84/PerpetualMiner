'use strict';

// O Envio que parou porque a pessoa fechou o Anki (#151, histórias 83, 84 e 86): o cartão do Envio diz quantos Cartões já estão
// no Anki e que o Envio continua sozinho quando o Anki abrir; Continuar envio abre o Anki pelo abridor (o host de mentira do fixture,
// e2e/fakes/abridor.js); e o abridor nunca reabre um Anki que a pessoa fechou: só o clique o chama. Quem retoma o Envio é a Conexão,
// quando sobe com o Anki (complemento/test_envio_retomada.py); aqui o teste faz o papel dela com o fake (`moverEnvio`).

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const contrato = require('../../complemento/contrato/exemplos.json');
const { AGORA, INGLESAS, RUSSA, SACK, ARM, abrirPainel, cartoesDe, enviarAoAnki, marcarEEnviar, envio, progresso, enviosCriados, umaVoltaDoEnvio } = require('../apoio-do-envio');

/** As mensagens `abrir` que o abridor recebeu. */
const aberturas = fakes => fakes.abridor.pedidos().filter(p => p.mensagem.acao === 'abrir');
const ABRIR = { mensagem: { acao: 'abrir' }, origem: `${contrato.origemDaExtensao}/` };
const retomadas = fakes => fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/jobs/retry');

test.beforeEach(({ fakes }) => {
  test.slow(); // o painel só nota o Anki fechado na volta seguinte do Envio, e cada teste espera algumas
  fakes.anki.usarRelogio(() => AGORA);
});

test.use({ permissaoDoAbridor: true });

/** Três Frases enviadas, o Envio andando com `prontos` de 10 Cartões no Anki, e a pessoa fecha o Anki. */
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
  // O cartão já diz o que acontece: a linha “Sem resposta da Conexão” (ENV-09) não repete.
  await expect(progresso(page).getByText('Sem resposta da Conexão com o Anki. Tentando de novo…')).toBeHidden();
  // A pessoa fechou o Anki: voltas inteiras do acompanhamento passam e ninguém o abre.
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
  // O Anki abriu e a Conexão retomou o Envio de onde ele estava (o fake faz o papel dela).
  fakes.anki.ligar();
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', progress: { done: 5, total: 10 }, cartoes: cartoesDe(5) });
  await expect(cartao).not.toContainText('Quando o Anki abrir', { timeout: 20_000 });
  await expect(cartao).toContainText('Criando cartões');
  await expect(cartao.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);
  // Continuar sozinho: o painel só lê, não manda retomar, e não abre o Anki outra vez.
  expect(retomadas(fakes)).toEqual([]);
  expect(aberturas(fakes)).toEqual([ABRIR]);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
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
  // O Cartão que falhou tem Tentar de novo nele mesmo; Continuar envio é do Envio parado, não deste.
  await expect(cartao.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);

  await cartao.getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(cartao).toContainText('Na fila');
  expect(retomadas(fakes).map(r => r.dados.jobId)).toEqual([ingles.jobId]);
  await estadoFinalEm('os Cartões do Envio na Conexão', () => Object.fromEntries(Object.entries(fakes.anki.envios[0].state.cards).map(([id, c]) => [id, c.status])),
    { [`${SACK.id}-0`]: 'added', [`${ARM.id}-0`]: 'pending' });
});
