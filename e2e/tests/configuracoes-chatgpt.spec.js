'use strict';

// Entrar com o ChatGPT (#155, docs/design/login-do-chatgpt.md): a coluna Conta do ChatGPT do card IA dos cartões, o login oficial
// pelo navegador e a linha “Usando o plano do ChatGPT · Gerenciar uso”. A Conexão com o Anki é o fake do e2e, que responde pelo
// contrato (complemento/contrato/exemplos-do-chatgpt.json) e guarda o login como a Conexão faria; a página do auth.openai.com é o
// fake do ChatGPT (e2e/fakes/chatgpt.js), que volta ao retorno da Conexão na 8766. O que fica guardado é o login na Conexão
// (`fakes.anki.chatgpt.situacao()`) e, no navegador, nada do login: o storage da extensão não ganha nada dele.

const { test, expect } = require('../fixtures');
const { estadoFinalEm } = require('../estado-final');

const card = page => page.locator('#cfg-ia');
const coluna = page => card(page).getByRole('region', { name: /Conta do ChatGPT/ });
const continuar = page => coluna(page).getByRole('button', { name: 'Continuar com o ChatGPT' });
const faixa = page => card(page).getByRole('alert');

async function abrirIA(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  await expect(coluna(page)).toBeVisible();
}

/** O storage inteiro da extensão como texto: nada do login (código, `state`, cliente emitido) pode estar nele. */
const storageInteiro = async extensao => JSON.stringify(await extensao.lerStorage(null));

test('sem login: a coluna do ChatGPT tem o tamanho da da chave, oferece Continuar com o ChatGPT e diz onde o login fica', async ({ page, extensao, fakes }) => {
  await abrirIA(page, extensao);

  const colunaDaChave = card(page).getByRole('region', { name: 'Chave da OpenAI' });
  const [a, b] = [await colunaDaChave.boundingBox(), await coluna(page).boundingBox()];
  expect(Math.abs(a.width - b.width)).toBeLessThan(1);
  await expect(coluna(page)).toContainText('Plus ou Pro');
  await expect(coluna(page)).toContainText('Use o seu plano em vez de pagar por cartão.');
  await expect(coluna(page)).toContainText('O login fica só neste computador, na Conexão com o Anki: nunca no navegador nem na nuvem.');
  await expect(continuar(page)).toBeEnabled();
  await expect(card(page)).toContainText('A imagem gerada por IA sempre sai pela chave, mesmo com o plano do ChatGPT.');

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'desconectada');
});

test('Continuar com o ChatGPT: o ChatGPT abre numa aba, a pessoa autoriza e a coluna diz Usando o plano do ChatGPT · Gerenciar uso', async ({ page, context, extensao, fakes }) => {
  await abrirIA(page, extensao);

  const [aba] = await Promise.all([context.waitForEvent('page'), continuar(page).click()]);
  await expect(aba).toHaveURL('http://127.0.0.1:8766/auth/callback?code=codigo-do-fake&state=state-da-tentativa-1&client_id=oaiapp_fake');
  await expect(aba.locator('body')).toHaveText('Pode fechar esta aba e voltar ao PerpetualMiner.');
  const [aberta] = fakes.chatgpt.abertas;
  expect([aberta.client_id, aberta.redirect_uri, aberta.code_challenge_method]).toEqual(['dynamic_agent_client', 'http://127.0.0.1:8766/auth/callback', 'S256']);

  await expect(coluna(page)).toContainText('Usando o plano do ChatGPT');
  await expect(coluna(page).getByRole('link', { name: 'Gerenciar uso' })).toHaveAttribute('href', 'https://chatgpt.com/settings/usage');
  await expect(coluna(page).getByRole('button', { name: 'Sair do ChatGPT' })).toBeVisible();
  await expect(continuar(page)).toHaveCount(0);

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'conectada');
  const storage = await storageInteiro(extensao);
  for (const doLogin of ['codigo-do-fake', 'state-da-tentativa', 'oaiapp_fake', 'auth.openai.com']) expect(storage).not.toContain(doLogin);
});

test('enquanto a pessoa não termina no ChatGPT, o botão espera e não abre outra aba', async ({ page, context, extensao, fakes }) => {
  fakes.chatgpt.responderNaAutorizacao('espera');
  await abrirIA(page, extensao);

  await Promise.all([context.waitForEvent('page'), continuar(page).click()]);
  const esperando = coluna(page).getByRole('button', { name: 'Esperando o ChatGPT…' });
  await expect(esperando).toHaveAttribute('aria-disabled', 'true');
  await expect(coluna(page)).toContainText('Termine a entrada na aba do ChatGPT que abriu.');
  await esperando.click({ force: true });
  expect(fakes.chatgpt.abertas).toHaveLength(1);

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'entrando');
});

test('recusar no ChatGPT: a faixa diz que o plano não foi liberado, com Tentar de novo, e nada vira login', async ({ page, context, extensao, fakes }) => {
  fakes.chatgpt.responderNaAutorizacao('recusa');
  await abrirIA(page, extensao);

  await Promise.all([context.waitForEvent('page'), continuar(page).click()]);
  await expect(faixa(page)).toContainText('Conta do ChatGPT: O ChatGPT não liberou o uso do plano. Entre de novo e permita o uso do plano.');
  await faixa(page).getByText('Detalhes').click();
  await expect(faixa(page)).toContainText('chatgpt_access_denied');
  await expect(faixa(page).getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(continuar(page)).toBeEnabled();

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'recusou');
});

test('Sair do ChatGPT: a Conexão apaga o login e a coluna volta a oferecer Continuar com o ChatGPT', async ({ page, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('conectada');
  await abrirIA(page, extensao);
  await expect(coluna(page)).toContainText('Usando o plano do ChatGPT');

  await coluna(page).getByRole('button', { name: 'Sair do ChatGPT' }).click();
  await expect(page.getByText('Você saiu do ChatGPT neste computador')).toBeVisible();
  await expect(continuar(page)).toBeEnabled();

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'desconectada');
});

test('com a Conexão desligada, Continuar com o ChatGPT diz que é ela que guarda o login e não abre aba', async ({ page, extensao, fakes }) => {
  await abrirIA(page, extensao);
  fakes.anki.desligar();

  await continuar(page).click();
  await expect(faixa(page)).toContainText('Conta do ChatGPT: A Conexão com o Anki não respondeu, e é ela que guarda o login. Ligue-a e tente de novo.');
  expect(fakes.chatgpt.abertas).toHaveLength(0);

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'desconectada');
});
