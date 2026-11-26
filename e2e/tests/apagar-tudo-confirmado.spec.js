'use strict';

const { test, expect } = require('../fixtures');

const AGORA = Date.now();
const FICA = { id: AGORA - 60_000, texto: 'He barely made it to the station.', data: '19/11/2026', streaming: 'netflix', idioma: 'Inglês' };
const SAI = { id: AGORA - 30_000, texto: 'Let us call it a day.', data: '19/11/2026', streaming: 'netflix', idioma: 'Inglês' };
const NOVA = 'The ferry left the harbour.';

const contadorDeFrases = page => page.locator('.shell-lateral').getByRole('link', { name: 'Frases' }).locator('.shell-contador');

async function abrirOApagarTudo(page) {
  await page.getByRole('button', { name: 'Zona de perigo', exact: true }).click();
  await page.getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await expect(page.getByRole('dialog')).toContainText('Apagar 2 frases');
}

function minerar(page) {
  return page.evaluate(texto => chrome.runtime.sendMessage({
    type: 'MINERAR', texto, origem: 'manual', idioma: 'Inglês', palavras: ['ferry@2'],
  }), NOVA);
}

test('o Apagar tudo apaga as Frases que o diálogo contou; a minerada com ele aberto fica', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [SAI, FICA] });
  await page.goto(extensao.url('painel.html#configuracoes'));
  await abrirOApagarTudo(page);

  expect((await minerar(page)).ok).toBe(true);
  await expect(contadorDeFrases(page)).toHaveText('3');
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 2 frases' }).click();

  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([NOVA]);
  await expect(contadorDeFrases(page)).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Apagar 1 frase', exact: true })).toBeVisible();
});

test('com Conta, a Frase minerada com o diálogo aberto fica também na nuvem, sem tombstone', async ({ page, extensao, fakes }) => {
  const uid = 'uid-apagar-tudo';
  await extensao.semearSessao({ uid });
  await extensao.gravarStorage({ frases: [SAI, FICA] });
  fakes.google.gravarFrases(uid, [SAI, FICA]);
  await page.goto(extensao.url('painel.html#configuracoes'));
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  await abrirOApagarTudo(page);

  const minerada = await minerar(page);
  expect(minerada.ok).toBe(true);
  await expect.poll(() => fakes.google.frasesDe(uid).length).toBe(3);
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 2 frases' }).click();

  await expect.poll(() => fakes.google.frasesDe(uid).map(f => f.texto)).toEqual([NOVA]);
  expect(fakes.google.apagadasDe(uid).sort()).toEqual([String(FICA.id), String(SAI.id)]);
  expect((await extensao.frases()).map(f => f.texto)).toEqual([NOVA]);
});
