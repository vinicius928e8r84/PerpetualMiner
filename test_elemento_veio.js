'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class No {
  constructor(tag) {
    this.tag = tag;
    this.filhos = [];
  }

  append(...filhos) {
    this.filhos.push(...filhos);
  }

  set textContent(texto) {
    this.filhos = [String(texto)];
    this.texto = String(texto);
  }
}

const contexto = vm.createContext({ document: { createElement: tag => new No(tag) } });
contexto.globalThis = contexto;
vm.runInContext(fs.readFileSync('veio/componentes.js', 'utf8'), contexto);
const { elemento, criar, botao } = contexto.PerpetualMiner.Veio;

const filho = new No('i');
const caixa = elemento('div', 'a b', 'texto', filho);
assert.strictEqual(caixa.tag, 'div');
assert.strictEqual(caixa.className, 'a b');
assert.deepStrictEqual(caixa.filhos, ['texto', filho]);

for (const semClasse of [undefined, null, '']) {
  const no = elemento('span', semClasse);
  assert.strictEqual('className' in no, false);
  assert.deepStrictEqual(no.filhos, []);
}

const paragrafo = criar('p', 'c', 'oi');
assert.strictEqual(paragrafo.className, 'c');
assert.strictEqual(paragrafo.texto, 'oi');
assert.strictEqual(criar('p', 'c', 0).texto, '0');
assert.strictEqual('texto' in criar('p', 'c'), false);
assert.strictEqual('texto' in criar('p', 'c', null), false);
assert.strictEqual('className' in criar('p', ''), false);

const clique = botao('veio-botao--primario', 'Ir', filho);
assert.strictEqual(clique.tag, 'button');
assert.strictEqual(clique.className, 'veio-botao veio-botao--primario');
assert.strictEqual(clique.type, 'button');
assert.deepStrictEqual(clique.filhos, ['Ir', filho]);

const COM_FILTRO_PROPRIO = ['painel-conta.js'];
const copias = [];
for (const arquivo of fs.readdirSync('.').filter(nome => /^(popup|painel|bookreader|overlay)[\w-]*\.js$/.test(nome) && !COM_FILTRO_PROPRIO.includes(nome))) {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  if (/^\s*function (elemento|criar)\(tag, classe/m.test(fonte)) copias.push(`${arquivo}: elemento/criar`);
  if (/^\s*function botao\(variante, \.\.\.filhos\)/m.test(fonte)) copias.push(`${arquivo}: botao`);
}
assert.deepStrictEqual(copias, [], `Veio.elemento, Veio.criar e Veio.botao são um só; sobrou cópia em:\n${copias.join('\n')}`);

console.log('elemento/criar/botao da Veio tests passed');
