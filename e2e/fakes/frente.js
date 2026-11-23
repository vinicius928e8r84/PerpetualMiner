'use strict';

const { isDeepStrictEqual } = require('util');

const CAMINHO = '/anki/card-front';
const FRENTES = ['frase_com_audio', 'ouvir_primeiro', 'lacuna', 'producao', 'ditado', 'criacao'];

function criarFakeFrente({ contrato, erro, colecao }) {
  const guardadas = {};
  const mexidos = new Set();
  const doCaminho = contrato.exemplos.filter(e => e.daExtensao && e.pedido.caminho === CAMINHO);

  function motivoDaRecusa(corpo) {
    if (!['en', 'ru'].includes(corpo.lang)) return 'invalid_lang';
    if (!FRENTES.includes(corpo.frente)) return 'invalid_front';
    if (mexidos.has(corpo.lang)) return 'note_type_changed';
    return null;
  }

  function exemploDeRecusa(corpo) {
    const doExemplo = doCaminho.find(e => 'colecao' in e.contexto && e.contexto.colecao === colecao() && isDeepStrictEqual(e.pedido.corpo, corpo));
    return doExemplo && doExemplo.resposta.status !== 200 ? doExemplo.resposta : null;
  }

  function responder(metodo, caminho, corpo = {}) {
    if (metodo !== 'POST' || caminho !== CAMINHO) return null;
    const motivo = motivoDaRecusa(corpo);
    if (motivo) return erro(CAMINHO, motivo);
    const recusa = exemploDeRecusa(corpo);
    if (recusa) return recusa;
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
