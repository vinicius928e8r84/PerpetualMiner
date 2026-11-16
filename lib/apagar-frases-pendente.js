'use strict';

(function (raiz) {
  const ALARME = 'pm-apagar-frases-pendente';
  const PERIODO_EM_MINUTOS = 0.5;

  function criar({ chrome, PedidoAoAnki, endereco }) {
    const gravado = raiz.EnvioGravado.criar(chrome.storage.local);

    /** Liga o alarme se há marca (sem recriar o que já existe, que empurraria a próxima volta) e o desliga se não há. */
    async function cuidar() {
      const marca = await gravado.ler();
      if (!marca?.apagarFrases) return chrome.alarms.clear(ALARME);
      if (await chrome.alarms.get(ALARME)) return;
      await chrome.alarms.create(ALARME, { periodInMinutes: PERIODO_EM_MINUTOS, delayInMinutes: PERIODO_EM_MINUTOS });
    }

    async function conferir() {
      const marca = await gravado.ler();
      if (!marca?.apagarFrases) return chrome.alarms.clear(ALARME);
      try {
        const resposta = await PedidoAoAnki.pedir(endereco, PedidoAoAnki.apagarFrasesDosEnvios());
        if (!resposta.ok) return;
      } catch {
        return;
      }
      await gravado.mudar(raiz.EnvioGravado.EVENTO.CONFIRMOU);
      await chrome.alarms.clear(ALARME);
    }

    return { cuidar, conferir };
  }

  function ligar({ chrome, ouvirChrome, endereco }) {
    if (typeof chrome.alarms?.create !== 'function') return;
    const pendente = criar({ chrome, PedidoAoAnki: raiz.PedidoAoAnki, endereco });
    ouvirChrome(chrome.alarms.onAlarm, alarme => {
      if (alarme.name === ALARME) pendente.conferir();
    });
    ouvirChrome(chrome.storage.onChanged, (mudancas, area) => {
      if (area === 'local' && raiz.EnvioGravado.CHAVE in mudancas) pendente.cuidar();
    });
    pendente.cuidar();
  }

  raiz.ApagarFrasesPendente = Object.freeze({ ALARME, criar, ligar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
