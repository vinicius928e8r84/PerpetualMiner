'use strict';

const { test, expect, botaoFlutuante } = require('../fixtures');

async function anotarSeletoresDoContentScript(page, context, extensao, ir) {
  const cdp = await context.newCDPSession(page);
  const mundos = [];
  cdp.on('Runtime.executionContextCreated', ({ context: mundo }) => mundos.push(mundo));
  await cdp.send('Runtime.enable');
  await ir();
  const doContentScript = mundos.filter(mundo => mundo.origin === `chrome-extension://${extensao.id}`).at(-1);
  const avaliar = async expression => (await cdp.send('Runtime.evaluate', { contextId: doContentScript.id, returnByValue: true, expression })).result.value;
  await avaliar(`(() => {
    const pedir = Document.prototype.querySelectorAll;
    globalThis.__seletoresPedidos = [];
    Document.prototype.querySelectorAll = function (seletor) { globalThis.__seletoresPedidos.push(seletor); return pedir.call(this, seletor); };
  })()`);
  return () => avaliar('globalThis.__seletoresPedidos.splice(0)');
}

const DUAS_VOLTAS_MS = 1600;

// Exceção de teste: sem-estado-guardado
test('com a mineração automática desligada, o content script só procura o vídeo: nenhum seletor de legenda é pedido', async ({ page, context, paginas, extensao }) => {
  const lerSeletores = await anotarSeletoresDoContentScript(page, context, extensao, async () => {
    await page.goto(paginas.url('player.html'));
    await expect(botaoFlutuante(page)).toBeVisible();
  });

  await page.waitForTimeout(DUAS_VOLTAS_MS);

  const pedidos = await lerSeletores();
  expect(pedidos).toContain('video');
  expect(pedidos.filter(seletor => seletor !== 'video')).toEqual([]);
});

// Exceção de teste: sem-estado-guardado
test('com os dois idiomas ligados, a legenda continua sendo lida: o contador do botão é o do idioma dela', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 5 } } });
  await page.goto(paginas.url('player.html'));
  await expect(botaoFlutuante(page)).toBeVisible();

  await expect(page.locator('perpetualminer-overlay .pm-contador')).toHaveText('0/20');
});
