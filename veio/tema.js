'use strict';

(function (raiz) {
  const TEMAS = Object.freeze({
    ESCURO: 'escuro',
    CLARO: 'claro',
  });

  const TEMA_PADRAO = TEMAS.ESCURO;

  const CHAVE = 'pm_tema';

  const MARCA_DA_TROCA = 'data-trocando-tema';

  function normalizarTema(valor) {
    return valor === TEMAS.ESCURO || valor === TEMAS.CLARO ? valor : TEMA_PADRAO;
  }

  function aplicarTema(tema) {
    const escolhido = normalizarTema(tema);
    const raizDaPagina = document.documentElement;
    const trocando = document.readyState !== 'loading'
      && raizDaPagina.getAttribute('data-tema') !== escolhido;
    if (trocando) raizDaPagina.setAttribute(MARCA_DA_TROCA, '');
    raizDaPagina.setAttribute('data-tema', escolhido);
    if (trocando) {
      requestAnimationFrame(() => requestAnimationFrame(() => raizDaPagina.removeAttribute(MARCA_DA_TROCA)));
    }
    try {
      localStorage.setItem(CHAVE, escolhido);
    } catch {
    }
    return escolhido;
  }

  async function lerTemaGravado() {
    const guardado = await chrome.storage.local.get(CHAVE);
    return normalizarTema(guardado?.[CHAVE]);
  }

  async function gravarTema(tema) {
    const escolhido = normalizarTema(tema);
    aplicarTema(escolhido);
    await chrome.storage.local.set({ [CHAVE]: escolhido });
    return escolhido;
  }

  function aoMudarTema(fn) {
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area === 'local' && CHAVE in mudancas) fn(normalizarTema(mudancas[CHAVE].newValue));
    });
  }

  function acompanharTemaGravado(fn) {
    lerTemaGravado().then(fn);
    aoMudarTema(fn);
  }

  function aplicarTemaGravado() {
    try {
      aplicarTema(localStorage.getItem(CHAVE));
    } catch {
      aplicarTema(TEMA_PADRAO);
    }

    lerTemaGravado().then(aplicarTema).catch(() => {});

    aoMudarTema(aplicarTema);
  }

  if (globalThis.chrome?.storage?.local) aplicarTemaGravado();

  raiz.Tema = {
    TEMAS,
    CHAVE,
    gravarTema,
    lerTemaGravado,
    aoMudarTema,
    acompanharTemaGravado,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
