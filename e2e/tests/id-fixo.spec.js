'use strict';

const { test, expect } = require('../fixtures');

// A "key" do manifest fixa o ID da extensão carregada da pasta no mesmo ID do
// item da loja, para o login com Google ter um único endereço de retorno.
test('a extensão carregada da pasta tem o ID do item da loja', async ({ extensao }) => {
  expect(extensao.id).toBe('ohpoogiccjmdgilgegholdidgfhjkadf');
  const retorno = await extensao.serviceWorker.evaluate(() => chrome.identity.getRedirectURL());
  expect(retorno).toBe('https://ohpoogiccjmdgilgegholdidgfhjkadf.chromiumapp.org/');
});
