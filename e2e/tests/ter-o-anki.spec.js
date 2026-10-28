'use strict';

// O passo “Ter o Anki” (#146): o primeiro dos passos da F1, com a pergunta “Você já tem o
// Anki?”. “Não tenho” leva à página de download do Anki, numa aba nova, e diz o que fazer depois
// pelo sistema da pessoa (o Anki não tem um endereço fixo por sistema: os instaladores são um por
// processador e o nome carrega a versão, revisão do PR #224); “Já tenho” usa o
// abridor da Conexão (#147) para abrir o Anki sozinho quando pode, e mostra o caminho manual
// quando não pode. Antes da Conexão, a tela não diz nada do Anki: “não instalado”, “fechado”
// e “aberto sem a Conexão” dão o mesmo silêncio. O mesmo componente (painel-conexao-passos.js)
// está no card ONB-16 da área Conexão com o Anki e no passo 4 da Boas-vindas.
//
// A animação do aviso (ONB-19) mora no passo de baixar o arquivo: dois quadros que se alternam
// sozinhos — o aviso que o próprio Anki mostra ao abrir o arquivo (com as palavras do Anki em
// pt-BR, que chama os complementos de “extensões”), e o mesmo diálogo com o Sim marcado, de onde
// clicar. Com “menos movimento”, os quadros ficam parados, lado a lado.

const { test, expect, comOSistema, SISTEMAS } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { fotografar } = require('../evidencias-mineracao');
const contrato = require('../../complemento/contrato/exemplos.json');

const ORIGEM = `${contrato.origemDaExtensao}/`;
const ABRIR = { mensagem: { acao: 'abrir' }, origem: ORIGEM };
// A página de download do Anki: ela existe sempre e escolhe o arquivo do processador sozinha.
const PAGINA_DO_ANKI = 'https://apps.ankiweb.net/';
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
const statusDaConexao = page => page.locator('#apv-status');

/** O painel como um usuário do sistema dado (o user agent e o `userAgentData` são os dele). */
async function abrirComo(page, extensao, sistema) {
  await comOSistema(page, sistema);
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
  // E nem a linha da Conexão, que neste passo não tem o que fazer: o Tentar de novo mora no de reiniciar.
  await expect(statusDaConexao(page)).toBeHidden();
  await expect(card(page).getByRole('button', { name: 'Tentar de novo' })).toBeHidden();
  await fotografar(page, 'ter-o-anki-pergunta.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

/** O link Baixar o Anki leva à página de download do Anki numa aba nova: o painel fica onde está. */
async function esperarOLinkDaPagina(page) {
  await expect(baixarOAnki(page)).toBeVisible();
  await expect(baixarOAnki(page)).toHaveAttribute('href', PAGINA_DO_ANKI);
  await expect(baixarOAnki(page)).toHaveAttribute('target', '_blank');
  await expect(baixarOAnki(page)).toHaveAttribute('rel', 'noopener');
}

test('“Não tenho” no Mac: o link leva à página de download do Anki, e o passo mostra a arrastada para Aplicativos', async ({ page, extensao }) => {
  await abrirComo(page, extensao, SISTEMAS.MAC);
  await expect(card(page)).toBeVisible();

  await naoTenho(page).click();

  await esperarOLinkDaPagina(page);
  await expect(card(page)).toContainText('Arraste o Anki para a pasta Aplicativos e abra-o de lá.');
  await expect(resultadoDoAnki(page)).toBeHidden();
  await fotografar(page, 'ter-o-anki-mac.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('“Não tenho” no Windows: o link leva à página de download do Anki, e o passo manda abrir o instalador', async ({ page, extensao }) => {
  await abrirComo(page, extensao, SISTEMAS.WINDOWS);
  await expect(card(page)).toBeVisible();

  await naoTenho(page).click();

  await esperarOLinkDaPagina(page);
  await expect(card(page)).toContainText('Abra o instalador que você baixou e siga o que ele pedir.');
  await expect(card(page)).not.toContainText('Arraste o Anki para a pasta Aplicativos');
  await fotografar(page, 'ter-o-anki-windows.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('“Não tenho” fora do Mac e do Windows: Baixar o Anki abre a página numa aba nova, e o painel fica no passo', async ({ page, context, extensao }) => {
  // O Chromium do teste é o do Linux: nem Mac nem Windows.
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  await naoTenho(page).click();
  await esperarOLinkDaPagina(page);
  await expect(card(page)).toContainText('Depois de instalar, abra o Anki.');

  const abaNova = context.waitForEvent('page');
  await baixarOAnki(page).click();
  // A página do Anki vem numa aba própria (o fixture não deixa o pedido sair; basta a aba ter nascido para ela).
  expect((await abaNova).url()).toMatch(/^(https:\/\/apps\.ankiweb\.net\/|about:blank|chrome-error:)/);
  await expect(page).toHaveURL(extensao.url('painel.html#anki/custos'));
  await expect(tituloDoPasso(page)).toHaveText('Ter o Anki');
  await expect(baixarOAnki(page)).toBeVisible();
  await estadoFinal(extensao, { pm_abridor: null });
});

test.describe('com a permissão do abridor já dada', () => {
  test.use({ permissaoDoAbridor: true });

  test('antes da Conexão, o Anki não instalado, fechado ou aberto sem a Conexão dá a mesma tela, e a tela não pergunta nada ao computador', async ({ page, extensao, fakes }) => {
    // Com a permissão do abridor dada, a extensão até poderia perguntar ao computador se o Anki está lá;
    // o passo não pergunta: só a resposta da pessoa (“Já tenho”) chama o abridor.
    const telas = [];
    // Não instalado: o abridor não acha o Anki. Fechado, ou aberto sem a Conexão: ele acha. Nos três,
    // nada responde na porta da Conexão (o beforeEach a desligou).
    for (const situacao of ['nao_achei', 'achei', 'achei_sem_abrir']) {
      fakes.abridor.definir(situacao);
      await page.goto(extensao.url('painel.html#anki/custos'));
      await expect(card(page)).toBeVisible();
      await expect(pergunta(page)).toBeVisible();
      telas.push(await card(page).innerText());
      await page.goto('about:blank');
    }
    expect(telas[1]).toBe(telas[0]);
    expect(telas[2]).toBe(telas[0]);
    expect(telas[0]).not.toMatch(/não encontrado|não (está )?instalado|já está aberto/i);
    expect(fakes.abridor.pedidos()).toEqual([]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
    await estadoFinal(extensao, { pm_abridor: null });
  });
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

  test('“Já tenho” clicado duas vezes seguidas pede ao abridor uma vez só', async ({ page, extensao, fakes }) => {
    // Cada `abrir` é um Anki aberto pelo sistema: dois pedidos juntos arriscam um segundo Anki ou o perfil já aberto.
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(card(page)).toBeVisible();

    await jaTenho(page).dblclick();

    await expect(resultadoDoAnki(page)).toHaveText('O Anki está abrindo…');
    await expect.poll(() => fakes.abridor.pedidos()).toEqual([ABRIR]);
    // Um segundo pedido sairia logo depois do primeiro: meio segundo depois da resposta, ainda é um só.
    await page.waitForTimeout(500);
    expect(fakes.abridor.pedidos()).toEqual([ABRIR]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
  });

  test('sem o abridor no computador: “Já tenho” cai no caminho manual de sempre', async ({ page, extensao, fakes }) => {
    // Uma Conexão antiga (ou nenhuma) não deixou o abridor: o Chrome não acha o host e o passo não trava.
    fakes.abridor.desregistrar();
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(card(page)).toBeVisible();

    await jaTenho(page).click();

    await expect(resultadoDoAnki(page)).toHaveText('Abra o Anki para continuar.');
    expect(fakes.abridor.pedidos()).toEqual([]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
  });

  test('o Anki no lugar e o sistema sem conseguir abri-lo: “Já tenho” cai no caminho manual de sempre', async ({ page, extensao, fakes }) => {
    // O abridor acha o Anki, mas o `open` (ou o Start-Process) falha: `{ achou: true, abriu: false }`.
    fakes.abridor.definir('achei_sem_abrir');
    await page.goto(extensao.url('painel.html#anki/custos'));
    await expect(card(page)).toBeVisible();

    await jaTenho(page).click();

    await expect(resultadoDoAnki(page)).toHaveText('Abra o Anki para continuar.');
    await expect(card(page)).not.toContainText('O Anki está abrindo…');
    expect(fakes.abridor.pedidos()).toEqual([ABRIR]);
    await expect(itemDaLista(page, /^Ter o Anki/)).not.toHaveAccessibleName(/feito$|agora não$/);
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
  // As palavras da janela do próprio Anki em pt-BR (addons-install-anki-addon e o começo de
  // addons-important-as-addons-are-programs-downloaded, Anki 25.9): o Anki diz “extensões”.
  await expect(aviso).toContainText('Instalar extensão do Anki');
  await expect(aviso).toContainText('Importante: Como as extensões são programas baixados da internet, elas são potencialmente maliciosas.');
  await expect(aviso.locator('.pc-animacao__quadro')).toHaveCount(2);
  // O quadro de onde clicar: o Sim com a marca do foco da Base.
  await expect(aviso.locator('.pc-animacao__quadro--clique .pc-dialogo__botao--sim')).toHaveCSS('outline-style', 'solid');
  await expect(aviso.locator('.pc-animacao__legenda')).toHaveText('Ao abrir o arquivo, o Anki avisa e pergunta. Clique em Sim para instalar.');
  // Alternam sozinhos: é animação, não duas cópias paradas.
  await expect(aviso.locator('.pc-animacao__quadro').first()).toHaveCSS('animation-name', 'pc-quadro');
  // E o desenho é do Anki: o passo do arquivo continua com o dele.
  const baixar = card(page).getByRole('link', { name: 'Baixar a Conexão com o Anki' });
  await expect(baixar).toBeVisible();
  // O aviso vem acima do botão: a pessoa vê o que o Anki vai perguntar antes de baixar o arquivo.
  const doAviso = await aviso.boundingBox();
  const doBotao = await baixar.boundingBox();
  expect(doAviso.y + doAviso.height).toBeLessThanOrEqual(doBotao.y);
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
  await expect(quadros.nth(1)).toHaveCSS('animation-name', 'none');
  // Visíveis de verdade: o toBeVisible do Playwright conta um quadro com opacidade 0 como visível.
  await expect(quadros.first()).toHaveCSS('opacity', '1');
  await expect(quadros.nth(1)).toHaveCSS('opacity', '1');
  // Parados e lado a lado, não empilhados.
  const caixas = await quadros.evaluateAll(els => els.map(el => {
    const caixa = el.getBoundingClientRect();
    return { x: caixa.x, largura: caixa.width };
  }));
  expect(caixas[1].x).toBeGreaterThan(caixas[0].x + caixas[0].largura - 1);
  await fotografar(page, 'ter-o-anki-animacao-parada.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('com menos movimento numa janela estreita, os quadros parados empilham e cabem no card', async ({ page, extensao }) => {
  // Exceção de teste: sem-estado-guardado — só o layout dos quadros muda com a largura; nada é gravado.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  await lista(page).getByRole('button', { name: 'Pôr a Conexão no Anki' }).click();

  // Larguras de uma janela de Chrome de verdade (ela não fica mais estreita que ~500 px) em que dois quadros não cabem.
  for (const largura of [540, 500]) {
    await page.setViewportSize({ width: largura, height: 1000 });
    const caixas = await card(page).locator('.pc-controle').evaluate(controle => {
      const limite = controle.getBoundingClientRect();
      return [...controle.querySelectorAll('.pc-animacao__quadro')].map(quadro => {
        const caixa = quadro.getBoundingClientRect();
        return { esquerda: caixa.left - limite.left, direita: limite.right - caixa.right };
      });
    });
    expect(caixas, `na janela de ${largura} px`).toHaveLength(2);
    for (const caixa of caixas) {
      expect(caixa.esquerda, `na janela de ${largura} px`).toBeGreaterThanOrEqual(0);
      expect(caixa.direita, `na janela de ${largura} px`).toBeGreaterThanOrEqual(0);
    }
  }
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
