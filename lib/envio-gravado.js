'use strict';

// O que a extensão guarda do Envio ao Anki (`pm_envio`), e o único lugar que grava essa chave. O valor é um de quatro:
//
//   nada                                    nenhum Envio acompanhado
//   { envios }                              a remessa que o painel acompanha
//   { envios, apagarFrases: true }          idem, com um Apagar tudo (CFG-17) que a Conexão ainda não confirmou
//   { envios: [], apagarFrases: true }      só o Apagar tudo por confirmar
//
// e muda por quatro eventos (`proximo`, sem tela nem storage; a prova é `node test_estado_do_envio.js`):
//
//   acompanhar { envios }   o painel grava a remessa; a marca do Apagar tudo, se há, fica
//   esquecer                o painel deixa de acompanhar; a marca fica
//   apagarTudo              a marca entra e os Envios saem
//   confirmou               a Conexão confirmou o Apagar tudo: a marca sai; um Envio criado no meio fica
//
// Quem usa: painel-envio.js, painel-envio-apagar.js e, no service worker, lib/apagar-frases-pendente.js.

(function (raiz) {
  const CHAVE = 'pm_envio';
  const EVENTO = Object.freeze({ ACOMPANHAR: 'acompanhar', ESQUECER: 'esquecer', APAGAR_TUDO: 'apagarTudo', CONFIRMOU: 'confirmou' });
  const SO_A_MARCA = Object.freeze({ envios: [], apagarFrases: true });

  /** O valor guardado depois de `evento` (`null`: nada guardado). */
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

  /** `storage` é o `chrome.storage.local` (o teste entra com o dele). */
  function criar(storage) {
    const ler = async () => (await storage.get({ [CHAVE]: null }))[CHAVE];

    /** Lê, aplica o evento e grava. `seAinda()` é perguntado depois da leitura: falso, nada é gravado (o Apagar tudo veio no meio). */
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
