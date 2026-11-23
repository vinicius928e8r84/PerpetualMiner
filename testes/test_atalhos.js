'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class Element {
  constructor(localName, extra = {}) {
    this.localName = localName;
    this.isContentEditable = false;
    Object.assign(this, extra);
  }
}

function carregar(chrome) {
  const contexto = vm.createContext({ Element, chrome });
  contexto.globalThis = contexto;
  contexto.PerpetualMiner = { textoDaVoz: (id, valores) => (valores ? `${id}:${valores.n}` : id) };
  vm.runInContext(fs.readFileSync('lib/atalhos.js', 'utf8'), contexto);
  return contexto.PerpetualMiner.Atalhos;
}

const Atalhos = carregar(undefined);
const doEvento = alvo => ({ target: alvo });

for (const tipo of ['text', 'search', 'email', 'password', 'number', 'url', 'tel', 'date']) {
  assert.strictEqual(Atalhos.digitandoNumCampo(doEvento(new Element('input', { type: tipo }))), true, `input ${tipo}`);
}
for (const tipo of ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']) {
  assert.strictEqual(Atalhos.digitandoNumCampo(doEvento(new Element('input', { type: tipo }))), false, `input ${tipo}`);
}
assert.strictEqual(Atalhos.digitandoNumCampo(doEvento(new Element('textarea'))), true);
assert.strictEqual(Atalhos.digitandoNumCampo(doEvento(new Element('select'))), true);
assert.strictEqual(Atalhos.digitandoNumCampo(doEvento(new Element('div', { isContentEditable: true }))), true);
assert.strictEqual(Atalhos.digitandoNumCampo(doEvento(new Element('div'))), false);
assert.strictEqual(Atalhos.digitandoNumCampo(doEvento(new Element('button'))), false);
assert.strictEqual(Atalhos.digitandoNumCampo(doEvento({ localName: 'input', type: 'text' })), false, 'alvo que não é elemento');
assert.strictEqual(Atalhos.digitandoNumCampo(doEvento(null)), false);

const dentro = new Element('input', { type: 'text' });
assert.strictEqual(Atalhos.digitandoNumCampo({ composedPath: () => [dentro, new Element('div')], target: new Element('div') }), true, 'o primeiro do caminho vale mais que o alvo');
assert.strictEqual(Atalhos.digitandoNumCampo({ composedPath: () => [], target: dentro }), true, 'caminho vazio cai no alvo');

const sombras = new Map();
const comSombra = carregar({ dom: { openOrClosedShadowRoot: elemento => sombras.get(elemento) } });
const hospedeiro = new Element('div');
const campoNaSombra = new Element('input', { type: 'text' });
sombras.set(hospedeiro, { activeElement: campoNaSombra });
assert.strictEqual(comSombra.digitandoNumCampo(doEvento(hospedeiro)), true, 'campo com foco numa sombra fechada');
sombras.set(hospedeiro, { activeElement: new Element('button') });
assert.strictEqual(comSombra.digitandoNumCampo(doEvento(hospedeiro)), false, 'botão com foco na sombra');
sombras.set(hospedeiro, { activeElement: null });
assert.strictEqual(comSombra.digitandoNumCampo(doEvento(hospedeiro)), false, 'sombra sem foco: vale o hospedeiro');
sombras.set(hospedeiro, undefined);
assert.strictEqual(comSombra.digitandoNumCampo(doEvento(hospedeiro)), false, 'sem sombra');
const hospedeiroEditavel = new Element('div', { isContentEditable: true });
sombras.set(hospedeiroEditavel, { activeElement: null });
assert.strictEqual(comSombra.digitandoNumCampo(doEvento(hospedeiroEditavel)), true, 'hospedeiro editável sem foco na sombra');
const fundo = new Element('div');
const meio = new Element('div');
sombras.set(fundo, { activeElement: meio });
sombras.set(meio, { activeElement: new Element('textarea') });
assert.strictEqual(comSombra.digitandoNumCampo(doEvento(fundo)), true, 'sombras dentro de sombras');

const teclado = (extra = {}) => ({ type: 'keydown', key: 'a', code: 'KeyA', altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...extra });
assert.strictEqual(Atalhos.atalhoDoEvento(teclado({ metaKey: true, altKey: true })), null);
assert.strictEqual(Atalhos.atalhoDoEvento(teclado()), null, 'sem modificador');
assert.strictEqual(Atalhos.atalhoDoEvento(teclado({ key: 'Alt', altKey: true })), null, 'só o modificador');
assert.deepStrictEqual({ ...Atalhos.atalhoDoEvento(teclado({ altKey: true })) }, {
  type: 'keyboard', button: null, code: 'KeyA', altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+A',
});
const mouse = (button, extra = {}) => ({ type: 'mousedown', button, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...extra });
assert.strictEqual(Atalhos.atalhoDoEvento(mouse(0)), null);
assert.strictEqual(Atalhos.atalhoDoEvento(mouse(2)), null);
assert.deepStrictEqual({ ...Atalhos.atalhoDoEvento(mouse(3, { ctrlKey: true })) }, {
  type: 'mouse', button: 3, code: null, altKey: false, ctrlKey: true, shiftKey: false, label: 'Ctrl+CFG-14.botaoVoltar',
});

const padrao = Atalhos.ATALHOS_PADRAO.legenda;
assert.strictEqual(Atalhos.mesmoAtalho(null, null), true);
assert.strictEqual(Atalhos.mesmoAtalho(padrao, null), false);
assert.strictEqual(Atalhos.mesmoAtalho(null, padrao), false);
assert.strictEqual(Atalhos.mesmoAtalho(padrao, { ...padrao, label: 'outro' }), true, 'o rótulo não conta');
assert.strictEqual(Atalhos.mesmoAtalho(padrao, { ...padrao, code: 'KeyD' }), false);
assert.strictEqual(Atalhos.mesmoAtalho(padrao, { ...padrao, shiftKey: true }), false);
assert.strictEqual(Atalhos.mesmoAtalho(padrao, { ...padrao, shiftKey: undefined }), true, 'modificador ausente é falso');
assert.strictEqual(Atalhos.mesmoAtalho({ type: 'mouse', button: 3 }, { type: 'mouse', button: 3, code: 'x' }), true);
assert.strictEqual(Atalhos.mesmoAtalho({ type: 'mouse', button: 3 }, { type: 'mouse', button: 4 }), false);
assert.strictEqual(Atalhos.mesmoAtalho({ type: 'mouse', button: 3 }, { type: 'keyboard', code: null }), false);

assert.strictEqual(Atalhos.correspondeAoAtalho(null, teclado({ altKey: true })), false);
assert.strictEqual(Atalhos.correspondeAoAtalho(padrao, teclado({ code: 'KeyS', altKey: true })), true);
assert.strictEqual(Atalhos.correspondeAoAtalho(padrao, teclado({ code: 'KeyS', altKey: true, metaKey: true })), false);
assert.strictEqual(Atalhos.correspondeAoAtalho(padrao, teclado({ type: 'keyup', code: 'KeyS', altKey: true })), false);
const botao3 = { type: 'mouse', button: 3, code: null, altKey: false, ctrlKey: false, shiftKey: false };
assert.strictEqual(Atalhos.correspondeAoAtalho(botao3, mouse(3)), true);
assert.strictEqual(Atalhos.correspondeAoAtalho(botao3, mouse(3, { type: 'mouseup' })), false);

assert.strictEqual(Atalhos.rotuloDoAtalho(null), '');
assert.strictEqual(Atalhos.rotuloDoAtalho(padrao), 'Alt+S');
assert.strictEqual(Atalhos.rotuloDoAtalho({ type: 'keyboard', code: 'Digit4', ctrlKey: true, shiftKey: true, altKey: true }), 'Ctrl+Alt+Shift+4');
assert.strictEqual(Atalhos.rotuloDoAtalho({ type: 'keyboard', code: null, label: 'Alt+X' }), 'Alt+X');
assert.strictEqual(Atalhos.rotuloDoAtalho({ type: 'keyboard', code: null }), '');
assert.strictEqual(Atalhos.rotuloDoAtalho({ type: 'mouse', button: 1 }), 'CFG-14.botaoDoMeio');
assert.strictEqual(Atalhos.rotuloDoAtalho({ type: 'mouse', button: 7, shiftKey: true }), 'Shift+CFG-14.outro:7');

assert.strictEqual(Atalhos.estaNoPadrao({ legenda: padrao, selecao: null }), true);
assert.strictEqual(Atalhos.estaNoPadrao({ legenda: null, selecao: null }), false);

console.log('Atalhos tests passed');
