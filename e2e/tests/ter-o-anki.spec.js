'use strict';

// O passo “Ter o Anki” (#146): o primeiro dos passos da F1, com a pergunta “Você já tem o
// Anki?”. “Não tenho” baixa o instalador certo para o sistema da pessoa; “Já tenho” usa o
// abridor da Conexão (#147) para abrir o Anki sozinho quando pode, e mostra o caminho manual
// quando não pode. Antes da Conexão, a tela não diz nada do Anki: “não instalado”, “fechado”
// e “aberto sem a Conexão” dão o mesmo silêncio. O mesmo componente (painel-conexao-passos.js)
// está no card ONB-16 da área Conexão com o Anki e no passo 4 da Boas-vindas.
//
// A animação do aviso (ONB-19) mora no passo de baixar o arquivo: dois quadros que se alternam
// sozinhos — o aviso que o próprio Anki mostra ao abrir o arquivo, e o mesmo diálogo com o Sim
// marcado, de onde clicar. Com “menos movimento”, os quadros ficam parados, lado a lado.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { fotografar } = require('../evidencias-mineracao');
const contrato = require('../../complemento/contrato/exemplos.json');

const ORIGEM = `${contrato.origemDaExtensao}/`;
const ABRIR = { mensagem: { acao: 'abrir' }, origem: ORIGEM };
const CONFERIR = { mensagem: { acao: 'conferir' }, origem: ORIGEM };

const card = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const lista = page => page.getByRole('navigation', { name: 'Como ligar' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: nome });
const tituloDoPasso = page => page.locator('#apv-passo-titulo');
const pergunta = page => card(page).getByText('Você já tem o Anki?');
const jaTenho = page => card(page).getByRole('button', { name: 'Já tenho' });
const naoTenho = page => card(page).getByRole('button', { name: 'Não tenho' });
const baixarOAnki = page => card(page).getByRole('link', { name: 'Baixar o Anki' });
const resultadoDoAnki = page => page.locator('#apv-anki-resultado');

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** O painel como um usuário do sistema dado: o user agent e o `userAgentData` são os dele. */
async function abrirComo(page, extensao, sistema) {
  await page.addInitScript(sistema => {
    Object.defineProperty(navigator, 'userAgent', { value: sistema });
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: /Mac/.test(sistema) ? 'macOS' : 'Windows' },
    });
  }, sistema);
  await page.goto(extensao.url('painel.html#anki/custos'));
}

test.beforeEach(({ fakes }) => {
  fakes.anki.desligar();
});

test('o primeiro passo é Ter o Anki: a pergunta e as duas respostas, e nada do Anki antes da Conexão', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();

  await expect(lista(page).getByRole('button')).toHaveText([
    /^Ter o Anki/, /^Pôr a Conexão no Anki/, /^Reiniciar o Anki/, /^Abrir o Anki sozinho/,
  ]);
  await expect(itemDaLista(page, /^Ter o Anki/)).toHaveAttribute('aria-current', 'step');
  await expect(card(page)).toContainText('Como ligar · Passo 1 de 4');
  await expect(tituloDoPasso(page)).toHaveText('Ter o Anki');
  await expect(pergunta(page)).toBeVisible();
  await expect(jaTenho(page)).toBeVisible();
  await expect(naoTenho(page)).toBeVisible();
  // O silêncio: a tela não diz nada do Anki — nem “não encontrado”, nem instalado, nem aberto.
  await expect(card(page)).not.toContainText(/não encontrado|instalar o Anki antes/i);
  await expect(baixarOAnki(page)).toHaveCount(0);
  await expect(resultadoDoAnki(page)).toBeHidden();
  await fotografar(page, 'ter-o-anki-pergunta.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('“Não tenho” no Mac: o download é o .dmg do Anki, e o passo mostra a arrastada para Aplicativos', async ({ page, extensao }) => {
  await abrirComo(page, extensao, MAC);
  await expect(card(page)).toBeVisible();

  await naoTenho(page).click();

  await expect(baixarOAnki(page)).toBeVisible();
  await expect(baixarOAnki(page)).toHaveAttribute('href', /^https:\/\/apps\.ankiweb\.net\/downloads\/current\/anki-[\d.]+-mac\.dmg$/);
  await expect(card(page)).toContainText('Arraste o Anki para a pasta Aplicativos e abra-o de lá.');
  await expect(resultadoDoAnki(page)).toBeHidden();
  await fotografar(page, 'ter-o-anki-mac.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('“Não tenho” no Windows: o download é o instalador .exe do Anki', async ({ page, extensao }) => {
  await abrirComo(page, extensao, WINDOWS);
  await expect(card(page)).toBeVisible();

  await naoTenho(page).click();

  await expect(baixarOAnki(page)).toBeVisible();
  await expect(baixarOAnki(page)).toHaveAttribute('href', /^https:\/\/apps\.ankiweb\.net\/downloads\/current\/anki-[\d.]+-windows\.exe$/);
  await expect(card(page)).toContainText('Abra o instalador que você baixou e siga o que ele pedir.');
  await fotografar(page, 'ter-o-anki-windows.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('“Já tenho” sem a permissão do abridor: o caminho manual de sempre, sem pergunta ao abridor', async ({ page, extensao, fakes }) => {
  // A extensão chega da loja sem a permissão: ela é opcional, e o pedido é do passo Abrir o Anki sozinho.
  expect(await extensao.permissaoDoAbridor()).toBe(false);
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();

  await jaTenho(page).click();

  await expect(resultadoDoAnki(page)).toHaveText('Abra o Anki para continuar.');
  expect(fakes.abridor.pedidos()).toEqual([]);
  await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), false);
  await estadoFinal(extensao, { pm_abridor: null });
});

test.describe('com a permissão que o Chrome guardou depois de Permitir', () => {
  test.use({ permissaoDoAbridor: true });

  test('“Já tenho” com o Anki instalado e fechado: o abridor abre o Anki, e a Conexão liga sozinha', async ({ page, extensao, fakes }) => {
    // Sem ninguém apertar nada, é a conferência de 15 s que encontra a Conexão que o Anki abriu trouxe.
    await page.clock.install({ time: new Date('2026-09-18T12:00:00') });
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(card(page)).toBeVisible();

    await jaTenho(page).click();

    await expect(resultadoDoAnki(page)).toHaveText('O Anki está abrindo…');
    expect(fakes.abridor.pedidos()).toEqual([ABRIR]);

    // O Anki abriu e a Conexão com ele responde: o passo vira ✓ e o card anda sozinho ao passo do abridor.
    fakes.anki.ligar();
    await page.clock.runFor(15_000);
    await expect(itemDaLista(page, /^Ter o Anki/)).toHaveAccessibleName(/feito$/);
    await expect(itemDaLista(page, /^Pôr a Conexão no Anki/)).toHaveAccessibleName(/feito$/);
    await expect(tituloDoPasso(page)).toHaveText('Abrir o Anki sozinho');
    await expect(resultadoDoAnki(page)).toBeHidden();
    await fotografar(page, 'ter-o-anki-abridor-abriu.png');
    await expect.poll(() => fakes.abridor.pedidos()).toEqual([ABRIR, CONFERIR]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
  });

  test('o abridor não acha o Anki: “Já tenho” cai no caminho manual de sempre', async ({ page, extensao, fakes }) => {
    fakes.abridor.definir('nao_achei');
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(card(page)).toBeVisible();

    await jaTenho(page).click();

    await expect(resultadoDoAnki(page)).toHaveText('Abra o Anki para continuar.');
    expect(fakes.abridor.pedidos()).toEqual([ABRIR]);
    // Sem o Anki aberto, a Conexão continua sem responder e o passo não vira ✓.
    await expect(itemDaLista(page, /^Ter o Anki/)).not.toHaveAccessibleName(/feito$|agora não$/);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
  });
});

test('no passo de baixar o arquivo, a animação mostra o aviso do Anki e de onde clicar', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();

  await lista(page).getByRole('button', { name: 'Pôr a Conexão no Anki' }).click();

  const aviso = card(page).locator('.pc-animacao');
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText('Complementos podem ser perigosos, como programas.');
  await expect(aviso.locator('.pc-animacao__quadro')).toHaveCount(2);
  // O quadro de onde clicar: o Sim com a marca do foco da Base.
  await expect(aviso.locator('.pc-animacao__quadro--clique .pc-dialogo__botao--sim')).toHaveCSS('outline-style', 'solid');
  await expect(aviso.locator('.pc-animacao__legenda')).toHaveText('Ao abrir o arquivo, o Anki avisa e pergunta. Clique em Sim para instalar.');
  // Alternam sozinhos: é animação, não duas cópias paradas.
  await expect(aviso.locator('.pc-animacao__quadro').first()).toHaveCSS('animation-name', 'pc-quadro');
  // E o desenho é do Anki: o passo do arquivo continua com o dele.
  await expect(card(page).getByRole('link', { name: 'Baixar a Conexão com o Anki' })).toBeVisible();
  await fotografar(page, 'ter-o-anki-animacao.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('com menos movimento, a animação vira quadros parados, lado a lado', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();

  await lista(page).getByRole('button', { name: 'Pôr a Conexão no Anki' }).click();

  const quadros = card(page).locator('.pc-animacao__quadro');
  await expect(quadros).toHaveCount(2);
  await expect(quadros.first()).toHaveCSS('animation-name', 'none');
  await expect(quadros.first()).toBeVisible();
  await expect(quadros.nth(1)).toBeVisible();
  // Parados e lado a lado, não empilhados.
  const caixas = await quadros.evaluateAll(els => els.map(el => {
    const caixa = el.getBoundingClientRect();
    return { x: caixa.x, largura: caixa.width };
  }));
  expect(caixas[1].x).toBeGreaterThan(caixas[0].x + caixas[0].largura - 1);
  await fotografar(page, 'ter-o-anki-animacao-parada.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('no passo 4 da Boas-vindas, o mesmo passo Ter o Anki abre em primeiro lugar', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html#boas-vindas/anki'));
  const cardDaBoasVindas = page.locator('.bv-card');
  await expect(cardDaBoasVindas).toBeVisible();

  await expect(passosDaBoasVindas(page).getByRole('button')).toHaveText([
    'Ter o Anki', 'Pôr a Conexão no Anki', 'Reiniciar o Anki', 'Abrir o Anki sozinho',
  ]);
  await expect(passosDaBoasVindas(page).getByRole('button', { name: 'Ter o Anki' })).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#bv4-passo-titulo')).toHaveText('Ter o Anki');
  await expect(cardDaBoasVindas.getByText('Você já tem o Anki?')).toBeVisible();
  await estadoFinal(extensao, { pm_abridor: null });
});

const passosDaBoasVindas = page => page.locator('.bv-card').getByRole('navigation', { name: 'Como ligar' });
