'use strict';

// A fronteira compartilhada da mineração de uma Frase: pedidos de gravação
// das páginas, o Contexto da seleção e a Palavra dentro do texto (os pedaços
// da frase e a posição dela). O menu de contexto usa esse Contexto,
// mas já está no service worker: veja `minerarSelecaoDoMenu` em background.js
// para a gravação local, a mesma que responde a `SALVAR_HISTORICO`.
//
// Carregar depois de `lib/idioma.js`, usado na detecção do idioma ao gravar.

(function (raiz) {
  const PDF = /\.pdf(\?|#|$)/i;
  const PDF_DO_VISUALIZADOR = /^chrome-extension:\/\/[a-z]+\/.*pdf/i;
  const SUFIXO_DO_VISUALIZADOR = /\s*[-–|]?\s*(PDF|Google Chrome)$/i;

  /**
   * O Contexto de um texto selecionado numa página: a Fonte é `pdf` num PDF e
   * `web` no resto, tanto no menu quanto no atalho.
   *
   * A diferença no Título é compatibilidade, não detecção de PDF: por padrão,
   * mantém a limpeza legada do menu (remove o final PDF/Google Chrome mesmo
   * numa página web, e usa a URL quando fica vazio). O atalho passa
   * `preservarTitulo: true` para manter só o trim do título, inclusive vazio.
   * Coberto por e2e/tests/mineracao-unica.spec.js.
   */
  function contextoDaSelecao({ url = '', titulo = '', preservarTitulo = false }) {
    const fonte = PDF.test(url) || PDF_DO_VISUALIZADOR.test(url) ? 'pdf' : 'web';
    return {
      fonte,
      titulo: preservarTitulo ? titulo.trim() : titulo.replace(SUFIXO_DO_VISUALIZADOR, '').trim() || url,
      detalhe: '',
    };
  }

  /**
   * Pede ao service worker que grave `texto` no histórico. Só um `ok: true` do
   * service worker confirma a gravação. Sem resposta, com erro de canal ou
   * com outro valor de `ok`, devolve falha: quem pediu não pode anunciar sucesso.
   * A falta de confirmação não prova que a escrita local não aconteceu.
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
   * @returns {Promise<object>} a frase gravada; rejeita se a gravação não foi confirmada.
   */
  async function minerarFraseManual(texto) {
    const resultado = await gravar({ texto, contexto: { fonte: 'manual', titulo: '', detalhe: '' } });
    if (!resultado.ok) throw new Error(resultado.error);
    return resultado.frase;
  }

  /**
   * A frase em pedaços, na ordem: cada palavra (letras e números, com hífen ou apóstrofo no meio) e cada caractere
   * entre elas. A posição do pedaço é o índice da Palavra gravada (`palavra@índice`).
   */
  function tokenizar(texto) {
    return (texto.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[^\p{L}\p{N}]/gu) || []).map(tok => {
      const isWord = /[\p{L}\p{N}]/u.test(tok);
      return { text: tok, isWord, clean: isWord ? tok.toLowerCase() : null };
    });
  }

  /**
   * As Palavras de volta com a posição na frase (`word@índice`, `|` entre os
   * grupos), ou `null` se alguma não está no texto. Uma palavra repetida no
   * texto volta na primeira vez que aparece depois da anterior do mesmo grupo.
   */
  function palavrasNoTexto(prefixo, texto) {
    const grupos = prefixo.split('|')
      .map(g => g.trim().split(/\s+/).filter(Boolean).map(w => w.toLowerCase()))
      .filter(g => g.length > 0);
    if (grupos.length === 0 || !texto) return null;
    const tokens = tokenizar(texto);
    const palavras = [];
    for (const grupo of grupos) {
      if (palavras.length > 0) palavras.push('|');
      let depoisDe = 0;
      for (const palavra of grupo) {
        const i = tokens.findIndex((t, idx) => idx >= depoisDe && t.isWord && t.clean === palavra);
        if (i < 0) return null;
        palavras.push(`${palavra}@${i}`);
        depoisDe = i + 1;
      }
    }
    return palavras;
  }

  /**
   * A Palavra gravada (`palavra@índice`, `|` entre os grupos) como fica quando o texto da frase muda: o grupo que
   * não está mais no texto sai, e o que ficou ganha a posição nova. Sem nenhum, `[]`.
   */
  function palavrasQueFicam(palavras, texto) {
    const grupos = [[]];
    for (const palavra of palavras || []) {
      if (palavra === '|') grupos.push([]);
      else grupos.at(-1).push(String(palavra).replace(/@\d+$/, ''));
    }
    const ficam = grupos.map(grupo => grupo.join(' ')).filter(grupo => palavrasNoTexto(grupo, texto));
    return palavrasNoTexto(ficam.join(' | '), texto) || [];
  }

  raiz.Mineracao = { contextoDaSelecao, gravar, tokenizar, palavrasNoTexto, palavrasQueFicam };
  raiz.minerarFraseManual = minerarFraseManual;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
