'use strict';

const { isDeepStrictEqual } = require('util');
const { criarNavegador } = require('./navegador');

const CAMINHO = '/anki/card-preview';

const semOGuid = corpo => (typeof corpo?.guid === 'string' ? { ...corpo, guid: '<guid>' } : corpo);

const copia = json => JSON.parse(JSON.stringify(json));

const NA_TELA_DE_PERFIS = { status: 503, json: { error: 'anki_card_preview_unavailable', detail: 'collection_not_open' } };

const mapaIncompleto = mapa => !mapa?.frase || !mapa?.resposta;
const mapaInvalido = mapa => mapaIncompleto(mapa) || mapa.frase === mapa.resposta;
const camposQueFaltam = (mapa, tipo) => Object.values(mapa).some(campo => !tipo.fields.includes(campo));

const daExtensaoEm = caminho => exemplo => exemplo.daExtensao && exemplo.pedido.caminho === caminho;

function exemploDaPrevia(exemplo, { metodo, corpo, naTelaDePerfis }) {
  if (!daExtensaoEm(CAMINHO)(exemplo) || exemplo.pedido.metodo !== metodo) return false;
  return isDeepStrictEqual(semOGuid(exemplo.pedido.corpo), semOGuid(corpo)) && (exemplo.resposta.status === 503) === naTelaDePerfis;
}

function semExemploDaPrevia(corpo, naTelaDePerfis) {
  return `O contrato (complemento/contrato/exemplos-da-previa.json) não tem exemplo de POST ${CAMINHO} com o corpo ${JSON.stringify(corpo)}`
    + `${naTelaDePerfis ? ' com o Anki na tela de perfis' : ''}; escreva-o lá antes de o fake responder.`;
}

function criarPrevia({ contexto, exemplos }) {
  const navegador = criarNavegador({ contexto, exemplos });
  let tiposDefinidos = null;
  const doContrato = status => exemplos().find(e => daExtensaoEm('/anki/note-types')(e) && e.resposta.status === status);
  const tipos = () => (tiposDefinidos || doContrato(200).resposta.json.noteTypes).map(tipo => ({ name: tipo.name, fields: [...tipo.fields] }));
  const previaDoTipoProprio = () => exemplos().find(e => daExtensaoEm(CAMINHO)(e) && e.pedido.corpo.tipoProprio && e.resposta.status === 200);

  function recusaDoTipoDaPessoa({ nome, mapa }) {
    if (mapaInvalido(mapa)) return { status: 400, json: { error: 'invalid_mapping' } };
    const tipo = tipos().find(t => t.name === nome);
    if (!tipo) return { status: 404, json: { error: 'note_type_missing' } };
    return camposQueFaltam(mapa, tipo) ? { status: 409, json: { error: 'invalid_mapping' } } : null;
  }

  function noTipoDaPessoa(corpo, naTelaDePerfis) {
    if (naTelaDePerfis) return NA_TELA_DE_PERFIS;
    const recusa = recusaDoTipoDaPessoa(corpo.tipoProprio);
    if (recusa) return recusa;
    return { status: 200, json: copia(previaDoTipoProprio().resposta.json) };
  }

  function osTiposDaPessoa() {
    if (contexto().perfil === null) return { status: 503, json: copia(doContrato(503).resposta.json) };
    return { status: 200, json: { noteTypes: tipos() } };
  }

  function aPrevia(metodo, _caminho, corpo) {
    const naTelaDePerfis = contexto().perfil === null;
    if (corpo?.tipoProprio) return noTipoDaPessoa(corpo, naTelaDePerfis);
    const exemplo = exemplos().find(e => exemploDaPrevia(e, { metodo, corpo, naTelaDePerfis }));
    if (!exemplo) throw new Error(semExemploDaPrevia(corpo, naTelaDePerfis));
    return { status: exemplo.resposta.status, json: copia(exemplo.resposta.json) };
  }

  const ROTAS = new Map([
    ['/anki/browse', navegador.responder],
    ['/anki/note-types', osTiposDaPessoa],
    [CAMINHO, aPrevia],
  ]);

  function responder(metodo, caminho, corpo) {
    const rota = metodo === 'POST' ? ROTAS.get(caminho) : undefined;
    return rota ? rota(metodo, caminho, corpo) : null;
  }

  return {
    responder,
    abertos: navegador.abertos,
    tiposDeNota: { definir(lista) { tiposDefinidos = lista; }, lista: tipos },
  };
}

module.exports = { criarPrevia };
