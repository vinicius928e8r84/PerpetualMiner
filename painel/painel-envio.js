'use strict';

(function (raiz) {
  const INTERVALO = 2000;

  const { textoDaVoz, Veio, Shell, ConexaoAnki, ConversaComOAnki, EnvioApagarFrases, ehRussa, AjustesDeEnvio, PedidoAoAnki, CartaoDoEnvio, EnvioComOAnkiFechado, SituacaoDoEnvio, FaseDaRemessa, EnvioGravado, EnvioAcompanhado, ResumoDoEnvio } = raiz;
  const { ETAPAS, nomeDoIdioma } = CartaoDoEnvio;
  const { FASE, EVENTO } = FaseDaRemessa;
  const { AREAS_DO_PAINEL } = Shell;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const { MOTIVO } = ConversaComOAnki;
  const porId = id => document.getElementById(id);
  const gravado = EnvioGravado.criar(chrome.storage.local);
  const pedir = (pedido, formato) => ConversaComOAnki.pedir(pedido, { prazoMs: FaseDaRemessa.PRAZO_DO_PEDIDO_MS, formato });
  const daRemessa = { pedir: (pedido, { formato } = {}) => pedir(pedido, formato) };
  const { montarCartao } = CartaoDoEnvio.criar({
    situacaoDe,
    estadoDoJob,
    esquecerOEnvio,
    falhaAoRetomar: envio => envio.jobId && falhasAoRetomar.get(envio.jobId),
    tentarCriarDeNovo,
    continuarEnvio,
    pedirAChave: envio => acompanhado(envio.jobId).usarAChave(),
    redesenhar: () => desenharProgresso(),
  });

  let doPainel = null;
  let ankiFechado = null;
  let aguardandoOAbridor = null;
  let remessa = null;
  const jobs = new Map();
  const falhasAoRetomar = new Map();
  const acompanhados = new Map();
  let fase = FASE.PARADA;
  const desconhecidos = new Set();
  const retomando = new Set();
  let desistiuDasPendencias = false;
  let semNoticia = false;
  let conexaoDesligada = false;
  let relogio = null;
  let progresso = null;
  const despachar = (tipo, dados) => { fase = FaseDaRemessa.proxima(fase, { tipo, ...dados }); };
  const assinaturas = new Map();

  async function usar(operacoes) {
    if (doPainel) return;
    doPainel = operacoes;
    porId('btn-send-anki').addEventListener('click', () => enviar());
    porId('modal-envio-fechar').addEventListener('click', () => progresso?.fechar());
    porId('modal-resumo-fechar').addEventListener('click', () => resumoDoEnvio.fechar());
    porId('btn-resumo-manter').addEventListener('click', () => resumoDoEnvio.fechar());
    porId('btn-resumo-apagar').addEventListener('click', () => resumoDoEnvio.responder(ResumoDoEnvio.RESPOSTA.APAGAR));
    chrome.storage.onChanged.addListener((mudancas, area) => {
      const nova = mudancas[EnvioGravado.CHAVE]?.newValue;
      if (area === 'local' && nova?.apagarFrases && !nova.envios?.length && remessa) encerrarOAcompanhamento();
    });
    ConexaoAnki.acompanhar(situacao => {
      mostrarConexao(situacao);
      if (situacao !== CONEXAO.DESLIGADA) EnvioApagarFrases.pedir();
    });
    ankiFechado = EnvioComOAnkiFechado.criar({ aoLigar: aoLigarOAnki });
    for (const area of AREAS_DO_PAINEL) Shell.aoEntrarNaArea(area, resumoDoEnvio.tentarAbrir);

    const guardada = await gravado.ler();
    if (!remessa && guardada?.envios?.some(e => e.jobId || e.corpo)) {
      remessa = guardada;
      await criarOsEnvios(remessa.envios.filter(e => !e.jobId && !e.falhaAoCriar && e.corpo));
      acompanhar();
    }
  }

  async function criarOsEnvios(envios, sobrou = () => true) {
    const estaRemessa = remessa;
    despachar(EVENTO.CRIAR);
    try {
      for (const envio of envios) {
        if (remessa !== estaRemessa) break;
        await criarEnvio(envio);
        await gravar();
      }
    } finally {
      if (remessa === estaRemessa) despachar(EVENTO.CRIOU, { sobrou: sobrou() });
    }
    return remessa === estaRemessa;
  }

  function aoLigarOAnki(ids) {
    const envio = aguardandoOAbridor;
    aguardandoOAbridor = null;
    return envio?.ids === ids && remessa?.envios.includes(envio) ? recomecar(() => criarEnvio(envio)) : enviar(ids);
  }

  async function enviar(ids) {
    if (!doPainel || !FaseDaRemessa.aceita(fase, EVENTO.CRIAR)) return;
    const acompanhadas = new Set((remessa?.envios || []).flatMap(e => e.ids));
    const novas = (ids ? doPainel.frasesPorId(ids) : doPainel.selecionadas()).filter(f => !acompanhadas.has(f.id));
    if (conexaoDesligada && novas.length) return ConexaoAnki.jaConectou() ? ankiFechado.pedir(novas.map(f => f.id)) : undefined;
    if (novas.length === 0) {
      if (remessa) abrirProgresso();
      return;
    }

    const porLang = { en: [], ru: [] };
    for (const frase of novas) porLang[ehRussa(frase) ? 'ru' : 'en'].push(frase.id);
    const envios = ['en', 'ru']
      .filter(lang => porLang[lang].length)
      .map(lang => ({ id: crypto.randomUUID(), lang, ids: porLang[lang], jobId: null, criadoEm: Date.now(), falhaAoCriar: null }));

    desistiuDasPendencias = false;
    remessa = remessa || { envios: [] };
    remessa.envios.push(...envios);
    abrirProgresso();
    if (!await criarOsEnvios(envios, () => Boolean(progresso) || remessa.envios.some(e => e.jobId))) return;
    if (fase === FASE.PARADA) return esquecer();
    const semResposta = envios.find(semRespostaAoCriar);
    if (semResposta) await pedirOAnkiFechado(semResposta);
    desenharProgresso();
    acompanhar();
  }

  function semRespostaAoCriar(envio) {
    return !envio.jobId && Boolean(envio.falhaAoCriar?.semResposta);
  }

  async function criarEnvio(envio) {
    const aRemessaDoEnvio = remessa;
    envio.falhaAoCriar = null;
    if (!envio.corpo) {
      envio.criadoEm = Date.now();
      let preset;
      try {
        preset = (await AjustesDeEnvio.ler())[envio.lang];
      } catch (erro) {
        envio.falhaAoCriar = { motivo: 'ENV-03.motivoAjustes', causa: String(erro.message || erro) };
        return;
      }
      envio.baralho = preset.deckName;
      envio.corpo = {
        jobId: envio.id,
        lang: envio.lang,
        deckName: preset.deckName,
        imageSource: preset.imageSource,
        ...AjustesDeEnvio.vozENivel(preset),
        entries: doPainel.frasesPorId(envio.ids).map(frase => ({ phraseId: frase.id, line: doPainel.linha(frase) })),
      };
      await gravar();
    }
    if (remessa !== aRemessaDoEnvio) return;
    const desfecho = await pedir(PedidoAoAnki.criarEnvio(envio.corpo));
    if (desfecho.motivo === MOTIVO.SEM_RESPOSTA) {
      envio.falhaAoCriar = { semResposta: true, causa: `POST /jobs → ${desfecho.detalhes}` };
      return;
    }
    if (!desfecho.ok || !desfecho.dados.jobId) {
      envio.falhaAoCriar = { semResposta: false, causa: `POST /jobs → HTTP ${desfecho.status} · ${desfecho.dados?.error || ''}`.trim() };
      return;
    }
    envio.jobId = desfecho.dados.jobId;
    jobs.set(envio.jobId, { jobId: envio.jobId, status: 'queued', state: { status: 'queued', stage: 'queued' } });
  }

  function acompanhar() {
    if (relogio) return;
    conferirEnvios();
    relogio = setInterval(conferirEnvios, INTERVALO);
  }

  function pararDeAcompanhar() {
    clearInterval(relogio);
    relogio = null;
  }

  async function conferirEnvios() {
    if (!remessa) return pararDeAcompanhar();
    if (remessa.envios.some(e => e.jobId && !terminou(e))) {
      await lerJobs();
      raiz.TetoDoMes.atualizar();
      if (semNoticia || conexaoDesligada) ConexaoAnki.conferir();
    }
    desenharProgresso();
    resumoDoEnvio.tentarAbrir();
  }

  async function lerJobs() {
    const desfecho = await pedir(PedidoAoAnki.listarEnvios(), dados => !dados.jobs || Array.isArray(dados.jobs));
    semNoticia = !desfecho.ok;
    if (semNoticia) return;
    const porJob = new Map((desfecho.dados.jobs || []).map(job => [job.jobId, job]));
    for (const envio of remessa?.envios || []) {
      if (!envio.jobId) continue;
      const job = porJob.get(envio.jobId);
      desconhecidos[job ? 'delete' : 'add'](envio.jobId);
      if (job) jobs.set(envio.jobId, job);
      else jobs.delete(envio.jobId);
    }
  }

  function estadoDoJob(envio) {
    const job = jobs.get(envio.jobId);
    return job ? { status: job.state?.status || job.status, ...job.state } : null;
  }

  function situacaoDe(envio) {
    return SituacaoDoEnvio.situacaoDoEnvio(envio, estadoDoJob(envio), {
      desconhecido: desconhecidos.has(envio.jobId),
      ankiFechado: ConexaoAnki.situacao() === CONEXAO.DESLIGADA && ConexaoAnki.jaConectou(),
    });
  }
  const terminou = envio => SituacaoDoEnvio.terminou(situacaoDe(envio));
  const foraDoResumo = envio => SituacaoDoEnvio.foraDoResumo(situacaoDe(envio));
  const resumoDoEnvio = ResumoDoEnvio.criar({
    estado: {
      remessa: () => remessa,
      fase: () => fase,
      progresso: () => progresso,
      desistiuDasPendencias: () => desistiuDasPendencias,
      doPainel: () => doPainel,
    },
    leitura: { situacaoDe, estadoDoJob, terminou, foraDoResumo, pendente },
    acoes: { abrirProgresso, despachar, esquecer, recomecar, criarEnvio, retomar },
  });

  async function gravar() {
    const aRemessa = remessa;
    if (!aRemessa) return;
    const envios = aRemessa.envios.filter(e => e.jobId || e.falhaAoCriar || e.corpo);
    return gravado.mudar(EnvioGravado.EVENTO.ACOMPANHAR, { envios, seAinda: () => remessa === aRemessa });
  }

  async function apagarTudo() {
    encerrarOAcompanhamento();
    await gravado.mudar(EnvioGravado.EVENTO.APAGAR_TUDO);
    return EnvioApagarFrases.pedir();
  }

  function encerrarOAcompanhamento() {
    despachar(EVENTO.APAGAR_TUDO);
    largarARemessa();
    progresso?.fechar();
    resumoDoEnvio.descartarSeAberto();
  }

  function largarARemessa() {
    remessa = null;
    desistiuDasPendencias = false;
    jobs.clear();
    desconhecidos.clear();
    falhasAoRetomar.clear();
    for (const envio of acompanhados.values()) envio.largar();
    acompanhados.clear();
    pararDeAcompanhar();
  }

  function esquecer() {
    largarARemessa();
    return gravado.mudar(EnvioGravado.EVENTO.ESQUECER);
  }

  function abrirProgresso() {
    if (fase === FASE.RESUMO) return;
    desenharProgresso({ mesmoFechado: true });
    if (progresso) return;
    progresso = Veio.abrirModal(porId('modal-envio'), { aoFechar: aoFecharProgresso });
  }

  function aoFecharProgresso() {
    progresso = null;
    assinaturas.clear();
    porId('modal-envio-lista').textContent = '';
    if (!remessa || fase !== FASE.ACOMPANHANDO) return;
    if (!remessa.envios.some(e => e.jobId)) {
      despachar(EVENTO.ESQUECER);
      return esquecer();
    }
    if (remessa.envios.every(terminou) && remessa.envios.some(pendente)) {
      desistiuDasPendencias = true;
      setTimeout(resumoDoEnvio.tentarAbrir, 0);
    }
  }

  function pendente(envio) {
    return Boolean(envio.falhaAoCriar) || Boolean(envio.jobId && (falhasAoRetomar.has(envio.jobId) || foraDoResumo(envio)));
  }

  function desenharProgresso({ mesmoFechado = false } = {}) {
    if (!remessa || (!progresso && !mesmoFechado)) return;
    const { envios } = remessa;
    const idiomas = new Intl.ListFormat('pt-BR', { type: 'conjunction' })
      .format([...new Set(envios.map(e => nomeDoIdioma(e.lang)))]);
    porId('modal-envio-detalhe').textContent = textoDaVoz('ENV-06.detalhe', { n: envios.length, idiomas });
    porId('modal-envio-sem-noticia').hidden = !semNoticia || conexaoDesligada;

    const lista = porId('modal-envio-lista');
    for (const envio of envios) {
      const chave = envio.id;
      const cartao = montarCartao(envio);
      const assinatura = cartao.dataset.assinatura;
      const atual = lista.querySelector(`[data-envio="${chave}"]`);
      cartao.dataset.envio = chave;
      if (atual && assinaturas.get(chave) === assinatura) continue;
      const focoDentro = atual?.contains(document.activeElement) ? document.activeElement.dataset.foco : null;
      if (atual) atual.replaceWith(cartao);
      else lista.append(cartao);
      assinaturas.set(chave, assinatura);
      if (focoDentro) cartao.querySelector(`[data-foco="${focoDentro}"]`)?.focus();
    }
  }

  async function esquecerOEnvio(envio) {
    if (!remessa) return;
    remessa.envios = remessa.envios.filter(e => e !== envio);
    desconhecidos.delete(envio.jobId);
    jobs.delete(envio.jobId);
    acompanhados.get(envio.jobId)?.largar();
    acompanhados.delete(envio.jobId);
    assinaturas.delete(envio.id);
    porId('modal-envio-lista').querySelector(`[data-envio="${envio.id}"]`)?.remove();
    if (!remessa.envios.length) return progresso ? progresso.fechar() : aoFecharProgresso();
    await gravar();
    desenharProgresso();
    resumoDoEnvio.tentarAbrir();
  }

  async function tentarCriarDeNovo(envio) {
    if (!FaseDaRemessa.aceita(fase, EVENTO.CRIAR)) return;
    if (await pedirOAnkiFechado(envio)) return;
    return recomecar(() => criarEnvio(envio));
  }

  async function pedirOAnkiFechado(envio) {
    if (!semRespostaAoCriar(envio) || await ConexaoAnki.conferir() !== CONEXAO.DESLIGADA || !ConexaoAnki.jaConectou()) return false;
    if (remessa?.envios.includes(envio)) {
      aguardandoOAbridor = envio;
      await ankiFechado.pedir(envio.ids);
    }
    return true;
  }

  async function recomecar(passo) {
    if (!FaseDaRemessa.aceita(fase, EVENTO.CRIAR)) return;
    const estaRemessa = remessa;
    despachar(EVENTO.CRIAR);
    desistiuDasPendencias = false;
    try {
      await passo();
    } finally {
      if (remessa === estaRemessa) despachar(EVENTO.CRIOU, { sobrou: true });
    }
    await gravar();
    desenharProgresso();
    acompanhar();
  }

  async function continuarEnvio(envio) {
    if (retomando.has(envio.jobId)) return;
    retomando.add(envio.jobId);
    desistiuDasPendencias = false;
    const ok = await retomar(envio).finally(() => retomando.delete(envio.jobId));
    if (ok) Veio.mostrarToastDeSucesso(textoDaVoz('ENV-14.sucesso'));
    desenharProgresso();
    acompanhar();
  }

  function acompanhado(jobId) {
    if (!acompanhados.has(jobId)) acompanhados.set(jobId, EnvioAcompanhado.acompanhar({ jobId }, { conversa: daRemessa, lerSozinho: false }));
    return acompanhados.get(jobId);
  }

  async function retomar(envio) {
    const { jobId } = envio;
    const desfecho = await acompanhado(jobId).tentarDeNovo();
    const job = jobs.get(jobId);
    if (desfecho.falha) {
      falhasAoRetomar.set(jobId, desfecho.falha);
      return false;
    }
    falhasAoRetomar.delete(jobId);
    if (desfecho.apagado) {
      jobs.set(jobId, { ...job, state: { ...job?.state, wiped: true } });
      return false;
    }
    if (SituacaoDoEnvio.retomavel(situacaoDe(envio))) jobs.set(jobId, { ...job, status: 'queued', state: { ...job?.state, status: 'queued', stage: 'queued', progress: {}, lastError: null, ankiError: null } });
    return true;
  }

  function mostrarConexao(situacao) {
    conexaoDesligada = situacao === CONEXAO.DESLIGADA;
    const enviarAoAnki = porId('btn-send-anki');
    const dica = porId('envio-indisponivel');
    dica.textContent = textoDaVoz('PAI-32.enviarIndisponivel');
    if (conexaoDesligada && !ConexaoAnki.jaConectou()) {
      enviarAoAnki.setAttribute('aria-disabled', 'true');
      enviarAoAnki.setAttribute('aria-describedby', dica.id);
    } else {
      enviarAoAnki.removeAttribute('aria-disabled');
      enviarAoAnki.removeAttribute('aria-describedby');
    }
  }

  function nomeDaEtapa(stage) {
    return ETAPAS.find(([etapa]) => etapa === stage)?.[1] || null;
  }

  raiz.Envio = { usar, nomeDaEtapa, apagarTudo };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
