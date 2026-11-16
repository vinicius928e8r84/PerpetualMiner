'use strict';

const { expect } = require('@playwright/test');

const PRAZO_PADRAO_MS = 5000;

const vazio = esperado => esperado === undefined
  || (esperado && typeof esperado === 'object' && !Array.isArray(esperado) && Object.keys(esperado).length === 0);

const conferir = (poll, esperado) => (esperado && typeof esperado === 'object' && !Array.isArray(esperado)
  ? poll.toMatchObject(esperado) : poll.toEqual(esperado));

async function estadoFinal(extensao, esperado, { prazo = PRAZO_PADRAO_MS } = {}) {
  const chaves = Object.keys(esperado || {});
  if (chaves.length === 0) throw new Error('estadoFinal precisa de ao menos uma chave do storage e do valor que ela deve ter');
  for (const chave of chaves) {
    if (vazio(esperado[chave])) {
      throw new Error(`estadoFinal: ${chave} sem valor esperado; diga o que deve estar guardado (null: nada guardado), não ${JSON.stringify(esperado[chave])}`);
    }
  }
  for (const chave of chaves) {
    await conferir(
      expect.poll(async () => (await extensao.lerStorage([chave]))[chave] ?? null, { timeout: prazo, message: `o que ficou guardado em ${chave}` }),
      esperado[chave],
    );
  }
}

async function estadoFinalEm(descricao, ler, esperado, { prazo = PRAZO_PADRAO_MS } = {}) {
  if (vazio(esperado)) throw new Error(`estadoFinalEm(${descricao}): diga o valor que deve estar guardado, não ${JSON.stringify(esperado)}`);
  await conferir(expect.poll(async () => ler(), { timeout: prazo, message: `o que ficou guardado: ${descricao}` }), esperado);
}

async function estadoFinalInalterado(extensao, chaves, acao) {
  if (!Array.isArray(chaves) || chaves.length === 0) throw new Error('estadoFinalInalterado precisa de ao menos uma chave do storage');
  const antes = await extensao.lerStorage(chaves);
  await acao();
  expect(await extensao.lerStorage(chaves), `o que ficou guardado em ${chaves.join(', ')} devia estar como antes`).toEqual(antes);
}

module.exports = { estadoFinal, estadoFinalEm, estadoFinalInalterado };
