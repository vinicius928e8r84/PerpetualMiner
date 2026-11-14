'use strict';

// As duas máquinas de estado do Envio ao Anki no painel, sem tela e sem pedidos. `painel-envio.js` guarda os fatos e manda os eventos;
// `painel-envio-cartao.js` desenha a situação. Prova sem navegador: `node test_estado_do_envio.js`.
//
// 1. `SituacaoDoEnvio`: o que um Envio é agora, um estado de uma lista fechada, a partir do que o painel sabe dele (`envio`), do que a
//    Conexão disse (`job`) e do contexto (`desconhecido`, `ankiFechado`, `agora`):
//
//      criando        o pedido saiu e a Conexão ainda não respondeu (não é “Na fila”: ninguém o recebeu)
//      naoComecou     o pedido não deu: `causa` é `semResposta`, `erro` ou `ajustes`            → Tentar de novo
//      desconhecido   a Conexão responde e não conhece o Envio (#245)                           → Esquecer
//      naFila         a Conexão o tem e ainda não começou
//      andando        `etapa` (a do Cartão que está sendo feito) e `feitos` de `total` Cartões
//      parado         o Anki fechou no meio (#151)                                              → Continuar envio
//      esperando      `espera`: `plano` (#158), `teto` (#160), `outroPerfil` ou `perfilSumiu` (#149), `anki` (5 min sem resposta, #246)
//      concluido      tudo virou cartão
//      emParte        parte virou cartão; `motivo` é o código da Conexão                        → o que a tabela dos motivos diz
//      naoConcluido   nada virou cartão; `motivo`, idem
//      apagado        o Apagar tudo de outro navegador parou o Envio na Conexão: nada a retomar                 → Esquecer
//
//    `doCodigo(codigo)` é a tabela dos motivos, uma só para o cartão, o resumo e a Boas-vindas (`painel-boas-vindas-envio.js`): a frase
//    (o ID no catálogo da Voz) e a ajuda que resolve.
//
// 2. `FaseDaRemessa`: `parada → criando → acompanhando → resumo → parada`. Todo pedido dela à Conexão tem prazo (`PRAZO_DO_PEDIDO_MS`): vencido o de criar, o Envio fica
//    “não começou · sem resposta”, que tem Tentar de novo. O Apagar tudo leva qualquer fase a `parada`. Um evento que a fase não aceita
//    não a muda (`aceita`), então quem age pergunta à fase em vez de conferir variáveis soltas.

(function (raiz) {
  const ESTADO = Object.freeze({
    CRIANDO: 'criando', NAO_COMECOU: 'naoComecou', DESCONHECIDO: 'desconhecido', NA_FILA: 'naFila', ANDANDO: 'andando', PARADO: 'parado',
    ESPERANDO: 'esperando', CONCLUIDO: 'concluido', EM_PARTE: 'emParte', NAO_CONCLUIDO: 'naoConcluido', APAGADO: 'apagado',
  });
  const ESPERA = Object.freeze({ PLANO: 'plano', TETO: 'teto', OUTRO_PERFIL: 'outroPerfil', PERFIL_SUMIU: 'perfilSumiu', ANKI: 'anki' });
  /** O `waiting.reason` da Conexão → a espera. */
  const ESPERA_DO_MOTIVO = Object.freeze({ plan_limit: ESPERA.PLANO, monthly_cap: ESPERA.TETO, other_profile: ESPERA.OUTRO_PERFIL, profile_missing: ESPERA.PERFIL_SUMIU });
  const FIM = Object.freeze({ completed: ESTADO.CONCLUIDO, partial: ESTADO.EM_PARTE, failed: ESTADO.NAO_CONCLUIDO });
  /** Passado este tempo em `wait_anki` sem motivo de perfil, o cartão diz o que fazer (ENV-22, #246); o Envio segue esperando. */
  const ESPERA_ATE_ORIENTAR_MS = 5 * 60 * 1000;
  const FRASES_APAGADAS = 'frases_apagadas';

  function situacaoDoEnvio(envio, job, { desconhecido = false, ankiFechado = false, agora = Date.now() } = {}) {
    if (!envio.jobId) {
      const falha = envio.falhaAoCriar;
      if (!falha) return { estado: ESTADO.CRIANDO };
      return { estado: ESTADO.NAO_COMECOU, causa: falha.motivo ? 'ajustes' : falha.semResposta ? 'semResposta' : 'erro' };
    }
    if (desconhecido) return { estado: ESTADO.DESCONHECIDO };
    const { status = 'queued', stage = 'queued', waiting, lastError, wiped, progress, updatedAt } = job || {};
    if (lastError === FRASES_APAGADAS) return { estado: ESTADO.APAGADO };
    if (status === 'completed') return { estado: ESTADO.CONCLUIDO };
    // Terminado e só depois apagado: o que entrou continua contado, e o que não entrou só vai num Envio novo (`apagadas`).
    if (FIM[status]) return { estado: FIM[status], motivo: lastError || null, ...(wiped ? { apagadas: true } : {}) };
    const andamento = { etapa: stage, feitos: Number(progress?.done) || 0, total: Number(progress?.total) || 0 };
    if (ankiFechado) return { estado: ESTADO.PARADO, ...andamento };
    const espera = ESPERA_DO_MOTIVO[waiting?.reason];
    if (espera) return { estado: ESTADO.ESPERANDO, espera, ...andamento };
    if (status === 'queued') return { estado: ESTADO.NA_FILA, ...andamento };
    if (stage === 'wait_anki' && !waiting && agora - Date.parse(updatedAt) >= ESPERA_ATE_ORIENTAR_MS) return { estado: ESTADO.ESPERANDO, espera: ESPERA.ANKI, ...andamento };
    return { estado: ESTADO.ANDANDO, ...andamento };
  }

  const RETOMAVEIS = [ESTADO.EM_PARTE, ESTADO.NAO_CONCLUIDO];
  const FINAIS = [ESTADO.NAO_COMECOU, ESTADO.DESCONHECIDO, ESTADO.CONCLUIDO, ESTADO.APAGADO, ...RETOMAVEIS];
  /** Nada mais anda sozinho neste Envio (terminou, ou nem começou). */
  const terminou = situacao => FINAIS.includes(situacao.estado);
  /** Terminou sem tudo virar cartão, e a Conexão retoma de onde parou (sem as Frases, ela não retoma nada). */
  const retomavel = situacao => RETOMAVEIS.includes(situacao.estado) && !situacao.apagadas;
  /** O resumo não conta este Envio: a Conexão não o conhece, ou as Frases dele foram apagadas. O cartão oferece Esquecer. */
  const foraDoResumo = situacao => situacao.estado === ESTADO.DESCONHECIDO || situacao.estado === ESTADO.APAGADO;

  const comoNumeros = lista => new Set((lista || []).map(Number));
  /**
   * O desfecho de cada idioma, para o resumo: o que virou cartão (`enviadas`), o que já estava lá (`duplicadas`), quantas não entraram
   * (`falhas`) e o motivo (`codigo`, o do primeiro Envio que tem um). `situacaoDe(envio)` e `estadoDoJob(envio)` são os de painel-envio.js.
   */
  function contagemPorIdioma(envios, situacaoDe, estadoDoJob) {
    const porLang = new Map();
    for (const envio of envios) {
      if (foraDoResumo(situacaoDe(envio))) continue;
      if (!porLang.has(envio.lang)) porLang.set(envio.lang, { lang: envio.lang, baralho: envio.baralho, total: 0, enviadas: [], duplicadas: [], falhas: 0 });
      const idioma = porLang.get(envio.lang);
      idioma.baralho = idioma.baralho || envio.baralho;
      idioma.total += envio.ids.length;
      const estado = (envio.jobId && estadoDoJob(envio)) || {};
      idioma.codigo ||= estado.lastError;
      const [sucesso, falha, dup] = [estado.successfulPhraseIds, estado.failedPhraseIds, estado.duplicatePhraseIds].map(comoNumeros);
      for (const id of envio.ids) {
        // Na dúvida, a frase fica: uma que a Conexão dá também como falha não é apagada.
        if (!sucesso.has(Number(id)) || falha.has(Number(id))) idioma.falhas += 1;
        else if (dup.has(Number(id))) idioma.duplicadas.push(id);
        else idioma.enviadas.push(id);
      }
    }
    return ['en', 'ru'].filter(lang => porLang.has(lang)).map(lang => porLang.get(lang));
  }

  const AJUDA = Object.freeze({ TENTAR: 'tentar', TROCAR_A_CHAVE: 'trocarAChave', USAR_A_CHAVE: 'usarAChave', ESCOLHER_QUEM_PAGA: 'escolherQuemPaga', GERENCIAR_USO: 'gerenciarUso' });
  const daVoz = id => (id && !id.includes('.') ? `ONB-23.${id}` : id);
  /** Uma linha da tabela: `fala` (a frase, na Boas-vindas), `noPainel` (a do cartão e do resumo; null: nada a dizer), `ajuda` (a ação do painel) e `chave` (na Boas-vindas, Trocar a chave pode resolver). */
  const motivo = (fala, ajuda, { noPainel = fala, chave = ajuda !== AJUDA.TENTAR } = {}) => Object.freeze({ fala: daVoz(fala), noPainel: daVoz(noPainel), ajuda, chave });
  const DA_OPENAI = motivo('motivoOpenAI', AJUDA.TENTAR);
  // O plano do ChatGPT que recusou o pedido: o painel não diz o motivo, e só resta tentar de novo.
  const DO_CHATGPT = motivo('motivoChatGPT', AJUDA.TENTAR, { noPainel: null, chave: true });
  // Sem motivo conhecido: Trocar a chave aparece na Boas-vindas porque pode ser ela.
  const SEM_MOTIVO = motivo('motivoOutro', AJUDA.TENTAR, { noPainel: null, chave: true });
  /** O código de erro da Conexão (`lastError` do Envio ou `error` do Cartão) → a frase do motivo e a ajuda. */
  const MOTIVOS = Object.freeze({
    openai_key_missing: motivo('motivoSemChave', AJUDA.TROCAR_A_CHAVE),
    openai_key_rejected: motivo('motivoChaveRecusada', AJUDA.TROCAR_A_CHAVE),
    openai_no_credit: motivo('motivoSemCredito', AJUDA.TROCAR_A_CHAVE),
    openai_rate_limited: DA_OPENAI,
    openai_unreachable: DA_OPENAI,
    generation_error: DA_OPENAI,
    empty_response: DA_OPENAI,
    // O login acabou: o Envio para e não gasta a chave sozinho, nem no Tentar de novo; a pessoa escolhe no card da IA (entrar de novo, ou a chave).
    chatgpt_signed_out: motivo('motivoChatGPT', AJUDA.ESCOLHER_QUEM_PAGA, { noPainel: 'CFG-46.noEnvio' }),
    chatgpt_rejected: DO_CHATGPT,
    // A conta que o plano não atende leva à chave; o limite de uso (o primeiro 429 logo depois de entrar também chega assim), a Gerenciar uso (#156).
    chatgpt_not_eligible: motivo('motivoChatGPT', AJUDA.USAR_A_CHAVE, { noPainel: 'CFG-35.erroChatgptNaoServe' }),
    chatgpt_usage_limit: motivo('motivoOutro', AJUDA.GERENCIAR_USO, { noPainel: 'ENV-20.limite' }),
    note_type_missing: motivo('motivoTipoDeNota', AJUDA.TENTAR),
    anki_write_failed: motivo('motivoAnki', AJUDA.TENTAR),
  });
  const doCodigo = codigo => (Object.hasOwn(MOTIVOS, codigo ?? '') ? MOTIVOS[codigo] : SEM_MOTIVO);

  raiz.SituacaoDoEnvio = Object.freeze({ ESTADO, ESPERA, AJUDA, situacaoDoEnvio, terminou, retomavel, foraDoResumo, contagemPorIdioma, doCodigo });

  const FASE = Object.freeze({ PARADA: 'parada', CRIANDO: 'criando', ACOMPANHANDO: 'acompanhando', RESUMO: 'resumo' });
  const EVENTO = Object.freeze({
    CRIAR: 'criar',              // um Enviar ao Anki, um Tentar de novo ou o pedido sem resposta de antes da recarga
    CRIOU: 'criou',              // { sobrou }: os pedidos terminaram (respondidos, recusados ou com o prazo vencido); `sobrou`: há o que acompanhar
    RESUMIR: 'resumir',          // nada mais anda: o resumo abre
    RESPONDER: 'responder',      // { tentar }: o resumo fechou; `tentar`: com Tentar de novo (a remessa segue)
    ESQUECER: 'esquecer',        // não há mais o que acompanhar
    APAGAR_TUDO: 'apagarTudo',   // o Apagar tudo (CFG-17), nesta aba ou em outra
  });
  /** O que um pedido da remessa à Conexão (criar, retomar, listar) tem para responder: vencido, é um pedido sem resposta. */
  const PRAZO_DO_PEDIDO_MS = 10 * 1000;
  const TRANSICOES = Object.freeze({
    [FASE.PARADA]: { [EVENTO.CRIAR]: () => FASE.CRIANDO },
    [FASE.CRIANDO]: { [EVENTO.CRIOU]: ({ sobrou }) => (sobrou ? FASE.ACOMPANHANDO : FASE.PARADA) },
    [FASE.ACOMPANHANDO]: { [EVENTO.CRIAR]: () => FASE.CRIANDO, [EVENTO.RESUMIR]: () => FASE.RESUMO, [EVENTO.ESQUECER]: () => FASE.PARADA },
    [FASE.RESUMO]: { [EVENTO.RESPONDER]: ({ tentar }) => (tentar ? FASE.ACOMPANHANDO : FASE.PARADA) },
  });

  const aceita = (fase, tipo) => tipo === EVENTO.APAGAR_TUDO || Object.hasOwn(TRANSICOES[fase], tipo);
  /** A fase depois de `evento` (`{ tipo, … }`); a mesma quando a fase não o aceita. */
  function proxima(fase, evento) {
    if (evento.tipo === EVENTO.APAGAR_TUDO) return FASE.PARADA;
    return aceita(fase, evento.tipo) ? TRANSICOES[fase][evento.tipo](evento) : fase;
  }

  raiz.FaseDaRemessa = Object.freeze({ FASE, EVENTO, PRAZO_DO_PEDIDO_MS, proxima, aceita });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
