'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinalEm } = require('../estado-final');
const { abrirPainel } = require('../apoio-do-envio');

const cardDaIA = page => page.locator('#cfg-ia');
const faixaDoChatGPT = page => cardDaIA(page).getByRole('alert');
const continuar = page => cardDaIA(page).getByRole('region', { name: /Conta do ChatGPT/ }).getByRole('button', { name: 'Continuar com o ChatGPT' });
const avancado = page => cardDaIA(page).locator('details.ia-avancado');
const seletor = page => cardDaIA(page).getByRole('combobox', { name: 'Modelo dos cartões' });
const avisoDoAnki = page => page.locator('#cfg-anki-corpo .veio-aviso');
const trilho = page => page.locator('#cfg-anki-corpo .veio-toggle');
const interruptor = page => page.getByRole('switch', { name: 'Abrir o Anki com o computador' });
const perfil = page => page.getByRole('combobox', { name: 'Perfil do Anki' });
const avisoDaVersao = page => page.locator('#painel-conexao-versao');

async function abrirIA(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
}

async function abrirOCardDoAnki(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/anki'));
  await expect(page.getByRole('button', { name: 'Conexão com o Anki', expanded: true })).toBeVisible();
}

const causaEmDetalhes = aviso => aviso.locator('details pre');

for (const { caso, resposta, texto, causa } of [
  { caso: 'recusa o pedido', resposta: { status: 500, json: { error: 'internal_error' } }, texto: 'Não deu para entrar com o ChatGPT. Tente de novo.', causa: 'HTTP 500 · internal_error' },
  { caso: 'não tem a rota', resposta: { status: 404, json: { error: 'not_found' } }, texto: 'Atualize a Conexão com o Anki para entrar com o ChatGPT.', causa: 'HTTP 404 · not_found' },
]) {
  test(`Continuar com o ChatGPT numa Conexão que ${caso}: a faixa diz o que fazer e a causa em Detalhes`, async ({ page, extensao, fakes }) => {
    fakes.anki.responder('POST', '/ia/chatgpt/entrar', () => resposta);
    await abrirIA(page, extensao);

    await continuar(page).click();

    await expect(faixaDoChatGPT(page)).toContainText(`Conta do ChatGPT: ${texto}`);
    await expect(causaEmDetalhes(faixaDoChatGPT(page))).toHaveText(causa);
    await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'desconectada');
  });
}

test('Continuar com o ChatGPT com a Conexão desligada: a causa em Detalhes é “sem resposta”', async ({ page, extensao, fakes }) => {
  await abrirIA(page, extensao);
  fakes.anki.desligar();

  await continuar(page).click();

  await expect(faixaDoChatGPT(page)).toContainText('A Conexão com o Anki não respondeu, e é ela que guarda o login.');
  await expect(causaEmDetalhes(faixaDoChatGPT(page))).toHaveText('sem resposta');
  await estadoFinalEm('o login do ChatGPT na Conexão', () => fakes.anki.chatgpt.situacao(), 'desconectada');
});

test('escolher um modelo que a Conexão não guarda: o Avançado diz que não deu para ler os modelos, e o guardado não muda', async ({ page, extensao, fakes }) => {
  fakes.anki.guardarChaveNaConexao('9f3a');
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
  await abrirIA(page, extensao);
  await avancado(page).locator('summary').click();
  fakes.anki.responder('POST', '/ia/modelo/escolher', () => ({ status: 500, json: { error: 'internal_error' } }));

  await seletor(page).selectOption('gpt-4.1-mini');

  await expect(avancado(page)).toContainText('Não deu para ler os modelos da sua conta. Tente de novo.');
  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), { escolha: 'automatico', trocou: null });
});

for (const { caso, resposta, texto, causa } of [
  { caso: 'recusa', resposta: { status: 500, json: { error: 'login_item_failed' } }, texto: 'Não deu para ligar. O Anki não vai abrir com o computador.', causa: 'HTTP 500 · login_item_failed' },
  { caso: 'responde sem dizer se ligou', resposta: { status: 200, json: { ok: true } }, texto: 'Não deu para ligar. O Anki não vai abrir com o computador.', causa: 'Resposta sem “ligado”' },
]) {
  test(`ligar o Abrir o Anki com o computador numa Conexão que ${caso}: o aviso diz o que houve e a causa em Detalhes`, async ({ page, extensao, fakes }) => {
    await abrirOCardDoAnki(page, extensao);
    await expect(interruptor(page)).toBeEnabled();
    fakes.anki.responder('POST', '/abrir-com-o-computador', () => resposta);

    await trilho(page).click();

    await expect(avisoDoAnki(page)).toContainText(texto);
    await expect(causaEmDetalhes(avisoDoAnki(page))).toHaveText(causa);
    await expect(interruptor(page)).not.toBeChecked();
    await estadoFinalEm('o item de login no computador', () => fakes.anki.itemInstalado(), false);
  });
}

test('trocar o perfil numa Conexão que recusa: o aviso diz que não trocou e a causa em Detalhes', async ({ page, extensao, fakes }) => {
  fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
  await abrirOCardDoAnki(page, extensao);
  await expect(perfil(page)).toHaveValue('Ana');
  fakes.anki.responder('POST', '/anki/profile', () => ({ status: 503, json: { error: 'anki_profiles_unavailable', detail: 'anki_busy' } }));

  await perfil(page).selectOption('Beto');

  await expect(avisoDoAnki(page)).toContainText('Não deu para trocar o perfil. Tente de novo.');
  await expect(causaEmDetalhes(avisoDoAnki(page))).toHaveText('HTTP 503 · anki_profiles_unavailable');
  await expect(perfil(page)).toHaveValue('Ana');
  await estadoFinalEm('o perfil marcado na Conexão', () => fakes.anki.perfilMarcado(), 'Ana');
});

test('a chave que a Conexão recusa duas vezes por sessão vencida: a faixa diz que a Conexão não respondeu, não que a chave foi recusada, e nada é guardado', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/ia/openai/chave', () => ({ status: 401, json: { error: 'session_expired' } }));
  await abrirIA(page, extensao);
  const faixa = cardDaIA(page).getByRole('alert');

  await cardDaIA(page).getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-de-exemplo-9f3a');
  await cardDaIA(page).getByRole('button', { name: 'Conferir e salvar' }).click();

  await expect(faixa).toContainText('A Conexão com o Anki não respondeu, e é ela que confere a chave. Ligue-a e tente de novo.');
  await expect(causaEmDetalhes(faixa)).toHaveText('sem resposta');
  await expect(cardDaIA(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/ia/openai/chave')).toHaveLength(4);
  await estadoFinalEm('a chave na Conexão', () => fakes.anki.chaveNaConexao(), null);
});

test.describe('com a permissão do abridor', () => {
  test.use({ permissaoDoAbridor: true });

  test('Reiniciar o Anki numa Conexão que não consegue fechá-lo: a tela diz que não deu, e o abridor não é chamado', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    fakes.anki.atualizacao.definir({ versao: '0.3.9', versaoNova: '0.4.5' });
    fakes.anki.definirAtualizacao({ atualizacao: 'instalada' });
    fakes.anki.responder('POST', '/atualizacao/reiniciar', () => ({ status: 503, json: { error: 'restart_unavailable' } }));
    await abrirPainel(page, extensao);

    await avisoDaVersao(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();

    await expect(avisoDaVersao(page)).toContainText('Não deu para reiniciar o Anki. Feche e abra de novo.');
    await estadoFinalEm('quantas vezes a Conexão fechou o Anki (nenhuma)', () => fakes.anki.atualizacao.reinicios(), 0);
    expect(fakes.abridor.pedidos().filter(pedido => pedido.mensagem.acao === 'abrir')).toEqual([]);
  });
});
