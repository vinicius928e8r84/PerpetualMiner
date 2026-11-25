'use strict';

(function (raiz) {
  const ACOES = Object.freeze({ LEGENDA: 'legenda', SELECAO: 'selecao' });

  const CHAVES_DOS_ATALHOS = Object.freeze({
    [ACOES.LEGENDA]: 'pm_atalho_legenda',
    [ACOES.SELECAO]: 'pm_atalho',
  });

  const ATALHOS_PADRAO = Object.freeze({
    [ACOES.LEGENDA]: Object.freeze({
      type: 'keyboard', button: null, code: 'KeyS', altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+S',
    }),
    [ACOES.SELECAO]: null,
  });

  const BOTOES_DO_MOUSE = { 1: 'CFG-14.botaoDoMeio', 3: 'CFG-14.botaoVoltar', 4: 'CFG-14.botaoAvancar' };
  const TECLAS_MODIFICADORAS = ['Control', 'Shift', 'Alt', 'Meta'];

  function lerAtalhos(aoLer) {
    chrome.storage.local.get(gravacaoDosAtalhos(ATALHOS_PADRAO), dados => aoLer({
      legenda: dados[CHAVES_DOS_ATALHOS.legenda] ?? null,
      selecao: dados[CHAVES_DOS_ATALHOS.selecao] ?? null,
    }));
  }

  function acompanharAtalhos(aoMudar) {
    lerAtalhos(aoMudar);
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local') return;
      if (Object.values(CHAVES_DOS_ATALHOS).some(chave => chave in mudancas)) lerAtalhos(aoMudar);
    });
  }

  function gravarAtalho(acao, atalho) {
    return chrome.storage.local.set({ [CHAVES_DOS_ATALHOS[acao]]: atalho });
  }

  function restaurarAtalhosPadrao() {
    return chrome.storage.local.set(gravacaoDosAtalhos(ATALHOS_PADRAO));
  }

  function gravacaoDosAtalhos(atalhos) {
    return Object.fromEntries(Object.values(ACOES).map(acao => [CHAVES_DOS_ATALHOS[acao], atalhos[acao]]));
  }

  function estaNoPadrao(atalhos) {
    return Object.values(ACOES).every(acao => mesmoAtalho(atalhos[acao], ATALHOS_PADRAO[acao]));
  }

  function atalhoDoEvento(evento) {
    if (evento.metaKey) return null;
    const modificadores = modificadoresDoEvento(evento);
    let atalho;
    if (evento.type === 'keydown') {
      if (TECLAS_MODIFICADORAS.includes(evento.key)) return null;
      if (!modificadores.altKey && !modificadores.ctrlKey && !modificadores.shiftKey) return null;
      atalho = { type: 'keyboard', button: null, code: evento.code, ...modificadores };
    } else {
      if (evento.button === 0 || evento.button === 2) return null;
      atalho = { type: 'mouse', button: evento.button, code: null, ...modificadores };
    }
    return { ...atalho, label: rotuloDoAtalho(atalho) };
  }

  const soltura = { botao: null, todas: false, guardaPosta: false };

  function guardarSolturaDoBotao(botao) {
    soltura.botao = botao;
    porAGuardaDaSoltura();
  }

  function guardarTodasAsSolturas(ligado) {
    soltura.todas = ligado;
    porAGuardaDaSoltura();
  }

  function porAGuardaDaSoltura() {
    if (soltura.guardaPosta) return;
    soltura.guardaPosta = true;
    for (const tipo of ['mouseup', 'auxclick']) document.addEventListener(tipo, aoSoltar, true);
  }

  function aoSoltar(evento) {
    if (evento.button === 0 || evento.button === 2) return;
    if (!soltura.todas && evento.button !== soltura.botao) return;
    evento.preventDefault();
    evento.stopImmediatePropagation();
    if (evento.type === 'auxclick' && evento.button === soltura.botao) soltura.botao = null;
  }

  function mesmoAtalho(a, b) {
    if (!a || !b) return !a && !b;
    return a.type === b.type
      && !!a.altKey === !!b.altKey && !!a.ctrlKey === !!b.ctrlKey && !!a.shiftKey === !!b.shiftKey
      && (a.type === 'mouse' ? a.button === b.button : a.code === b.code);
  }

  function correspondeAoAtalho(atalho, evento) {
    if (!atalho || evento.metaKey) return false;
    if (atalho.type === 'keyboard' && evento.type !== 'keydown') return false;
    if (atalho.type === 'mouse' && evento.type !== 'mousedown') return false;
    return mesmoAtalho(atalho, {
      type: atalho.type, code: evento.code, button: evento.button, ...modificadoresDoEvento(evento),
    });
  }

  function modificadoresDoEvento(evento) {
    return { altKey: evento.altKey, ctrlKey: evento.ctrlKey, shiftKey: evento.shiftKey };
  }

  const QUE_NAO_SE_DIGITA = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'];

  function digitandoNumCampo(evento) {
    let alvo = evento.composedPath?.()[0] || evento.target;
    while (alvo instanceof Element && globalThis.chrome?.dom?.openOrClosedShadowRoot) {
      const focoNaSombra = chrome.dom.openOrClosedShadowRoot(alvo)?.activeElement;
      if (!focoNaSombra) break;
      alvo = focoNaSombra;
    }
    if (!(alvo instanceof Element)) return false;
    if (alvo.isContentEditable) return true;
    if (alvo.localName === 'textarea' || alvo.localName === 'select') return true;
    if (alvo.localName !== 'input') return false;
    return !QUE_NAO_SE_DIGITA.includes(alvo.type);
  }

  function rotuloDoAtalho(atalho) {
    if (!atalho) return '';
    const { textoDaVoz } = raiz;
    const modificadores = [atalho.ctrlKey && 'Ctrl', atalho.altKey && 'Alt', atalho.shiftKey && 'Shift'].filter(Boolean);
    let tecla;
    if (atalho.type === 'mouse') {
      const botao = BOTOES_DO_MOUSE[atalho.button];
      tecla = botao ? textoDaVoz(botao) : textoDaVoz('CFG-14.outro', { n: String(atalho.button) });
    } else {
      if (!atalho.code) return atalho.label || '';
      tecla = atalho.code.replace(/^(Key|Digit)/, '');
    }
    return [...modificadores, tecla].join('+');
  }

  raiz.Atalhos = {
    ACOES,
    ATALHOS_PADRAO,
    acompanharAtalhos,
    atalhoDoEvento,
    correspondeAoAtalho,
    digitandoNumCampo,
    estaNoPadrao,
    gravarAtalho,
    guardarSolturaDoBotao,
    guardarTodasAsSolturas,
    mesmoAtalho,
    restaurarAtalhosPadrao,
    rotuloDoAtalho,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
