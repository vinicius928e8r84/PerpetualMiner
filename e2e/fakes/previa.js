'use strict';

const { isDeepStrictEqual } = require('util');
const { criarNavegador } = require('./navegador');

const CAMINHO = '/anki/card-preview';

const semOGuid = corpo => (corpo && typeof corpo.guid === 'string' ? { ...corpo, guid: '<guid>' } : corpo);

function criarPrevia({ contexto, exemplos }) {
  const navegador = criarNavegador({ contexto, exemplos });
  let tiposDefinidos = null;
  const doContrato = status => exemplos().find(e => e.daExtensao && e.pedido.caminho === '/anki/note-types' && e.resposta.status === status);
  const tipos = () => (tiposDefinidos || doContrato(200).resposta.json.noteTypes).map(tipo => ({ name: tipo.name, fields: [...tipo.fields] }));

  function noTipoDaPessoa(corpo, naTelaDePerfis) {
    const { nome, mapa } = corpo.tipoProprio;
    if (naTelaDePerfis) return { status: 503, json: { error: 'anki_card_preview_unavailable', detail: 'collection_not_open' } };
    if (!mapa?.frase || !mapa?.resposta || mapa.frase === mapa.resposta) return { status: 400, json: { error: 'invalid_mapping' } };
    const tipo = tipos().find(t => t.name === nome);
    if (!tipo) return { status: 404, json: { error: 'note_type_missing' } };
    if (Object.values(mapa).some(campo => !tipo.fields.includes(campo))) return { status: 409, json: { error: 'invalid_mapping' } };
    const ok = exemplos().find(e => e.daExtensao && e.pedido.caminho === CAMINHO && e.pedido.corpo.tipoProprio && e.resposta.status === 200);
    return { status: 200, json: JSON.parse(JSON.stringify(ok.resposta.json)) };
  }

  function osTiposDaPessoa() {
    if (contexto().perfil === null) return { status: 503, json: JSON.parse(JSON.stringify(doContrato(503).resposta.json)) };
    return { status: 200, json: { noteTypes: tipos() } };
  }

  function responder(metodo, caminho, corpo) {
    if (metodo === 'POST' && caminho === '/anki/browse') return navegador.responder(metodo, caminho, corpo);
    if (metodo === 'POST' && caminho === '/anki/note-types') return osTiposDaPessoa();
    if (metodo !== 'POST' || caminho !== CAMINHO) return null;
    const naTelaDePerfis = contexto().perfil === null;
    if (corpo?.tipoProprio) return noTipoDaPessoa(corpo, naTelaDePerfis);
    const exemplo = exemplos().find(e => e.daExtensao && e.pedido.metodo === metodo && e.pedido.caminho === caminho
      && isDeepStrictEqual(semOGuid(e.pedido.corpo), semOGuid(corpo)) && (e.resposta.status === 503) === naTelaDePerfis);
    if (!exemplo) {
      throw new Error(`O contrato (complemento/contrato/exemplos-da-previa.json) não tem exemplo de POST ${CAMINHO} com o corpo ${JSON.stringify(corpo)}`
        + `${naTelaDePerfis ? ' com o Anki na tela de perfis' : ''}; escreva-o lá antes de o fake responder.`);
    }
    return { status: exemplo.resposta.status, json: JSON.parse(JSON.stringify(exemplo.resposta.json)) };
  }

  return {
    responder,
    abertos: navegador.abertos,
    tiposDeNota: { definir(lista) { tiposDefinidos = lista; }, lista: tipos },
  };
}

module.exports = { criarPrevia };
