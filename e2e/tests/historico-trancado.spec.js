'use strict';

const { test, expect } = require('../fixtures');

const FICA = { id: 1, texto: 'He barely made it to the station.', data: '18/09/2026', streaming: 'netflix', idioma: 'Inglês' };
const SAI = { id: 2, texto: 'Let us call it a day.', data: '18/09/2026', streaming: 'netflix', idioma: 'Inglês' };
const NOVA = 'The ferry left the harbour.';

const cartoes = page => page.locator('#frases-lista .veio-frase');

function pedidosNaFilaDaTranca(page) {
  return page.evaluate(async () =>
    (await navigator.locks.query()).pending.filter(pedido => pedido.name === 'pm-historico').length);
}

function trancarOHistorico(page) {
  return page.evaluate(() => new Promise(trancou => {
    navigator.locks.request('pm-historico', () => {
      trancou();
      return new Promise(soltar => { window.soltarOHistorico = soltar; });
    });
  }));
}

test('com o Histórico trancado, a Frase minerada e o Apagar do Painel esperam a vez, e as duas mudanças ficam', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [SAI, FICA] });
  await page.goto(extensao.url('painel.html#frases'));
  await expect(cartoes(page)).toHaveText([/call it a day/, /barely/]);
  await trancarOHistorico(page);

  const minerada = page.evaluate(texto => chrome.runtime.sendMessage({
    type: 'SALVAR_HISTORICO', texto, origem: 'manual', idioma: 'Inglês', palavras: ['ferry@2'],
  }), NOVA);
  await expect.poll(() => pedidosNaFilaDaTranca(page)).toBe(1);
  await cartoes(page).filter({ hasText: SAI.texto }).getByRole('button', { name: 'Apagar frase', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar frase' }).click();
  await expect.poll(() => pedidosNaFilaDaTranca(page)).toBe(2);
  expect(await extensao.frases()).toEqual([SAI, FICA]);

  await page.evaluate(() => window.soltarOHistorico());
  expect((await minerada).ok).toBe(true);
  await expect.poll(async () => (await extensao.frases()).map(f => [f.texto, f.keywords])).toEqual([
    [NOVA, ['ferry@2']],
    [FICA.texto, undefined],
  ]);
  await expect(cartoes(page)).toHaveText([/ferry left/, /barely/]);
});
