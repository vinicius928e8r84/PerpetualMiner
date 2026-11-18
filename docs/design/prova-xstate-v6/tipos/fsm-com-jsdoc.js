// @ts-check
'use strict';

const { setup, types } = require('xstate/fsm');

const maquina = setup({
  schemas: {
    events: {
      criar: /** @type {typeof types<{}>} */ (types)(),
      criou: /** @type {typeof types<{ sobrou: boolean }>} */ (types)(),
    },
  },
}).createFSM({
  initial: 'parada',
  states: {
    parada: {
      on: {
        criar: { target: 'criando' },
        // @ts-expect-error
        cirar: { target: 'criando' },
      },
    },
    criando: {
      on: {
        criou: ({ event }) => ({ target: event.sobrou ? 'acompanhando' : 'parada' }),
      },
    },
    acompanhando: {
      on: {
        // @ts-expect-error
        criar: { target: 'crinado' },
      },
    },
  },
});

maquina.transition(maquina.initialState, { type: 'criar' });
// @ts-expect-error
maquina.transition(maquina.initialState, { type: 'cirar' });
// @ts-expect-error
maquina.transition(maquina.initialState, { type: 'criou' });
