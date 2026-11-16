'use strict';

const { isDeepStrictEqual } = require('util');

const CAMINHO = '/anki/card-front';
const FRENTES = ['frase_com_audio', 'ouvir_primeiro', 'lacuna', 'producao', 'ditado', 'criacao'];

function criarFakeFrente({ contrato, erro, colecao }) {
  const guardadas = {};
  const mexidos = new Set();
  const doCaminho = contrato.exemplos.filter(e => e.daExtensao && e.pedido.caminho === CAMINHO);

  function responder(metodo, caminho, corpo = {}) {
    if (metodo !== 'POST' || caminho !== CAMINHO) return null;
    if (!['en', 'ru'].includes(corpo.lang)) return erro(CAMINHO, 'invalid_lang');
    if (!FRENTES.includes(corpo.frente)) return erro(CAMINHO, 'invalid_front');
    if (mexidos.has(corpo.lang)) return erro(CAMINHO, 'note_type_changed');
    const doExemplo = doCaminho.find(e => 'colecao' in e.contexto && e.contexto.colecao === colecao() && isDeepStrictEqual(e.pedido.corpo, corpo));
    if (doExemplo && doExemplo.resposta.status !== 200) return doExemplo.resposta;
    guardadas[corpo.lang] = corpo.frente;
    return doCaminho.find(e => e.resposta.status === 200).resposta;
  }

  return {
    responder,
    mexerNoTipoDeNota(lang) { mexidos.add(lang); },
    /** @estado-guardado A frente que a Conexão pôs no modelo de Cartão de cada idioma (`{ en, ru }`; o idioma que ninguém trocou não está). */
    guardadas() { return { ...guardadas }; },
  };
}

module.exports = { criarFakeFrente };
