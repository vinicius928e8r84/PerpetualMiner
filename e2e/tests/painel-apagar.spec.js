'use strict';

// O painel gravava o tombstone com o caminho de campo `ids.{id}` sem crases,
// que o Firestore recusa: apagar uma frase não deixava tombstone na nuvem, e
// "Apagar tudo" esperava essa gravação e nunca chegava ao DELETE.

const { test, expect } = require('../fixtures');

const PRIMEIRA = 'The ferry left before the fog had lifted.';
const SEGUNDA = 'Her notebook was full of borrowed recipes.';

async function minerar(page, textos) {
  return page.evaluate(lista => Promise.all(lista.map(texto =>
    chrome.runtime.sendMessage({
      type: 'SALVAR_HISTORICO',
      texto,
      origem: 'manual',
      idioma: 'Inglês',
      contexto: { fonte: 'manual', titulo: 'Manual Input', detalhe: '' },
    }),
  )), textos);
}

async function abrirPainelSincronizado(page, extensao, endereco = '') {
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
}

test('com a conta conectada, a frase apagada no painel sai da nuvem e fica no tombstone', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-painel' });
  await page.goto(extensao.url('popup.html'));
  const [apagada] = await minerar(page, [PRIMEIRA, SEGUNDA]);
  await expect.poll(() => fakes.google.frasesDe('uid-painel').length).toBe(2);

  await abrirPainelSincronizado(page, extensao);
  await page.locator('#frases-lista .veio-frase', { hasText: PRIMEIRA }).getByRole('button', { name: 'Apagar frase' }).click();
  await expect(page.getByText(PRIMEIRA)).toHaveCount(0);

  await expect.poll(() => fakes.google.frasesDe('uid-painel').map(f => f.texto)).toEqual([SEGUNDA]);
  await expect.poll(() => fakes.google.apagadasDe('uid-painel')).toEqual([String(apagada.frase.id)]);
});

test('com a conta conectada, "Apagar tudo" no painel apaga todas as frases da nuvem', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-tudo' });
  await page.goto(extensao.url('popup.html'));
  const mineradas = await minerar(page, [PRIMEIRA, SEGUNDA]);
  await expect.poll(() => fakes.google.frasesDe('uid-tudo').length).toBe(2);

  // “Apagar tudo” mora em Configurações › Zona de perigo.
  await abrirPainelSincronizado(page, extensao, '#configuracoes/perigo');
  page.once('dialog', dialogo => dialogo.accept());
  await page.getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await expect(page.locator('#shell-total')).toHaveText('0');

  await expect.poll(() => fakes.google.frasesDe('uid-tudo')).toEqual([]);
  expect(fakes.google.apagadasDe('uid-tudo').sort()).toEqual(mineradas.map(m => String(m.frase.id)).sort());
});
