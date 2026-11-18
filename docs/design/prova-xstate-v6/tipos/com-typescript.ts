import { createActor, setup, types } from 'xstate';

type Envio = { id: string; jobId: string | null };

const remessa = setup({
  schemas: {
    context: types<{ envios: Envio[]; semNoticia: boolean }>(),
    events: {
      enviar: types<{ ids: number[] }>(),
      apagarTudo: types<{}>(),
      responder: types<{ tentar?: 'en' | 'ru' }>(),
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
// @ts-expect-error tipo de evento que não existe
ator.send({ type: 'envair', ids: [1] });
// @ts-expect-error falta o dado do evento
ator.send({ type: 'enviar' });
// @ts-expect-error dado com o valor errado
ator.send({ type: 'responder', tentar: 'de' });

const instantaneo = ator.getSnapshot();
instantaneo.matches('parada');
// @ts-expect-error estado que não existe
instantaneo.matches('prada');
// @ts-expect-error evento que não existe
instantaneo.can({ type: 'envair' });
// @ts-expect-error campo que o contexto não tem
instantaneo.context.remessa;

remessa.createMachine({
  context: { envios: [], semNoticia: false },
  initial: 'parada',
  states: {
    parada: {
      on: {
        // @ts-expect-error evento que os schemas não declaram
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
        // @ts-expect-error campo do contexto com o tipo errado
        apagarTudo: () => ({ context: { semNoticia: 'sim' } }),
      },
    },
  },
});

remessa
  // @ts-expect-error alvo que não é um estado: o erro cai na chamada inteira, não na linha do alvo
  .createMachine({
    context: { envios: [], semNoticia: false },
    initial: 'parada',
    states: {
      parada: { on: { apagarTudo: { target: 'prada' } } },
    },
  });

remessa
  // @ts-expect-error alvo errado devolvido por uma função: também na chamada inteira
  .createMachine({
    context: { envios: [], semNoticia: false },
    initial: 'parada',
    states: {
      parada: { on: { responder: ({ event }) => (event.tentar ? { target: 'criado' } : { target: 'parada' }) } },
      criando: {},
    },
  });

remessa
  // @ts-expect-error dois erros juntos (evento e alvo): sobra um erro só, na chamada inteira, que não diz qual
  .createMachine({
    context: { envios: [], semNoticia: false },
    initial: 'parada',
    states: {
      parada: {
        on: {
          envair: { target: 'criando' },
          apagarTudo: { target: 'prada' },
        },
      },
      criando: {},
    },
  });
