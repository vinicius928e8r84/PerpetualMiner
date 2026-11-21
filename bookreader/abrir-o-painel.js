'use strict';

(function (raiz) {
  const PAINEL = 'painel/painel.html';

  const ehOPainel = (aba, alvo) => aba.url && aba.url.split('#')[0] === alvo;
  const jaEstaNoEndereco = (aba, alvo, endereco) => endereco && aba.url === alvo + endereco;

  function irParaOPainel(aba, alvo, endereco) {
    if (!aba) {
      chrome.tabs.create({ url: alvo + endereco });
      return;
    }
    chrome.tabs.update(aba.id, endereco ? { active: true, url: alvo + endereco } : { active: true });
    chrome.windows.update(aba.windowId, { focused: true });
    if (jaEstaNoEndereco(aba, alvo, endereco)) {
      chrome.runtime.sendMessage({ type: 'PAINEL_REAPLICAR_ENDERECO' }, () => void chrome.runtime.lastError);
    }
  }

  function abrirPainel(endereco = '') {
    const alvo = chrome.runtime.getURL(PAINEL);
    chrome.tabs.query({}, abas => irParaOPainel(abas.find(aba => ehOPainel(aba, alvo)), alvo, endereco));
  }

  raiz.AbrirOPainel = Object.freeze({ abrirPainel });
})(globalThis.PerpetualMiner);
