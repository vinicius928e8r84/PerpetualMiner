'use strict';

const fs = require('fs');
const { test, expect } = require('../fixtures');
const conexaoReal = require('../conexao-real');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const contrato = require('../../complemento/contrato/exemplos.json');
const { exemploDaExtensao, diferencaDoContrato } = require('../fakes/anki');
const { pedirDaPagina } = require('../pareamento-de-teste');

const PRAZO_DA_CONEXAO_MS = 20000;

const CHAVE = 'sk-proj-chave-de-exemplo-9f3a';

test.beforeEach(({ conexaoDoTeste }) => {
  test.skip(!conexaoDoTeste, 'só no modo PM_CONEXAO=real');
});

const card = page => page.locator('#cfg-ia');
const campo = page => card(page).getByRole('textbox', { name: 'Chave da OpenAI' });

async function colarEConferir(page, extensao, chave) {
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await campo(page).fill(chave);
  await card(page).getByRole('button', { name: 'Conferir e salvar' }).click();
}

test('a saúde da Conexão real acende a área Conexão com o Anki', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
});

test('chave aceita pela OpenAI: a Conexão real guarda a cópia e o storage só tem o fim dela', async ({ page, extensao, conexaoDoTeste }) => {
  await colarEConferir(page, extensao, CHAVE);

  await expect(card(page).locator('.cfg-resumo')).toHaveText('••••••••9f3a', { timeout: PRAZO_DA_CONEXAO_MS });
  await estadoFinalEm('a cópia da chave na Conexão real', async () => (await conexaoDoTeste.enviar({ estado: true })).cofre?.chave, CHAVE);
  await estadoFinal(extensao, { pm_chave_openai: { ultimos4: '9f3a' } });
  expect(JSON.stringify(await extensao.lerStorage(null))).not.toContain('sk-proj-chave-de-exemplo');
});

test('chave recusada pela OpenAI: a tela avisa e a Conexão real não guarda nada', async ({ page, extensao, conexaoDoTeste }) => {
  await conexaoDoTeste.enviar({ openai: 'recusa' });
  await colarEConferir(page, extensao, CHAVE);

  await expect(card(page).getByRole('alert')).toBeVisible({ timeout: PRAZO_DA_CONEXAO_MS });
  await estadoFinalEm('o cofre da Conexão real', async () => (await conexaoDoTeste.enviar({ estado: true })).cofre, null);
  await estadoFinal(extensao, { pm_chave_openai: null });
});

const soDaColecao = contrato.exemplos.filter(e => exemploDaExtensao(e) && 'colecao' in e.contexto
  && Object.keys(e.contexto).every(chave => chave === 'colecao' || (chave === 'perfil' && e.contexto.perfil === 'Usuário 1')));
for (const exemplo of soDaColecao) {
  test(`a Conexão real responde o exemplo do contrato: ${exemplo.nome}`, async ({ page, extensao, conexaoDoTeste }) => {
    await conexaoDoTeste.enviar({ colecao: contrato.colecoes[exemplo.contexto.colecao] });
    await page.goto(extensao.url('manifest.json'), { waitUntil: 'domcontentloaded' });

    const resposta = await pedirDaPagina(page, exemplo.pedido);

    expect(resposta.status).toBe(exemplo.resposta.status);
    expect(diferencaDoContrato(resposta.json, exemplo.resposta.json)).toBeNull();
  });
}

test('falar uma frase vai à voz de mentira: a Conexão real dos testes não fala com o Google de verdade', async ({ page, extensao, conexaoDoTeste }) => {
  await page.goto(extensao.url('manifest.json'), { waitUntil: 'domcontentloaded' });

  const resposta = await pedirDaPagina(page, { metodo: 'POST', caminho: '/voz/falar', corpo: { lang: 'en', sotaque: 'com', texto: 'Hello there' } });

  expect(resposta.status).toBe(200);
  await estadoFinalEm('o que a voz de mentira ouviu', async () => (await conexaoDoTeste.enviar({ estado: true })).falas, [['com', 'en', 'Hello there']]);
});

test('a Conexão real dos testes apaga a pasta de dados dela ao fechar', async () => {
  const outra = await conexaoReal.subir();
  const { pasta } = await outra.enviar({ estado: true });
  const existia = fs.existsSync(pasta);

  await outra.fechar();

  expect([existia, fs.existsSync(pasta)]).toEqual([true, false]);
});
