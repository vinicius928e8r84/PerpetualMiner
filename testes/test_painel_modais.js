'use strict';

const assert = require('assert');
const fs = require('fs');

const { lerHtml, acharTodos, impressaoDigital } = require('./arvore_do_html.js');

const IMPRESSAO_DA_PAGINA = 'aef21fc0f329462ae27f7caf702faab15db98dd970335f85b1e9aa6e7799150b';
const IMPRESSAO_DOS_MODAIS = {
  'modal-contexto': 'bd673d6286754141c3f57dbedc93cf9711a28ec616c92bf613dea0a576201dc0',
  'modal-apagar': '5359af30deb5a2316833c57f5403e90954bda731260b19b5fde6dfe49c0d738f',
  'modal-minerar': '48e1cc307f3e3829e65c0737bc324f865e637bf3a62b645b7072b8a1dc41ce36',
  'modal-envio': '21cbcdee7c481f0a9ab507a2fd0e05340f79a754abcdb63c9307d332c7ae6fb4',
  'modal-resumo': 'de478897349513ca827ff238cb83b6caaeb56619e3a074bb0a2e679e0fd2d7b0',
};

const semScripts = no => (typeof no === 'string' ? no : { ...no, filhos: no.filhos.filter(filho => filho.tag !== 'script').map(semScripts) });
const ehModal = no => no.atributos?.class === 'veio-scrim' && /^modal-/.test(no.atributos.id);

function aPaginaMontada() {
  return lerHtml(fs.readFileSync('painel/painel.html', 'utf8'));
}

function osModaisDa(pagina) {
  return Object.fromEntries(acharTodos(pagina, ehModal).map(modal => [modal.atributos.id, impressaoDigital(modal)]));
}

function cadaModalTemASuaArvore() {
  assert.deepStrictEqual(osModaisDa(aPaginaMontada()), IMPRESSAO_DOS_MODAIS);
}

function aPaginaInteiraTemAMesmaArvore() {
  assert.strictEqual(impressaoDigital(semScripts(aPaginaMontada())), IMPRESSAO_DA_PAGINA);
}

function osModaisFicamEntreOCorpoEAPonteDoAbridor() {
  const corpo = acharTodos(aPaginaMontada(), no => no.tag === 'body')[0];
  const nomes = corpo.filhos.map(filho => filho.atributos.id || filho.tag);
  const doPrimeiroModalAPonte = nomes.slice(nomes.indexOf('modal-contexto'), nomes.indexOf('abridor-ponte') + 1);
  assert.deepStrictEqual(doPrimeiroModalAPonte, ['modal-contexto', 'modal-apagar', 'modal-minerar', 'modal-envio', 'modal-resumo', 'abridor-ponte']);
}

cadaModalTemASuaArvore();
aPaginaInteiraTemAMesmaArvore();
osModaisFicamEntreOCorpoEAPonteDoAbridor();
console.log('painel: a árvore dos modais e da página ok');
