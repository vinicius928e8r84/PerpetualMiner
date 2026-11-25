'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contexto = { console };
contexto.globalThis = contexto;
vm.createContext(contexto);
const arquivo = 'lib/mineracao-automatica-na-pagina.js';
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8'), contexto, { filename: arquivo });
const { criarEsperaDaLegenda, SILENCIO_DA_LEGENDA_MS } = contexto.PerpetualMiner.MineracaoAutomaticaNaPagina;

function umTextoNovoSoParaDepoisDoSilencio() {
  const espera = criarEsperaDaLegenda();
  assert.strictEqual(espera.parou('Hello there.', 1000), false, 'a primeira vez que o texto aparece só começa a espera');
  assert.strictEqual(espera.parou('Hello there.', 1000 + SILENCIO_DA_LEGENDA_MS - 1), false);
  assert.strictEqual(espera.parou('Hello there.', 1000 + SILENCIO_DA_LEGENDA_MS), true, 'a legenda parada por 650 ms está pronta');
}

function umTextoJaMandadoNaoVoltaAParar() {
  const espera = criarEsperaDaLegenda();
  espera.parou('Hello there.', 0);
  assert.strictEqual(espera.parou('Hello there.', 700), true);
  assert.strictEqual(espera.parou('Hello there.', 5000), false);
}

function umTextoQueMudaRecomecaAEspera() {
  const espera = criarEsperaDaLegenda();
  espera.parou('First.', 0);
  assert.strictEqual(espera.parou('Second.', 600), false);
  assert.strictEqual(espera.parou('Second.', 600 + SILENCIO_DA_LEGENDA_MS - 1), false);
  assert.strictEqual(espera.parou('Second.', 600 + SILENCIO_DA_LEGENDA_MS), true);
}

function umTextoVazioNaoMudaNada() {
  const espera = criarEsperaDaLegenda();
  espera.parou('Gone.', 0);
  assert.strictEqual(espera.parou('', 400), false);
  assert.strictEqual(espera.parou('Gone.', 1000), true, 'o texto que volta igual continua parado desde a primeira vez');
}

function umTextoMandadoPodeSerMandadoDepoisDeOutro() {
  const espera = criarEsperaDaLegenda();
  espera.parou('One.', 0);
  espera.parou('One.', 700);
  espera.parou('Two.', 800);
  assert.strictEqual(espera.parou('Two.', 1500), true);
  espera.parou('One.', 1600);
  assert.strictEqual(espera.parou('One.', 2300), true);
}

function osMilissegundosDoSilencioSaoDaPorta() {
  const espera = criarEsperaDaLegenda(100);
  espera.parou('Quick.', 0);
  assert.strictEqual(espera.parou('Quick.', 99), false);
  assert.strictEqual(espera.parou('Quick.', 100), true);
}

umTextoNovoSoParaDepoisDoSilencio();
umTextoJaMandadoNaoVoltaAParar();
umTextoQueMudaRecomecaAEspera();
umTextoVazioNaoMudaNada();
umTextoMandadoPodeSerMandadoDepoisDeOutro();
osMilissegundosDoSilencioSaoDaPorta();
console.log('espera da legenda: tudo certo');
