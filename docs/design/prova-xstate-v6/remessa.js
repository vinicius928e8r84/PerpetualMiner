'use strict';

(function (raiz) {
  const { setup, createAsyncLogic, createActor } = globalThis.XState;
  const { SituacaoDoEnvio } = raiz;

  const INTERVALO_MS = 2000;
  const NA_FILA = Object.freeze({ status: 'queued', state: { status: 'queued', stage: 'queued' } });
  const DA_REMESSA = Object.freeze({
    envios: [], jobs: {}, desconhecidos: [], falhasAoRetomar: {}, fila: [], aRetomar: [],
    semNoticia: false, desistiu: false, progressoAberto: false, sobraSempre: false, resumo: null,
  });

  function estadoDoJob(contexto, envio) {
    const job = contexto.jobs[envio.jobId];
    return job ? { status: job.state?.status || job.status, ...job.state } : null;
  }
  const situacaoDe = (contexto, envio) => SituacaoDoEnvio.situacaoDoEnvio(envio, estadoDoJob(contexto, envio), {
    desconhecido: contexto.desconhecidos.includes(envio.jobId), ankiFechado: contexto.ankiFechado, agora: 0,
  });
  const terminou = contexto => envio => SituacaoDoEnvio.terminou(situacaoDe(contexto, envio));
  const foraDoResumo = contexto => envio => SituacaoDoEnvio.foraDoResumo(situacaoDe(contexto, envio));
  const retomavel = contexto => envio => SituacaoDoEnvio.retomavel(situacaoDe(contexto, envio));
  const pendente = contexto => envio => Boolean(envio.falhaAoCriar)
    || Boolean(envio.jobId && (contexto.falhasAoRetomar[envio.jobId] || foraDoResumo(contexto)(envio)));
  const prontaParaOResumo = contexto => contexto.envios.some(e => e.jobId && !foraDoResumo(contexto)(e)) && contexto.envios.every(terminou(contexto));

  function resumoDe(contexto) {
    const idiomas = SituacaoDoEnvio.contagemPorIdioma(contexto.envios, envio => situacaoDe(contexto, envio), envio => estadoDoJob(contexto, envio));
    return { idiomas, enviadas: idiomas.flatMap(i => i.enviadas), duplicadas: idiomas.flatMap(i => i.duplicadas) };
  }

  const trocar = (envios, id, mudanca) => envios.map(envio => (envio.id === id ? { ...envio, ...mudanca } : envio));
  const semAChave = (objeto, chave) => Object.fromEntries(Object.entries(objeto).filter(([k]) => k !== chave));
  const aGuardar = envios => envios.filter(e => e.jobId || e.falhaAoCriar || e.corpo);

  function comOsNovos(contexto, { frases, ids, agora }) {
    const acompanhadas = new Set(contexto.envios.flatMap(e => e.ids));
    const novas = frases.filter(frase => !acompanhadas.has(frase.id));
    const novos = ['en', 'ru']
      .map(lang => ({ lang, frases: novas.filter(frase => frase.lang === lang) }))
      .filter(grupo => grupo.frases.length)
      .map(grupo => ({
        id: ids[grupo.lang], lang: grupo.lang, ids: grupo.frases.map(f => f.id), linhas: grupo.frases.map(f => f.linha),
        jobId: null, criadoEm: agora, falhaAoCriar: null,
      }));
    return { novas, novos };
  }

  function criarMaquina({ conexao, ajustes, guardar, agora = Date.now }) {
    const gravar = contexto => () => guardar.gravar(aGuardar(contexto.envios));

    return setup({
      actors: {
        prepararEnvio: createAsyncLogic({
          run: async ({ input: envio }) => {
            let preset;
            try {
              preset = (await ajustes.ler())[envio.lang];
            } catch (erro) {
              return { falhaAoCriar: { motivo: 'ENV-03.motivoAjustes', causa: String(erro.message || erro) } };
            }
            return {
              criadoEm: agora(),
              baralho: preset.deckName,
              corpo: {
                jobId: envio.id, lang: envio.lang, deckName: preset.deckName, imageSource: preset.imageSource,
                entries: envio.ids.map((phraseId, i) => ({ phraseId, line: envio.linhas[i] })),
              },
            };
          },
        }),
        gravarEnvios: createAsyncLogic({ run: ({ input: envios }) => guardar.gravar(aGuardar(envios)) }),
        pedirEnvio: createAsyncLogic({ run: ({ input: corpo, signal }) => conexao.criar(corpo, { signal }) }),
        lerJobs: createAsyncLogic({ run: ({ signal }) => conexao.listar({ signal }) }),
        retomarEnvio: createAsyncLogic({
          run: async ({ input: jobId, signal }) => ({ jobId, ...await conexao.retomar(jobId, { signal }) }),
        }),
      },
    }).createMachine({
      id: 'remessa',
      context: ({ input }) => {
        const envios = input?.guardada?.envios?.some(e => e.jobId || e.corpo) ? input.guardada.envios : [];
        return {
          ...DA_REMESSA, ankiFechado: false, telaLivre: true, envios,
          fila: envios.filter(e => !e.jobId && !e.falhaAoCriar && e.corpo).map(e => e.id), sobraSempre: envios.length > 0,
        };
      },
      initial: 'inicio',
      on: {
        apagarTudo: (_, enq) => {
          enq(() => guardar.apagarTudo());
          return { target: '.parada', context: DA_REMESSA };
        },
        conexao: ({ event }) => ({ context: { ankiFechado: event.ankiFechado } }),
        tela: ({ event }) => ({ context: { telaLivre: event.livre } }),
        retomou: ({ context, event }, enq) => {
          if (event.desfecho === 'retomado') enq.emit({ type: 'retomado', jobId: event.jobId });
          return { context: aposRetomar(context, event) };
        },
      },
      states: {
        inicio: {
          type: 'choice',
          choice: ({ context }) => (context.envios.length ? { target: 'criando' } : { target: 'parada' }),
        },

        parada: {
          on: {
            enviar: ({ context, event }) => {
              const { novos } = comOsNovos(context, event);
              if (!novos.length) return undefined;
              return { target: 'criando', context: { envios: novos, fila: novos.map(e => e.id), progressoAberto: true, desistiu: false } };
            },
          },
        },

        criando: {
          initial: 'escolhendo',
          on: {
            fechouProgresso: { context: { progressoAberto: false } },
            esquecerOEnvio: ({ context, event }) => ({
              context: { envios: context.envios.filter(e => e.id !== event.id), fila: context.fila.filter(id => id !== event.id) },
            }),
          },
          onDone: ({ context }, enq) => {
            if (context.sobraSempre || context.progressoAberto || context.envios.some(e => e.jobId)) {
              enq(gravar(context));
              return { target: 'acompanhando', context: { sobraSempre: false } };
            }
            enq(() => guardar.esquecer());
            return { target: 'parada', context: DA_REMESSA };
          },
          states: {
            escolhendo: {
              type: 'choice',
              choice: ({ context }) => {
                const envio = context.envios.find(e => e.id === context.fila[0]);
                if (envio) return { target: envio.corpo ? 'pedindo' : 'preparando' };
                if (context.aRetomar.length) return { target: 'retomando' };
                return { target: 'criado' };
              },
            },
            preparando: {
              invoke: {
                src: 'prepararEnvio',
                input: ({ context }) => context.envios.find(e => e.id === context.fila[0]),
                onDone: ({ context, event }) => {
                  const envios = trocar(context.envios, context.fila[0], event.output);
                  if (event.output.falhaAoCriar) return { target: 'escolhendo', context: { envios, fila: context.fila.slice(1) } };
                  return { target: 'gravando', context: { envios } };
                },
              },
            },
            gravando: {
              invoke: {
                src: 'gravarEnvios',
                input: ({ context }) => context.envios,
                onDone: { target: 'pedindo' },
                onError: ({ context, event }) => ({
                  target: 'escolhendo',
                  context: {
                    envios: trocar(context.envios, context.fila[0], { falhaAoCriar: { semResposta: false, causa: `guardar → ${event.error?.message || event.error}` } }),
                    fila: context.fila.slice(1),
                  },
                }),
              },
            },
            pedindo: {
              invoke: {
                src: 'pedirEnvio',
                input: ({ context }) => context.envios.find(e => e.id === context.fila[0]).corpo,
                onDone: ({ context, event }, enq) => {
                  const { jobId, falha } = event.output;
                  const proximo = {
                    envios: trocar(context.envios, context.fila[0], jobId ? { jobId, falhaAoCriar: null } : { falhaAoCriar: falha }),
                    jobs: jobId ? { ...context.jobs, [jobId]: { jobId, ...NA_FILA } } : context.jobs,
                    fila: context.fila.slice(1),
                  };
                  enq(gravar(proximo));
                  return { target: 'escolhendo', context: proximo };
                },
              },
            },
            retomando: {
              invoke: {
                src: 'retomarEnvio',
                input: ({ context }) => context.aRetomar[0],
                onDone: ({ context, event }) => ({
                  target: 'escolhendo',
                  context: { ...aposRetomar(context, event.output), aRetomar: context.aRetomar.slice(1) },
                }),
              },
            },
            criado: { type: 'final' },
          },
        },

        acompanhando: {
          initial: 'conferindo',
          always: ({ context }) => {
            if (!context.telaLivre) return undefined;
            const todosTerminaram = context.envios.every(terminou(context));
            const haPendente = context.envios.some(pendente(context));
            if (!prontaParaOResumo(context)) {
              const soSobrouOQueFicaDeFora = context.envios.some(foraDoResumo(context)) && todosTerminaram;
              return soSobrouOQueFicaDeFora && !context.progressoAberto && !context.desistiu ? { context: { progressoAberto: true } } : undefined;
            }
            if (haPendente && !context.desistiu) return context.progressoAberto ? undefined : { context: { progressoAberto: true } };
            return { target: 'resumo', context: { progressoAberto: false, resumo: resumoDe(context) } };
          },
          on: {
            enviar: ({ context, event }) => {
              const { novas, novos } = comOsNovos(context, event);
              if (!novas.length) return { context: { progressoAberto: true } };
              return {
                target: 'criando',
                context: { envios: [...context.envios, ...novos], fila: novos.map(e => e.id), progressoAberto: true, desistiu: false },
              };
            },
            tentarCriarDeNovo: ({ context, event }) => ({
              target: 'criando',
              context: { envios: trocar(context.envios, event.id, { falhaAoCriar: null }), fila: [event.id], sobraSempre: true, desistiu: false },
            }),
            continuar: ({ event, children }, enq) => {
              const id = `retomar:${event.jobId}`;
              if (children[id]) return undefined;
              const crianca = enq.spawn('retomarEnvio', { id, input: event.jobId });
              enq.subscribeTo(crianca, { done: saida => ({ type: 'retomou', ...saida }) });
              return { context: { desistiu: false } };
            },
            esquecerOEnvio: ({ context, event }, enq) => {
              const esquecido = context.envios.find(e => e.id === event.id);
              const envios = context.envios.filter(e => e !== esquecido);
              if (!envios.length) {
                enq(() => guardar.esquecer());
                return { target: 'parada', context: DA_REMESSA };
              }
              const proximo = {
                envios,
                jobs: semAChave(context.jobs, esquecido?.jobId),
                desconhecidos: context.desconhecidos.filter(jobId => jobId !== esquecido?.jobId),
              };
              enq(gravar(proximo));
              return { context: proximo };
            },
            fechouProgresso: ({ context }, enq) => {
              if (!context.envios.some(e => e.jobId)) {
                enq(() => guardar.esquecer());
                return { target: 'parada', context: DA_REMESSA };
              }
              const desistiu = context.envios.every(terminou(context)) && context.envios.some(pendente(context));
              return { context: { progressoAberto: false, desistiu: context.desistiu || desistiu } };
            },
          },
          states: {
            conferindo: {
              type: 'choice',
              choice: ({ context }) => (context.envios.some(e => e.jobId && !terminou(context)(e)) ? { target: 'lendo' } : { target: 'esperando' }),
            },
            lendo: {
              invoke: {
                src: 'lerJobs',
                onDone: ({ context, event }) => {
                  const lidos = event.output.jobs;
                  if (!lidos) return { target: 'esperando', context: { semNoticia: true } };
                  const porJob = new Map(lidos.map(job => [job.jobId, job]));
                  const comJob = context.envios.filter(e => e.jobId).map(e => e.jobId);
                  return {
                    target: 'esperando',
                    context: {
                      semNoticia: false,
                      jobs: Object.fromEntries(comJob.filter(jobId => porJob.has(jobId)).map(jobId => [jobId, porJob.get(jobId)])),
                      desconhecidos: comJob.filter(jobId => !porJob.has(jobId)),
                    },
                  };
                },
                onError: { target: 'esperando', context: { semNoticia: true } },
              },
            },
            esperando: { after: { [INTERVALO_MS]: { target: 'conferindo' } } },
          },
        },

        resumo: {
          on: {
            responder: ({ context, event }, enq) => {
              if (event.tentar) {
                const doIdioma = context.envios.filter(e => e.lang === event.tentar && !foraDoResumo(context)(e));
                return {
                  target: 'criando',
                  context: {
                    resumo: null, progressoAberto: true, desistiu: false, sobraSempre: true,
                    envios: context.envios.map(e => (doIdioma.includes(e) && !e.jobId ? { ...e, falhaAoCriar: null } : e)),
                    fila: doIdioma.filter(e => !e.jobId).map(e => e.id),
                    aRetomar: doIdioma.filter(e => e.jobId && retomavel(context)(e)).map(e => e.jobId),
                  },
                };
              }
              enq(() => guardar.esquecer());
              enq.emit({ type: 'respondida', apagar: event.apagar === true, enviadas: context.resumo.enviadas, duplicadas: context.resumo.duplicadas });
              return { target: 'parada', context: DA_REMESSA };
            },
          },
        },
      },
    });
  }

  function aposRetomar(contexto, { jobId, desfecho, causa }) {
    const job = contexto.jobs[jobId];
    const falhasAoRetomar = semAChave(contexto.falhasAoRetomar, jobId);
    if (desfecho === 'apagadas') return { falhasAoRetomar, jobs: { ...contexto.jobs, [jobId]: { ...job, state: { ...job?.state, wiped: true } } } };
    if (desfecho === 'falhou') return { falhasAoRetomar: { ...falhasAoRetomar, [jobId]: causa } };
    const envio = contexto.envios.find(e => e.jobId === jobId);
    if (!envio || !retomavel(contexto)(envio)) return { falhasAoRetomar };
    const naFila = { ...job, status: 'queued', state: { ...job?.state, status: 'queued', stage: 'queued', progress: {}, lastError: null, ankiError: null } };
    return { falhasAoRetomar, jobs: { ...contexto.jobs, [jobId]: naFila } };
  }

  function criar(portas, opcoes = {}) {
    const ator = createActor(criarMaquina(portas), opcoes);
    const visao = () => {
      const { value, context } = ator.getSnapshot();
      return {
        fase: typeof value === 'string' ? value : Object.keys(value)[0],
        passo: typeof value === 'string' ? null : Object.values(value)[0],
        ...context,
        situacoes: Object.fromEntries(context.envios.map(envio => [envio.id, situacaoDe(context, envio)])),
      };
    };
    return { ator, visao, enviar: (frases, ids) => ator.send({ type: 'enviar', frases, ids, agora: (portas.agora || Date.now)() }) };
  }

  raiz.RemessaXState = Object.freeze({ INTERVALO_MS, criarMaquina, criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
