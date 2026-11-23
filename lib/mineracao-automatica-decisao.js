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

  const resumoDaAvaliacao = avaliacao => (avaliacao ? {
    accept: Boolean(avaliacao.accept),
    reason: avaliacao.reason || '',
    keywords: avaliacao.keywords || [],
  } : null);

  const extrasDaMineracao = (idioma, evaluation) => ({
    autoMiner: true,
    autoMinerReason: evaluation.reason || 'accepted',
    ...(idioma.guardaPalavras ? { keywords: evaluation.keywords, autoKeyword: true } : {}),
  });

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

    const idiomaDoEvento = evento => normalizarIdioma(evento.lang || detectarIdioma(evento.texto || ''));

    async function registrar(evento) {
      await ajustes.registrar({
        at: relogio.agora(),
        action: evento.action || 'skip',
        reason: evento.reason || '',
        texto: normalizarTexto(evento.texto || ''),
        lang: idiomaDoEvento(evento),
        contexto: evento.contexto || null,
        phraseId: evento.phraseId || null,
        evaluation: resumoDaAvaliacao(evento.evaluation),
      });
    }

    async function pular(registro, resposta) {
      await registrar({ action: 'skip', ...registro });
      return { action: 'skip', reason: registro.reason, ...resposta };
    }

    function impedimentoDoDia(state, lang) {
      if (!state.settings[lang]?.enabled) return 'disabled';
      if (raiz.MineracaoDoDia.noLimiteDeHoje(state, lang, new Date(relogio.agora()))) return 'daily_limit';
      return null;
    }

    async function avaliarEGravar({ texto, lang, contexto, origem }, state) {
      const evaluation = await avaliar(texto, lang);
      const alvo = { texto, lang, contexto, evaluation };
      if (!evaluation.accept) return pular({ reason: evaluation.reason, ...alvo }, { state, evaluation });

      const chave = chaveDoTexto(texto);
      const idioma = idiomaDoCodigo(lang);
      const frase = await historico.salvarSeNova(
        { texto, origem, contexto, idioma: idioma.rotulo, extras: extrasDaMineracao(idioma, evaluation) },
        existente => chaveDoTexto(existente.texto) === chave,
      );
      if (!frase) return pular({ reason: 'duplicate', ...alvo }, { state, evaluation });

      const updatedState = await ajustes.contarMais(lang);
      ajustes.publicar(updatedState);
      await registrar({ action: 'saved', reason: evaluation.reason || 'accepted', ...alvo, phraseId: frase.id });
      return { action: 'saved', frase, evaluation, state: updatedState };
    }

    async function candidata(pedido) {
      const texto = normalizarTexto(pedido.texto || '');
      const contexto = pedido.contexto || null;
      if (!texto) return pular({ reason: 'empty', texto, lang: normalizarIdioma(pedido.lang), contexto }, {});

      const lang = normalizarIdioma(pedido.lang || detectarIdioma(texto));
      const state = await ajustes.ler();
      const impedimento = impedimentoDoDia(state, lang);
      if (impedimento) return pular({ reason: impedimento, texto, lang, contexto }, { state });
      return avaliarEGravar({ texto, lang, contexto, origem: pedido.origem || 'auto' }, state);
    }

    return Object.freeze({ candidata, avaliar });
  }

  raiz.MineracaoAutomatica = Object.assign(raiz.MineracaoAutomatica || {}, { criar, IDIOMAS });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
