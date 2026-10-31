'use strict';

// O limite do plano do ChatGPT no Envio (#158, história 85): o cartão do Envio diz “Limite de uso atingido · Faltam 7 cartões” com
// Gerenciar uso (a ação principal), Usar a minha chave e Tentar de novo, e o Envio volta sozinho quando o plano libera. A Conexão
// é o fake do e2e (`fakes.anki`), que faz o papel dela: a espera do plano é o `waiting` que o teste põe no Envio (`moverEnvio`), e
// `POST /jobs/usar-a-chave` responde pelo contrato (`complemento/contrato/exemplos-do-limite.json`). O lado da Conexão está em
// `complemento/test_limite_do_plano.py`.

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, abrirPainel, cartoesDe, envio, marcarEEnviar, enviosCriados, umaVoltaDoEnvio, progresso } = require('../apoio-do-envio');

const CARTAO = 'Envio em inglês · 3 frases';
const ESPERANDO_O_PLANO = { reason: 'plan_limit' };
const pedidosA = (fakes, caminho) => fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === caminho);
const retomadas = fakes => pedidosA(fakes, '/jobs/retry');
const usosDaChave = fakes => pedidosA(fakes, '/jobs/usar-a-chave');

test.beforeEach(({ fakes }) => {
  test.slow(); // o painel lê o Envio de 2 em 2 s, e cada teste espera algumas voltas
  fakes.anki.usarRelogio(() => AGORA);
});

/** Três Frases enviadas, o Envio andando com `prontos` de 10 Cartões no Anki, e o plano do ChatGPT chega ao limite. */
async function planoNoLimite(page, extensao, fakes, prontos = 3) {
  await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, INGLESAS.map(f => f.texto));
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', progress: { done: prontos, total: 10 }, cartoes: cartoesDe(prontos) });
  await expect(envio(page, CARTAO)).toContainText('Criando cartões', { timeout: 10_000 });
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', progress: { done: prontos, total: 10 }, cartoes: cartoesDe(prontos), esperando: ESPERANDO_O_PLANO });
  return job;
}

test('no limite do plano o cartão diz quantos cartões faltam e oferece Gerenciar uso, Usar a minha chave e Tentar de novo', async ({ page, extensao, fakes }) => {
  const job = await planoNoLimite(page, extensao, fakes);
  const cartao = envio(page, CARTAO);

  await expect(cartao).toContainText('Limite de uso atingido · Faltam 7 cartões', { timeout: 20_000 });
  await expect(cartao).toContainText('Quando o plano liberar, o Envio continua sozinho.');
  await expect(cartao.getByRole('link', { name: 'Gerenciar uso' })).toBeVisible();
  await expect(cartao.getByRole('button', { name: 'Usar a minha chave' })).toBeVisible();
  await expect(cartao.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(cartao.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);
  // O plano não é Anki fechado, e só olhar o cartão não mexe na Conexão.
  await umaVoltaDoEnvio(page);
  expect([retomadas(fakes), usosDaChave(fakes)]).toEqual([[], []]);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('com 1 cartão faltando o cartão diz “Falta 1 cartão”', async ({ page, extensao, fakes }) => {
  const job = await planoNoLimite(page, extensao, fakes, 9);

  await expect(envio(page, CARTAO)).toContainText('Limite de uso atingido · Falta 1 cartão', { timeout: 20_000 });
  await estadoFinal(extensao, { pm_envio: { envios: [{ jobId: job.jobId }] } });
});

test('Gerenciar uso é um link para a página de uso do ChatGPT, numa aba nova, e não mexe no Envio', async ({ page, extensao, fakes }) => {
  const job = await planoNoLimite(page, extensao, fakes);
  const gerenciar = envio(page, CARTAO).getByRole('link', { name: 'Gerenciar uso' });

  await expect(gerenciar).toHaveAttribute('href', 'https://chatgpt.com/settings/usage', { timeout: 20_000 });
  await expect(gerenciar).toHaveAttribute('target', '_blank');
  await expect(gerenciar).toHaveAttribute('rel', /noopener/);
  await umaVoltaDoEnvio(page);
  expect([retomadas(fakes), usosDaChave(fakes)]).toEqual([[], []]);
  await estadoFinal(extensao, { pm_envio: { envios: [{ jobId: job.jobId }] } });
});

test('Tentar de novo no limite pede à Conexão que tente já e o cartão segue esperando o plano', async ({ page, extensao, fakes }) => {
  const job = await planoNoLimite(page, extensao, fakes);
  const cartao = envio(page, CARTAO);
  await expect(cartao).toContainText('Limite de uso atingido', { timeout: 20_000 });

  await cartao.getByRole('button', { name: 'Tentar de novo' }).click();

  await expect.poll(() => retomadas(fakes).map(r => r.dados)).toEqual([{ jobId: job.jobId }]);
  // A Conexão só tentou o texto de novo: o plano ainda está no limite, e o Envio é o mesmo (nada foi criado nem posto na fila).
  await umaVoltaDoEnvio(page);
  await expect(cartao).toContainText('Limite de uso atingido · Faltam 7 cartões');
  expect(fakes.anki.envios).toHaveLength(1);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('Usar a minha chave segue o Envio pela chave: a Conexão marca o Envio, o limite sai do cartão e o Envio continua', async ({ page, extensao, fakes }) => {
  fakes.anki.guardarChaveNaConexao('9f3a');
  const job = await planoNoLimite(page, extensao, fakes);
  const cartao = envio(page, CARTAO);
  await expect(cartao).toContainText('Limite de uso atingido', { timeout: 20_000 });

  await cartao.getByRole('button', { name: 'Usar a minha chave' }).click();

  await expect.poll(() => usosDaChave(fakes).map(r => r.dados)).toEqual([{ jobId: job.jobId }]);
  await expect(cartao).not.toContainText('Limite de uso atingido');
  await expect(cartao.getByRole('button', { name: 'Usar a minha chave' })).toHaveCount(0);
  await umaVoltaDoEnvio(page);
  await expect(cartao).toContainText('Criando cartões');
  expect(fakes.anki.envios[0].state).toMatchObject({ status: 'running', usingKey: true });
  expect(fakes.anki.envios[0].state.waiting).toBeUndefined();
  expect(retomadas(fakes)).toEqual([]);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('Usar a minha chave sem chave guardada leva às Configurações da IA e o Envio segue esperando o plano', async ({ page, extensao, fakes }) => {
  const job = await planoNoLimite(page, extensao, fakes);
  const cartao = envio(page, CARTAO);
  await expect(cartao).toContainText('Limite de uso atingido', { timeout: 20_000 });

  await cartao.getByRole('button', { name: 'Usar a minha chave' }).click();

  await expect(page).toHaveURL(/#configuracoes\/ia$/);
  await expect(progresso(page)).toBeHidden();
  expect(usosDaChave(fakes)).toHaveLength(1);
  expect(fakes.anki.envios[0].state).toMatchObject({ status: 'running', waiting: ESPERANDO_O_PLANO });
  expect(fakes.anki.envios[0].state.usingKey).toBeUndefined();
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});

test('o Envio volta sozinho quando o plano libera: o limite sai do cartão sem nenhum clique', async ({ page, extensao, fakes }) => {
  const job = await planoNoLimite(page, extensao, fakes);
  const cartao = envio(page, CARTAO);
  await expect(cartao).toContainText('Limite de uso atingido · Faltam 7 cartões', { timeout: 20_000 });

  // O plano liberou e a Conexão continuou sozinha (o fake faz o papel dela).
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', progress: { done: 5, total: 10 }, cartoes: cartoesDe(5) });

  await expect(cartao).not.toContainText('Limite de uso atingido', { timeout: 20_000 });
  await expect(cartao).toContainText('Criando cartões');
  await expect(cartao.getByRole('button', { name: 'Usar a minha chave' })).toHaveCount(0);
  await expect(cartao.getByRole('link', { name: 'Gerenciar uso' })).toHaveCount(0);
  // Voltou sozinho: o painel só leu, e a pessoa não clicou em nada.
  expect([retomadas(fakes), usosDaChave(fakes)]).toEqual([[], []]);
  await estadoFinal(extensao, { pm_envio: { envios: [{ ids: INGLESAS.map(f => f.id), jobId: job.jobId }] } });
});
