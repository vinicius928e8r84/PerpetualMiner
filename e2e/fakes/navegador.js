'use strict';

const CAMINHO = '/anki/browse';

function criarNavegador({ contexto, exemplos }) {
  const abertos = [];

  function responder(metodo, caminho, corpo) {
    if (metodo !== 'POST' || caminho !== CAMINHO) return null;
    const naTelaDePerfis = contexto().perfil === null;
    const exemplo = exemplos().find(e => e.daExtensao && e.pedido.metodo === metodo && e.pedido.caminho === caminho
      && typeof corpo?.guid === 'string' && (e.resposta.status === 503) === naTelaDePerfis);
    if (!exemplo) {
      throw new Error(`O contrato (complemento/contrato/exemplos-do-navegador.json) não tem exemplo de POST ${CAMINHO} com o corpo ${JSON.stringify(corpo)}`
        + `${naTelaDePerfis ? ' com o Anki na tela de perfis' : ''}; escreva-o lá antes de o fake responder.`);
    }
    if (exemplo.resposta.status === 200) abertos.push(corpo.guid);
    return { status: exemplo.resposta.status, json: JSON.parse(JSON.stringify(exemplo.resposta.json)) };
  }

  return { responder, abertos };
}

function cartoesDoEstado(jobId, cartoes) {
  return Object.fromEntries(Object.entries(cartoes).map(([id, valor]) => {
    const { status, error = null } = typeof valor === 'string' ? { status: valor } : valor;
    return [id, { phraseId: Number(id.split('-')[0]), status, error, ...(status === 'added' && { guid: `pm${jobId.replace(/-/g, '').slice(0, 12)}${id.replace('-', 'c')}` }) }];
  }));
}

module.exports = { criarNavegador, cartoesDoEstado };
