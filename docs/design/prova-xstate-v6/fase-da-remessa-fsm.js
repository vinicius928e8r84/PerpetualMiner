'use strict';

(function (raiz) {
  const { createFSM } = globalThis.XStateFSM;

  const FASE = Object.freeze({ PARADA: 'parada', CRIANDO: 'criando', ACOMPANHANDO: 'acompanhando', RESUMO: 'resumo' });
  const EVENTO = Object.freeze({
    CRIAR: 'criar',
    CRIOU: 'criou',
    RESUMIR: 'resumir',
    RESPONDER: 'responder',
    ESQUECER: 'esquecer',
    APAGAR_TUDO: 'apagarTudo',
  });
  const PRAZO_DO_PEDIDO_MS = 10 * 1000;

  const paraAParada = { target: FASE.PARADA };
  const maquina = createFSM({
    id: 'faseDaRemessa',
    initial: FASE.PARADA,
    states: {
      [FASE.PARADA]: {
        on: { [EVENTO.CRIAR]: { target: FASE.CRIANDO }, [EVENTO.APAGAR_TUDO]: paraAParada },
      },
      [FASE.CRIANDO]: {
        on: {
          [EVENTO.CRIOU]: ({ event }) => ({ target: event.sobrou ? FASE.ACOMPANHANDO : FASE.PARADA }),
          [EVENTO.APAGAR_TUDO]: paraAParada,
        },
      },
      [FASE.ACOMPANHANDO]: {
        on: {
          [EVENTO.CRIAR]: { target: FASE.CRIANDO },
          [EVENTO.RESUMIR]: { target: FASE.RESUMO },
          [EVENTO.ESQUECER]: paraAParada,
          [EVENTO.APAGAR_TUDO]: paraAParada,
        },
      },
      [FASE.RESUMO]: {
        on: {
          [EVENTO.RESPONDER]: ({ event }) => ({ target: event.tentar ? FASE.ACOMPANHANDO : FASE.PARADA }),
          [EVENTO.APAGAR_TUDO]: paraAParada,
        },
      },
    },
  });

  const naFase = fase => ({ ...maquina.initialState, value: fase });
  const aceita = (fase, tipo) => Object.hasOwn(maquina.config.states[fase].on, tipo);
  const proxima = (fase, evento) => maquina.transition(naFase(fase), { ...evento, type: evento.tipo })[0].value;

  raiz.FaseDaRemessaFSM = Object.freeze({ FASE, EVENTO, PRAZO_DO_PEDIDO_MS, proxima, aceita, maquina });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
