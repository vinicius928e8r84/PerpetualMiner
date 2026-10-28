'use strict';

// O Envio com o perfil fixo do Anki (#149, histórias 22 e 24): com outro perfil aberto o Envio espera e diz “O Anki está no
// perfil X. O Envio espera.” com “Abrir <perfil>”; o clique pede à Conexão que feche o perfil pelo caminho do Anki e abra o
// marcado. Com o marcado apagado, o cartão manda escolher outro nas Configurações. O que a Conexão faz com o Anki
// (fechar, sincronizar, abrir) é do ensaio do dono; aqui a Conexão é o fake e a tela é a verdadeira.

const { test, expect } = require('../fixtures');
const { AGORA, INGLESAS, SACK, ARM, abrirPainel, envio, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

const pedidosParaAbrir = fakes => fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/anki/profile/open');

async function enviarEEsperar(page, extensao, fakes, esperando) {
  fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Beto' });
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto]);
  const [ingles] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(ingles.jobId, { stage: 'wait_anki', esperando });
  return ingles;
}

test('com outro perfil aberto o Envio espera e o cartão diz em que perfil o Anki está', async ({ page, extensao, fakes }) => {
  await enviarEEsperar(page, extensao, fakes, { reason: 'other_profile', profile: 'Beto', marked: 'Ana' });

  const cartao = envio(page, 'Envio em inglês · 2 frases');
  await expect(cartao).toContainText('Esperando o Anki');
  await expect(cartao).toContainText('O Anki está no perfil Beto. O Envio espera.');
  await expect(cartao.getByRole('button', { name: 'Abrir Ana' })).toBeVisible();
  // A tela só espera: nada foi pedido ao Anki.
  expect(pedidosParaAbrir(fakes)).toHaveLength(0);
  expect(fakes.anki.perfilAberto()).toBe('Beto');
});

test('Abrir o perfil marcado pede à Conexão e o Anki fica no perfil certo', async ({ page, extensao, fakes }) => {
  const ingles = await enviarEEsperar(page, extensao, fakes, { reason: 'other_profile', profile: 'Beto', marked: 'Ana' });

  await envio(page, 'Envio em inglês · 2 frases').getByRole('button', { name: 'Abrir Ana' }).click();

  await expect.poll(() => fakes.anki.perfilAberto()).toBe('Ana');
  expect(pedidosParaAbrir(fakes)).toHaveLength(1);
  // O Envio segue de onde parou, como a Conexão faria com o perfil certo aberto.
  fakes.anki.concluirEnvio(ingles.jobId);
  await expect(page.getByRole('dialog', { name: /^Envio concluído/ })).toBeVisible();
});

test('o clique que a Conexão não atende diz que não deu e o cartão continua esperando', async ({ page, extensao, fakes }) => {
  await enviarEEsperar(page, extensao, fakes, { reason: 'other_profile', profile: 'Beto', marked: 'Ana' });
  fakes.anki.responder('POST', '/anki/profile/open', () => ({ status: 500, json: { error: 'internal_error' } }));

  await envio(page, 'Envio em inglês · 2 frases').getByRole('button', { name: 'Abrir Ana' }).click();

  await expect(page.locator('.veio-toast, .envio-cartao__motivo').filter({ hasText: 'Não deu para abrir o perfil. Tente de novo.' })).toBeVisible();
  expect(fakes.anki.perfilAberto()).toBe('Beto');
});

test('com o perfil marcado apagado o cartão manda escolher outro nas Configurações e nada abre', async ({ page, extensao, fakes }) => {
  await enviarEEsperar(page, extensao, fakes, { reason: 'profile_missing', profile: 'Beto', marked: 'Ana' });

  const cartao = envio(page, 'Envio em inglês · 2 frases');
  await expect(cartao).toContainText('O perfil “Ana” não está mais no Anki. O Envio espera você escolher outro.');
  await cartao.getByRole('button', { name: 'Escolher perfil' }).click();

  await expect(page).toHaveURL(/painel\.html#configuracoes\/anki$/);
  expect(pedidosParaAbrir(fakes)).toHaveLength(0);
  expect(fakes.anki.perfilAberto()).toBe('Beto');
});

test('um Envio que espera por outro motivo não fala de perfil', async ({ page, extensao, fakes }) => {
  fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto]);
  const [ingles] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(ingles.jobId, { stage: 'wait_anki' });

  const cartao = envio(page, 'Envio em inglês · 2 frases');
  await expect(cartao).toContainText('Esperando o Anki');
  await expect(cartao).not.toContainText('perfil');
});
