'use strict';

(function (raiz) {
  function causaDaFalha(resposta) {
    if (chrome.runtime.lastError) return chrome.runtime.lastError.message;
    if (resposta?.ok && resposta.state) return null;
    return resposta?.error || JSON.stringify(resposta ?? null);
  }

  function pedir(mensagem) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(mensagem, resposta => {
        const falha = causaDaFalha(resposta);
        if (falha) reject(new Error(falha));
        else resolve(resposta.state);
      });
    });
  }

  const lerEstado = () => pedir({ type: 'AUTO_MINER_GET_STATE' });

  const salvarAjustes = mudanca => pedir({ type: 'AUTO_MINER_SET_SETTINGS', settings: mudanca });

  function ligarCampoDoLimite(campo, { limiteGravado, gravar }) {
    campo.type = 'number';
    campo.min = '1';
    campo.max = '100';
    campo.step = '1';
    campo.inputMode = 'numeric';
    campo.classList.add('veio-campo', 'veio-campo--limite');

    let pedido = null;
    const aoGravar = () => {
      const gravado = limiteGravado();
      const valor = Math.round(Number(campo.value));
      if (!campo.value.trim() || Number.isNaN(valor)) {
        campo.value = String(gravado);
        return;
      }
      if (valor === gravado || valor === pedido) return;
      pedido = valor;
      gravar(valor).finally(() => {
        pedido = null;
        if (campo.isConnected) campo.value = String(limiteGravado());
      });
    };
    campo.addEventListener('change', aoGravar);
    campo.addEventListener('focus', () => campo.select());
    campo.addEventListener('keydown', evento => {
      if (evento.key !== 'Enter') return;
      evento.preventDefault();
      aoGravar();
    });
  }

  raiz.MineracaoAutomatica = { lerEstado, salvarAjustes, ligarCampoDoLimite };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
