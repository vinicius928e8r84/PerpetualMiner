'use strict';

// Como a extensão pede uma leitura à Conexão com o Anki. O que lê o Anki da pessoa (os Baralhos, os
// números e o vocabulário) é POST com corpo JSON: o GET de uma página da extensão vai sem `Origin` e a
// Conexão só atende a extensão (complemento/contrato/LEIA-ME.md). Quem pede trata a resposta.
//
// Carregado pelo service worker e pelo painel, antes de quem pede.

(function (raiz) {
  /** O POST de `corpo` (JSON) a `caminho` da Conexão em `endereco`; `opcoes` vão ao `fetch` (o `signal`, por exemplo). Devolve a resposta. */
  function postarJson(endereco, caminho, corpo, opcoes = {}) {
    return fetch(`${endereco}${caminho}`, {
      ...opcoes,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  }

  raiz.PedidoAoAnki = Object.freeze({ postarJson });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
