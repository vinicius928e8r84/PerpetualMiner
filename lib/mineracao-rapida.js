'use strict';

// A mineração rápida: uma frase colada ou escrita vai para o histórico com a
// Fonte `manual`, como no popup (POP-03/04) e no passo 1 da Boas-vindas.
//
// Carregado pelo popup e pelo painel, depois de `lib/idioma.js`.

(function (raiz) {
  /**
   * Grava `texto` pelo service worker (SALVAR_HISTORICO).
   *
   * @returns {Promise<object>} a frase gravada; rejeita quando ela não foi gravada.
   */
  function minerarFraseManual(texto) {
    return new Promise((resolver, rejeitar) => {
      chrome.runtime.sendMessage({
        type: 'SALVAR_HISTORICO',
        texto,
        origem: 'manual',
        idioma: raiz.detectarIdioma(texto),
        contexto: { fonte: 'manual', titulo: '', detalhe: '' },
      }, resposta => {
        if (chrome.runtime.lastError) return rejeitar(new Error(chrome.runtime.lastError.message));
        // Sem resposta nenhuma também não gravou.
        if (!resposta?.ok) return rejeitar(new Error(resposta?.error || 'save_failed'));
        resolver(resposta.frase);
      });
    });
  }

  raiz.minerarFraseManual = minerarFraseManual;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
