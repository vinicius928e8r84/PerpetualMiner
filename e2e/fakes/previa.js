'use strict';

// A prévia do Cartão na Conexão de mentira (#164) e os tipos de nota da pessoa (#165, `POST /anki/note-types`): `POST /anki/card-preview` responde pelos exemplos do contrato
// (`complemento/contrato/exemplos-da-previa*.json`) o Cartão de exemplo do estilo. O Cartão não depende da coleção que o Anki tem aberta (o
// exemplo cita uma só porque o teste do complemento precisa de uma): o fake serve o exemplo do pedido, e com o Anki na tela de perfis
// (`abrirPerfil(null)`) o `503`. Uma falha de propósito é `fakes.anki.responder('POST', '/anki/card-preview', …)` ou `desligar()`.
// `test_fake_anki.js` e `contrato-da-conexao.spec.js` conferem as respostas contra os exemplos.

const { isDeepStrictEqual } = require('util');

const CAMINHO = '/anki/card-preview';

/** `contexto()` é o contexto de agora do fake (o perfil aberto); `exemplos` são os do contrato. */
function criarPrevia({ contexto, exemplos }) {
  let tiposDefinidos = null;  // os tipos de nota da pessoa que o teste definiu (#165); sem eles, os do contrato
  const doContrato = status => exemplos().find(e => e.daExtensao && e.pedido.caminho === '/anki/note-types' && e.resposta.status === status);
  const tipos = () => (tiposDefinidos || doContrato(200).resposta.json.noteTypes).map(tipo => ({ name: tipo.name, fields: [...tipo.fields] }));

  /**
   * A prévia no tipo de nota que a pessoa já tem (#165): o fake confere o mapeamento como a Conexão o confere (a Frase e a resposta em campos diferentes, `400
   * invalid_mapping`) e, se serve, responde o Cartão do exemplo do contrato com `tipoProprio`: o desenho é do Anki e o fake não desenha, então ele não depende de qual
   * campo foi para onde. O tipo da pessoa vem de `tipos()` (`fakes.anki.previa.tiposDeNota`), e um que não está lá é `404 note_type_missing`.
   */
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

  /** `POST /anki/note-types` (#165): os tipos de nota da pessoa; com o Anki na tela de perfis (`abrirPerfil(null)`), o `503`. */
  function osTiposDaPessoa() {
    if (contexto().perfil === null) return { status: 503, json: JSON.parse(JSON.stringify(doContrato(503).resposta.json)) };
    return { status: 200, json: { noteTypes: tipos() } };
  }

  function responder(metodo, caminho, corpo) {
    if (metodo === 'POST' && caminho === '/anki/note-types') return osTiposDaPessoa();
    if (metodo !== 'POST' || caminho !== CAMINHO) return null;
    const naTelaDePerfis = contexto().perfil === null;
    if (corpo?.tipoProprio) return noTipoDaPessoa(corpo, naTelaDePerfis);
    const exemplo = exemplos().find(e => e.daExtensao && e.pedido.metodo === metodo && e.pedido.caminho === caminho
      && isDeepStrictEqual(e.pedido.corpo, corpo) && (e.resposta.status === 503) === naTelaDePerfis);
    if (!exemplo) {
      throw new Error(`O contrato (complemento/contrato/exemplos-da-previa.json) não tem exemplo de POST ${CAMINHO} com o corpo ${JSON.stringify(corpo)}`
        + `${naTelaDePerfis ? ' com o Anki na tela de perfis' : ''}; escreva-o lá antes de o fake responder.`);
    }
    return { status: exemplo.resposta.status, json: JSON.parse(JSON.stringify(exemplo.resposta.json)) };
  }

  return {
    responder,
    /** Os tipos de nota que o Anki da pessoa tem (`[{ name, fields }]`): `definir(tipos)` para o teste, `lista()` para ver. */
    tiposDeNota: { definir(lista) { tiposDefinidos = lista; }, lista: tipos },
  };
}

module.exports = { criarPrevia };
