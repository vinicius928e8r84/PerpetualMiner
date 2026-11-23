'use strict';

(function (raiz) {
  const CHAVE = 'pm_envio';
  const EVENTO = Object.freeze({ ACOMPANHAR: 'acompanhar', ESQUECER: 'esquecer', APAGAR_TUDO: 'apagarTudo', CONFIRMOU: 'confirmou' });
  const SO_A_MARCA = Object.freeze({ envios: [], apagarFrases: true });

  const apagarFrasesMarcado = gravado => Boolean(gravado?.apagarFrases);
  const soAMarca = () => ({ ...SO_A_MARCA });
  const mantem = gravado => gravado ?? null;
  const acompanhar = (gravado, { envios }) => ({ envios, ...(apagarFrasesMarcado(gravado) ? { apagarFrases: true } : {}) });
  const esquecer = gravado => (apagarFrasesMarcado(gravado) ? soAMarca() : null);
  const confirmou = gravado => (gravado?.envios?.length ? { envios: gravado.envios } : null);

  const TRANSICOES = new Map([
    [EVENTO.ACOMPANHAR, acompanhar],
    [EVENTO.ESQUECER, esquecer],
    [EVENTO.APAGAR_TUDO, soAMarca],
    [EVENTO.CONFIRMOU, confirmou],
  ]);

  const proximo = (gravado, evento) => (TRANSICOES.get(evento.tipo) ?? mantem)(gravado, evento);

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
