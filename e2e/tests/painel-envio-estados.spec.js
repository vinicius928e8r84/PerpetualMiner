'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { AGORA, INGLESAS, SACK, ARM, abrirPainel, marcar, enviarAoAnki, progresso, resumo, envio, baralho, enviosCriados } = require('../apoio-do-envio');

const pedidosDeCriar = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs');
const ingles = page => envio(page, /^Envio em inglês/);

test.beforeEach(async ({ extensao, fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
  await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
});

test('a Conexão aceita o pedido do Envio e não responde: o cartão não diz “Na fila”, o prazo vence em “Não começou” com Tentar de novo, e o Enviar ao Anki segue vivo', async ({ page, extensao, fakes }) => {
  test.setTimeout(90_000);
  await abrirPainel(page, extensao);
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  await marcar(page, SACK.texto).check();

  fakes.anki.silenciar('/jobs');
  await enviarAoAnki(page).click();
  await expect(ingles(page)).toContainText('Enviando o pedido');
  await expect(ingles(page)).not.toContainText('Na fila');
  await expect(ingles(page)).not.toContainText('etapa');
  await expect(ingles(page).getByRole('button')).toHaveCount(0);

  await expect(ingles(page)).toContainText('Não começou', { timeout: 30_000 });
  await expect(ingles(page)).toContainText('A Conexão com o Anki não respondeu. Confira se ela está ligada.');
  expect(fakes.anki.envios).toHaveLength(0);

  fakes.anki.voltarAFalar();
  await ingles(page).getByRole('button', { name: 'Tentar de novo' }).click();
  const [criado] = await enviosCriados(fakes, 1);
  await expect(ingles(page)).toContainText('Na fila');

  await page.locator('#modal-envio-fechar').click();
  await expect(progresso(page)).toBeHidden();
  await marcar(page, SACK.texto).uncheck();
  await marcar(page, ARM.texto).check();
  await enviarAoAnki(page).click();
  const [, segundo] = await enviosCriados(fakes, 2);
  expect(segundo.entries.map(e => e.phraseId)).toEqual([ARM.id]);
  await estadoFinalEm('os Envios que o painel acompanha', async () => (await extensao.lerStorage('pm_envio')).pm_envio.envios.map(e => [e.jobId, e.ids, e.falhaAoCriar]),
    [[criado.jobId, [SACK.id], null], [segundo.jobId, [ARM.id], null]]);
});

test('a chave recusada: o resumo diz o motivo e oferece Trocar a chave, além do Tentar de novo', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao);
  await marcar(page, SACK.texto).check();
  await enviarAoAnki(page).click();
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', cartoes: { [`${SACK.id}-0`]: 'failed' } });
  fakes.anki.concluirEnvio(job.jobId, { erro: 'openai_key_rejected' });

  await expect(resumo(page)).toBeVisible({ timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).toContainText('1 não entrou');
  await expect(baralho(page, 'Inglês')).toContainText('A OpenAI não aceitou a chave.');
  await expect(baralho(page, 'Inglês').getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await baralho(page, 'Inglês').getByRole('button', { name: 'Trocar a chave' }).click();
  await expect(resumo(page)).toBeHidden();
  await expect(page).toHaveURL(/#configuracoes\/ia$/);
  await estadoFinal(extensao, { pm_envio: null, frases: INGLESAS });
});

test('a chave recusada num Envio, com outro ainda andando: o cartão dele diz o motivo e leva a Trocar a chave', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, { id: 1_700_000_000_002, texto: 'Я улыбаюсь каждое утро.', data: '18/09/2026', streaming: 'netflix', idioma: 'Russo' }] });
  await abrirPainel(page, extensao);
  await marcar(page, SACK.texto).check();
  await marcar(page, 'Я улыбаюсь каждое утро.').check();
  await enviarAoAnki(page).click();
  const [doIngles, doRusso] = await enviosCriados(fakes, 2);
  fakes.anki.moverEnvio(doRusso.jobId, { stage: 'generate_cards' });
  fakes.anki.concluirEnvio(doIngles.jobId, { erro: 'openai_key_rejected' });

  await expect(ingles(page)).toContainText('Não concluído', { timeout: 10_000 });
  await expect(ingles(page)).toContainText('A OpenAI não aceitou a chave.');
  await expect(ingles(page).getByRole('button', { name: 'Trocar a chave' })).toBeVisible();
  await expect(ingles(page).getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await estadoFinalEm('o Envio em inglês na Conexão', () => doIngles.state.lastError, 'openai_key_rejected');
});

test('o login do ChatGPT acabou no meio do Envio: o cartão e o resumo dizem isso e levam ao card da IA, onde a pessoa escolhe; o cartão não oferece Tentar de novo', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, { id: 1_700_000_000_002, texto: 'Я улыбаюсь каждое утро.', data: '18/09/2026', streaming: 'netflix', idioma: 'Russo' }] });
  await abrirPainel(page, extensao);
  await marcar(page, SACK.texto).check();
  await marcar(page, 'Я улыбаюсь каждое утро.').check();
  await enviarAoAnki(page).click();
  const [doIngles, doRusso] = await enviosCriados(fakes, 2);
  fakes.anki.chatgpt.definir('acabou');
  fakes.anki.moverEnvio(doRusso.jobId, { stage: 'generate_cards' });
  fakes.anki.concluirEnvio(doIngles.jobId, { erro: 'chatgpt_signed_out' });

  const ACABOU = 'O login do ChatGPT acabou. Entre de novo ou use a chave: o Envio não troca sozinho.';
  await expect(ingles(page)).toContainText('Não concluído', { timeout: 10_000 });
  await expect(ingles(page)).toContainText(ACABOU);
  await expect(ingles(page).getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);

  fakes.anki.concluirEnvio(doRusso.jobId, { erro: 'chatgpt_signed_out' });
  await expect(resumo(page)).toBeVisible({ timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).toContainText(ACABOU);
  await baralho(page, 'Inglês').getByRole('button', { name: 'Abrir IA dos cartões' }).click();
  await expect(resumo(page)).toBeHidden();
  await expect(page).toHaveURL(/#configuracoes\/ia$/);
  await expect(page.locator('#cfg-ia').getByRole('alert')).toContainText('Conta do ChatGPT: O login do ChatGPT acabou.');

  await estadoFinalEm('o Envio em inglês na Conexão', () => doIngles.state.lastError, 'chatgpt_signed_out');
  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'acabou');
});

test('as Frases do Envio foram apagadas na Conexão por outro navegador: o cartão diz isso e só oferece Esquecer; nenhum Tentar de novo sai, e nada fica em laço', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao);
  await marcar(page, SACK.texto).check();
  await marcar(page, ARM.texto).check();
  await enviarAoAnki(page).click();
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', cartoes: { [`${SACK.id}-0`]: 'added', [`${ARM.id}-0`]: 'pending' } });
  await expect(ingles(page)).toContainText('Criando cartões', { timeout: 10_000 });

  fakes.anki.apagarAsFrases();

  await expect(ingles(page)).toContainText('Não concluído', { timeout: 10_000 });
  await expect(ingles(page)).toContainText('As frases deste Envio foram apagadas da Conexão com o Anki.');
  await expect(ingles(page).getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await page.waitForTimeout(4_500);   // duas voltas do acompanhamento
  await expect(resumo(page)).toBeHidden();
  await expect(progresso(page)).toBeVisible();

  await ingles(page).getByRole('button', { name: 'Esquecer' }).click();
  await expect(progresso(page)).toBeHidden();
  await estadoFinalEm('os pedidos de retomar que chegaram à Conexão', () => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry').length, 0);
  await estadoFinal(extensao, { pm_envio: null, frases: INGLESAS });
});

test('as Frases de um Envio que não concluiu são apagadas na Conexão sem o painel saber: a Conexão recusa o Tentar de novo do resumo e a Frase vai num Envio novo', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao);
  await marcar(page, SACK.texto).check();
  await enviarAoAnki(page).click();
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', cartoes: { [`${SACK.id}-0`]: 'failed' } });
  fakes.anki.concluirEnvio(job.jobId, { erro: 'openai_rate_limited' });
  await expect(resumo(page)).toBeVisible({ timeout: 10_000 });

  fakes.anki.silenciar('/jobs/list');
  fakes.anki.apagarAsFrases();
  await baralho(page, 'Inglês').getByRole('button', { name: 'Tentar de novo' }).click();

  const [, novo] = await enviosCriados(fakes, 2);
  expect(novo.entries.map(e => e.phraseId)).toEqual([SACK.id]);
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry').map(r => r.dados?.jobId)).toEqual([job.jobId]);
  await expect(progresso(page)).not.toContainText('Não deu para retomar o envio');
  await estadoFinalEm('os Envios que o painel acompanha', async () => (await extensao.lerStorage('pm_envio')).pm_envio.envios.map(e => [e.jobId, e.ids]),
    [[job.jobId, []], [novo.jobId, [SACK.id]]]);
});

const custos = page => page.locator('#anki-custos');
const naAbaCustos = () => [
  { jobId: 'job-en-falhou', lang: 'en', createdAt: new Date().toISOString(), status: 'failed', pedidas: 3, custos: { cartoes: 0.011 }, lastError: 'openai_rate_limited' },
  { jobId: 'job-ru-apagado', lang: 'ru', createdAt: new Date().toISOString(), status: 'failed', pedidas: 2, custos: { cartoes: 0 }, lastError: 'frases_apagadas' },
];

test('na aba Custos, o Envio com as Frases apagadas diz isso e não oferece Continuar envio; o que a Conexão recusa depois do clique também, sem “Envio retomado”', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(naAbaCustos());
  fakes.anki.responder('POST', '/jobs/retry', () => ({ status: 409, json: { error: 'job_wiped' } }));
  await page.goto(extensao.url('painel.html#anki/custos'));
  const opcoes = custos(page).getByRole('listbox', { name: 'Envios recentes' }).getByRole('option');

  await opcoes.filter({ hasText: 'Envio em russo' }).click();
  const apagado = page.getByRole('region', { name: 'Envio em russo · 2 frases' });
  await expect(apagado).toContainText('As frases deste Envio foram apagadas da Conexão com o Anki.');
  await expect(apagado.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);

  await opcoes.filter({ hasText: 'Envio em inglês' }).click();
  const falhou = page.getByRole('region', { name: 'Envio em inglês · 3 frases' });
  await falhou.getByRole('button', { name: 'Continuar envio' }).click();
  await expect(falhou).toContainText('As frases deste Envio foram apagadas da Conexão com o Anki.');
  await expect(falhou.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);
  await expect(falhou).not.toContainText('Não deu para retomar o envio');
  await expect(page.locator('.veio-toast')).toHaveCount(0);
  await estadoFinalEm('os pedidos de retomar que chegaram à Conexão', () => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry').map(r => r.dados?.jobId), ['job-en-falhou']);
});
