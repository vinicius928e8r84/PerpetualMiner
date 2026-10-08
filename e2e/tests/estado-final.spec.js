'use strict';

// As conferências de e2e/estado-final.js: confirmam o que está guardado e recusam ficar vazias.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm, estadoFinalInalterado } = require('../estado-final');

test('estadoFinal confere o valor guardado no storage da extensão, parcial para objetos', async ({ extensao }) => {
  await extensao.gravarStorage({ pm_tema: 'claro', pm_envio: { envios: [{ id: 'a', lang: 'en' }], extra: 1 } });

  await estadoFinal(extensao, { pm_tema: 'claro', pm_envio: { envios: [{ id: 'a' }] }, pm_que_nao_existe: null });
  await expect(estadoFinal(extensao, { pm_tema: 'escuro' }, { prazo: 300 })).rejects.toThrow(/o que ficou guardado em pm_tema/);
  await expect(estadoFinal(extensao, { pm_que_nao_existe: 'algo' }, { prazo: 300 })).rejects.toThrow();
});

test('estadoFinal espera a gravação que chega depois', async ({ extensao }) => {
  setTimeout(() => extensao.gravarStorage({ pm_tema: 'claro' }), 400);
  await estadoFinal(extensao, { pm_tema: 'claro' });
});

test('uma conferência vazia falha em vez de passar', async ({ extensao }) => {
  await expect(estadoFinal(extensao, {})).rejects.toThrow(/ao menos uma chave/);
  await expect(estadoFinal(extensao, { pm_tema: undefined })).rejects.toThrow(/sem valor esperado/);
  await expect(estadoFinal(extensao, { pm_envio: {} })).rejects.toThrow(/sem valor esperado/);
  await expect(estadoFinalEm('o item de login', () => true, undefined)).rejects.toThrow(/diga o valor/);
  await expect(estadoFinalInalterado(extensao, [], async () => {})).rejects.toThrow(/ao menos uma chave/);
});

test('estadoFinalEm confere o que uma fonte fora do storage guarda', async () => {
  let itemDeLogin = false;
  setTimeout(() => { itemDeLogin = true; }, 300);
  await estadoFinalEm('o item de login', () => itemDeLogin, true);
  await expect(estadoFinalEm('o item de login', () => itemDeLogin, false, { prazo: 300 })).rejects.toThrow(/o item de login/);
});

test('estadoFinalInalterado vê uma gravação que não devia acontecer', async ({ extensao }) => {
  await extensao.gravarStorage({ pm_tema: 'claro' });

  await estadoFinalInalterado(extensao, ['pm_tema'], async () => {});
  await expect(estadoFinalInalterado(extensao, ['pm_tema'], () => extensao.gravarStorage({ pm_tema: 'escuro' }))).rejects.toThrow(/como antes/);
});
