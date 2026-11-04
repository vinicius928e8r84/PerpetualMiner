'use strict';

// A prévia do Cartão na Conexão de mentira (#164): `POST /anki/card-preview` responde pelos exemplos do contrato
// (`complemento/contrato/exemplos-da-previa.json`) o Cartão de exemplo do estilo. O Cartão não depende da coleção que o Anki tem aberta (o
// exemplo cita uma só porque o teste do complemento precisa de uma): o fake serve o exemplo do pedido, e com o Anki na tela de perfis
// (`abrirPerfil(null)`) o `503`. Uma falha de propósito é `fakes.anki.responder('POST', '/anki/card-preview', …)` ou `desligar()`.
// `test_fake_anki.js` e `contrato-da-conexao.spec.js` conferem as respostas contra os exemplos.

const { isDeepStrictEqual } = require('util');

const CAMINHO = '/anki/card-preview';

/** `contexto()` é o contexto de agora do fake (o perfil aberto); `exemplos` são os do contrato. */
function criarPrevia({ contexto, exemplos }) {
  function responder(metodo, caminho, corpo) {
    if (metodo !== 'POST' || caminho !== CAMINHO) return null;
    const naTelaDePerfis = contexto().perfil === null;
    const exemplo = exemplos().find(e => e.daExtensao && e.pedido.metodo === metodo && e.pedido.caminho === caminho
      && isDeepStrictEqual(e.pedido.corpo, corpo) && (e.resposta.status === 503) === naTelaDePerfis);
    if (!exemplo) {
      throw new Error(`O contrato (complemento/contrato/exemplos-da-previa.json) não tem exemplo de POST ${CAMINHO} com o corpo ${JSON.stringify(corpo)}`
        + `${naTelaDePerfis ? ' com o Anki na tela de perfis' : ''}; escreva-o lá antes de o fake responder.`);
    }
    return { status: exemplo.resposta.status, json: JSON.parse(JSON.stringify(exemplo.resposta.json)) };
  }

  return { responder };
}

module.exports = { criarPrevia };
