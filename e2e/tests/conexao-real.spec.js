'use strict';

// A extensão diante da Conexão de verdade (PM_CONEXAO=real, e2e/conexao-real.js): o complemento do repositório
// responde a 8766 no lugar do fake de JavaScript, com a coleção em memória e a OpenAI de mentira dos testes do
// complemento. Um fake escreve a resposta que o autor acha certa; aqui quem responde é o servidor. Sem a variável
// estes testes não rodam (`PM_CONEXAO=real node scripts/testar.mjs e2e -- conexao-real` sobe o modo).

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const contrato = require('../../complemento/contrato/exemplos.json');
const { exemploDaExtensao, diferencaDoContrato } = require('../fakes/anki');
const { pedirDaPagina } = require('../pareamento-de-teste');

// A Conexão de verdade confere a chave em dois pedidos à OpenAI de mentira: dê-lhe mais que os 5 s dos testes com fake.
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

// O que o contrato diz das leituras da coleção, perguntado ao servidor que o escreveu: um exemplo que só depende
// da coleção aberta. Os outros contextos (chave, fila, item de login) são do lado do complemento.
const soDaColecao = contrato.exemplos.filter(e => exemploDaExtensao(e) && 'colecao' in e.contexto
  && Object.keys(e.contexto).every(chave => chave === 'colecao' || (chave === 'perfil' && e.contexto.perfil === 'Usuário 1')));
for (const exemplo of soDaColecao) {
  test(`a Conexão real responde o exemplo do contrato: ${exemplo.nome}`, async ({ page, extensao, conexaoDoTeste }) => {
    await conexaoDoTeste.enviar({ colecao: contrato.colecoes[exemplo.contexto.colecao] });
    await page.goto(extensao.url('manifest.json'), { waitUntil: 'domcontentloaded' });

    const resposta = await pedirDaPagina(page, exemplo.pedido);   // assinado como a extensão (#192)

    expect(resposta.status).toBe(exemplo.resposta.status);
    expect(diferencaDoContrato(resposta.json, exemplo.resposta.json)).toBeNull();
  });
}
