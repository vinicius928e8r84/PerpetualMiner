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

test('se a Conexão responde com um endereço que não é o da autorização oficial do ChatGPT, nenhuma aba abre e a faixa diz que não deu para entrar', async ({ page, context, extensao, fakes }) => {
  fakes.chatgpt.responderAoEntrarComAUrl('https://evil.exemplo/api/accounts/authorize?client_id=dynamic_agent_client&redirect_uri=http%3A%2F%2F127.0.0.1%3A8766%2Fauth%2Fcallback&state=roubado');
  await abrirIA(page, extensao);
  const abasAntes = context.pages().length;

  await continuar(page).click();
  await expect(faixa(page)).toContainText('Conta do ChatGPT: Não deu para entrar com o ChatGPT. Tente de novo.');
  await expect(faixa(page).getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(continuar(page)).toBeEnabled();
  expect(fakes.chatgpt.abertas).toHaveLength(0);
  expect(context.pages()).toHaveLength(abasAntes);
  expect(context.pages().map(aba => aba.url()).filter(url => url.includes('evil.exemplo'))).toEqual([]);

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'desconectada');
});

test('Sair do ChatGPT: a Conexão apaga o login e a coluna volta a oferecer Continuar com o ChatGPT', async ({ page, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('conectada');
  await extensao.gravarStorage({ pm_plano_do_chatgpt_avisado: true }); // o modal da primeira vez já foi dado (configuracoes-chatgpt-plano.spec.js)
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

// O login que acabou (a Conexão recusou a renovação do token, `acabou` no estado): o Envio para e não gasta a chave sozinho, e a
// coluna dá as duas saídas, que são escolhas da pessoa. A regra, sem navegador: complemento/test_quem_paga.py.
const ACABOU = 'Conta do ChatGPT: O login do ChatGPT acabou. Entre de novo para seguir pelo plano, ou use a chave da OpenAI.';

test('o login que acabou: a faixa diz que acabou, com o código no Detalhes, e Continuar com o ChatGPT entra de novo', async ({ page, context, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('acabou');
  await extensao.gravarStorage({ pm_plano_do_chatgpt_avisado: true });
  await abrirIA(page, extensao);

  await expect(faixa(page)).toContainText(ACABOU);
  await expect(faixa(page).getByRole('button', { name: 'Usar a chave' })).toBeVisible();
  await faixa(page).getByText('Detalhes').click();
  await expect(faixa(page)).toContainText('chatgpt_signed_out');
  await expect(coluna(page)).not.toContainText('Usando o plano do ChatGPT');

  await Promise.all([context.waitForEvent('page'), continuar(page).click()]);
  await expect(coluna(page)).toContainText('Usando o plano do ChatGPT');
  await expect(faixa(page)).toHaveCount(0);

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'conectada');
});

test('o login que acabou: recusar no ChatGPT ao entrar de novo deixa o login acabado, e a faixa segue com as duas saídas', async ({ page, context, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('acabou');
  fakes.chatgpt.responderNaAutorizacao('recusa');
  await abrirIA(page, extensao);
  await expect(faixa(page)).toContainText(ACABOU);

  const [aba] = await Promise.all([context.waitForEvent('page'), continuar(page).click()]);
  await expect(aba.locator('body')).toHaveText('Pode fechar esta aba e voltar ao PerpetualMiner.');
  await expect(faixa(page)).toContainText(ACABOU);
  await expect(faixa(page).getByRole('button', { name: 'Usar a chave' })).toBeVisible();
  await expect(continuar(page)).toBeEnabled();

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'acabou');
});

test('o login que acabou: Usar a chave tira o login acabado da Conexão sem dizer que a pessoa saiu, e o modelo passa a dizer Pago pela sua chave', async ({ page, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('acabou');
  fakes.anki.guardarChaveNaConexao('9f3a');
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
  await abrirIA(page, extensao);
  await expect(faixa(page)).toContainText(ACABOU);
  // Ninguém paga enquanto a pessoa não escolhe: o card não oferece o modelo, nem diz que a chave paga.
  await expect(card(page)).not.toContainText('Pago pela sua chave');

  await faixa(page).getByRole('button', { name: 'Usar a chave' }).click();
  await expect(faixa(page)).toHaveCount(0);
  await expect(continuar(page)).toBeEnabled();
  await expect(page.getByText('Você saiu do ChatGPT neste computador')).toHaveCount(0);
  await card(page).locator('details.ia-avancado summary').click();
  await expect(card(page)).toContainText('Pago pela sua chave');

  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'desconectada');
});
