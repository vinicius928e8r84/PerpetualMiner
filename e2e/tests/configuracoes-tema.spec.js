'use strict';

// Configurações · Aparência: o seletor de tema (#45, item 10 da lista fechada).
//
// Escuro é o padrão; claro é opcional, vale para o painel, o popup e Minerar de
// uma foto, e fica gravado só neste computador. O que aparece por cima das
// páginas continua escuro. A troca vale na hora, sem recarregar.
//
// O popup e o Minerar de uma foto ainda não foram refeitos na Veio (#38, #36 e
// #37): o CSS deles foi desenhado para um fundo fixo, então o corpo deles fica
// preso no tema em que foi desenhado e só a página passa a carregar a escolha.
// Os testes daqui afirmam essa fronteira como ela é hoje.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado, nunca funções internas.

const { test, expect } = require('../fixtures');

/** Os fundos da tabela de tokens do Veio (identidade-veio/README.md). */
const FUNDO = {
  escuro: 'rgb(18, 17, 16)',    // #121110
  claro: 'rgb(247, 244, 238)',  // #F7F4EE
};

/** O fundo que a pessoa vê: quem o pinta é o body, com o token do tema. */
const fundoDaPagina = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
/** O tema que a página carrega, no <html>, onde os tokens trocam de valor. */
const temaDaPagina = page => page.locator('html');
const opcaoDoTema = (page, nome) => page.getByRole('radio', { name: nome, exact: true });
/** O rádio é escondido pelo controle segmentado: quem recebe o clique é o rótulo. */
const escolherTema = (page, nome) => page.locator('#cfg-tema label').filter({ hasText: nome }).click();
const resumoDaAparencia = page => page.locator('#cfg-aparencia-resumo');

/** O tema gravado, ou `undefined` quando ainda não há escolha. */
const temaGravado = async extensao => (await extensao.lerStorage('pm_tema')).pm_tema;

async function abrirConfiguracoes(page, extensao, endereco = '#configuracoes') {
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
}

/** O contraste entre duas cores `rgb(...)`, pela fórmula da WCAG. */
function contraste(corA, corB) {
  const luminancia = cor => {
    const [r, g, b] = cor.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [clara, escura] = [luminancia(corA), luminancia(corB)].sort((x, y) => y - x);
  return (clara + 0.05) / (escura + 0.05);
}

test('sem escolha gravada, o painel abre no escuro', async ({ page, extensao }) => {
  await abrirConfiguracoes(page, extensao);

  expect(await fundoDaPagina(page)).toBe(FUNDO.escuro);
  await expect(resumoDaAparencia(page)).toHaveText('Escuro');
  expect(await temaGravado(extensao)).toBeUndefined();
});

test('escolher Claro troca a tela na hora, sem recarregar, e fica gravado', async ({ page, extensao }) => {
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');

  await expect(page.getByRole('radiogroup', { name: 'Tema' })).toBeVisible();
  await escolherTema(page, 'Claro');

  await expect.poll(() => fundoDaPagina(page)).toBe(FUNDO.claro);
  await expect(resumoDaAparencia(page)).toHaveText('Claro');
  // A mudança já aparece na tela, então não há toast (C4 da Voz).
  await expect(page.locator('.veio-toast')).toHaveCount(0);
  await expect.poll(() => temaGravado(extensao)).toBe('claro');
});

test('a escolha continua depois de recarregar', async ({ page, extensao }) => {
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
  await escolherTema(page, 'Claro');
  await expect.poll(() => temaGravado(extensao)).toBe('claro');

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();

  expect(await fundoDaPagina(page)).toBe(FUNDO.claro);
  await expect(opcaoDoTema(page, 'Claro')).toBeChecked();
  await expect(resumoDaAparencia(page)).toHaveText('Claro');
});

test('voltar para Escuro devolve o padrão', async ({ page, extensao }) => {
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
  await escolherTema(page, 'Claro');
  await expect.poll(() => fundoDaPagina(page)).toBe(FUNDO.claro);

  await escolherTema(page, 'Escuro');

  await expect.poll(() => fundoDaPagina(page)).toBe(FUNDO.escuro);
  await expect(resumoDaAparencia(page)).toHaveText('Escuro');
  await expect.poll(() => temaGravado(extensao)).toBe('escuro');
});

test('o painel já aberto em outra aba troca junto, sem recarregar', async ({ page, context, extensao }) => {
  const outra = await context.newPage();
  await abrirConfiguracoes(outra, extensao, '#frases');
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');

  await escolherTema(page, 'Claro');

  await expect.poll(() => fundoDaPagina(outra)).toBe(FUNDO.claro);
  await outra.close();
});

test('o popup e o Minerar de uma foto abrem com a escolha; o que ainda não foi refeito fica como foi desenhado',
  async ({ page, context, extensao }) => {
    await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
    await escolherTema(page, 'Claro');
    await expect.poll(() => temaGravado(extensao)).toBe('claro');

    const popup = await context.newPage();
    await popup.goto(extensao.url('popup.html'));
    await expect(temaDaPagina(popup)).toHaveAttribute('data-tema', 'claro');
    // O corpo do popup é o de hoje, desenhado para o escuro, e continua escuro
    // até #38 trazer o popup para os tokens.
    await expect(popup.locator('body')).toHaveAttribute('data-tema', 'escuro');
    expect(await fundoDaPagina(popup)).toBe('rgb(17, 18, 20)');

    const foto = await context.newPage();
    await foto.goto(extensao.url('bookreader.html'));
    await expect(temaDaPagina(foto)).toHaveAttribute('data-tema', 'claro');
    // O corpo do Minerar de uma foto é o de hoje, desenhado para o claro (#36, #37).
    await expect(foto.locator('body')).toHaveAttribute('data-tema', 'claro');
    expect(await fundoDaPagina(foto)).toBe('rgb(249, 250, 251)');

    await popup.close();
    await foto.close();
  });

test('o que aparece por cima das páginas continua escuro', async ({ page, context, extensao, paginas }) => {
  const painel = await context.newPage();
  await abrirConfiguracoes(painel, extensao, '#configuracoes/aparencia');

  await page.goto(paginas.url('player.html'));
  const botao = page.locator('#btn-minerador-pro');
  await expect(botao).toBeVisible();
  const antes = await botao.evaluate(no => getComputedStyle(no).backgroundColor);

  await escolherTema(painel, 'Claro');
  await expect.poll(() => temaGravado(extensao)).toBe('claro');
  await page.waitForTimeout(200);

  expect(await botao.evaluate(no => getComputedStyle(no).backgroundColor)).toBe(antes);
  await painel.close();
});

test('no claro, o texto do painel passa no contraste AA', async ({ page, extensao }) => {
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
  await escolherTema(page, 'Claro');
  await expect.poll(() => fundoDaPagina(page)).toBe(FUNDO.claro);

  const titulo = page.getByRole('heading', { name: 'Configurações' });
  const cores = await titulo.evaluate(no => {
    const estilo = getComputedStyle(no);
    return { texto: estilo.color, fundo: getComputedStyle(document.body).backgroundColor };
  });
  expect(contraste(cores.texto, cores.fundo)).toBeGreaterThanOrEqual(4.5);

  const descricao = page.locator('#cfg-aparencia .cfg-descricao');
  const corDaDescricao = await descricao.evaluate(no => getComputedStyle(no).color);
  expect(contraste(corDaDescricao, FUNDO.claro)).toBeGreaterThanOrEqual(4.5);
});

test('o seletor tem nome, é alcançável pelo teclado e as setas trocam o tema', async ({ page, extensao }) => {
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');

  await opcaoDoTema(page, 'Escuro').focus();
  await expect(opcaoDoTema(page, 'Escuro')).toBeFocused();
  await page.keyboard.press('ArrowRight');

  await expect(opcaoDoTema(page, 'Claro')).toBeChecked();
  await expect(opcaoDoTema(page, 'Claro')).toBeFocused();
  await expect.poll(() => fundoDaPagina(page)).toBe(FUNDO.claro);
  // O foco continua visível no controle escolhido.
  const contorno = await opcaoDoTema(page, 'Claro').evaluate(no => getComputedStyle(no.closest('label')).outlineWidth);
  expect(contorno).not.toBe('0px');
});
