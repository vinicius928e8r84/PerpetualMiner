'use strict';

// Conexão com o Anki · primeira conexão no desenho B (#77, ONB-16): o card que
// fica no lugar das abas enquanto a Conexão nunca respondeu neste computador
// (docs/design/painel/anki/prototipo-primeira-conexao.html, variante B), com os
// passos de pôr a Conexão no Anki por um arquivo, sem terminal (#145; o componente
// é o de painel-conexao-passos.js, o mesmo do passo 4 da Boas-vindas, que
// boas-vindas.spec.js confere), precedidos pela pergunta “Você já tem o Anki?”
// (#146). A Conexão é o fake da fronteira HTTP (fakes/anki.js). Os testes
// afirmam o que a pessoa vê e o que fica gravado.

const { test, expect } = require('../fixtures');
const fs = require('fs');
const { fotografar } = require('../evidencias-mineracao');
const contrato = require('../../complemento/contrato/exemplos.json');

const AGORA = new Date('2026-09-18T12:00:00');
const F1 = 'A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.';

const card = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const pronto = page => page.getByRole('region', { name: 'Conexão com o Anki: ligada' });
const lista = page => page.getByRole('navigation', { name: 'Como ligar' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: nome });
const tituloDoPasso = page => page.locator('#apv-passo-titulo');
const status = page => page.locator('#apv-status');
const baixar = page => card(page).getByRole('link', { name: 'Baixar a Conexão com o Anki' });
const baixarDeNovo = page => card(page).getByRole('link', { name: 'Baixar de novo' });
const naoRespondeu = page => card(page).getByText('A Conexão com o Anki ainda não respondeu. Confira:');

// O que o /health do complemento diz de si no exemplo do contrato (a versão e o perfil), para o teste
// não repetir o número que o contrato já tem.
const saude = contexto => contrato.exemplos.find(e => e.pedido.caminho === '/health' && e.daExtensao
  && e.resposta.status === 200 && e.contexto.perfil === contexto).resposta.json;
const abas = page => page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' });
const tentarDoCard = page => card(page).locator('#apv-tentar');
const tentarDaF1 = page => page.locator('#shell-tentar-de-novo');
const pedidosDeHealth = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/health');

async function abrir(page, extensao) {
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/custos'));
}

async function pararRelogio(page) {
  await page.clock.install({ time: new Date(AGORA.getTime() - 60_000) });
  await page.clock.pauseAt(AGORA);
}

const listaDeEnvios = page => page.getByRole('listbox', { name: 'Envios recentes' });

test.beforeEach(({ fakes }) => {
  fakes.anki.definirCustos([
    { jobId: 'job-en', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 12, custos: { cartoes: 0.081 } },
  ]);
  fakes.anki.desligar();
});

test('nunca conectada: abre no passo da pergunta, com os dois quadros e a F1 em cima', async ({ page, extensao }) => {
  await abrir(page, extensao);

  await expect(page.getByText(F1)).toBeVisible();
  // A faixa F1 é um aviso: entra com a animação do componente (e fica estática com movimento reduzido).
  await expect(page.locator('#shell-faixa-conexao')).toHaveCSS('animation-name', 'veio-aviso-entra');
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('A Conexão com o Anki fica dentro do Anki, neste computador, e é ela que cria os cartões.');
  await expect(abas(page)).toBeHidden();

  // A lista tem os 3 passos, o primeiro é o atual e nenhum está feito.
  await expect(lista(page).getByRole('button')).toHaveText(['Você já tem o Anki?', 'Pôr a Conexão no Anki', 'Reiniciar o Anki']);
  await expect(itemDaLista(page, 'Você já tem o Anki?')).toHaveAttribute('aria-current', 'step');
  await expect(lista(page).locator('[aria-current="step"]')).toHaveCount(1);
  await expect(lista(page).getByRole('button', { name: /feito/ })).toHaveCount(0);

  await expect(card(page)).toContainText('Como ligar · Passo 1 de 3');
  await expect(tituloDoPasso(page)).toHaveText('Você já tem o Anki?');
  await expect(card(page)).toContainText('Os cartões ficam no Anki, um programa que roda neste computador.');
  // O Anki não é lido antes da Conexão: o passo espera, nunca diz “não encontrado”.
  await expect(status(page)).toHaveText('Esperando a Conexão');
  await expect(card(page)).not.toContainText('não encontrado');
  // Sem terminal: nenhum comando de pip ou python, nenhum Detalhes de comandos, nenhum Copiar.
  await expect(card(page)).not.toContainText(/pip|python|install_autostart/i);
  await expect(card(page).getByRole('button', { name: 'Copiar' })).toHaveCount(0);
  // O passo da pergunta não mostra o arquivo: ele está no passo de baixo.
  await expect(baixar(page)).toBeHidden();

  await expect(card(page).getByRole('heading', { name: 'Continua funcionando' })).toBeVisible();
  await expect(card(page)).toContainText('Minerar de vídeos, páginas e fotos.');
  await expect(card(page).getByRole('heading', { name: 'Fica indisponível sem ela' })).toBeVisible();
  await expect(card(page)).toContainText('Enviar ao Anki e a mineração automática.');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

// ─── O passo “Você já tem o Anki?” (#146) ─────────────────────────────────────

const pergunta = page => itemDaLista(page, 'Você já tem o Anki?');
const tenhoOAnki = page => card(page).getByRole('button', { name: 'Já tenho o Anki' });
const naoTenhoOAnki = page => card(page).getByRole('button', { name: 'Ainda não tenho o Anki' });

test('abre no passo “Você já tem o Anki?”, com as duas respostas e o status esperando', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await expect(lista(page).getByRole('button')).toHaveText(['Você já tem o Anki?', 'Pôr a Conexão no Anki', 'Reiniciar o Anki']);
  await expect(pergunta(page)).toHaveAttribute('aria-current', 'step');
  await expect(card(page)).toContainText('Como ligar · Passo 1 de 3');
  await expect(tituloDoPasso(page)).toHaveText('Você já tem o Anki?');
  await expect(card(page)).toContainText('Os cartões ficam no Anki, um programa que roda neste computador.');
  // Antes da Conexão nada se sabe do Anki: o passo espera, sem dizer “não encontrado”.
  await expect(status(page)).toHaveText('Esperando a Conexão');
  await expect(card(page)).not.toContainText('não encontrado');
  // O aviso do Anki só entra quando a pessoa diz que não o tem.
  await expect(card(page).locator('.veio-aviso')).toBeHidden();
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('“Já tenho o Anki” segue para pôr a Conexão, com o foco no título do passo', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await tenhoOAnki(page).click();
  await expect(itemDaLista(page, 'Pôr a Conexão no Anki')).toHaveAttribute('aria-current', 'step');
  await expect(card(page)).toContainText('Como ligar · Passo 2 de 3');
  await expect(tituloDoPasso(page)).toHaveText('Pôr a Conexão no Anki');
  await expect(tituloDoPasso(page)).toBeFocused();
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('“Ainda não tenho o Anki” traz o aviso do Anki, que entra animado; dizer que tem o resolve', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await naoTenhoOAnki(page).click();
  const aviso = card(page).locator('.veio-aviso');
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText('O Anki é grátis e roda neste computador. Baixe-o no site dele, instale e abra-o; depois siga para pôr a Conexão.');
  // A entrada é a animação do aviso, da Base Veio (e estática com movimento reduzido: o teste do fim confere).
  await expect(aviso).toHaveCSS('animation-name', 'veio-aviso-entra');

  // A ação do aviso abre o site do Anki numa aba nova.
  const [aba] = await Promise.all([
    page.context().waitForEvent('page'),
    aviso.getByRole('button', { name: 'Baixar o Anki' }).click(),
  ]);
  expect(new URL(aba.url()).host).toBe('apps.ankiweb.net');
  await aba.close();

  // Dizer que tem resolve o aviso: ele sai e o passo segue para pôr a Conexão.
  await tenhoOAnki(page).click();
  await expect(card(page).locator('.veio-aviso')).toBeHidden();
  await expect(tituloDoPasso(page)).toHaveText('Pôr a Conexão no Anki');

  // De volta à pergunta, o aviso não volta sozinho: quem disse que tem, tem.
  await pergunta(page).click();
  await expect(card(page).locator('.veio-aviso')).toBeHidden();
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('os passos: Continuar, Voltar e a lista andam pelo card, e o foco vai ao título do passo', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Voltar' })).toBeHidden();

  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(itemDaLista(page, 'Pôr a Conexão no Anki')).toHaveAttribute('aria-current', 'step');
  await expect(card(page)).toContainText('Como ligar · Passo 2 de 3');
  await expect(tituloDoPasso(page)).toHaveText('Pôr a Conexão no Anki');
  await expect(tituloDoPasso(page)).toBeFocused();
  await expect(card(page)).toContainText('Baixe o arquivo e abra-o. Se o Anki estiver fechado, ele abre sozinho. Quando o Anki perguntar se você quer instalar, responda Sim.');
  await expect(baixar(page)).toBeVisible();

  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(itemDaLista(page, 'Reiniciar o Anki')).toHaveAttribute('aria-current', 'step');
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(tituloDoPasso(page)).toHaveText('Reiniciar o Anki');
  await expect(tituloDoPasso(page)).toBeFocused();
  await expect(card(page)).toContainText('Feche o Anki e abra-o de novo. A Conexão liga quando o Anki abre, e esta tela confere sozinha.');
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');
  await expect(tentarDoCard(page)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Continuar' })).toBeHidden();
  await expect(baixar(page)).toBeHidden();

  await card(page).getByRole('button', { name: 'Voltar' }).click();
  await expect(tituloDoPasso(page)).toHaveText('Pôr a Conexão no Anki');
  await expect(tituloDoPasso(page)).toBeFocused();

  await lista(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('a lista se anda pelo teclado: Tab chega ao passo e Enter o abre', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await pergunta(page).focus();
  await page.keyboard.press('Tab');
  await expect(itemDaLista(page, 'Pôr a Conexão no Anki')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(itemDaLista(page, 'Pôr a Conexão no Anki')).toHaveAttribute('aria-current', 'step');
  await expect(tituloDoPasso(page)).toBeFocused();
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('o status é uma região que anuncia a mudança', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await expect(page.getByRole('status').filter({ hasText: 'Esperando a Conexão' })).toHaveCount(1);
  await expect(status(page)).toHaveAttribute('role', 'status');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('Tentar de novo sem resposta: a Conexão continua desligada e o card fica no passo de reiniciar', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await lista(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await tentarDoCard(page).click();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(page.getByText(F1)).toBeVisible();
  await expect(card(page)).toBeVisible();
  await expect(abas(page)).toBeHidden();
  await expect(lista(page).getByRole('button', { name: /feito/ })).toHaveCount(0);
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);

  await tentarDoCard(page).click();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');
  await expect(card(page)).toBeVisible();
  await expect(abas(page)).toBeHidden();
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('conectando (depois de Tentar de novo): abre no passo de reiniciar com “Conectando ao Anki…” e o botão indisponível', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('Como ligar · Passo 1 de 3');

  let liberar;
  const segurada = new Promise(r => { liberar = r; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return { status: 503, json: {} }; });
  fakes.anki.ligar();
  await tentarDaF1(page).click();

  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(status(page)).toHaveText('Conectando ao Anki…');
  await expect(tentarDoCard(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#apv-confere')).toHaveText('Conferindo agora…');
  // Apertar indisponível não pergunta de novo.
  const antes = pedidosDeHealth(fakes).length;
  await tentarDoCard(page).click({ force: true });
  expect(pedidosDeHealth(fakes)).toHaveLength(antes);

  // Sem resposta, e sem escolha da pessoa, o card volta ao primeiro passo que falta.
  liberar();
  await expect(card(page)).toContainText('Como ligar · Passo 1 de 3');
  await expect(status(page)).toHaveText('Esperando a Conexão');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('a resposta anterior mantém o card visível ao terminar a leitura do fato durante uma tentativa da F1', async ({ page, extensao, fakes }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await extensao.gravarStorage({ pm_anki_ja_conectou: false });
  await pararRelogio(page);
  await page.addInitScript(() => {
    const ler = chrome.storage.local.get.bind(chrome.storage.local);
    const segurada = new Promise(resolve => { globalThis.liberarLeituraDaConexao = resolve; });
    chrome.storage.local.get = async (...args) => {
      if (args[0] && typeof args[0] === 'object' && 'pm_anki_ja_conectou' in args[0]) await segurada;
      return ler(...args);
    };
  });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(page.getByText(F1)).toBeVisible();

  const antes = pedidosDeHealth(fakes).length;
  let liberarResposta;
  const segurada = new Promise(resolve => { liberarResposta = resolve; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return { status: 503, json: {} }; });
  fakes.anki.ligar();
  await tentarDaF1(page).click();
  await expect.poll(() => pedidosDeHealth(fakes).length).toBe(antes + 1);

  await page.evaluate(() => globalThis.liberarLeituraDaConexao());
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(status(page)).toHaveText('Conectando ao Anki…');
  await expect(tentarDoCard(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#apv-confere')).toHaveText('Conferindo agora…');
  await expect(abas(page)).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  await fotografar(page, 'anki-conectando-leitura-tardia.png');

  liberarResposta();
  await expect(status(page)).toHaveText('Esperando a Conexão');
  await expect(card(page)).toContainText('Como ligar · Passo 1 de 3');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('a Conexão passa a responder: o momento Pronto, e depois as abas voltam com o toast', async ({ page, extensao, fakes }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await pararRelogio(page);
  await page.goto(extensao.url('painel.html#anki/custos'));
  await page.evaluate(() => document.fonts.ready);
  await expect(card(page)).toBeVisible();

  fakes.anki.ligar();
  await tentarDaF1(page).click();

  await expect(pronto(page)).toBeVisible();
  await expect(pronto(page)).toContainText('Pronto');
  await expect(pronto(page)).toContainText('As abas voltam em seguida.');
  await expect(status(page)).toHaveText(`Achei o Anki · ${saude('Usuário 1').perfil} · versão ${saude('Usuário 1').versao}`);
  await expect(lista(page).getByRole('button', { name: /feito$/ })).toHaveCount(3);
  await expect(abas(page)).toBeHidden();
  // A chave fica gravada já na primeira resposta.
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);
  await expect(tituloDoPasso(page)).toBeFocused();
  await fotografar(page, 'anki-pronto.png');

  // O card cobre as abas pelos 1,8 s inteiros; o relógio parado não depende da carga do host.
  await page.clock.runFor(1799);
  await expect(pronto(page)).toBeVisible();
  await expect(abas(page)).toBeHidden();
  await expect(page.locator('.veio-toast')).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(abas(page)).toBeVisible();
  await expect(pronto(page)).toBeHidden();
  await expect(page.getByText(F1)).toBeHidden();
  await expect(page.locator('.veio-toast')).toHaveText('Conexão com o Anki: ligada');
  // Custos carrega sozinha, como se a Conexão sempre tivesse estado ali.
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('radio', { name: 'Custos' })).toBeFocused();
  await fotografar(page, 'anki-abas-toast.png');
  // E continua gravada depois do foco, do toast e das abas de volta.
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);
});

test('reiniciar o Anki sem apertar nada: a consulta automática mostra Conectando e depois “Achei o Anki · perfil · versão”', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  await lista(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');

  // A pessoa reinicia o Anki fora da extensão; a consulta de 15 s sai e demora.
  let liberar;
  const segurada = new Promise(r => { liberar = r; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return fakes.anki.respostaDoContrato('GET', '/health'); });
  fakes.anki.ligar();
  await page.clock.runFor(15_000);
  await expect(status(page)).toHaveText('Conectando ao Anki…');
  await expect(tentarDoCard(page)).toHaveAttribute('aria-disabled', 'true');
  expect(pedidosDeHealth(fakes)).toHaveLength(2);
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);

  liberar();
  await expect(status(page)).toHaveText(`Achei o Anki · ${saude('Usuário 1').perfil} · versão ${saude('Usuário 1').versao}`);
  await expect(lista(page).getByRole('button', { name: /feito$/ })).toHaveCount(3);
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);
});

test('a consulta automática que não acha a Conexão volta ao último resultado, desligada', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  await lista(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');

  let liberar;
  const segurada = new Promise(r => { liberar = r; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return { status: 503, json: {} }; });
  fakes.anki.ligar();
  await page.clock.runFor(15_000);
  await expect(status(page)).toHaveText('Conectando ao Anki…');

  liberar();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');
  await expect(tentarDoCard(page)).not.toHaveAttribute('aria-disabled', 'true');
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('um destaque só por tela: na pergunta é Já tenho o Anki, no arquivo é Baixar e no reiniciar é Tentar de novo', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await expect(card(page)).toContainText('Como ligar · Passo 1 de 3');
  await expect(page.locator('.veio-botao--primario:visible')).toHaveText(['Já tenho o Anki']);

  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(card(page)).toContainText('Como ligar · Passo 2 de 3');
  await expect(page.locator('.veio-botao--primario:visible')).toHaveText(['Baixar a Conexão com o Anki']);

  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(page.locator('.veio-botao--primario:visible')).toHaveText(['Tentar de novo']);
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('a Conexão liga sozinha, sem ninguém apertar: a conferência de 15 s do shell a encontra', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();

  fakes.anki.ligar();
  await page.clock.runFor(15_000);

  await expect(pronto(page)).toBeVisible();
  await expect(abas(page)).toBeVisible();
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);
});

test('o foco não cai no fim da página: fica no título do card no Pronto e vai para a aba quando o card sai', async ({ page, extensao, fakes }) => {
  // O relógio da página é do teste: o Pronto fica na tela até ele andar.
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();

  // O Tentar de novo da F1 some no Pronto, com o foco nele.
  fakes.anki.ligar();
  await tentarDaF1(page).focus();
  await page.keyboard.press('Enter');
  await expect(pronto(page)).toBeVisible();
  await expect(tituloDoPasso(page)).toBeFocused();

  await page.clock.runFor(2_000);
  await expect(abas(page)).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Custos' })).toBeFocused();
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);
});

test('o Tentar de novo do próprio card também deixa o foco no título do Pronto', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  await lista(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();

  fakes.anki.ligar();
  await tentarDoCard(page).focus();
  await page.keyboard.press('Enter');
  await expect(pronto(page)).toBeVisible();
  await expect(tituloDoPasso(page)).toBeFocused();
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);
});

test('só o Tentar de novo do card fixa o passo de reiniciar: o da F1 deixa o card voltar ao primeiro passo', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await tentarDaF1(page).click();
  await expect(status(page)).toHaveText('Esperando a Conexão');
  await expect(card(page)).toContainText('Como ligar · Passo 1 de 3');

  await lista(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await tentarDoCard(page).click();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('o passo que a pessoa abriu continua aberto depois de uma conferência que não achou a Conexão e de uma volta por outra área', async ({ page, extensao, fakes }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await pararRelogio(page);
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  const linha = page.locator('#apv-confere');
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 0 s');
  expect(pedidosDeHealth(fakes)).toHaveLength(1);

  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(card(page)).toContainText('Como ligar · Passo 2 de 3');
  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await page.evaluate(() => document.fonts.ready);
  await fotografar(page, 'anki-passo-reiniciar-antes-da-conferencia.png');

  let liberar;
  const segurada = new Promise(resolve => { liberar = resolve; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return { status: 503, json: {} }; });
  fakes.anki.ligar();
  await page.clock.runFor(15_000);
  await expect.poll(() => pedidosDeHealth(fakes)).toHaveLength(2);
  await expect(linha).toHaveText('Conferindo agora…');
  // A consulta automática também aparece como Conectando nos passos, sem ninguém apertar nada.
  await expect(status(page)).toHaveText('Conectando ao Anki…');
  await expect(tentarDoCard(page)).toHaveAttribute('aria-disabled', 'true');
  await fotografar(page, 'anki-passo-reiniciar-conferindo.png');
  liberar();
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 0 s');
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(abas(page)).toBeHidden();
  await fotografar(page, 'anki-passo-reiniciar-conferencia-concluida.png');

  await page.getByRole('link', { name: 'Frases' }).click();
  await expect(card(page)).toBeHidden();
  await page.getByRole('link', { name: 'Conexão com o Anki' }).click();
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(abas(page)).toBeHidden();
  await fotografar(page, 'anki-passo-reiniciar-apos-voltar.png');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('a Conexão liga com a pessoa em outra área: as abas já estão lá quando ela chega, sem Pronto nem toast', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  await page.getByRole('link', { name: 'Frases' }).click();
  await expect(card(page)).toBeHidden();

  fakes.anki.ligar();
  await page.clock.runFor(15_000);
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);

  // O relógio anda o bastante para o Pronto acabar, se ele tivesse começado.
  // (Lida na hora: o toast sai sozinho, então esperar por ele esconderia o erro.)
  await page.clock.runFor(2_000);
  expect(await page.locator('.veio-toast').count()).toBe(0);

  await page.getByRole('link', { name: 'Conexão com o Anki' }).click();
  await expect(abas(page)).toBeVisible();
  expect(await pronto(page).count()).toBe(0);
  await expect(card(page)).toBeHidden();
});

test('“Confere sozinho a cada 15 s” segue a conferência do shell, sem um segundo relógio de rede', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  const linha = page.locator('#apv-confere');
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 0 s');
  expect(pedidosDeHealth(fakes)).toHaveLength(1);

  await page.clock.runFor(5_000);
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 5 s');
  expect(pedidosDeHealth(fakes)).toHaveLength(1);

  // A conferência do shell sai aos 15 s: a linha diz que está conferindo, e é uma pergunta só.
  let liberar;
  const segurada = new Promise(r => { liberar = r; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return { status: 503, json: {} }; });
  fakes.anki.ligar();
  await page.clock.runFor(10_000);
  await expect(linha).toHaveText('Conferindo agora…');
  expect(pedidosDeHealth(fakes)).toHaveLength(2);

  liberar();
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 0 s');
  await page.clock.runFor(7_000);
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 7 s');
  expect(pedidosDeHealth(fakes)).toHaveLength(2);
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('Baixar a Conexão com o Anki entrega o arquivo que vai dentro do pacote da extensão', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();
  // O arquivo é do passo de baixo: a pergunta abre primeiro.
  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(baixar(page)).toBeVisible();

  const [arquivo] = await Promise.all([page.waitForEvent('download'), baixar(page).click()]);

  expect(arquivo.suggestedFilename()).toBe('perpetualminer.ankiaddon');
  const baixado = fs.readFileSync(await arquivo.path());
  expect(baixado.equals(fs.readFileSync(require('path').join(__dirname, '..', '..', 'conexao', 'perpetualminer.ankiaddon')))).toBe(true);
  // É um zip: o Anki instala o `.ankiaddon` pelo `manifest.json` dentro dele.
  expect(baixado.subarray(0, 2).toString()).toBe('PK');
  expect(baixado.includes(Buffer.from('manifest.json'))).toBe(true);
  // Baixar o arquivo não é conectar.
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('o Detalhes “O arquivo não abriu?” diz que o código do AnkiWeb vem em breve, sem inventar um número', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();
  await card(page).getByRole('button', { name: 'Continuar' }).click();

  await card(page).getByText('O arquivo não abriu?', { exact: true }).click();
  await expect(card(page).locator('pre')).toHaveText('O código para colar em Ferramentas › Complementos › Obter complementos vem em breve.');
  await expect(card(page).locator('pre')).not.toContainText(/\d/);

  // O Detalhes é do passo do arquivo: no passo de reiniciar, ele sai.
  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(card(page).getByText('O arquivo não abriu?', { exact: true })).toBeHidden();
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('com o código do AnkiWeb publicado, o Detalhes o mostra para colar em Obter complementos', async ({ page, extensao }) => {
  // O código só existe depois do primeiro upload (#176): quem o publicar o define em PerpetualMiner.CODIGO_DO_ANKIWEB.
  await page.addInitScript(() => { globalThis.PerpetualMiner = { CODIGO_DO_ANKIWEB: '123456789' }; });
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();
  await card(page).getByRole('button', { name: 'Continuar' }).click();

  await card(page).getByText('O arquivo não abriu?', { exact: true }).click();
  await expect(card(page).locator('pre')).toHaveText('No Anki, abra Ferramentas › Complementos › Obter complementos, cole o código 123456789 e reinicie o Anki.');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('reiniciar o Anki: a conferência mostra Conectando e depois “Achei o Anki · perfil · versão”', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();
  await lista(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');

  let liberar;
  const segurada = new Promise(r => { liberar = r; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return fakes.anki.respostaDoContrato('GET', '/health'); });
  fakes.anki.ligar();
  await tentarDoCard(page).click();
  await expect(status(page)).toHaveText('Conectando ao Anki…');

  liberar();
  await expect(status(page)).toHaveText(`Achei o Anki · ${saude('Usuário 1').perfil} · versão ${saude('Usuário 1').versao}`);
  await expect(lista(page).getByRole('button', { name: /feito$/ })).toHaveCount(3);
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);
});

test('o Anki na tela de perfis: “Achei o Anki · versão”, sem perfil', async ({ page, extensao, fakes }) => {
  fakes.anki.abrirPerfil(null);
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  fakes.anki.ligar();
  await tentarDaF1(page).click();

  await expect(status(page)).toHaveText(`Achei o Anki · versão ${saude(null).versao}`);
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);
});

test('dois minutos sem resposta: o checklist de 3 itens e “Baixar de novo”, e a conferência segue sozinha', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  await expect(naoRespondeu(page)).toBeHidden();

  await page.clock.runFor(119_000);
  await expect(naoRespondeu(page)).toBeHidden();
  await page.clock.runFor(1_000);

  await expect(naoRespondeu(page)).toBeVisible();
  await expect(card(page).locator('.pc-checklist li')).toHaveText([
    'O Anki está aberto?',
    'Você fechou o Anki e abriu de novo?',
    'A Conexão com o Anki está ativada em Ferramentas › Complementos?',
  ]);
  // Baixar de novo entrega o mesmo arquivo.
  const [arquivo] = await Promise.all([page.waitForEvent('download'), baixarDeNovo(page).click()]);
  expect(arquivo.suggestedFilename()).toBe('perpetualminer.ankiaddon');
  // O checklist vale em qualquer passo que a pessoa esteja olhando.
  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(naoRespondeu(page)).toBeVisible();

  // A conferência continua: uma pergunta nova ao /health a cada 15 s, e quando a Conexão responde o checklist sai.
  const antes = pedidosDeHealth(fakes).length;
  await page.clock.runFor(15_000);
  await expect.poll(() => pedidosDeHealth(fakes).length).toBeGreaterThan(antes);
  await expect(naoRespondeu(page)).toBeVisible();
  // Quinze segundos de checklist sem resposta não gravaram nada.
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
  fakes.anki.ligar();
  await page.clock.runFor(15_000);
  await expect(pronto(page)).toBeVisible();
  await expect(naoRespondeu(page)).toBeHidden();
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);
});

test('os dois minutos contam desde que a pessoa vê os passos: quem chega depois não vê o checklist de cara', async ({ page, extensao }) => {
  // Nunca conectou e a Conexão está desligada: a pessoa começa em Frases, onde o card não está à vista.
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('link', { name: 'Conexão com o Anki' })).toBeVisible();
  await page.clock.runFor(150_000);
  await expect(card(page)).toBeHidden();

  await page.getByRole('link', { name: 'Conexão com o Anki' }).click();
  await expect(card(page)).toBeVisible();
  await expect(naoRespondeu(page)).toBeHidden();

  // A espera é a de dois minutos inteiros, a partir de agora que ela vê os passos.
  await page.clock.runFor(119_000);
  await expect(naoRespondeu(page)).toBeHidden();
  await page.clock.runFor(1_000);
  await expect(naoRespondeu(page)).toBeVisible();
  await expect(card(page).locator('.pc-checklist li')).toHaveCount(3);
  await expect(baixarDeNovo(page)).toBeVisible();
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('com a janela estreita (o trilho), a lista fica em cima do card', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  const daLista = await lista(page).boundingBox();
  const doCard = await card(page).locator('.pc-card').boundingBox();
  expect(daLista.y + daLista.height).toBeLessThanOrEqual(doCard.y);
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('com a janela larga, a lista fica ao lado do card', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  const daLista = await lista(page).boundingBox();
  const doCard = await card(page).locator('.pc-card').boundingBox();
  expect(daLista.x + daLista.width).toBeLessThanOrEqual(doCard.x);
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('o foco é visível na lista e nos botões, e piscar e pulsar ficam estáticos com movimento reduzido', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await pergunta(page).focus();
  await page.keyboard.press('Tab');
  await expect(itemDaLista(page, 'Pôr a Conexão no Anki')).toBeFocused();
  await expect(itemDaLista(page, 'Pôr a Conexão no Anki')).toHaveCSS('outline-style', 'solid');

  // O ponto que pisca da linha da conferência dura 1 ms, uma volta só.
  await expect(page.locator('.apv-confere .anki-ponto')).toHaveCSS('animation-duration', '0.001s');

  // A entrada do aviso do Anki também: existe, e dura 1 ms com movimento reduzido.
  await naoTenhoOAnki(page).click();
  await expect(card(page).locator('.veio-aviso')).toBeVisible();
  await expect(card(page).locator('.veio-aviso')).toHaveCSS('animation-duration', '0.001s');
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});

test('nos dois temas o card usa os tokens Veio: o fundo do card e o do controle são os do tema', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  const cores = () => page.evaluate(() => {
    const cor = seletor => getComputedStyle(document.querySelector(`#anki-primeira-vez ${seletor}`)).backgroundColor;
    return { card: cor('.pc-card'), controle: cor('.pc-controle') };
  });
  const escuro = await cores();

  // O tema muda pela escolha da pessoa em Configurações › Aparência, e fica gravado.
  await page.goto(extensao.url('painel.html#configuracoes/aparencia'));
  await page.locator('#cfg-tema label').filter({ hasText: 'Claro' }).click();
  await expect.poll(async () => (await extensao.lerStorage('pm_tema')).pm_tema).toBe('claro');
  await page.getByRole('link', { name: 'Conexão com o Anki' }).click();
  await expect(card(page)).toBeVisible();
  const claro = await cores();
  expect(claro.card).not.toBe(escuro.card);
  expect(claro.controle).not.toBe(escuro.controle);
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);
});
