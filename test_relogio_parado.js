'use strict';

const assert = require('assert');
const relogioParado = require('./e2e/relogio-parado');

const MEIO_DIA = new Date('2026-09-18T12:00:00').getTime();

function paginaQueAnota() {
  const chamadas = [];
  return {
    chamadas,
    clock: {
      install: async opcoes => { chamadas.push(['install', new Date(opcoes.time).getTime()]); },
      pauseAt: async instante => { chamadas.push(['pauseAt', new Date(instante).getTime()]); },
      runFor: async () => {},
    },
  };
}

(async () => {
  const semInstante = paginaQueAnota();
  const relogio = await relogioParado.pararRelogio(semInstante, { prazoDoTeste: 30_000 });
  assert.strictEqual(relogio.instante.getTime(), MEIO_DIA, 'sem `em`, o relógio para no instante fixo dos testes, não na hora da máquina');
  assert.deepStrictEqual(semInstante.chamadas, [['install', MEIO_DIA - relogio.margem], ['pauseAt', MEIO_DIA]]);

  const semNada = paginaQueAnota();
  assert.strictEqual((await relogioParado.pararRelogio(semNada)).instante.getTime(), MEIO_DIA);
  assert.deepStrictEqual(semNada.chamadas.at(-1), ['pauseAt', MEIO_DIA]);

  const comInstante = paginaQueAnota();
  const pedido = new Date('2026-03-01T23:59:00').getTime();
  assert.strictEqual((await relogioParado.pararRelogio(comInstante, { em: pedido })).instante.getTime(), pedido);
  assert.deepStrictEqual(comInstante.chamadas.at(-1), ['pauseAt', pedido]);

  assert.strictEqual(relogioParado.AGORA_DOS_TESTES.getTime(), MEIO_DIA);

  console.log('relogio-parado tests passed');
})().catch(erro => {
  console.error(erro);
  process.exit(1);
});
