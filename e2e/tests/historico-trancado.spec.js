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

async function minerarComOHistoricoTrancado(page, extensao, frases) {
  await extensao.gravarStorage({ frases });
  await page.goto(extensao.url('painel.html#frases'));
  await expect(cartoes(page)).toHaveCount(frases.length);
  await trancarOHistorico(page);
  const minerada = page.evaluate(texto => chrome.runtime.sendMessage({
    type: 'MINERAR', texto, origem: 'manual', idioma: 'Inglês', palavras: ['ferry@2'],
  }), NOVA);
  await expect.poll(() => pedidosNaFilaDaTranca(page)).toBe(1);
  return { minerada };
}

async function soltarDepoisDoPainelEntrarNaFila(page, extensao, frases) {
  await expect.poll(() => pedidosNaFilaDaTranca(page)).toBe(2);
  expect(await extensao.frases()).toEqual(frases);
  await page.evaluate(() => window.soltarOHistorico());
}

test('com o Histórico trancado, a Frase minerada e o Apagar do Painel esperam a vez, e as duas mudanças ficam', async ({ page, extensao }) => {
  const { minerada } = await minerarComOHistoricoTrancado(page, extensao, [SAI, FICA]);
  await cartoes(page).filter({ hasText: SAI.texto }).getByRole('button', { name: 'Apagar frase', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar frase' }).click();
  await soltarDepoisDoPainelEntrarNaFila(page, extensao, [SAI, FICA]);
  expect((await minerada).ok).toBe(true);
  await expect.poll(async () => (await extensao.frases()).map(f => [f.texto, f.keywords])).toEqual([
    [NOVA, ['ferry@2']],
    [FICA.texto, undefined],
  ]);
  await expect(cartoes(page)).toHaveText([/ferry left/, /barely/]);
});

test('com o Histórico trancado, a Palavra marcada no Painel espera a vez da Frase minerada, e as duas ficam', async ({ page, extensao }) => {
  const { minerada } = await minerarComOHistoricoTrancado(page, extensao, [FICA]);
  await cartoes(page).getByRole('button', { name: 'barely', exact: true }).click();
  await soltarDepoisDoPainelEntrarNaFila(page, extensao, [FICA]);

  expect((await minerada).ok).toBe(true);
  await expect.poll(async () => (await extensao.frases()).map(f => [f.texto, f.keywords])).toEqual([
    [NOVA, ['ferry@2']],
    [FICA.texto, ['barely@2']],
  ]);
});

test('com o Histórico trancado, o Contexto de N frases espera a vez da Frase minerada, e as duas mudanças ficam', async ({ page, extensao }) => {
  const { minerada } = await minerarComOHistoricoTrancado(page, extensao, [SAI, FICA]);
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Editar contexto', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Título' }).fill('Dark');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar contexto' }).click();
  await soltarDepoisDoPainelEntrarNaFila(page, extensao, [SAI, FICA]);

  expect((await minerada).ok).toBe(true);
  await expect.poll(async () => (await extensao.frases()).map(f => [f.texto, f.contexto?.titulo])).toEqual([
    [NOVA, undefined],
    [SAI.texto, 'Dark'],
    [FICA.texto, 'Dark'],
  ]);
  await expect(page.locator('.veio-toast')).toHaveText('Contexto de 2 frases atualizado');
});

test('com o Histórico trancado, o Apagar tudo espera a vez, apaga as Frases que estavam na tela e deixa a que chegou', async ({ page, extensao }) => {
  const { minerada } = await minerarComOHistoricoTrancado(page, extensao, [SAI, FICA]);
  await page.locator('.shell-lateral').getByRole('link', { name: 'Configurações', exact: true }).click();
  await page.getByRole('button', { name: 'Zona de perigo', exact: true }).click();
  await page.getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 2 frases' }).click();
  await soltarDepoisDoPainelEntrarNaFila(page, extensao, [SAI, FICA]);

  expect((await minerada).ok).toBe(true);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([NOVA]);
  await expect(page.getByRole('button', { name: 'Apagar 1 frase', exact: true })).toBeVisible();
});

test('com Conta e o Histórico trancado, o Painel espera a vez para copiar a marca Enviada da nuvem, e a Frase minerada fica', async ({ page, context, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-trancado' });
  await extensao.gravarStorage({ frases: [FICA] });
  fakes.google.gravarFrases('uid-trancado', [{ ...FICA, status: 'exported' }]);
  const outra = await context.newPage();
  await outra.goto(extensao.url('popup/popup.html'));
  await trancarOHistorico(outra);
  const minerada = outra.evaluate(texto => chrome.runtime.sendMessage({
    type: 'MINERAR', texto, origem: 'manual', idioma: 'Inglês', palavras: ['ferry@2'],
  }), NOVA);
  await expect.poll(() => pedidosNaFilaDaTranca(outra)).toBe(1);

  await page.goto(extensao.url('painel.html#frases'));
  await expect.poll(() => pedidosNaFilaDaTranca(outra)).toBe(2);
  expect(await extensao.frases()).toEqual([FICA]);
  await outra.evaluate(() => window.soltarOHistorico());

  expect((await minerada).ok).toBe(true);
  await expect.poll(async () => (await extensao.frases()).map(f => [f.texto, f.status])).toEqual([
    [NOVA, undefined],
    [FICA.texto, 'exported'],
  ]);
});
