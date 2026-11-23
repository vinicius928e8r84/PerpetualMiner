'use strict';

const { DocumentoFalso, GLOBAIS_DO_DOM } = require('./dom-falso.js');

function prepararAPagina({ ids = [] } = {}) {
  const documento = new DocumentoFalso();
  Object.assign(globalThis, GLOBAIS_DO_DOM, { document: documento, addEventListener() {} });
  globalThis.PerpetualMiner = {};
  globalThis.chrome = { storage: { local: { get: async padrao => padrao, set: async () => {}, onChanged: { addListener() {} } } } };
  require('../lib/voz/catalogo.js');
  require('../lib/voz/catalogo-nivel.js');
  require('../lib/voz/texto.js');
  require('../veio/componentes.js');
  const conteudo = documento.createElement('main');
  conteudo.className = 'shell-conteudo';
  documento.body.append(conteudo);
  for (const id of ids) {
    const no = documento.createElement('div');
    no.id = id;
    documento.body.append(no);
  }
  return { documento, conteudo, raiz: globalThis.PerpetualMiner };
}

const MARCAS = ['id', 'className', 'type', 'value', 'hidden'];

function retrato(no) {
  if (no.nodeType === 3) return no.data;
  const atributos = Object.fromEntries([...no.atributos.entries()].sort());
  const marcas = Object.fromEntries(MARCAS.filter(marca => no[marca] !== undefined && no[marca] !== '' && no[marca] !== false).map(marca => [marca, no[marca]]));
  return { tag: no.localName, ...marcas, ...(Object.keys(atributos).length ? { atributos } : {}), filhos: no.childNodes.map(retrato) };
}

const retratoDoQueHaEm = no => (no ? retrato(no) : null);

function resumo(no) {
  if (!no) return null;
  return {
    id: no.id, classe: no.className, papel: no.getAttribute('role'), texto: no.textContent,
    botoes: no.querySelectorAll('button').map(botao => botao.textContent || botao.getAttribute('aria-label')),
  };
}

const esperar = () => new Promise(resolver => setImmediate(resolver));

module.exports = { prepararAPagina, resumo, retrato, retratoDoQueHaEm, esperar };
