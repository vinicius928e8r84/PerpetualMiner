// @ts-check
'use strict';

const { createActor, setup, types } = require('xstate');

/** @typedef {{ id: string, jobId: string | null }} Envio */

const remessa = setup({
  schemas: {
    context: /** @type {typeof types<{ envios: Envio[], semNoticia: boolean }>} */ (types)(),
    events: {
      enviar: /** @type {typeof types<{ ids: number[] }>} */ (types)(),
      apagarTudo: /** @type {typeof types<{}>} */ (types)(),
      responder: /** @type {typeof types<{ tentar?: 'en' | 'ru' }>} */ (types)(),
    },
  },
});

const certa = remessa.createMachine({
  context: { envios: [], semNoticia: false },
  initial: 'parada',
  states: {
    parada: {
      on: {
        enviar: ({ event }) => ({ target: 'criando', context: { envios: event.ids.map(id => ({ id: String(id), jobId: null })) } }),
      },
    },
    criando: { on: { apagarTudo: { target: 'parada' } } },
    resumo: { on: { responder: ({ event }) => (event.tentar ? { target: 'criando' } : { target: 'parada' }) } },
  },
});

const ator = createActor(certa).start();
ator.send({ type: 'enviar', ids: [1] });
// @ts-expect-error
ator.send({ type: 'envair', ids: [1] });
// @ts-expect-error
ator.send({ type: 'enviar' });
// @ts-expect-error
ator.send({ type: 'responder', tentar: 'de' });

const instantaneo = ator.getSnapshot();
instantaneo.matches('parada');
// @ts-expect-error
instantaneo.matches('prada');
// @ts-expect-error
instantaneo.can({ type: 'envair' });
// @ts-expect-error
instantaneo.context.remessa;

remessa.createMachine({
  context: { envios: [], semNoticia: false },
  initial: 'parada',
  states: {
    parada: {
      on: {
        // @ts-expect-error
        envair: { target: 'criando' },
      },
    },
    criando: {},
  },
});

remessa.createMachine({
  context: { envios: [], semNoticia: false },
  initial: 'parada',
  states: {
    parada: {
      on: {
        // @ts-expect-error
        apagarTudo: () => ({ context: { semNoticia: 'sim' } }),
      },
    },
  },
});

remessa
  // @ts-expect-error
  .createMachine({
    context: { envios: [], semNoticia: false },
    initial: 'parada',
    states: {
      parada: { on: { apagarTudo: { target: 'prada' } } },
    },
  });
