'use strict';

// O Apagar tudo que a Conexão com o Anki ainda não confirmou fica marcado em `pm_envio` (`apagarFrases: true`). Com todo painel
// fechado, quem o pede de novo é o service worker: enquanto a marca existe há um alarme de 30 s (o mínimo do Chrome) e cada volta
// manda `POST /jobs/apagar-frases`. Sem marca não há alarme: nada acorda o service worker à toa. A Conexão espera até 60 s depois
// de subir por um pedido de Envio antes de retomar um Envio parado (`complemento/trabalhador.py`), e este pedido chega nesse tempo.
// Carregado depois de lib/envio-gravado.js, que é quem grava `pm_envio`.

(function (raiz) {
  const ALARME = 'pm-apagar-frases-pendente';
  const PERIODO_EM_MINUTOS = 0.5;

  /** `chrome` e `PedidoAoAnki` entram de fora para o teste trocá-los; `endereco` é o da Conexão. */
  function criar({ chrome, PedidoAoAnki, endereco }) {
    const gravado = raiz.EnvioGravado.criar(chrome.storage.local);

    /** Liga o alarme se há marca (sem recriar o que já existe, que empurraria a próxima volta) e o desliga se não há. */
    async function cuidar() {
      const marca = await gravado.ler();
      if (!marca?.apagarFrases) return chrome.alarms.clear(ALARME);
      if (await chrome.alarms.get(ALARME)) return;
      await chrome.alarms.create(ALARME, { periodInMinutes: PERIODO_EM_MINUTOS, delayInMinutes: PERIODO_EM_MINUTOS });
    }

    /** Uma volta do alarme: pede o apagamento e, confirmado, tira a marca (os Envios novos que o painel acompanha ficam). */
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

  /** Liga ao service worker (`ouvirChrome` é o de `background.js`): o alarme é conferido a cada despertar e a cada mudança de `pm_envio`. */
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
