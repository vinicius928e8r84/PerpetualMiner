'use strict';

(function (raiz) {
  const { detectarIdioma } = raiz;

  const IDIOMAS = Object.freeze([
    {
      codigo: 'ru',
      reconhece: valor => valor.includes('ru') || valor.includes('rus') || valor.includes('рус'),
      rotulo: raiz.idiomaDe('ru'),
      guardaPalavras: false,
      avaliar: (texto, vocabulario) => raiz.PalavraAutomatica.avaliar(texto, 'ru', vocabulario),
    },
    {
      codigo: 'en',
      reconhece: () => true,
      rotulo: raiz.idiomaDe('en'),
      guardaPalavras: true,
      avaliar: (texto, vocabulario) => raiz.PalavraAutomatica.avaliar(texto, 'en', vocabulario),
    },
  ]);

  function criar({ vocabulario, historico, ajustes, relogio, idiomas = IDIOMAS }) {
    const normalizarTexto = valor => raiz.PalavraAutomatica.normalizarTexto(valor);
    const chaveDoTexto = valor => normalizarTexto(valor).toLowerCase();
    const idiomaDoCodigo = codigo => idiomas.find(idioma => idioma.codigo === codigo);

    function normalizarIdioma(valor) {
      const minusculo = String(valor || '').toLowerCase();
      return idiomas.find(idioma => idioma.reconhece(minusculo)).codigo;
    }

    function avaliar(texto, valorDoIdioma) {
      const lang = normalizarIdioma(valorDoIdioma);
      return idiomaDoCodigo(lang).avaliar(texto, () => vocabulario(lang));
    }

    async function registrar(evento) {
      await ajustes.registrar({
        at: relogio.agora(),
        action: evento.action || 'skip',
        reason: evento.reason || '',
        texto: normalizarTexto(evento.texto || ''),
        lang: normalizarIdioma(evento.lang || detectarIdioma(evento.texto || '')),
        contexto: evento.contexto || null,
        phraseId: evento.phraseId || null,
        evaluation: evento.evaluation ? {
          accept: Boolean(evento.evaluation.accept),
          reason: evento.evaluation.reason || '',
          keywords: evento.evaluation.keywords || [],
        } : null,
      });
    }

    async function candidata(pedido) {
      const texto = normalizarTexto(pedido.texto || '');
      const contexto = pedido.contexto || null;
      if (!texto) {
        await registrar({ action: 'skip', reason: 'empty', texto, lang: normalizarIdioma(pedido.lang), contexto });
        return { action: 'skip', reason: 'empty' };
      }

      const lang = normalizarIdioma(pedido.lang || detectarIdioma(texto));
      const idioma = idiomaDoCodigo(lang);
      const state = await ajustes.ler();
      if (!state.settings[lang]?.enabled) {
        await registrar({ action: 'skip', reason: 'disabled', texto, lang, contexto });
        return { action: 'skip', reason: 'disabled', state };
      }
      if (raiz.MineracaoDoDia.noLimiteDeHoje(state, lang, new Date(relogio.agora()))) {
        await registrar({ action: 'skip', reason: 'daily_limit', texto, lang, contexto });
        return { action: 'skip', reason: 'daily_limit', state };
      }

      const evaluation = await avaliar(texto, lang);
      if (!evaluation.accept) {
        await registrar({ action: 'skip', reason: evaluation.reason, texto, lang, contexto, evaluation });
        return { action: 'skip', reason: evaluation.reason, state, evaluation };
      }

      const chave = chaveDoTexto(texto);
      const extras = {
        autoMiner: true,
        autoMinerReason: evaluation.reason || 'accepted',
        ...(idioma.guardaPalavras ? { keywords: evaluation.keywords, autoKeyword: true } : {}),
      };
      const frase = await historico.salvarSeNova(
        { texto, origem: pedido.origem || 'auto', contexto, idioma: idioma.rotulo, extras },
        existente => chaveDoTexto(existente.texto) === chave,
      );
      if (!frase) {
        await registrar({ action: 'skip', reason: 'duplicate', texto, lang, contexto, evaluation });
        return { action: 'skip', reason: 'duplicate', state, evaluation };
      }

      const updatedState = await ajustes.contarMais(lang);
      ajustes.publicar(updatedState);
      await registrar({ action: 'saved', reason: evaluation.reason || 'accepted', texto, lang, contexto, evaluation, phraseId: frase.id });
      return { action: 'saved', frase, evaluation, state: updatedState };
    }

    return Object.freeze({ candidata, avaliar });
  }

  raiz.MineracaoAutomatica = Object.assign(raiz.MineracaoAutomatica || {}, { criar, IDIOMAS });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
