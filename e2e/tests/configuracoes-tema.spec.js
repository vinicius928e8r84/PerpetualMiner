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
// A spec registra esse adiamento (Configurações › Aparência, "Onde vale"), e os
// testes daqui afirmam essa fronteira como ela é hoje.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado, nunca funções internas.

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('../fixtures');

/**
 * O `--veio-bg` de cada tema, lido de veio/tokens.css: a cor mora lá, e um
 * valor repetido aqui passaria a mentir no dia em que o token mudasse.
 */
function fundoDoTema(tema) {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'veio', 'tokens.css'), 'utf8');
  const inicioDoClaro = css.indexOf('[data-tema="claro"]');
  const trecho = tema === 'claro' ? css.slice(inicioDoClaro) : css.slice(0, inicioDoClaro);
  const achado = trecho.match(/--veio-bg:\s*(#[0-9A-Fa-f]{6})/);
  if (!achado) throw new Error(`--veio-bg não encontrado no tema ${tema} de veio/tokens.css`);
  const [, r, g, b] = achado[1].match(/#(..)(..)(..)/);
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`;
}

const FUNDO = { escuro: fundoDoTema('escuro'), claro: fundoDoTema('claro') };

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

/**
 * O contraste entre duas cores, pela fórmula da WCAG. Aceita `rgb(...)` e o
 * `color(srgb r g b)` (de 0 a 1) que o Chromium devolve para um `color-mix`.
 */
function contraste(corA, corB) {
  const luminancia = cor => {
    const escala = cor.startsWith('color(srgb') ? 1 : 255;
    const [r, g, b] = cor.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => {
      const c = v / escala;
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

test('o popup carrega a escolha, mas fica como foi desenhado até ser refeito (#38)',
  async ({ page, context, extensao }) => {
    // Como o popup abre hoje, antes de qualquer escolha: escuro, o fundo em que
    // foi desenhado. O Minerar de uma foto já segue o tema (minerar-foto.spec.js).
    const fundosDeHoje = {};
    for (const tela of ['popup.html']) {
      const aberta = await context.newPage();
      await aberta.goto(extensao.url(tela));
      fundosDeHoje[tela] = await fundoDaPagina(aberta);
      await aberta.close();
    }

    await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
    await escolherTema(page, 'Claro');
    await expect.poll(() => temaGravado(extensao)).toBe('claro');

    // O popup continua com o fundo que já tinha no escuro: o CSS dele é o de
    // hoje, escrito à mão fora dos tokens, e só muda no ticket dele. O teste
    // compara com ele mesmo, para não repetir aqui uma cor.
    for (const [tela, fundoDeHoje] of Object.entries(fundosDeHoje)) {
      const aberta = await context.newPage();
      await aberta.goto(extensao.url(tela));
      await expect(temaDaPagina(aberta)).toHaveAttribute('data-tema', 'claro');
      expect(await fundoDaPagina(aberta)).toBe(fundoDeHoje);
      await aberta.close();
    }
  });

test('o que aparece por cima das páginas continua escuro', async ({ page, context, extensao, paginas }) => {
  const painel = await context.newPage();
  await abrirConfiguracoes(painel, extensao, '#configuracoes/aparencia');

  await page.goto(paginas.url('player.html'));
  const botao = page.getByRole('button', { name: /^Minerar legenda/ });
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

  // O card inteiro: título, descrição, resumo e as duas opções do seletor.
  const textos = [
    '#cfg-aparencia-titulo', '#cfg-aparencia .cfg-descricao', '#cfg-aparencia-resumo',
    '#cfg-tema label:nth-of-type(1)', '#cfg-tema label:nth-of-type(2)',
  ];
  for (const seletor of textos) {
    // O fundo real atrás do texto: o primeiro ancestral que pinta um fundo.
    const medido = await page.locator(seletor).evaluate(no => {
      let sobre = no;
      while (sobre && getComputedStyle(sobre).backgroundColor === 'rgba(0, 0, 0, 0)') sobre = sobre.parentElement;
      return { texto: getComputedStyle(no).color, fundo: getComputedStyle(sobre || document.body).backgroundColor };
    });
    expect(contraste(medido.texto, medido.fundo), `contraste de ${seletor}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('a troca de tema não anima', async ({ page, extensao }) => {
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');

  // Enquanto as cores novas pintam, nada transiciona: sem isso a tela inteira
  // faria um cross-fade (spec de Configurações › Aparência). O que já estava
  // animando por conta própria (o cursor da marca, o flash da seção) segue.
  // O clique e a leitura rodam no mesmo quadro, dentro da página: um clique do
  // Playwright voltaria depois de alguns quadros, quando a marca da troca já
  // saiu, e o teste passaria mesmo com a tela animando.
  const transicoes = await page.evaluate(async () => {
    const rotulo = [...document.querySelectorAll('#cfg-tema label')].find(no => no.textContent.trim() === 'Claro');
    rotulo.click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    return document.getAnimations()
      .filter(animacao => animacao.playState === 'running' && animacao.transitionProperty)
      .map(animacao => animacao.transitionProperty);
  });

  expect(transicoes).toEqual([]);
  await expect.poll(() => fundoDaPagina(page)).toBe(FUNDO.claro);
});

/** A imagem que a marca mostra de verdade: a do `content` do CSS, ou o `src` quando não há. */
const imagemDaMarca = locator => locator.evaluate(no => {
  const conteudo = getComputedStyle(no).content;
  return (conteudo.startsWith('url(') ? conteudo : no.src).match(/icones\/([^")]+)/)[1];
});

test('no claro, a marca do painel vai para o azulejo claro; o popup, ainda escuro, fica com a de sempre',
  async ({ page, context, extensao }) => {
    await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
    const marca = page.locator('.veio-marca').first();
    expect(await imagemDaMarca(marca)).toBe('icone.svg');

    await escolherTema(page, 'Claro');
    await expect.poll(() => imagemDaMarca(marca)).toBe('icone-claro.svg');

    const popup = await context.newPage();
    await popup.goto(extensao.url('popup.html'));
    expect(await imagemDaMarca(popup.locator('.veio-marca'))).toBe('icone.svg');
    await popup.close();
  });

test('o seletor de tema tem a largura das opções, não a do card', async ({ page, extensao }) => {
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');

  const larguras = await page.locator('#cfg-tema').evaluate(grupo => ({
    grupo: grupo.getBoundingClientRect().width,
    corpo: grupo.parentElement.getBoundingClientRect().width,
  }));
  expect(larguras.grupo).toBeLessThan(larguras.corpo / 2);
});

test('o seletor tem nome, é alcançável pelo teclado e as setas trocam o tema', async ({ page, extensao }) => {
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');

  await opcaoDoTema(page, 'Escuro').focus();
  await expect(opcaoDoTema(page, 'Escuro')).toBeFocused();
  await page.keyboard.press('ArrowRight');

  await expect(opcaoDoTema(page, 'Claro')).toBeChecked();
  await expect(opcaoDoTema(page, 'Claro')).toBeFocused();
  await expect.poll(() => fundoDaPagina(page)).toBe(FUNDO.claro);
  // O foco continua visível no controle escolhido, com o foco do Veio: 2px
  // sólidos na cor de destaque do tema em uso.
  const foco = await opcaoDoTema(page, 'Claro').evaluate(no => {
    const estilo = getComputedStyle(no.closest('label'));
    const amostra = document.body.appendChild(document.createElement('span'));
    amostra.style.color = 'var(--veio-accent)';
    const destaque = getComputedStyle(amostra).color;
    amostra.remove();
    return { largura: estilo.outlineWidth, estilo: estilo.outlineStyle, cor: estilo.outlineColor, destaque };
  });
  expect(foco).toEqual({ largura: '2px', estilo: 'solid', cor: foco.destaque, destaque: foco.destaque });
});
