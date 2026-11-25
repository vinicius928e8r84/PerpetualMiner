'use strict';

const assert = require('assert');
const fs = require('fs');

const { lerHtml, acharTodos, canonicaDoFalso, impressaoDigital } = require('./arvore_do_html.js');
const { prepararAPagina } = require('./painel_de_mentira.js');

const IMPRESSAO_DA_PAGINA = 'aef21fc0f329462ae27f7caf702faab15db98dd970335f85b1e9aa6e7799150b';
const IMPRESSAO_DA_AREA_DO_ANKI = 'e3dce991cf5fb66076b4da6138b6de7de45f7abc689fe421f3d9bb9e777594ba';
const IMPRESSAO_DA_AREA_DE_CONFIGURACOES = 'f93fd4b4eb4f91e69366935979e95a97a28cc8ea38a11ce5181aca9610279153';
const IMPRESSAO_DOS_MODAIS = {
  'modal-contexto': 'bd673d6286754141c3f57dbedc93cf9711a28ec616c92bf613dea0a576201dc0',
  'modal-apagar': '5359af30deb5a2316833c57f5403e90954bda731260b19b5fde6dfe49c0d738f',
  'modal-minerar': '48e1cc307f3e3829e65c0737bc324f865e637bf3a62b645b7072b8a1dc41ce36',
  'modal-envio': '21cbcdee7c481f0a9ab507a2fd0e05340f79a754abcdb63c9307d332c7ae6fb4',
  'modal-resumo': 'de478897349513ca827ff238cb83b6caaeb56619e3a074bb0a2e679e0fd2d7b0',
};

const CSS_CORTADOS = /(?:painel-anki|painel-primeira-conexao|componentes-formulario)\.css$/;
const ehRecursoDeScriptOuCssCortado = no => no.tag === 'script' || (no.tag === 'link' && CSS_CORTADOS.test(no.atributos.href));
const semScripts = no => (typeof no === 'string' ? no : { ...no, filhos: no.filhos.filter(filho => !ehRecursoDeScriptOuCssCortado(filho)).map(semScripts) });
const ehModal = no => no.atributos?.class === 'veio-scrim' && /^modal-/.test(no.atributos.id);

const doCorpo = pagina => acharTodos(pagina, no => no.tag === 'body')[0];

let esqueletosMontados = null;

function osEsqueletosMontados() {
  if (esqueletosMontados) return structuredClone(esqueletosMontados);
  const { documento, conteudo } = prepararAPagina();
  const ponte = documento.createElement('iframe');
  ponte.setAttribute('id', 'abridor-ponte');
  ponte.id = 'abridor-ponte';
  documento.body.append(ponte);
  require('../painel/esqueleto-modais.js');
  require('../painel/esqueleto-anki.js');
  require('../painel/esqueleto-configuracoes.js');
  esqueletosMontados = {
    modais: ponte.parentNode.childNodes.filter(no => no.className === 'veio-scrim').map(canonicaDoFalso),
    areas: conteudo.childNodes.map(canonicaDoFalso),
  };
  return structuredClone(esqueletosMontados);
}

function aPaginaMontada() {
  const pagina = lerHtml(fs.readFileSync('painel/painel.html', 'utf8'));
  const corpo = doCorpo(pagina);
  const posicao = corpo.filhos.findIndex(filho => filho.atributos?.id === 'abridor-ponte');
  const { modais, areas } = osEsqueletosMontados();
  corpo.filhos.splice(posicao, 0, ...modais);
  doConteudo(pagina).filhos.push(...areas);
  return pagina;
}

function osModaisDa(pagina) {
  return Object.fromEntries(acharTodos(pagina, ehModal).map(modal => [modal.atributos.id, impressaoDigital(modal)]));
}

const doConteudo = pagina => acharTodos(pagina, no => no.tag === 'main' && no.atributos.class === 'shell-conteudo')[0];

const aAreaDoAnki = pagina => acharTodos(pagina, no => no.atributos?.['data-area'] === 'anki')[0];

const aAreaDeConfiguracoes = pagina => acharTodos(pagina, no => no.atributos?.['data-area'] === 'configuracoes')[0];

function aAreaDoAnkiTemASuaArvore() {
  assert.strictEqual(impressaoDigital(aAreaDoAnki(aPaginaMontada())), IMPRESSAO_DA_AREA_DO_ANKI);
}

function aAreaDeConfiguracoesTemASuaArvore() {
  assert.strictEqual(impressaoDigital(aAreaDeConfiguracoes(aPaginaMontada())), IMPRESSAO_DA_AREA_DE_CONFIGURACOES);
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
  assert.ok(scripts.indexOf('/veio/componentes.js') < scripts.indexOf('esqueleto-anki.js'));
  assert.ok(scripts.indexOf('esqueleto-anki.js') < scripts.indexOf('esqueleto-configuracoes.js'));
  assert.ok(scripts.indexOf('esqueleto-configuracoes.js') < scripts.indexOf('painel-shell.js'));
}

aAreaDoAnkiTemASuaArvore();
aAreaDeConfiguracoesTemASuaArvore();
cadaModalTemASuaArvore();
aPaginaInteiraTemAMesmaArvore();
osModaisFicamEntreOCorpoEAPonteDoAbridor();
oEsqueletoCarregaAntesDoShellENaoDepoisDosModulos();
console.log('painel: a árvore dos modais e da página ok');
