'use strict';

// O script do modelo de Cartão da frente Criação (#168), `complemento/modelo_da_criacao.js`, rodando como roda dentro do Anki: numa página de mentira com o
// que o modelo põe na frente e no verso (os campos escondidos, o lugar do texto e o “✓ usou a palavra”). Confere o que a pessoa vê, sem IA.
// Roda sem navegador: `node complemento/test_modelo_da_criacao.js`.

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const SCRIPT = fs.readFileSync('complemento/modelo_da_criacao.js', 'utf8');

function elemento(textoInicial = '') {
  const ouvintes = {};
  return {
    textContent: textoInicial, value: '', hidden: false, ouvintes,
    addEventListener(tipo, funcao) { (ouvintes[tipo] = ouvintes[tipo] || []).push(funcao); },
    disparar(tipo) { (ouvintes[tipo] || []).forEach(funcao => funcao()); },
  };
}

/** Uma página de Cartão: `elementos` por id, o que a página guarda de uma tela para a outra (`guardado`, compartilhável) e o `pycmd` (ou nenhum, como no AnkiDroid). */
function pagina({ elementos, guardado = new Map(), comPycmd = true, semStorage = false }) {
  const mensagens = [];
  const janela = {};
  if (!semStorage) janela.sessionStorage = { getItem: chave => (guardado.has(chave) ? guardado.get(chave) : null), setItem: (chave, valor) => guardado.set(chave, String(valor)), removeItem: chave => guardado.delete(chave) };
  else janela.PerpetualMinerPersistence = Object.fromEntries(guardado);
  const contexto = vm.createContext({ window: janela, document: { getElementById: id => elementos[id] || null }, setTimeout: funcao => funcao(), clearTimeout() {} });
  if (comPycmd) contexto.pycmd = mensagem => mensagens.push(mensagem);
  vm.runInContext(SCRIPT, contexto);
  return { mensagens, guardado, janela };
}

function versoDeUmCartao({ palavra, raiz = '', gravada = '', ...resto }) {
  const elementos = {
    'perpetualminer-escreveu': elemento(), 'perpetualminer-texto': elemento(), 'perpetualminer-usou': elemento(),
    'perpetualminer-palavra': elemento(palavra), 'perpetualminer-raiz': elemento(raiz), 'perpetualminer-gravada': elemento(gravada),
  };
  elementos['perpetualminer-escreveu'].hidden = elementos['perpetualminer-usou'].hidden = true;
  pagina({ elementos, ...resto });
  return {
    voceEscreveu: elementos['perpetualminer-escreveu'].hidden ? null : elementos['perpetualminer-texto'].textContent,
    usouAPalavra: !elementos['perpetualminer-usou'].hidden,
  };
}

/** A pessoa escreve `frase` na frente e vê o verso: devolve o verso. */
function escreverEVer(frase, cartao, { comPycmd = true } = {}) {
  const guardado = new Map();
  const campo = elemento();
  const frente = pagina({ elementos: { 'perpetualminer-escrita': campo }, guardado, comPycmd });
  campo.value = frase;
  campo.disparar('input');
  return { frente, verso: versoDeUmCartao({ ...cartao, guardado }) };
}

const INGLES = { palavra: 'give up' };
const usou = (frase, cartao) => escreverEVer(frase, cartao).verso.usouAPalavra;

// -- ✓ usou a palavra, no inglês: a Palavra ou o radical dela --
assert.strictEqual(usou('I want to give up sugar.', INGLES), true, 'a Palavra como está');
assert.strictEqual(usou('She gives up easily.', INGLES), true, 'a Palavra flexionada (give → gives)');
assert.strictEqual(usou('GIVE UP now!', INGLES), true, 'maiúsculas e pontuação não contam');
assert.strictEqual(usou('She is giving up on it.', INGLES), true, 'pelo radical (giving)');
assert.strictEqual(usou('I like sugar.', INGLES), false, 'a frase sem a Palavra');
assert.strictEqual(usou('Never give in.', INGLES), false, 'só uma das palavras da Palavra');
assert.strictEqual(usou('She runs every morning.', { palavra: 'running' }), true, 'a consoante dobrada não atrapalha o radical');
assert.strictEqual(usou('The studies were long.', { palavra: 'studied' }), true, 'studied → studies');

// -- ✓ usou a palavra, no russo: o radical vem dos campos da morfologia (Raiz) --
const RUSSO = { palavra: 'приходила', raiz: 'ход' };
assert.strictEqual(usou('Он всегда приходит рано.', RUSSO), true, 'outra forma da mesma raiz');
assert.strictEqual(usou('Она ушла вчера.', RUSSO), false, 'sem a raiz');
assert.strictEqual(usou('Она приходила вчера.', { palavra: 'приходила' }), true, 'sem Raiz (o Iniciante), a Palavra igual');
assert.strictEqual(usou('Она пришла вчера.', { palavra: 'приходила' }), false, 'sem Raiz, outra forma não conta');
assert.strictEqual(usou('Приходи́ла вчера.', { palavra: 'приходила' }), true, 'o sinal de tônica não atrapalha');
assert.strictEqual(usou('Ёлка стоит.', { palavra: 'елка' }), true, 'ё vale e');

// -- o verso --
{
  const { verso } = escreverEVer('I will never give up.', INGLES);
  assert.deepStrictEqual(verso, { voceEscreveu: 'I will never give up.', usouAPalavra: true }, 'o verso mostra o que foi escrito, com o ✓');
}
{
  const { verso } = escreverEVer('I like sugar.', INGLES);
  assert.deepStrictEqual(verso, { voceEscreveu: 'I like sugar.', usouAPalavra: false }, 'sem a Palavra, o texto aparece e o ✓ não');
}
{
  const { verso } = escreverEVer('<b>give up</b>', INGLES);
  assert.strictEqual(verso.voceEscreveu, '<b>give up</b>', 'o que a pessoa escreveu aparece como texto, não como HTML');
}
assert.deepStrictEqual(escreverEVer('   ', INGLES).verso, { voceEscreveu: null, usouAPalavra: false }, 'sem escrever nada, o verso não mostra “Você escreveu”');
assert.deepStrictEqual(
  versoDeUmCartao({ ...INGLES, gravada: 'I give up.' }), { voceEscreveu: 'I give up.', usouAPalavra: true },
  'sem o que a página guardou, vale a frase que a Conexão gravou no campo');
assert.deepStrictEqual(escreverEVer('I give up.', INGLES, { comPycmd: false }).verso, { voceEscreveu: 'I give up.', usouAPalavra: true }, 'sem pycmd (AnkiDroid), o ✓ funciona');

// -- a frente --
{
  const { frente } = escreverEVer('I give up.', INGLES);
  assert.deepStrictEqual(frente.mensagens, ['perpetualminer:criacao:I give up.'], 'a frase vai à Conexão com a mensagem da Criação, uma vez');
}
{
  const { frente } = escreverEVer('I give up.', INGLES, { comPycmd: false });
  assert.deepStrictEqual(frente.mensagens, [], 'sem pycmd nada é enviado e nada quebra');
}
{
  const guardado = new Map([['perpetualminer_escrita', 'frase do cartão anterior']]);
  pagina({ elementos: { 'perpetualminer-escrita': elemento() }, guardado });
  assert.strictEqual(guardado.get('perpetualminer_escrita'), '', 'uma frente nova começa sem a frase do Cartão anterior');
}
{
  const guardado = new Map(), campo = elemento();
  const semStorage = pagina({ elementos: { 'perpetualminer-escrita': campo }, guardado, semStorage: true });
  campo.value = 'sem storage';
  campo.disparar('input');
  assert.strictEqual(semStorage.janela.PerpetualMinerPersistence.perpetualminer_escrita, 'sem storage', 'sem sessionStorage, a página guarda no objeto da janela');
}

console.log('modelo da Criação tests passed');
