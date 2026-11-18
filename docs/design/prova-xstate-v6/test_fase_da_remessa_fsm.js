'use strict';

const assert = require('assert');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..', '..');
globalThis.PerpetualMiner = {};
globalThis.XStateFSM = require('./vendor/xstate-fsm.umd.min.js');
require(path.join(RAIZ, 'painel-envio-estado.js'));
require('./fase-da-remessa-fsm.js');
const { FaseDaRemessa, FaseDaRemessaFSM } = globalThis.PerpetualMiner;

assert.deepStrictEqual(FaseDaRemessaFSM.FASE, FaseDaRemessa.FASE);
assert.deepStrictEqual(FaseDaRemessaFSM.EVENTO, FaseDaRemessa.EVENTO);
assert.strictEqual(FaseDaRemessaFSM.PRAZO_DO_PEDIDO_MS, FaseDaRemessa.PRAZO_DO_PEDIDO_MS);

const DADOS = [{}, { sobrou: true }, { sobrou: false }, { tentar: true }, { tentar: false }, { sobrou: true, tentar: true }];
let comparadas = 0;
for (const fase of Object.values(FaseDaRemessa.FASE)) {
  for (const tipo of Object.values(FaseDaRemessa.EVENTO)) {
    assert.strictEqual(FaseDaRemessaFSM.aceita(fase, tipo), FaseDaRemessa.aceita(fase, tipo), `aceita ${fase} × ${tipo}`);
    for (const dados of DADOS) {
      const evento = { tipo, ...dados };
      assert.strictEqual(FaseDaRemessaFSM.proxima(fase, evento), FaseDaRemessa.proxima(fase, evento), `proxima ${fase} × ${JSON.stringify(evento)}`);
      comparadas += 1;
    }
  }
}
assert.strictEqual(comparadas, 4 * 6 * DADOS.length);

const { FASE, EVENTO, proxima } = FaseDaRemessaFSM;
const depoisDe = (eventos, fase = FASE.PARADA) => eventos.reduce((f, evento) => proxima(f, typeof evento === 'string' ? { tipo: evento } : evento), fase);
const CRIOU = { tipo: EVENTO.CRIOU, sobrou: true };
assert.strictEqual(depoisDe([EVENTO.CRIAR, CRIOU, EVENTO.RESUMIR, { tipo: EVENTO.RESPONDER, tentar: true }, EVENTO.CRIAR]), FASE.CRIANDO);
assert.strictEqual(depoisDe([EVENTO.CRIAR, { tipo: EVENTO.CRIOU, sobrou: false }]), FASE.PARADA);

assert.throws(() => globalThis.XStateFSM.createFSM({ initial: 'a', states: { a: { on: { IR: 'b' } }, b: {} } }), /Use \{ target: "b" \}/);
assert.strictEqual(proxima(FASE.PARADA, { tipo: 'eventoQueNaoExiste' }), FASE.PARADA);

console.log('test_fase_da_remessa_fsm ok');
