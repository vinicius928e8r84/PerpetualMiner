'use strict';

(function (raiz) {
  const PDF = /\.pdf(\?|#|$)/i;
  const PDF_DO_VISUALIZADOR = /^chrome-extension:\/\/[a-z]+\/.*pdf/i;
  const SUFIXO_DO_VISUALIZADOR = /\s*[-–|]?\s*(PDF|Google Chrome)$/i;

  function contextoDaSelecao({ url = '', titulo = '', preservarTitulo = false }) {
    const fonte = PDF.test(url) || PDF_DO_VISUALIZADOR.test(url) ? 'pdf' : 'web';
    return {
      fonte,
      titulo: preservarTitulo ? titulo.trim() : titulo.replace(SUFIXO_DO_VISUALIZADOR, '').trim() || url,
      detalhe: '',
    };
  }

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

  async function minerarFraseManual(texto) {
    const resultado = await gravar({ texto, contexto: { fonte: 'manual', titulo: '', detalhe: '' } });
    if (!resultado.ok) throw new Error(resultado.error);
    return resultado.frase;
  }

  function tokenizar(texto) {
    return (texto.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[^\p{L}\p{N}]/gu) || []).map(tok => {
      const isWord = /[\p{L}\p{N}]/u.test(tok);
      return { text: tok, isWord, clean: isWord ? tok.toLowerCase() : null };
    });
  }

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
