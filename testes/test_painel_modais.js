'use strict';

const assert = require('assert');
const fs = require('fs');

const { lerHtml, acharTodos, canonicaDoFalso, impressaoDigital } = require('./arvore_do_html.js');
const { prepararAPagina } = require('./painel_de_mentira.js');

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

const doCorpo = pagina => acharTodos(pagina, no => no.tag === 'body')[0];

let modaisMontados = null;

function osModaisMontadosPeloEsqueleto() {
  if (modaisMontados) return structuredClone(modaisMontados);
  const { documento } = prepararAPagina();
  const ponte = documento.createElement('iframe');
  ponte.setAttribute('id', 'abridor-ponte');
  ponte.id = 'abridor-ponte';
  documento.body.append(ponte);
  require('../painel/esqueleto-modais.js');
  modaisMontados = ponte.parentNode.childNodes.filter(no => no.className === 'veio-scrim').map(canonicaDoFalso);
  return structuredClone(modaisMontados);
}

function aPaginaMontada() {
  const pagina = lerHtml(fs.readFileSync('painel/painel.html', 'utf8'));
  const corpo = doCorpo(pagina);
  const posicao = corpo.filhos.findIndex(filho => filho.atributos?.id === 'abridor-ponte');
  corpo.filhos.splice(posicao, 0, ...osModaisMontadosPeloEsqueleto());
  return pagina;
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
  const nomes = doCorpo(aPaginaMontada()).filhos.map(filho => filho.atributos.id || filho.tag);
  const doPrimeiroModalAPonte = nomes.slice(nomes.indexOf('modal-contexto'), nomes.indexOf('abridor-ponte') + 1);
  assert.deepStrictEqual(doPrimeiroModalAPonte, ['modal-contexto', 'modal-apagar', 'modal-minerar', 'modal-envio', 'modal-resumo', 'abridor-ponte']);
}

function oEsqueletoCarregaAntesDoShellENaoDepoisDosModulos() {
  const scripts = acharTodos(lerHtml(fs.readFileSync('painel/painel.html', 'utf8')), no => no.tag === 'script').map(no => no.atributos.src);
  assert.ok(scripts.indexOf('/veio/componentes.js') < scripts.indexOf('esqueleto-modais.js'));
  assert.ok(scripts.indexOf('esqueleto-modais.js') < scripts.indexOf('painel-shell.js'));
}

cadaModalTemASuaArvore();
aPaginaInteiraTemAMesmaArvore();
osModaisFicamEntreOCorpoEAPonteDoAbridor();
oEsqueletoCarregaAntesDoShellENaoDepoisDosModulos();
console.log('painel: a árvore dos modais e da página ok');
