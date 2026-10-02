'use strict';

// Como a Conexão com o Anki aparece, decidido uma vez (lib/conexao-na-tela.js):
// o mesmo texto (BRG-01/BRG-02) e o mesmo ponto para a mesma situação, o
// Tentar de novo indisponível (`aria-disabled`, nunca `disabled`: o foco fica
// nele e apertar de novo não pergunta de novo) e o foco que não cai no <body>
// quando a Conexão liga. Três superfícies usam essa decisão: a F1 do shell, o
// card da primeira conexão (ONB-16) e o passo 4 da Boas-vindas. A Conexão é o
// fake da fronteira HTTP (fakes/anki.js); os testes afirmam o que a pessoa vê.

const { test, expect } = require('../fixtures');
const path = require('path');

// Evidência opcional da extensão real, sem tornar pixels um requisito da suíte.
const fotografar = async (page, nome) => {
  if (process.env.PM_EVIDENCE_DIR) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(process.env.PM_EVIDENCE_DIR, nome), fullPage: true });
  }
};

test.beforeEach(async ({ page }) => {
  if (process.env.PM_EVIDENCE_DIR) await page.setViewportSize({ width: 1280, height: 1000 });
});

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
    await fotografar(page, 'a3-onb16-desligada.png');

    await page.goto(extensao.url('painel.html#boas-vindas/anki'));
    await expect(statusDoPasso4(page)).toHaveText(TEXTO.desligada);
    await expect(pontoDoPasso4(page)).toHaveAttribute('data-estado', 'desligada');
    await fotografar(page, 'a3-passo4-desligada.png');
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
    await fotografar(page, 'a3-onb16-conectando.png');
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

  test('ONB-16: tentar de novo durante o Pronto anuncia Conectando sem desfazer o marco', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    const agora = new Date('2026-09-18T12:00:00');
    await page.clock.install({ time: agora });
    await page.clock.pauseAt(new Date(agora.getTime() + 1_000));
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(cardDaPrimeiraConexao(page)).toBeVisible();

    fakes.anki.ligar();
    await tentarDaF1(page).click();
    await expect(cardDaPrimeiraConexao(page)).toContainText('Pronto');
    await expect(statusDoCard(page)).toHaveText(TEXTO.ligada);

    fakes.anki.desligar();
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(sidebar(page)).toHaveText(TEXTO.desligada);
    await expect(tentarDaF1(page)).toBeVisible();

    const liberar = segurarOHealth(fakes);
    fakes.anki.ligar();
    await tentarDaF1(page).click();
    await expect(sidebar(page)).toHaveText(TEXTO.conectando);
    await expect(statusDoCard(page)).toHaveText(TEXTO.conectando);
    await expect(cardDaPrimeiraConexao(page)).toContainText('Pronto');
    await expect(pontoDoCard(page)).toHaveAttribute('data-estado', 'conectando');
    await expect(page.getByRole('navigation', { name: 'Como ligar' }).getByRole('button', { name: /feito$/ })).toHaveCount(3);
    await expect(tentarDoCard(page)).toBeHidden();
    await expect(tentarDaF1(page)).toHaveAttribute('aria-disabled', 'true');
    await fotografar(page, 'a3-onb16-pronto-conectando.png');

    liberar();
    await expect(sidebar(page)).toHaveText(TEXTO.desligada);
    await page.clock.runFor(1_800);
    await expect(cardDaPrimeiraConexao(page)).toBeHidden();
    await expect(page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' })).toBeVisible();
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
    await fotografar(page, 'a3-f1-indisponivel-foco.png');

    liberar();
    await expect(sidebar(page)).toHaveText(TEXTO.desligada);
    await expect(tentarDaF1(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('ONB-16: o retry do card fica aria-disabled sem perder o foco nem repetir a conferência', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(cardDaPrimeiraConexao(page)).toBeVisible();
    await page.getByRole('navigation', { name: 'Como ligar' }).getByRole('button', { name: 'Tentar de novo' }).click();

    const liberar = segurarOHealth(fakes);
    fakes.anki.ligar();
    await tentarDoCard(page).focus();
    await page.keyboard.press('Enter');
    await expect(statusDoCard(page)).toHaveText(TEXTO.conectando);
    await expect(tentarDoCard(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(tentarDoCard(page)).not.toHaveAttribute('disabled');
    await expect(tentarDoCard(page)).toBeFocused();

    const antes = pedidosDeHealth(fakes).length;
    await page.keyboard.press('Enter');
    await tentarDoCard(page).click({ force: true });
    expect(pedidosDeHealth(fakes)).toHaveLength(antes);
    await fotografar(page, 'a3-onb16-indisponivel-foco.png');

    liberar();
    await expect(statusDoCard(page)).toHaveText(TEXTO.desligada);
    await expect(tentarDoCard(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(tentarDoCard(page)).toBeFocused();
    await expect(cardDaPrimeiraConexao(page)).toContainText('Como ligar · Passo 3 de 3');
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
    await fotografar(page, 'a3-passo4-indisponivel-foco.png');
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
    await fotografar(page, 'a3-f1-ligada-foco.png');
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
    await fotografar(page, 'a3-passo4-ligada-foco.png');
  });
});
