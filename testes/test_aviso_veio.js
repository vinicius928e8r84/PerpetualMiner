'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class No {
  constructor(tag) {
    this.tag = tag;
    this.filhos = [];
    this.atributos = {};
    this.ouvintes = {};
    this.removido = false;
  }

  append(...filhos) {
    this.filhos.push(...filhos);
  }

  setAttribute(nome, valor) {
    this.atributos[nome] = String(valor);
  }

  addEventListener(tipo, funcao) {
    this.ouvintes[tipo] = funcao;
  }

  remove() {
    this.removido = true;
  }

  set textContent(texto) {
    this.filhos = [String(texto)];
  }
}

const documento = {
  createElement: tag => new No(tag),
  createElementNS: (_espaco, tag) => new No(tag),
};
const contexto = vm.createContext({ document: documento });
contexto.globalThis = contexto;
vm.runInContext(fs.readFileSync('veio/componentes.js', 'utf8'), contexto);
const { montarAviso } = contexto.PerpetualMiner.Veio;

const descendentes = no => [no, ...no.filhos.filter(filho => filho instanceof No).flatMap(descendentes)];
const da = (no, classe) => descendentes(no).find(filho => filho.className === classe);
const todosDa = (no, tag) => descendentes(no).filter(filho => filho.tag === tag);
const textoDe = no => no.filhos.map(filho => (filho instanceof No ? textoDe(filho) : filho)).join('');
const erroDe = abrir => {
  try {
    abrir();
  } catch (erro) {
    return erro.message;
  }
  return null;
};

{
  const aviso = montarAviso({ texto: 'Falhou', rotuloDeFechar: 'Ocultar' });
  assert.strictEqual(aviso.tag, 'div');
  assert.strictEqual(aviso.className, 'veio-aviso');
  assert.strictEqual(aviso.atributos.role, 'alert');
  assert.strictEqual(aviso.filhos.length, 2);
  const paragrafo = da(aviso, 'veio-aviso__texto');
  assert.strictEqual(paragrafo.tag, 'p');
  assert.deepStrictEqual(paragrafo.filhos, ['Falhou']);
  const acoes = da(aviso, 'veio-aviso__acoes');
  assert.deepStrictEqual(acoes.filhos.map(filho => filho.className), ['veio-botao-icone']);
  const fechar = acoes.filhos[0];
  assert.strictEqual(fechar.type, 'button');
  assert.strictEqual(fechar.atributos['aria-label'], 'Ocultar');
  assert.strictEqual(todosDa(fechar, 'svg').length, 1);
  assert.strictEqual(da(aviso, 'veio-aviso__detalhes'), undefined);
}

{
  const aviso = montarAviso({ texto: 'Só informa', tom: 'info', fechavel: false });
  assert.strictEqual(aviso.className, 'veio-aviso veio-aviso--info');
  assert.strictEqual(aviso.atributos.role, 'status');
  assert.deepStrictEqual(da(aviso, 'veio-aviso__acoes').filhos, []);
}

{
  let fechou = 0;
  const aviso = montarAviso({ texto: 'x', rotuloDeFechar: 'Ocultar', aoFechar: () => fechou++ });
  da(aviso, 'veio-botao-icone').ouvintes.click();
  assert.strictEqual(aviso.removido, true);
  assert.strictEqual(fechou, 1);
}

{
  const aviso = montarAviso({ texto: 'x', rotuloDeFechar: 'Ocultar' });
  da(aviso, 'veio-botao-icone').ouvintes.click();
  assert.strictEqual(aviso.removido, true);
}

{
  const usou = () => {};
  const aviso = montarAviso({ texto: 'x', fechavel: false, acao: { rotulo: 'Tentar de novo', aoUsar: usou } });
  const [botao] = da(aviso, 'veio-aviso__acoes').filhos;
  assert.strictEqual(botao.className, 'veio-botao veio-botao--contorno');
  assert.strictEqual(botao.type, 'button');
  assert.deepStrictEqual(botao.filhos, ['Tentar de novo']);
  assert.strictEqual(botao.ouvintes.click, usou);
}

{
  const aviso = montarAviso({ texto: 'Corpo', abertura: 'Atenção.', icone: 'perigo', fechavel: false });
  const paragrafo = da(aviso, 'veio-aviso__texto');
  assert.strictEqual(paragrafo.filhos.length, 4);
  assert.strictEqual(paragrafo.filhos[0].tag, 'svg');
  assert.strictEqual(paragrafo.filhos[1].tag, 'strong');
  assert.deepStrictEqual(paragrafo.filhos[1].filhos, ['Atenção.']);
  assert.deepStrictEqual(paragrafo.filhos.slice(2), [' ', 'Corpo']);
  assert.strictEqual(textoDe(paragrafo), 'Atenção. Corpo');
}

{
  const aviso = montarAviso({ texto: 'x', fechavel: false, detalhes: 'causa técnica' });
  const detalhes = da(aviso, 'veio-aviso__detalhes');
  assert.strictEqual(detalhes.tag, 'details');
  assert.strictEqual(aviso.filhos[aviso.filhos.length - 1], detalhes);
  assert.strictEqual(textoDe(todosDa(detalhes, 'summary')[0]), 'Detalhes');
  assert.strictEqual(textoDe(todosDa(detalhes, 'pre')[0]), 'causa técnica');
}

{
  const outro = { createElement: tag => Object.assign(new No(tag), { dono: 'outro' }), createElementNS: documento.createElementNS };
  const aviso = montarAviso({ texto: 'x', fechavel: false, documento: outro });
  assert.strictEqual(aviso.dono, 'outro');
  assert.strictEqual(da(aviso, 'veio-aviso__texto').dono, 'outro');
}

assert.strictEqual(erroDe(() => montarAviso({ texto: 'x' })), 'O aviso precisa do rótulo de fechar, vindo do catálogo da Voz');
assert.strictEqual(erroDe(() => montarAviso({ texto: 'x', fechavel: true, rotuloDeFechar: '' })), 'O aviso precisa do rótulo de fechar, vindo do catálogo da Voz');
assert.strictEqual(erroDe(() => montarAviso({ texto: 'x', fechavel: false })), null);
assert.strictEqual(erroDe(() => montarAviso({ texto: 'x', fechavel: false, tom: 'sucesso' })), 'Tom de aviso fora da Base Veio: sucesso');
assert.strictEqual(erroDe(() => montarAviso({ texto: 'x', tom: 'sucesso' })), 'O aviso precisa do rótulo de fechar, vindo do catálogo da Voz');

console.log('ok');
