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
  const MODIFICADORES = ['altKey', 'ctrlKey', 'shiftKey'];

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
    const atalho = evento.type === 'keydown' ? atalhoDeTeclado(evento, modificadores) : atalhoDeMouse(evento, modificadores);
    return atalho && { ...atalho, label: rotuloDoAtalho(atalho) };
  }

  function atalhoDeTeclado(evento, modificadores) {
    if (TECLAS_MODIFICADORAS.includes(evento.key) || !Object.values(modificadores).some(Boolean)) return null;
    return { type: 'keyboard', button: null, code: evento.code, ...modificadores };
  }

  function atalhoDeMouse(evento, modificadores) {
    if (evento.button === 0 || evento.button === 2) return null;
    return { type: 'mouse', button: evento.button, code: null, ...modificadores };
  }

  // Eles navegam na soltura, não no `mousedown`, então segurar só o `mousedown`
  // não basta: quem usa o botão como atalho (ou está gravando um) também segura
  // a soltura dele, ou a página sai do lugar.

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
    return a.type === b.type && mesmosModificadores(a, b) && mesmaTecla(a, b);
  }

  function mesmosModificadores(a, b) {
    return MODIFICADORES.every(modificador => !!a[modificador] === !!b[modificador]);
  }

  function mesmaTecla(a, b) {
    return a.type === 'mouse' ? a.button === b.button : a.code === b.code;
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

  const CAMPOS_DE_DIGITAR = ['textarea', 'select'];
  const QUE_NAO_SE_DIGITA = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'];

  /**
   * O evento nasceu num campo onde se digita (input de texto, textarea, select,
   * contenteditable): ali a tecla é da pessoa, não da extensão. Numa sombra
   * fechada o evento chega retargetado ao host; no content script,
   * `chrome.dom.openOrClosedShadowRoot` abre a sombra e o foco dentro dela é o campo.
   */
  function digitandoNumCampo(evento) {
    return ehCampoDeDigitar(descerAoFocoDaSombra(evento.composedPath?.()[0] || evento.target));
  }

  function ehCampoDeDigitar(alvo) {
    if (!(alvo instanceof Element)) return false;
    if (alvo.isContentEditable || CAMPOS_DE_DIGITAR.includes(alvo.localName)) return true;
    return alvo.localName === 'input' && !QUE_NAO_SE_DIGITA.includes(alvo.type);
  }

  function descerAoFocoDaSombra(alvo) {
    let atual = alvo;
    while (atual instanceof Element) {
      const foco = focoDentroDaSombra(atual);
      if (!foco) break;
      atual = foco;
    }
    return atual;
  }

  function focoDentroDaSombra(hospedeiro) {
    if (!globalThis.chrome?.dom?.openOrClosedShadowRoot) return null;
    return chrome.dom.openOrClosedShadowRoot(hospedeiro)?.activeElement;
  }

  function rotuloDoAtalho(atalho) {
    if (!atalho) return '';
    const tecla = teclaDoRotulo(atalho);
    if (tecla === null) return atalho.label || '';
    const modificadores = [atalho.ctrlKey && 'Ctrl', atalho.altKey && 'Alt', atalho.shiftKey && 'Shift'].filter(Boolean);
    return [...modificadores, tecla].join('+');
  }

  function teclaDoRotulo(atalho) {
    if (atalho.type === 'mouse') return nomeDoBotao(atalho.button);
    return atalho.code ? atalho.code.replace(/^(Key|Digit)/, '') : null;
  }

  function nomeDoBotao(botao) {
    const { textoDaVoz } = raiz;
    const nome = BOTOES_DO_MOUSE[botao];
    return nome ? textoDaVoz(nome) : textoDaVoz('CFG-14.outro', { n: String(botao) });
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
