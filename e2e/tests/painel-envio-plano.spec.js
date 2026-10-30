'use strict';

// O Envio que o plano do ChatGPT parou (#156, docs/design/imagem-pelo-plano.md): o primeiro limite de uso logo depois de entrar mostra
// Gerenciar uso e deixa tentar de novo, sem concluir que a cota acabou; a conta que o plano não atende diz que a chave é o caminho.
// A Conexão com o Anki é o fake do e2e: ele termina o Envio com o código que a Conexão de verdade grava (`lastError`, complemento/envio.py).

const { test, expect } = require('../fixtures');
const { estadoFinalEm } = require('../estado-final');
const { AGORA, INGLESAS, RUSSA, SACK, abrirPainel, resumo, envio, baralho, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');

const LIMITE = 'O ChatGPT recusou o pedido por limite de uso. Logo depois de entrar, isso pode acontecer sem a cota ter acabado: veja em Gerenciar uso e tente de novo.';
const NAO_SERVE = 'O plano do ChatGPT não serve para a conta grátis ou Go. Use a chave da OpenAI.';

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test('o primeiro limite de uso do plano: o resumo mostra Gerenciar uso e Tentar de novo, não diz que a cota acabou, e o Envio volta à fila', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.concluirEnvio(job.jobId, { erro: 'chatgpt_usage_limit' });

  await expect(baralho(page, 'Inglês')).toContainText('1 não entrou', { timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).toContainText(LIMITE);
  await expect(baralho(page, 'Inglês')).not.toContainText(/acabou|esgot/);
  await expect(baralho(page, 'Inglês').getByRole('link', { name: 'Gerenciar uso' })).toHaveAttribute('href', 'https://chatgpt.com/settings/usage');
  await baralho(page, 'Inglês').getByRole('button', { name: 'Tentar de novo' }).click();

  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === '/jobs/retry' && r.dados?.jobId === job.jobId)).toBe(true);
  await estadoFinalEm('o Envio na Conexão', () => fakes.anki.envios[0].state.status, 'queued');
});

test('o limite de uso também aparece no cartão do Envio, enquanto outro Envio anda', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);
  fakes.anki.moverEnvio(russo.jobId, { stage: 'generate_cards' });
  fakes.anki.concluirEnvio(ingles.jobId, { erro: 'chatgpt_usage_limit' });

  const cartaoIngles = envio(page, 'Envio em inglês · 1 frase');
  await expect(cartaoIngles).toContainText(LIMITE, { timeout: 10_000 });
  await expect(cartaoIngles.getByRole('link', { name: 'Gerenciar uso' })).toHaveAttribute('href', 'https://chatgpt.com/settings/usage');
  await cartaoIngles.getByRole('button', { name: 'Tentar de novo' }).click();

  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === '/jobs/retry' && r.dados?.jobId === ingles.jobId)).toBe(true);
  await estadoFinalEm('o Envio em inglês na Conexão', () => fakes.anki.envios.find(e => e.jobId === ingles.jobId).state.status, 'queued');
});

test('a conta que o plano não atende: o resumo diz que a chave é o caminho e Usar a chave leva ao card da IA', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.concluirEnvio(job.jobId, { erro: 'chatgpt_not_eligible' });

  await expect(baralho(page, 'Inglês')).toContainText(NAO_SERVE, { timeout: 10_000 });
  await expect(baralho(page, 'Inglês').getByRole('link', { name: 'Gerenciar uso' })).toHaveCount(0);
  await baralho(page, 'Inglês').getByRole('button', { name: 'Usar a chave' }).click();

  await expect(page).toHaveURL(/#configuracoes\/ia$/);
  await expect(resumo(page)).toHaveCount(0);
  await estadoFinalEm('o Envio na Conexão', () => fakes.anki.envios[0].state.lastError, 'chatgpt_not_eligible');
});

test('um Envio que falhou por outro motivo não ganha a cópia do plano', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.concluirEnvio(job.jobId, { erro: 'anki_timeout' });

  await expect(baralho(page, 'Inglês')).toContainText('1 não entrou', { timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).not.toContainText('ChatGPT');
  await expect(baralho(page, 'Inglês').getByRole('link', { name: 'Gerenciar uso' })).toHaveCount(0);
  await estadoFinalEm('o Envio na Conexão', () => fakes.anki.envios[0].state.lastError, 'anki_timeout');
});
