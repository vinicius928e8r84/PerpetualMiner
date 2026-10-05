'use strict';

// O que ficou guardado ao fim de um cenário (CODING_STANDARDS.md regra 8): um teste que age na tela
// confere também isto, com um valor concreto, na fonte que guarda de verdade. A regra `e2e-estado-final`
// (scripts/regras/) exige uma leitura seguida de uma conferência depois da primeira ação; estas funções
// são o jeito que não deixa a conferência vazia (sem chave, ou sem o valor esperado).

const { expect } = require('@playwright/test');

const PRAZO_PADRAO_MS = 5000;

const vazio = esperado => esperado === undefined
  || (esperado && typeof esperado === 'object' && !Array.isArray(esperado) && Object.keys(esperado).length === 0);

// Um objeto casa pelas chaves que o teste diz (em qualquer fundura); o resto compara inteiro.
const conferir = (poll, esperado) => (esperado && typeof esperado === 'object' && !Array.isArray(esperado)
  ? poll.toMatchObject(esperado) : poll.toEqual(esperado));

/**
 * O storage da extensão tem, para cada chave de `esperado`, o valor dito: `null` é uma chave que não está
 * guardada. Espera a gravação chegar (até `prazo` ms). Sem nenhuma chave, ou com um valor `undefined` ou `{}`, a
 * conferência seria vazia e o teste falha.
 */
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

/** Um valor guardado fora do storage da extensão (o item de login que a Conexão tem, as frases do Firestore falso): `ler()` devolve o que está lá. */
async function estadoFinalEm(descricao, ler, esperado, { prazo = PRAZO_PADRAO_MS } = {}) {
  if (vazio(esperado)) throw new Error(`estadoFinalEm(${descricao}): diga o valor que deve estar guardado, não ${JSON.stringify(esperado)}`);
  await conferir(expect.poll(async () => ler(), { timeout: prazo, message: `o que ficou guardado: ${descricao}` }), esperado);
}

/** As `chaves` do storage ficam como estavam depois de `acao` (uma recusa não grava nada). */
async function estadoFinalInalterado(extensao, chaves, acao) {
  if (!Array.isArray(chaves) || chaves.length === 0) throw new Error('estadoFinalInalterado precisa de ao menos uma chave do storage');
  const antes = await extensao.lerStorage(chaves);
  await acao();
  expect(await extensao.lerStorage(chaves), `o que ficou guardado em ${chaves.join(', ')} devia estar como antes`).toEqual(antes);
}

module.exports = { estadoFinal, estadoFinalEm, estadoFinalInalterado };
