'use strict';

const CAMINHO = '/anki/browse';

const ehOPedido = ({ metodo, caminho }) => metodo === 'POST' && caminho === CAMINHO;
const exemploDoNavegador = exemplo => exemplo.daExtensao && ehOPedido(exemplo.pedido);
const respondeNaTela = (exemplo, naTelaDePerfis) => (exemplo.resposta.status === 503) === naTelaDePerfis;
const copia = json => JSON.parse(JSON.stringify(json));

function faltaOExemplo(corpo, naTelaDePerfis) {
  const tela = naTelaDePerfis ? ' com o Anki na tela de perfis' : '';
  return new Error(`O contrato (complemento/contrato/exemplos-do-navegador.json) não tem exemplo de POST ${CAMINHO} com o corpo ${JSON.stringify(corpo)}`
    + `${tela}; escreva-o lá antes de o fake responder.`);
}

function criarNavegador({ contexto, exemplos }) {
  const abertos = [];

  function exemploPara(corpo, naTelaDePerfis) {
    if (typeof corpo?.guid !== 'string') return undefined;
    return exemplos().find(exemplo => exemploDoNavegador(exemplo) && respondeNaTela(exemplo, naTelaDePerfis));
  }

  function responder(metodo, caminho, corpo) {
    if (!ehOPedido({ metodo, caminho })) return null;
    const naTelaDePerfis = contexto().perfil === null;
    const exemplo = exemploPara(corpo, naTelaDePerfis);
    if (!exemplo) throw faltaOExemplo(corpo, naTelaDePerfis);
    if (exemplo.resposta.status === 200) abertos.push(corpo.guid);
    return { status: exemplo.resposta.status, json: copia(exemplo.resposta.json) };
  }

  return { responder, abertos };
}

const situacaoDoCartao = valor => (typeof valor === 'string' ? { status: valor } : valor);
const guidDoCartao = (jobId, id) => `pm${jobId.replace(/-/g, '').slice(0, 12)}${id.replace('-', 'c')}`;

function cartaoDoEstado(jobId, id, valor) {
  const { status, error = null } = situacaoDoCartao(valor);
  const cartao = { phraseId: Number(id.split('-')[0]), status, error };
  if (status === 'added') cartao.guid = guidDoCartao(jobId, id);
  return cartao;
}

function cartoesDoEstado(jobId, cartoes) {
  return Object.fromEntries(Object.entries(cartoes).map(([id, valor]) => [id, cartaoDoEstado(jobId, id, valor)]));
}

module.exports = { criarNavegador, cartoesDoEstado };
