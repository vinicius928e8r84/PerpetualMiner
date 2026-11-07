'use strict';

// O desenho de arrastar o Anki para Aplicativos (ONB-25, #238), no passo Ter o Anki depois de “Não tenho”, só no Mac.
// É do mesmo estilo da animação do aviso (ONB-19, `ter-o-anki.spec.js`): dois quadros que se alternam sozinhos — o
// ícone do Anki ao lado da pasta Aplicativos e o ícone já dentro dela —, parados e lado a lado com “menos movimento”.
// É só imagem: a frase do passo (ONB-18) é o que o leitor de tela lê. O Windows e os outros sistemas não o têm.

const { test, expect, comOSistema, SISTEMAS } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { fotografar } = require('../evidencias-mineracao');

const card = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const naoTenho = page => card(page).getByRole('button', { name: 'Não tenho' });
const baixarOAnki = page => card(page).getByRole('link', { name: 'Baixar o Anki' });

/** O painel como um usuário do sistema dado (o user agent e o `userAgentData` são os dele). */
async function abrirComo(page, extensao, sistema) {
  await comOSistema(page, sistema);
  await page.goto(extensao.url('painel.html#anki/custos'));
}

test.beforeEach(({ fakes }) => {
  fakes.anki.desligar();
});

test('“Não tenho” no Mac: o desenho mostra o Anki sendo arrastado para Aplicativos, entre o link e a frase', async ({ page, extensao }) => {
  await abrirComo(page, extensao, SISTEMAS.MAC);
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('.pc-arraste')).toBeHidden();

  await naoTenho(page).click();

  const desenho = card(page).locator('.pc-arraste');
  await expect(desenho).toBeVisible();
  await expect(desenho.locator('.pc-arraste__quadro')).toHaveCount(2);
  // O desenho é só imagem: quem lê por voz tem a frase logo abaixo (a mesma que o passo já dizia).
  await expect(desenho.locator('.pc-arraste__quadro').first()).toHaveAttribute('aria-hidden', 'true');
  await expect(desenho.locator('.pc-arraste__quadro').nth(1)).toHaveAttribute('aria-hidden', 'true');
  // Os dois quadros dizem os nomes que a pessoa vê no Mac: o Anki e a pasta Aplicativos.
  const primeiro = desenho.locator('.pc-arraste__quadro').first();
  const solto = desenho.locator('.pc-arraste__quadro--solto');
  await expect(primeiro).toContainText('Anki');
  await expect(primeiro).toContainText('Aplicativos');
  await expect(primeiro.locator('.pc-arraste__pasta .pc-arraste__miniatura')).toHaveCount(0);
  // O segundo quadro é o Anki já dentro da pasta, com a marca de foco da Base.
  await expect(solto).toHaveCount(1);
  await expect(solto.locator('.pc-arraste__pasta .pc-arraste__miniatura')).toHaveCount(1);
  await expect(solto.locator('.pc-arraste__pasta')).toHaveCSS('outline-style', 'solid');
  // Alternam sozinhos, como a animação do aviso.
  await expect(primeiro).toHaveCSS('animation-name', 'pc-quadro');
  await expect(solto).toHaveCSS('animation-name', 'pc-quadro');
  // Entre o link do download e a frase.
  const doLink = await baixarOAnki(page).boundingBox();
  const doDesenho = await desenho.boundingBox();
  const daFrase = await card(page).locator('.pc-anki__depois').boundingBox();
  expect(doLink.y + doLink.height).toBeLessThanOrEqual(doDesenho.y);
  expect(doDesenho.y + doDesenho.height).toBeLessThanOrEqual(daFrase.y);
  await expect(card(page).locator('.pc-anki__depois')).toHaveText('Arraste o Anki para a pasta Aplicativos e abra-o de lá.');
  await fotografar(page, 'ter-o-anki-mac-desenho.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('“Não tenho” no Mac, com menos movimento: os dois quadros do desenho ficam parados, lado a lado', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirComo(page, extensao, SISTEMAS.MAC);
  await expect(card(page)).toBeVisible();

  await naoTenho(page).click();

  const quadros = card(page).locator('.pc-arraste__quadro');
  await expect(quadros).toHaveCount(2);
  await expect(quadros.first()).toHaveCSS('animation-name', 'none');
  await expect(quadros.nth(1)).toHaveCSS('animation-name', 'none');
  // Visíveis de verdade: o toBeVisible do Playwright conta um quadro com opacidade 0 como visível.
  await expect(quadros.first()).toHaveCSS('opacity', '1');
  await expect(quadros.nth(1)).toHaveCSS('opacity', '1');
  const caixas = await quadros.evaluateAll(els => els.map(el => {
    const caixa = el.getBoundingClientRect();
    return { x: caixa.x, largura: caixa.width };
  }));
  expect(caixas[1].x).toBeGreaterThan(caixas[0].x + caixas[0].largura - 1);
  await fotografar(page, 'ter-o-anki-mac-desenho-parado.png');
  await estadoFinal(extensao, { pm_abridor: null });
});

test('“Não tenho” no Mac, com menos movimento numa janela estreita: os quadros empilham e cabem no card', async ({ page, extensao }) => {
  // Exceção de teste: sem-estado-guardado — só o layout dos quadros muda com a largura; nada é gravado.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirComo(page, extensao, SISTEMAS.MAC);
  await expect(card(page)).toBeVisible();
  await naoTenho(page).click();

  // Larguras de uma janela de Chrome de verdade (ela não fica mais estreita que ~500 px) em que dois quadros não cabem.
  for (const largura of [540, 500]) {
    await page.setViewportSize({ width: largura, height: 1000 });
    const caixas = await card(page).locator('.pc-controle').evaluate(controle => {
      const limite = controle.getBoundingClientRect();
      return [...controle.querySelectorAll('.pc-arraste__quadro')].map(quadro => {
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

test('“Não tenho” no Windows: o passo não tem o desenho de arrastar', async ({ page, extensao }) => {
  await abrirComo(page, extensao, SISTEMAS.WINDOWS);
  await expect(card(page)).toBeVisible();

  await naoTenho(page).click();

  await expect(baixarOAnki(page)).toBeVisible();
  await expect(card(page).locator('.pc-arraste')).toHaveCount(0);
  await estadoFinal(extensao, { pm_abridor: null });
});

test('“Não tenho” fora do Mac e do Windows: o passo não tem o desenho de arrastar', async ({ page, extensao }) => {
  // O Chromium do teste é o do Linux: nem Mac nem Windows.
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();

  await naoTenho(page).click();

  await expect(card(page)).toContainText('Depois de instalar, abra o Anki.');
  await expect(card(page).locator('.pc-arraste')).toHaveCount(0);
  await estadoFinal(extensao, { pm_abridor: null });
});
