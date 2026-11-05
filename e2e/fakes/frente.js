'use strict';

// A frente do Cartão na Conexão de mentira (#166): `POST /anki/card-front` confere o idioma e a frente como a Conexão os confere e, se dá certo,
// guarda a frente do idioma (`guardadas()`), sem mexer no do outro. Com a coleção de um exemplo aberta (`abrirColecao`) vale a resposta que o contrato
// (`complemento/contrato/exemplos-da-frente.json`) dá a esse corpo: o Anki na tela de perfis, a coleção que quebra. `mexerNoTipoDeNota('en')` é a pessoa
// ter mexido no tipo de nota do idioma no Anki: a troca dá `note_type_changed`. As respostas são as do contrato: `test_fake_anki.js` e
// `contrato-da-conexao.spec.js` as conferem contra elas.

const { isDeepStrictEqual } = require('util');

const CAMINHO = '/anki/card-front';
const FRENTES = ['frase_com_audio', 'ouvir_primeiro', 'lacuna', 'producao', 'ditado'];

/** `contrato`: os exemplos; `erro(caminho, erro)`: a resposta de erro do contrato; `colecao()`: a coleção de um exemplo aberta (undefined: nenhuma). */
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
    /** A pessoa mexeu no tipo de nota do idioma no Anki (outro modelo de Cartão): a troca da frente dele dá `note_type_changed`. */
    mexerNoTipoDeNota(lang) { mexidos.add(lang); },
    /** @estado-guardado A frente que a Conexão pôs no modelo de Cartão de cada idioma (`{ en, ru }`; o idioma que ninguém trocou não está). */
    guardadas() { return { ...guardadas }; },
  };
}

module.exports = { criarFakeFrente };
