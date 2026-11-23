'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DocumentoFalso } = require('./dom-falso');
const { doElementoFalso, retrato } = require('./retrato_da_arvore');

const RAIZ = path.join(__dirname, '..');
const ler = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');

function montarAPagina() {
  const documento = new DocumentoFalso();
  const montadas = [];
  const conteudo = { prepend: area => montadas.push(area) };
  const buscas = [];
  documento.querySelector = seletor => (buscas.push(seletor), conteudo);
  const contexto = vm.createContext({ document: documento });
  contexto.globalThis = contexto;
  vm.runInContext(ler('veio/componentes.js'), contexto);
  vm.runInContext(ler('painel/esqueleto-frases.js'), contexto);
  return { montadas, buscas };
}

const { montadas, buscas } = montarAPagina();
assert.deepStrictEqual(buscas, ['.shell-conteudo'], 'o esqueleto entra no conteúdo do shell');
assert.strictEqual(montadas.length, 1, 'o esqueleto monta uma área só');
assert.strictEqual(retrato(doElementoFalso(montadas[0])), ler('testes/retratos/esqueleto_das_frases.txt'),
  'a árvore da Área Frases mudou: tags, ids, classes, aria-*, data-voz e hidden têm de ficar como estavam');

const pagina = ler('painel/painel.html');
assert(!/<section[^>]*data-area="frases"/.test(pagina), 'a marcação da Área Frases saiu da página');
const scripts = [...pagina.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const posicao = arquivo => scripts.indexOf(arquivo);
assert(posicao('/veio/componentes.js') >= 0 && posicao('/veio/componentes.js') < posicao('esqueleto-frases.js'),
  'o esqueleto usa o construtor de elementos do Veio, que carrega antes dele');
assert(posicao('esqueleto-frases.js') < posicao('painel-shell.js'), 'o esqueleto monta a área antes dos outros scripts do painel');
assert(scripts.slice(0, posicao('esqueleto-frases.js')).every(s => s.startsWith('/')), 'só scripts de fora do painel carregam antes do esqueleto');

console.log('ok: a Área Frases tem a mesma árvore, montada pelo esqueleto');
