'use strict';

const assert = require('assert');
const { decidir } = require('./issue-da-noturna.js');

for (const reprovado of ['failure', 'timed_out', 'cancelled']) {
  assert.strictEqual(decidir([reprovado, 'success', 'success']), 'vermelha', `${reprovado} na primeira posição`);
  assert.strictEqual(decidir(['success', reprovado, 'success']), 'vermelha', `${reprovado} no meio`);
  assert.strictEqual(decidir(['success', 'success', reprovado]), 'vermelha', `${reprovado} na última`);
  assert.strictEqual(decidir(['skipped', reprovado]), 'vermelha', `${reprovado} com uma pulada`);
}
assert.strictEqual(decidir(['success', 'success', 'success']), 'verde');
assert.strictEqual(decidir(['success']), 'verde');
for (const semResultado of ['skipped', '', undefined, 'queued']) {
  assert.strictEqual(decidir(['success', semResultado]), 'nada', `${semResultado} não é verde nem vermelha`);
}
assert.strictEqual(decidir([]), 'nada');

console.log('ok');
