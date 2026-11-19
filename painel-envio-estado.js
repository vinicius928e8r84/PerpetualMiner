'use strict';

(function (raiz) {
  const ESTADO = Object.freeze({
    CRIANDO: 'criando', NAO_COMECOU: 'naoComecou', DESCONHECIDO: 'desconhecido', NA_FILA: 'naFila', ANDANDO: 'andando', PARADO: 'parado',
    ESPERANDO: 'esperando', CONCLUIDO: 'concluido', EM_PARTE: 'emParte', NAO_CONCLUIDO: 'naoConcluido', APAGADO: 'apagado',
  });
  const ESPERA = Object.freeze({ PLANO: 'plano', TETO: 'teto', OUTRO_PERFIL: 'outroPerfil', PERFIL_SUMIU: 'perfilSumiu', ANKI: 'anki' });
  const ESPERA_DO_MOTIVO = Object.freeze({ plan_limit: ESPERA.PLANO, monthly_cap: ESPERA.TETO, other_profile: ESPERA.OUTRO_PERFIL, profile_missing: ESPERA.PERFIL_SUMIU });
  const FIM = Object.freeze({ completed: ESTADO.CONCLUIDO, partial: ESTADO.EM_PARTE, failed: ESTADO.NAO_CONCLUIDO });
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
  const terminou = situacao => FINAIS.includes(situacao.estado);
  const retomavel = situacao => RETOMAVEIS.includes(situacao.estado) && !situacao.apagadas;
  const foraDoResumo = situacao => situacao.estado === ESTADO.DESCONHECIDO || situacao.estado === ESTADO.APAGADO;

  const comoNumeros = lista => new Set((lista || []).map(Number));
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
        if (!sucesso.has(Number(id)) || falha.has(Number(id))) idioma.falhas += 1;
        else if (dup.has(Number(id))) idioma.duplicadas.push(id);
        else idioma.enviadas.push(id);
      }
    }
    return ['en', 'ru'].filter(lang => porLang.has(lang)).map(lang => porLang.get(lang));
  }

  const AJUDA = Object.freeze({ TENTAR: 'tentar', TROCAR_A_CHAVE: 'trocarAChave', USAR_A_CHAVE: 'usarAChave', ESCOLHER_QUEM_PAGA: 'escolherQuemPaga', GERENCIAR_USO: 'gerenciarUso' });
  const daVoz = id => (id && !id.includes('.') ? `ONB-23.${id}` : id);
  const motivo = (fala, ajuda, { noPainel = fala, chave = ajuda !== AJUDA.TENTAR } = {}) => Object.freeze({ fala: daVoz(fala), noPainel: daVoz(noPainel), ajuda, chave });
  const DA_OPENAI = motivo('motivoOpenAI', AJUDA.TENTAR);
  const DO_CHATGPT = motivo('motivoChatGPT', AJUDA.TENTAR, { noPainel: null, chave: true });
  const SEM_MOTIVO = motivo('motivoOutro', AJUDA.TENTAR, { noPainel: null, chave: true });
  const MOTIVOS = Object.freeze({
    openai_key_missing: motivo('motivoSemChave', AJUDA.TROCAR_A_CHAVE),
    openai_key_rejected: motivo('motivoChaveRecusada', AJUDA.TROCAR_A_CHAVE),
    openai_no_credit: motivo('motivoSemCredito', AJUDA.TROCAR_A_CHAVE),
    openai_rate_limited: DA_OPENAI,
    openai_unreachable: DA_OPENAI,
    generation_error: DA_OPENAI,
    empty_response: DA_OPENAI,
    chatgpt_signed_out: motivo('motivoChatGPT', AJUDA.ESCOLHER_QUEM_PAGA, { noPainel: 'CFG-46.noEnvio' }),
    chatgpt_rejected: DO_CHATGPT,
    chatgpt_not_eligible: motivo('motivoChatGPT', AJUDA.USAR_A_CHAVE, { noPainel: 'CFG-35.erroChatgptNaoServe' }),
    chatgpt_usage_limit: motivo('motivoOutro', AJUDA.GERENCIAR_USO, { noPainel: 'ENV-20.limite' }),
    note_type_missing: motivo('motivoTipoDeNota', AJUDA.TENTAR),
    anki_write_failed: motivo('motivoAnki', AJUDA.TENTAR),
    keyword_missing: motivo('motivoSemPalavra', AJUDA.TENTAR),
  });
  const doCodigo = codigo => (Object.hasOwn(MOTIVOS, codigo ?? '') ? MOTIVOS[codigo] : SEM_MOTIVO);

  raiz.SituacaoDoEnvio = Object.freeze({ ESTADO, ESPERA, AJUDA, situacaoDoEnvio, terminou, retomavel, foraDoResumo, contagemPorIdioma, doCodigo });

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
  const TRANSICOES = Object.freeze({
    [FASE.PARADA]: { [EVENTO.CRIAR]: () => FASE.CRIANDO },
    [FASE.CRIANDO]: { [EVENTO.CRIOU]: ({ sobrou }) => (sobrou ? FASE.ACOMPANHANDO : FASE.PARADA) },
    [FASE.ACOMPANHANDO]: { [EVENTO.CRIAR]: () => FASE.CRIANDO, [EVENTO.RESUMIR]: () => FASE.RESUMO, [EVENTO.ESQUECER]: () => FASE.PARADA },
    [FASE.RESUMO]: { [EVENTO.RESPONDER]: ({ tentar }) => (tentar ? FASE.ACOMPANHANDO : FASE.PARADA) },
  });

  const aceita = (fase, tipo) => tipo === EVENTO.APAGAR_TUDO || Object.hasOwn(TRANSICOES[fase], tipo);
  function proxima(fase, evento) {
    if (evento.tipo === EVENTO.APAGAR_TUDO) return FASE.PARADA;
    return aceita(fase, evento.tipo) ? TRANSICOES[fase][evento.tipo](evento) : fase;
  }

  raiz.FaseDaRemessa = Object.freeze({ FASE, EVENTO, PRAZO_DO_PEDIDO_MS, proxima, aceita });

  const INTERVALO_DA_LEITURA_MS = 2000;
  const TERMINOU_SEM_CHEGAR = ['failed', 'partial'];
  const esperarOIntervalo = ms => new Promise(resolve => setTimeout(resolve, ms));

  function acompanhar(alvo = {}, { conversa = raiz.ConversaComOAnki, esperar = esperarOIntervalo, intervaloMs = INTERVALO_DA_LEITURA_MS, lerSozinho = true } = {}) {
    const { jobId } = alvo;
    if (typeof jobId !== 'string' || !jobId) throw new Error('EnvioAcompanhado.acompanhar pede o jobId do Envio');
    const corpo = Array.isArray(alvo.entries) ? alvo : null;
    const { PedidoAoAnki } = raiz;
    const ouvintes = new Set();
    const naoLidos = new Set();
    let criacaoEmCurso = null;
    let situacao = null;
    let lendo = false;
    let vez = 0;

    function mudarPara(nova, lido) {
      const antes = situacao;
      situacao = nova;
      if (JSON.stringify(antes) === JSON.stringify(nova)) return;
      for (const ouvinte of [...ouvintes]) ouvinte(nova, lido);
    }

    const falhaDe = (pedido, desfecho) => ({
      falha: `${pedido} ${jobId} · ${desfecho.detalhes}`,
      semResposta: desfecho.motivo === raiz.ConversaComOAnki.MOTIVO.SEM_RESPOSTA,
      status: desfecho.status,
    });

    async function ler(minha) {
      const desfecho = await conversa.pedir(PedidoAoAnki.verEnvio(jobId), { formato: dados => Boolean(dados.state) });
      if (minha !== vez) return false;
      if (desfecho.ok) mudarPara(situacaoDoEnvio({ jobId }, desfecho.dados.state), desfecho.dados.state);
      else if (desfecho.codigo === 'job_not_found') mudarPara(situacaoDoEnvio({ jobId }, null, { desconhecido: true }), null);
      else {
        for (const ouvinte of [...naoLidos]) ouvinte(falhaDe('POST /jobs/get', desfecho));
        return false;
      }
      return true;
    }

    async function seguir() {
      if (lendo) return;
      lendo = true;
      const minha = vez;
      try {
        for (;;) {
          const leu = await ler(minha);
          if (minha !== vez || (leu && terminou(situacao))) return;
          await esperar(intervaloMs);
          if (minha !== vez) return;
        }
      } finally {
        if (minha === vez) lendo = false;
      }
    }

    async function pedirESeguir(pedido, recusa) {
      const minha = vez;
      const desfecho = await conversa.pedir(pedido);
      if (desfecho.ok) {
        if (lerSozinho && minha === vez) seguir();
        return { ok: true };
      }
      if (desfecho.codigo === recusa.codigo) return { ...recusa.desfecho };
      return { falha: `${pedido.metodo} ${pedido.caminho} ${jobId} · ${desfecho.detalhes}` };
    }

    function umPedidoPorVez(pedir) {
      let emCurso = null;
      return () => (emCurso ||= pedir().finally(() => { emCurso = null; }));
    }

    const tentarDeNovo = umPedidoPorVez(() => pedirESeguir(PedidoAoAnki.tentarEnvioDeNovo(jobId), { codigo: 'job_wiped', desfecho: { apagado: true } }));
    const usarAChave = umPedidoPorVez(() => pedirESeguir(PedidoAoAnki.usarAChaveNoEnvio(jobId), { codigo: 'openai_key_missing', desfecho: { semChave: true } }));

    async function pedirParaCriar() {
      const minha = vez;
      const criado = await conversa.pedir(PedidoAoAnki.criarEnvio(corpo));
      if (!criado.ok) return falhaDe('POST /jobs', criado);
      if (TERMINOU_SEM_CHEGAR.includes(criado.dados.status)) {
        const repetido = await conversa.pedir(PedidoAoAnki.tentarEnvioDeNovo(jobId));
        if (repetido.codigo === 'job_wiped') return { apagado: true };
        if (!repetido.ok) return falhaDe('POST /jobs/retry', repetido);
      }
      if (minha === vez) seguir();
      return { ok: true };
    }

    function criar() {
      if (!corpo) throw new Error('EnvioAcompanhado.criar pede o corpo do Envio (com as entries) em acompanhar');
      criacaoEmCurso ||= pedirParaCriar().finally(() => { criacaoEmCurso = null; });
      return criacaoEmCurso;
    }

    function aoMudar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    }

    function aoNaoLer(ouvinte) {
      naoLidos.add(ouvinte);
      return () => naoLidos.delete(ouvinte);
    }

    function largar() {
      vez += 1;
      lendo = false;
    }

    return Object.freeze({ criar, tentarDeNovo, usarAChave, situacao: () => situacao, aoMudar, aoNaoLer, largar });
  }

  raiz.EnvioAcompanhado = Object.freeze({ INTERVALO_MS: INTERVALO_DA_LEITURA_MS, acompanhar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
