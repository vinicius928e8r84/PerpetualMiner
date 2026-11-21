'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { paraCampos, deCampos, erroDaResposta, MOTIVO } = require('../lib/sincronizacao.js');

const resposta = (status, corpo) => ({ status, json: corpo === undefined ? async () => { throw new Error('sem corpo'); } : async () => corpo });

test('paraCampos escreve cada tipo no formato do Firestore e ignora o que não tem formato', () => {
  const campos = paraCampos({
    texto: 'a', numero: 7, marca: false, lista: [1, 'b'], mapa: { dentro: 2 },
    nulo: null, indefinido: undefined, funcao: () => 1,
  });
  assert.deepEqual(campos, {
    texto: { stringValue: 'a' },
    numero: { integerValue: '7' },
    marca: { booleanValue: false },
    lista: { arrayValue: { values: [{ stringValue: '1' }, { stringValue: 'b' }] } },
    mapa: { mapValue: { fields: { dentro: { integerValue: '2' } } } },
  });
});

test('deCampos lê cada tipo do Firestore e devolve null para o que não conhece', () => {
  assert.deepEqual(deCampos({
    texto: { stringValue: 'a' },
    numero: { integerValue: '7' },
    marca: { booleanValue: false },
    lista: { arrayValue: { values: [{ stringValue: 'x' }, { integerValue: '3' }, {}] } },
    vazia: { arrayValue: {} },
    mapa: { mapValue: { fields: { dentro: { integerValue: '2' } } } },
    estranho: { geoPointValue: {} },
  }), {
    texto: 'a', numero: 7, marca: false, lista: ['x', '3', ''], vazia: [], mapa: { dentro: 2 }, estranho: null,
  });
  assert.deepEqual(deCampos(undefined), {});
});

test('erroDaResposta separa sessão vencida, recusa das regras e erro comum', async () => {
  const vencida = await erroDaResposta(resposta(401, { error: { message: 'token' } }));
  assert.deepEqual([vencida.message, vencida.motivo, vencida.status], ['token', MOTIVO.EXPIROU, undefined]);

  const recusada = await erroDaResposta(resposta(403, {}));
  assert.deepEqual([recusada.message, recusada.motivo, recusada.status], ['HTTP 403', MOTIVO.RECUSADO, undefined]);

  const negada = await erroDaResposta(resposta(400, { error: { status: 'PERMISSION_DENIED', message: 'regras' } }));
  assert.deepEqual([negada.message, negada.motivo, negada.status], ['regras', MOTIVO.RECUSADO, undefined]);

  const comum = await erroDaResposta(resposta(500));
  assert.deepEqual([comum.message, comum.motivo, comum.status], ['HTTP 500', undefined, 500]);
});
