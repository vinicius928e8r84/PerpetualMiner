'use strict';

(function (raiz) {
  const ALARME = 'pm-apagar-frases-pendente';
  const PERIODO_EM_MINUTOS = 0.5;

  function criar({ chrome, conversa }) {
    const gravado = raiz.EnvioGravado.criar(chrome.storage.local);

    async function cuidar() {
      const marca = await gravado.ler();
      if (!marca?.apagarFrases) return chrome.alarms.clear(ALARME);
      if (await chrome.alarms.get(ALARME)) return;
      await chrome.alarms.create(ALARME, { periodInMinutes: PERIODO_EM_MINUTOS, delayInMinutes: PERIODO_EM_MINUTOS });
    }

    async function conferir() {
      const marca = await gravado.ler();
      if (!marca?.apagarFrases) return chrome.alarms.clear(ALARME);
      const desfecho = await conversa.pedir(raiz.PedidoAoAnki.apagarFrasesDosEnvios());
      if (!desfecho.ok) return;
      await gravado.mudar(raiz.EnvioGravado.EVENTO.CONFIRMOU);
      await chrome.alarms.clear(ALARME);
    }

    return { cuidar, conferir };
  }

  function ligar({ chrome }) {
    if (typeof chrome.alarms?.create !== 'function') return;
    const pendente = criar({ chrome, conversa: raiz.ConversaComOAnki });
    chrome.alarms.onAlarm.addListener(alarme => {
      if (alarme.name === ALARME) pendente.conferir();
    });
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area === 'local' && raiz.EnvioGravado.CHAVE in mudancas) pendente.cuidar();
    });
    pendente.cuidar();
  }

  raiz.ApagarFrasesPendente = Object.freeze({ ALARME, criar, ligar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
