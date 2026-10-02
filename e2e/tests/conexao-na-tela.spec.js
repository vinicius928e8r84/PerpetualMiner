'use strict';

// Como a Conexão com o Anki aparece, decidido uma vez (lib/conexao-na-tela.js):
// o mesmo texto (BRG-01/BRG-02) e o mesmo ponto para a mesma situação, o
// Tentar de novo indisponível (`aria-disabled`, nunca `disabled`: o foco fica
// nele e apertar de novo não pergunta de novo) e o foco que não cai no <body>
// quando a Conexão liga. Três superfícies usam essa decisão: a F1 do shell, o
// card da primeira conexão (ONB-16) e o passo 4 da Boas-vindas. A Conexão é o
// fake da fronteira HTTP (fakes/anki.js); os testes afirmam o que a pessoa vê.

const { test, expect } = require('../fixtures');

const TEXTO = {
  conectando: 'Conectando ao Anki…',
  desligada: 'Conexão com o Anki: desligada',
  ligada: 'Conexão com o Anki: ligada',
};

const pedidosDeHealth = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/health');

const sidebar = page => page.locator('#shell-conexao-descricao');
const pontoDaSidebar = page => page.locator('.shell-ponto');
const tentarDaF1 = page => page.locator('#shell-tentar-de-novo');
const cardDaPrimeiraConexao = page => page.locator('#anki-primeira-vez');
const tentarDoCard = page => page.locator('#apv-tentar');
const statusDoCard = page => page.locator('#apv-status');
const pontoDoCard = page => page.locator('#apv-ponto');
const cardDaBoasVindas = page => page.locator('.bv-card');
const statusDoPasso4 = page => cardDaBoasVindas(page).getByRole('status');
const pontoDoPasso4 = page => cardDaBoasVindas(page).locator('.bv-status .bv-ponto');
const tentarDoPasso4 = page => cardDaBoasVindas(page).getByRole('button', { name: 'Verificar de novo', exact: true });

/** Segura o /health: a Conexão fica Conectando até `liberar()`, que responde com `status`. */
function segurarOHealth(fakes, status = 503) {
  let liberar;
  const segurada = new Promise(r => { liberar = r; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return { status, json: {} }; });
  return liberar;
}

test.describe('a mesma situação, a mesma tela', () => {
  test('desligada: a sidebar, o card da primeira conexão e o passo 4 dizem o mesmo e pintam o mesmo ponto', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();

    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(cardDaPrimeiraConexao(page)).toBeVisible();
    await expect(sidebar(page)).toHaveText(TEXTO.desligada);
    await expect(pontoDaSidebar(page)).toHaveAttribute('data-estado', 'desligada');

    // O passo 3 do card é o que mostra o status; o 1º espera a Conexão sem dizer “desligada”.
    await page.getByRole('navigation', { name: 'Como ligar' }).getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(statusDoCard(page)).toHaveText(TEXTO.desligada);
    await expect(pontoDoCard(page)).toHaveAttribute('data-estado', 'desligada');

    await page.goto(extensao.url('painel.html#boas-vindas/anki'));
    await expect(statusDoPasso4(page)).toHaveText(TEXTO.desligada);
    await expect(pontoDoPasso4(page)).toHaveAttribute('data-estado', 'desligada');
  });

  test('conectando: as três superfícies dizem BRG-02 e pintam o ponto de conectando', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(cardDaPrimeiraConexao(page)).toBeVisible();

    const liberar = segurarOHealth(fakes);
    fakes.anki.ligar();
    await tentarDaF1(page).click();
    await expect(sidebar(page)).toHaveText(TEXTO.conectando);
    await expect(pontoDaSidebar(page)).toHaveAttribute('data-estado', 'conectando');
    await expect(statusDoCard(page)).toHaveText(TEXTO.conectando);
    await expect(pontoDoCard(page)).toHaveAttribute('data-estado', 'conectando');
    liberar();
    await expect(sidebar(page)).toHaveText(TEXTO.desligada);

    const outraAba = await page.context().newPage();
    const liberarDeNovo = segurarOHealth(fakes);
    await outraAba.goto(extensao.url('painel.html#boas-vindas/anki'));
    await expect(statusDoPasso4(outraAba)).toHaveText(TEXTO.conectando);
    await expect(pontoDoPasso4(outraAba)).toHaveAttribute('data-estado', 'conectando');
    liberarDeNovo();
    await expect(statusDoPasso4(outraAba)).toHaveText(TEXTO.desligada);
  });
});

test.describe('Tentar de novo indisponível enquanto confere', () => {
  test('F1: fica aria-disabled (não disabled), com o foco nele, e apertar de novo não pergunta de novo', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(tentarDaF1(page)).toBeVisible();

    const liberar = segurarOHealth(fakes);
    fakes.anki.ligar();
    await tentarDaF1(page).focus();
    await page.keyboard.press('Enter');

    await expect(sidebar(page)).toHaveText(TEXTO.conectando);
    await expect(tentarDaF1(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(tentarDaF1(page)).not.toHaveAttribute('disabled');
    await expect(tentarDaF1(page)).toBeFocused();

    const antes = pedidosDeHealth(fakes).length;
    await page.keyboard.press('Enter');
    await tentarDaF1(page).click({ force: true });
    expect(pedidosDeHealth(fakes)).toHaveLength(antes);

    liberar();
    await expect(sidebar(page)).toHaveText(TEXTO.desligada);
    await expect(tentarDaF1(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('passo 4 da Boas-vindas: aria-disabled com o foco nele; apertar de novo não pergunta de novo', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#boas-vindas/anki'));
    await expect(statusDoPasso4(page)).toHaveText(TEXTO.desligada);

    const liberar = segurarOHealth(fakes);
    fakes.anki.ligar();
    await tentarDoPasso4(page).focus();
    await page.keyboard.press('Enter');
    await expect(statusDoPasso4(page)).toHaveText(TEXTO.conectando);
    await expect(tentarDoPasso4(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(tentarDoPasso4(page)).not.toHaveAttribute('disabled');
    await expect(tentarDoPasso4(page)).toBeFocused();

    const antes = pedidosDeHealth(fakes).length;
    await page.keyboard.press('Enter');
    expect(pedidosDeHealth(fakes)).toHaveLength(antes);
    liberar();
    await expect(statusDoPasso4(page)).toHaveText(TEXTO.desligada);
  });
});

test.describe('o foco ao ligar não cai no <body>', () => {
  test('F1, com as abas à mostra: o Tentar de novo sai e o foco vai para a aba escolhida', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(tentarDaF1(page)).toBeVisible();

    fakes.anki.ligar();
    await tentarDaF1(page).focus();
    await page.keyboard.press('Enter');

    await expect(tentarDaF1(page)).toBeHidden();
    await expect(page.getByRole('radio', { name: 'Custos' })).toBeFocused();
  });

  test('passo 4: o botão sai e o foco vai para o título do passo', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#boas-vindas/anki'));
    await expect(statusDoPasso4(page)).toHaveText(TEXTO.desligada);

    fakes.anki.ligar();
    await tentarDoPasso4(page).focus();
    await page.keyboard.press('Enter');

    await expect(statusDoPasso4(page)).toHaveText(TEXTO.ligada);
    await expect(tentarDoPasso4(page)).toHaveCount(0);
    await expect(page.locator('#bv-titulo')).toBeFocused();
  });
});
