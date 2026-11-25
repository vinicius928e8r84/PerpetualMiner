'use strict';

(function (raiz) {
  const PDF = /\.pdf(\?|#|$)/i;
  const PDF_DO_VISUALIZADOR = /^chrome-extension:\/\/[a-z]+\/.*pdf/i;
  const SUFIXO_DO_VISUALIZADOR = /\s*[-–|]?\s*(PDF|Google Chrome)$/i;

  function fonteDoEndereco(url) {
    return PDF.test(url) || PDF_DO_VISUALIZADOR.test(url) ? 'pdf' : 'web';
  }

  function contextoDaSelecao({ url = '', titulo = '', preservarTitulo = false }) {
    return {
      fonte: fonteDoEndereco(url),
      titulo: preservarTitulo ? titulo.trim() : titulo.replace(SUFIXO_DO_VISUALIZADOR, '').trim() || url,
      detalhe: '',
    };
  }

  function naoGravou(error) {
    return { ok: false, error };
  }

  function desfechoDaGravacao(resposta) {
    if (chrome.runtime.lastError) return naoGravou(chrome.runtime.lastError.message);
    if (resposta?.ok !== true) return naoGravou(resposta?.error || 'save_failed');
    return { ok: true, frase: resposta.frase };
  }

  function gravar({ texto, contexto, origem, idioma, palavras, semNuvem }) {
    return new Promise(resolver => {
      try {
        chrome.runtime.sendMessage({
          type: 'SALVAR_HISTORICO',
          texto,
          origem: origem ?? contexto?.fonte,
          idioma: idioma ?? raiz.detectarIdioma(texto),
          contexto,
          palavras,
          semNuvem,
        }, resposta => resolver(desfechoDaGravacao(resposta)));
      } catch (erro) {
        resolver(naoGravou(erro?.message || 'save_failed'));
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

  function gruposDoPrefixo(prefixo) {
    return prefixo.split('|')
      .map(g => g.trim().split(/\s+/).filter(Boolean).map(w => w.toLowerCase()))
      .filter(g => g.length > 0);
  }

  function ehAPalavra(token, palavra) {
    return token.isWord && token.clean === palavra;
  }

  function grupoNosTokens(grupo, tokens) {
    const achadas = [];
    let depoisDe = 0;
    for (const palavra of grupo) {
      const i = tokens.findIndex((t, idx) => idx >= depoisDe && ehAPalavra(t, palavra));
      if (i < 0) return null;
      achadas.push(`${palavra}@${i}`);
      depoisDe = i + 1;
    }
    return achadas;
  }

  function palavrasNoTexto(prefixo, texto) {
    const grupos = gruposDoPrefixo(prefixo);
    if (grupos.length === 0 || !texto) return null;
    const tokens = tokenizar(texto);
    const palavras = [];
    for (const grupo of grupos) {
      const achadas = grupoNosTokens(grupo, tokens);
      if (!achadas) return null;
      if (palavras.length > 0) palavras.push('|');
      palavras.push(...achadas);
    }
    return palavras;
  }

  function gruposMarcados(palavras) {
    const grupos = [[]];
    for (const palavra of palavras || []) {
      if (palavra === '|') grupos.push([]);
      else grupos.at(-1).push(String(palavra).replace(/@\d+$/, ''));
    }
    return grupos;
  }

  function palavrasQueFicam(palavras, texto) {
    const ficam = gruposMarcados(palavras).map(grupo => grupo.join(' ')).filter(grupo => palavrasNoTexto(grupo, texto));
    return palavrasNoTexto(ficam.join(' | '), texto) || [];
  }

  function separarOUltimoGrupo(palavras) {
    const fimDoPenultimo = palavras.lastIndexOf('|') + 1;
    return { anteriores: palavras.slice(0, fimDoPenultimo), ultimo: palavras.slice(fimDoPenultimo) };
  }

  function naOrdemDoTexto(marcadas, texto) {
    return tokenizar(texto)
      .map((token, indice) => (token.isWord && marcadas.has(`${token.clean}@${indice}`) ? `${token.clean}@${indice}` : null))
      .filter(Boolean);
  }

  function palavrasAposMarcar(palavras, chave, texto) {
    const { anteriores, ultimo } = separarOUltimoGrupo(palavras);
    const marcadas = new Set(ultimo);
    if (marcadas.has(chave)) marcadas.delete(chave);
    else                     marcadas.add(chave);
    const novoUltimo = naOrdemDoTexto(marcadas, texto);
    return novoUltimo.length > 0 ? [...anteriores, ...novoUltimo] : anteriores.slice(0, -1);
  }

  raiz.Mineracao = { contextoDaSelecao, gravar, tokenizar, palavrasNoTexto, palavrasQueFicam, palavrasAposMarcar };
  raiz.minerarFraseManual = minerarFraseManual;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
