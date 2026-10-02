'use strict';

// Minerar uma Frase por um caminho só. Quem mina (a legenda e a seleção da
// página, o menu de contexto, a mineração rápida do popup e da Boas-vindas, a
// foto e o Minerar frases do painel) monta o pedido e lê a resposta daqui:
// o pedido `SALVAR_HISTORICO` ao service worker, a Fonte, o idioma e o Contexto
// da seleção, e o "gravou / não gravou".
//
// Carregado depois de `lib/idioma.js`: pelo content script, pelo service worker
// (`importScripts`), pelo popup, pelo painel e pelo Minerar de uma foto.

(function (raiz) {
  const PDF = /\.pdf(\?|#|$)/i;
  const PDF_DO_VISUALIZADOR = /^chrome-extension:\/\/[a-z]+\/.*pdf/i;
  const SUFIXO_DO_VISUALIZADOR = /\s*[-–|]?\s*(PDF|Google Chrome)$/i;

  /**
   * O Contexto de um texto selecionado numa página: a Fonte é `pdf` num PDF e
   * `web` no resto, e o título é o da aba sem o sufixo do visualizador (o da
   * página, na falta dele). O menu de contexto e o atalho de seleção gravam o
   * mesmo Contexto.
   */
  function contextoDaSelecao({ url = '', titulo = '' }) {
    const fonte = PDF.test(url) || PDF_DO_VISUALIZADOR.test(url) ? 'pdf' : 'web';
    return {
      fonte,
      titulo: titulo.replace(SUFIXO_DO_VISUALIZADOR, '').trim() || url,
      detalhe: '',
    };
  }

  /**
   * Pede ao service worker que grave `texto` no histórico. Só um `ok: true` do
   * service worker conta como gravou: sem resposta, com um erro de canal ou com
   * uma resposta sem `ok`, a Frase não foi gravada.
   *
   * `origem` é a Fonte que a Frase grava em `streaming` (a do Contexto, se não
   * vier); o idioma é detectado do texto, se não vier. `palavras` (mesmo vazia)
   * diz que a Palavra já veio com a linha, e `semNuvem` que quem pede sobe as
   * Frases de uma vez no fim (o Minerar frases do painel).
   *
   * @returns {Promise<{ok: true, frase: object} | {ok: false, error: string}>}
   *   Nunca rejeita.
   */
  function gravar({ texto, contexto, origem, idioma, palavras, semNuvem }) {
    return new Promise(resolver => {
      const naoGravou = error => resolver({ ok: false, error });
      try {
        chrome.runtime.sendMessage({
          type: 'SALVAR_HISTORICO',
          texto,
          origem: origem ?? contexto?.fonte,
          idioma: idioma ?? raiz.detectarIdioma(texto),
          contexto,
          palavras,
          semNuvem,
        }, resposta => {
          if (chrome.runtime.lastError) return naoGravou(chrome.runtime.lastError.message);
          if (resposta?.ok !== true) return naoGravou(resposta?.error || 'save_failed');
          resolver({ ok: true, frase: resposta.frase });
        });
      } catch (erro) {
        // A extensão foi recarregada e esta página ficou órfã.
        naoGravou(erro?.message || 'save_failed');
      }
    });
  }

  /**
   * A mineração rápida: uma frase colada ou escrita vai para o histórico com a
   * Fonte `manual`, como no popup (POP-03/04) e no passo 1 da Boas-vindas.
   *
   * @returns {Promise<object>} a frase gravada; rejeita quando ela não foi gravada.
   */
  async function minerarFraseManual(texto) {
    const resultado = await gravar({ texto, contexto: { fonte: 'manual', titulo: '', detalhe: '' } });
    if (!resultado.ok) throw new Error(resultado.error);
    return resultado.frase;
  }

  raiz.Mineracao = { contextoDaSelecao, gravar };
  raiz.minerarFraseManual = minerarFraseManual;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
