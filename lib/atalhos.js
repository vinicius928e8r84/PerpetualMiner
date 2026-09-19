'use strict';

// Os atalhos gravados, num lugar só: “Minerar legenda” e “Minerar seleção”.
//
// O card Atalhos de Configurações grava, o content script obedece e o painel
// mostra (resumo da linha fechada, vazio de Frases). Os três leem daqui, então
// o formato gravado, o rótulo em PT-BR e a regra de “é o mesmo atalho” não
// divergem entre eles.
//
// Um atalho gravado é { type: 'keyboard'|'mouse', code, button, altKey,
// ctrlKey, shiftKey, label }, o mesmo formato que o `pm_atalho` sempre teve.
// O `label` é só para quem ainda lê o texto pronto (o popup de hoje); o rótulo
// na tela sai de `rotuloDoAtalho`, refeito do que foi gravado, então um atalho
// gravado em inglês (“Alt+Mouse Back”) aparece em PT-BR.
//
// O atalho de legenda mora em `pm_atalho_legenda`. Sem a chave, vale o padrão
// Alt+S; gravada como null, não há atalho de legenda. O de seleção continua no
// `pm_atalho` de hoje, e null é “sem atalho” (o padrão).
//
// Não há `commands` no manifest: o atalho de legenda aceita botão do mouse, que
// o `chrome.commands` não aceita, então o gravado vale só pelo content script.

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

  /** Os botões extras do mouse em PT-BR (CFG-14), pelo `button` do evento. */
  const BOTOES_DO_MOUSE = { 1: 'CFG-14.botaoDoMeio', 3: 'CFG-14.botaoVoltar', 4: 'CFG-14.botaoAvancar' };
  const TECLAS_MODIFICADORAS = ['Control', 'Shift', 'Alt', 'Meta'];

  /** Os dois atalhos como estão gravados, com o padrão onde nada foi gravado. */
  function lerAtalhos(aoLer) {
    const pedido = {
      [CHAVES_DOS_ATALHOS.legenda]: ATALHOS_PADRAO.legenda,
      [CHAVES_DOS_ATALHOS.selecao]: ATALHOS_PADRAO.selecao,
    };
    chrome.storage.local.get(pedido, dados => aoLer({
      legenda: dados[CHAVES_DOS_ATALHOS.legenda] ?? null,
      selecao: dados[CHAVES_DOS_ATALHOS.selecao] ?? null,
    }));
  }

  /**
   * Chama `aoMudar(atalhos)` com os atalhos gravados agora e de novo a cada
   * mudança, venha de onde vier (Configurações, o popup, outra aba).
   */
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

  /** Volta aos atalhos de fábrica: {legenda: Alt+S, seleção: nenhum}. */
  function restaurarAtalhosPadrao() {
    return chrome.storage.local.set({
      [CHAVES_DOS_ATALHOS.legenda]: ATALHOS_PADRAO.legenda,
      [CHAVES_DOS_ATALHOS.selecao]: ATALHOS_PADRAO.selecao,
    });
  }

  function estaNoPadrao(atalhos) {
    return Object.values(ACOES).every(acao => mesmoAtalho(atalhos[acao], ATALHOS_PADRAO[acao]));
  }

  /**
   * O atalho que um evento grava, ou null quando ele não grava nada: uma tecla
   * modificadora sozinha, o clique esquerdo e o direito (o Cancelar continua
   * clicável e o menu do botão direito continua funcionando).
   */
  function atalhoDoEvento(evento) {
    const modificadores = { altKey: evento.altKey, ctrlKey: evento.ctrlKey, shiftKey: evento.shiftKey };
    let atalho;
    if (evento.type === 'keydown') {
      if (TECLAS_MODIFICADORAS.includes(evento.key)) return null;
      atalho = { type: 'keyboard', button: null, code: evento.code, ...modificadores };
    } else {
      if (evento.button === 0 || evento.button === 2) return null;
      atalho = { type: 'mouse', button: evento.button, code: null, ...modificadores };
    }
    return { ...atalho, label: rotuloDoAtalho(atalho) };
  }

  /** Dois atalhos são o mesmo quando a mesma tecla ou o mesmo botão, com os mesmos modificadores, disparam os dois. */
  function mesmoAtalho(a, b) {
    if (!a || !b) return !a && !b;
    return a.type === b.type
      && !!a.altKey === !!b.altKey && !!a.ctrlKey === !!b.ctrlKey && !!a.shiftKey === !!b.shiftKey
      && (a.type === 'mouse' ? a.button === b.button : a.code === b.code);
  }

  /** Se o evento (keydown ou mousedown) é o do atalho gravado. */
  function correspondeAoAtalho(atalho, evento) {
    if (!atalho) return false;
    if (atalho.type === 'keyboard' && evento.type !== 'keydown') return false;
    if (atalho.type === 'mouse' && evento.type !== 'mousedown') return false;
    return mesmoAtalho(atalho, {
      type: atalho.type, code: evento.code, button: evento.button,
      altKey: evento.altKey, ctrlKey: evento.ctrlKey, shiftKey: evento.shiftKey,
    });
  }

  /** “Ctrl+Shift+K”, “Alt+Botão voltar”: refeito do que foi gravado, em PT-BR. */
  function rotuloDoAtalho(atalho) {
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
    estaNoPadrao,
    gravarAtalho,
    lerAtalhos,
    mesmoAtalho,
    restaurarAtalhosPadrao,
    rotuloDoAtalho,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
