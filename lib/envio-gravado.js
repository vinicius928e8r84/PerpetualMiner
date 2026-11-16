'use strict';

(function (raiz) {
  const CHAVE = 'pm_envio';
  const EVENTO = Object.freeze({ ACOMPANHAR: 'acompanhar', ESQUECER: 'esquecer', APAGAR_TUDO: 'apagarTudo', CONFIRMOU: 'confirmou' });
  const SO_A_MARCA = Object.freeze({ envios: [], apagarFrases: true });

  function proximo(gravado, evento) {
    const marcado = Boolean(gravado?.apagarFrases);
    switch (evento.tipo) {
      case EVENTO.ACOMPANHAR: return { envios: evento.envios, ...(marcado ? { apagarFrases: true } : {}) };
      case EVENTO.ESQUECER: return marcado ? { ...SO_A_MARCA } : null;
      case EVENTO.APAGAR_TUDO: return { ...SO_A_MARCA };
      case EVENTO.CONFIRMOU: return gravado?.envios?.length ? { envios: gravado.envios } : null;
      default: return gravado ?? null;
    }
  }

  function criar(storage) {
    const ler = async () => (await storage.get({ [CHAVE]: null }))[CHAVE];

    async function mudar(tipo, { envios, seAinda } = {}) {
      const depois = proximo(await ler(), { tipo, envios });
      if (seAinda && !seAinda()) return;
      if (depois) await storage.set({ [CHAVE]: depois });
      else await storage.remove(CHAVE);
    }

    return { ler, mudar };
  }

  raiz.EnvioGravado = Object.freeze({ CHAVE, EVENTO, proximo, criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
