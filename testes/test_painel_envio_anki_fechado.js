'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const DESFECHO = {
  RESPONDEU: 'respondeu', FECHOU: 'fechou', NAO_ABRIU: 'nao_abriu', SEM_RESPOSTA: 'sem_resposta', SEM_PERMISSAO: 'sem_permissao', ABERTO: 'aberto',
};

function carregar() {
  const raiz = {};
  const contexto = vm.createContext({
    globalThis: { PerpetualMiner: raiz },
    document: {},
  });
  Object.assign(raiz, {
    textoDaVoz: () => '', Veio: {}, ConexaoAnki: {}, Abridor: {},
    AbrirOAnki: { DESFECHO, causaDoAbridor: ({ resultado }) => `abridor · ${resultado}` },
  });
  contexto.globalThis.PerpetualMiner = raiz;
  const arquivo = path.join(__dirname, '..', 'painel', 'painel-envio-anki-fechado.js');
  vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);
  return raiz.EnvioComOAnkiFechado;
}

const { faixaDoDesfecho: faixa } = carregar();
const faixaDoDesfecho = resultado => JSON.parse(JSON.stringify(faixa(resultado)));

test('sem permissão a faixa traz o botão e continua esperando o Anki', () => {
  assert.deepStrictEqual(faixaDoDesfecho({ desfecho: DESFECHO.SEM_PERMISSAO }), { opcoes: { botao: true }, espera: true });
});

test('o Anki que não abriu mostra a causa do abridor e continua esperando', () => {
  assert.deepStrictEqual(faixaDoDesfecho({ desfecho: DESFECHO.NAO_ABRIU, resultado: 'x' }), { opcoes: { causa: 'abridor · x' }, espera: true });
});

test('sem resposta no prazo e Anki fechado na espera encerram o pedido com a causa', () => {
  assert.deepStrictEqual(faixaDoDesfecho({ desfecho: DESFECHO.SEM_RESPOSTA }), { opcoes: { causa: 'abridor · sem resposta da Conexão no prazo' }, espera: false });
  assert.deepStrictEqual(faixaDoDesfecho({ desfecho: DESFECHO.FECHOU }), { opcoes: { causa: 'abridor · a pessoa fechou o Anki durante a espera' }, espera: false });
});

test('um desfecho sem faixa (respondeu, aberto) não ganha faixa', () => {
  assert.strictEqual(faixaDoDesfecho({ desfecho: DESFECHO.RESPONDEU }), null);
  assert.strictEqual(faixaDoDesfecho({ desfecho: DESFECHO.ABERTO }), null);
});
