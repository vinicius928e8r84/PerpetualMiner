'use strict';

// O Apagar tudo que a Conexão com o Anki ainda não confirmou fica marcado em `pm_envio` (`apagarFrases: true`). Com todo painel
// fechado, quem o pede de novo é o service worker: enquanto a marca existe há um alarme de 30 s (o mínimo do Chrome) e cada volta
// manda `POST /jobs/apagar-frases`. Sem marca não há alarme: nada acorda o service worker à toa. A Conexão espera até 60 s depois
// de subir por um pedido de Envio antes de retomar um Envio parado (`complemento/envio.py`), e este pedido chega nesse tempo.

(function (raiz) {
  const CHAVE_GRAVADA = 'pm_envio';
  const ALARME = 'pm-apagar-frases-pendente';
  const PERIODO_EM_MINUTOS = 0.5;

  /** `chrome` e `PedidoAoAnki` entram de fora para o teste trocá-los; `endereco` é o da Conexão. */
  function criar({ chrome, PedidoAoAnki, endereco }) {
    const lerMarca = async () => (await chrome.storage.local.get({ [CHAVE_GRAVADA]: null }))[CHAVE_GRAVADA];

    /** Liga o alarme se há marca (sem recriar o que já existe, que empurraria a próxima volta) e o desliga se não há. */
    async function cuidar() {
      const marca = await lerMarca();
      if (!marca?.apagarFrases) return chrome.alarms.clear(ALARME);
      if (await chrome.alarms.get(ALARME)) return;
      await chrome.alarms.create(ALARME, { periodInMinutes: PERIODO_EM_MINUTOS, delayInMinutes: PERIODO_EM_MINUTOS });
    }

    /** Uma volta do alarme: pede o apagamento e, confirmado, tira a marca (os Envios novos que o painel acompanha ficam). */
    async function conferir() {
      const marca = await lerMarca();
      if (!marca?.apagarFrases) return chrome.alarms.clear(ALARME);
      try {
        const resposta = await PedidoAoAnki.pedir(endereco, PedidoAoAnki.apagarFrasesDosEnvios());
        if (!resposta.ok) return;
      } catch {
        return;
      }
      const atual = await lerMarca();
      if (atual?.envios?.length) await chrome.storage.local.set({ [CHAVE_GRAVADA]: { envios: atual.envios } });
      else await chrome.storage.local.remove(CHAVE_GRAVADA);
      await chrome.alarms.clear(ALARME);
    }

    return { cuidar, conferir };
  }

  raiz.ApagarFrasesPendente = Object.freeze({ ALARME, criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
