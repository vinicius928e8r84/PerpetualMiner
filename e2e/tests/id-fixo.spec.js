'use strict';

const { test, expect } = require('../fixtures');

test('a extensão carregada da pasta tem o ID do item da loja', async ({ extensao }) => {
  expect(extensao.id).toBe('ohpoogiccjmdgilgegholdidgfhjkadf');
  const retorno = await extensao.serviceWorker.evaluate(() => chrome.identity.getRedirectURL());
  expect(retorno).toBe(`https://${extensao.id}.chromiumapp.org/`);
});
