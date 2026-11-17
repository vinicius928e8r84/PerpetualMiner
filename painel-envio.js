'use strict';

(function (raiz) {
  const INTERVALO = 2000;

  const { textoDaVoz, Veio, Shell, ConexaoAnki, EnvioApagarFrases, ehRussa, AjustesDeEnvio, PedidoAoAnki, CartaoDoEnvio, EnvioComOAnkiFechado, SituacaoDoEnvio, FaseDaRemessa, EnvioGravado } = raiz;
  const { ETAPAS, nomeDoIdioma } = CartaoDoEnvio;
  const { FASE, EVENTO } = FaseDaRemessa;
  const { AREAS_DO_PAINEL } = Shell;
  const { ENDERECO: ENDERECO_DA_CONEXAO, SITUACAO: CONEXAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);
  const gravado = EnvioGravado.criar(chrome.storage.local);
  const pedir = pedido => PedidoAoAnki.pedir(ENDERECO_DA_CONEXAO, pedido, { signal: AbortSignal.timeout(FaseDaRemessa.PRAZO_DO_PEDIDO_MS) });
  const { montarCartao } = CartaoDoEnvio.criar({
    situacaoDe,
    estadoDoJob,
    esquecerOEnvio,
    falhaAoRetomar: envio => envio.jobId && falhasAoRetomar.get(envio.jobId),
    tentarCriarDeNovo,
    continuarEnvio,
    redesenhar: () => desenharProgresso(),
  });

  let doPainel = null;
  let ankiFechado = null;
  let aguardandoOAbridor = null;
  let remessa = null;
  const jobs = new Map();
  const falhasAoRetomar = new Map();
  let fase = FASE.PARADA;
  const desconhecidos = new Set();
  const retomando = new Set();
  let desistiuDasPendencias = false;
  let semNoticia = false;
  let conexaoDesligada = false;
  let relogio = null;
  let progresso = null;
  let resumo = null;
  const despachar = (tipo, dados) => { fase = FaseDaRemessa.proxima(fase, { tipo, ...dados }); };
  let respostaDoResumo = null;
  const assinaturas = new Map();

  async function usar(operacoes) {
    if (doPainel) return;
    doPainel = operacoes;
    porId('btn-send-anki').addEventListener('click', () => enviar());
    porId('modal-envio-fechar').addEventListener('click', () => progresso?.fechar());
    porId('modal-resumo-fechar').addEventListener('click', () => resumo?.fechar());
    porId('btn-resumo-manter').addEventListener('click', () => resumo?.fechar());
    porId('btn-resumo-apagar').addEventListener('click', () => responderResumo('apagar'));
    chrome.storage.onChanged.addListener((mudancas, area) => {
      const nova = mudancas[EnvioGravado.CHAVE]?.newValue;
      if (area === 'local' && nova?.apagarFrases && !nova.envios?.length && remessa) encerrarOAcompanhamento();
    });
    ConexaoAnki.acompanhar(situacao => {
      mostrarConexao(situacao);
      if (situacao !== CONEXAO.DESLIGADA) EnvioApagarFrases.pedir();
    });
    ankiFechado = EnvioComOAnkiFechado.criar({ aoLigar: aoLigarOAnki });
    for (const area of AREAS_DO_PAINEL) Shell.aoEntrarNaArea(area, tentarAbrirResumo);

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
    let resposta;
    try {
      resposta = await pedir(PedidoAoAnki.criarEnvio(envio.corpo));
    } catch (erro) {
      envio.falhaAoCriar = { semResposta: true, causa: `POST /jobs → ${erro.message || erro}` };
      return;
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !dados.jobId) {
      envio.falhaAoCriar = { semResposta: false, causa: `POST /jobs → HTTP ${resposta.status} · ${dados.error || ''}`.trim() };
      return;
    }
    envio.jobId = dados.jobId;
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
    tentarAbrirResumo();
  }

  async function lerJobs() {
    try {
      const resposta = await pedir(PedidoAoAnki.listarEnvios());
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const lista = (await resposta.json()).jobs || [];
      const porJob = new Map(lista.map(job => [job.jobId, job]));
      for (const envio of remessa?.envios || []) {
        if (!envio.jobId) continue;
        const job = porJob.get(envio.jobId);
        desconhecidos[job ? 'delete' : 'add'](envio.jobId);
        if (job) jobs.set(envio.jobId, job);
        else jobs.delete(envio.jobId);
      }
      semNoticia = false;
    } catch {
      semNoticia = true;
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
    if (resumo) responderResumo('descartar');
  }

  function largarARemessa() {
    remessa = null;
    desistiuDasPendencias = false;
    jobs.clear();
    desconhecidos.clear();
    falhasAoRetomar.clear();
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
      setTimeout(tentarAbrirResumo, 0);
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
    assinaturas.delete(envio.id);
    porId('modal-envio-lista').querySelector(`[data-envio="${envio.id}"]`)?.remove();
    if (!remessa.envios.length) return progresso ? progresso.fechar() : aoFecharProgresso();
    await gravar();
    desenharProgresso();
    tentarAbrirResumo();
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

  async function retomar(envio) {
    const { jobId } = envio;
    try {
      const resposta = await pedir(PedidoAoAnki.tentarEnvioDeNovo(jobId));
      const job = jobs.get(jobId);
      falhasAoRetomar.delete(jobId);
      // 409: as Frases dele foram apagadas na Conexão.
      if (resposta.status === 409) {
        jobs.set(jobId, { ...job, state: { ...job?.state, wiped: true } });
        return false;
      }
      if (!resposta.ok) throw new Error(`POST /jobs/retry ${jobId} → HTTP ${resposta.status}`);
      if (SituacaoDoEnvio.retomavel(situacaoDe(envio))) jobs.set(jobId, { ...job, status: 'queued', state: { ...job?.state, status: 'queued', stage: 'queued', progress: {}, lastError: null, ankiError: null } });
      return true;
    } catch (erro) {
      falhasAoRetomar.set(jobId, String(erro.message || erro));
      return false;
    }
  }

  function prontoParaResumo() {
    if (!remessa || fase !== FASE.ACOMPANHANDO) return false;
    return remessa.envios.some(e => e.jobId && !foraDoResumo(e)) && remessa.envios.every(terminou);
  }

  function outroModalAberto() {
    const scrims = [...document.querySelectorAll('.veio-scrim:not([hidden])')]
      .filter(s => s.id !== 'modal-envio' && s.id !== 'modal-resumo');
    return scrims.length > 0;
  }

  function tentarAbrirResumo() {
    if (!AREAS_DO_PAINEL.includes(Shell.areaAtual())) return;
    if (outroModalAberto()) return;
    if (!prontoParaResumo()) {
      if (remessa?.envios.some(foraDoResumo) && remessa.envios.every(terminou) && !progresso && !desistiuDasPendencias) abrirProgresso();
      return;
    }
    if (remessa.envios.some(pendente) && !desistiuDasPendencias) {
      if (!progresso) abrirProgresso();
      return;
    }
    if (progresso) progresso.fechar();

    const idiomas = SituacaoDoEnvio.contagemPorIdioma(remessa.envios, situacaoDe, estadoDoJob);
    const enviadas = idiomas.flatMap(i => i.enviadas);
    const duplicadas = idiomas.flatMap(i => i.duplicadas);
    const falhas = idiomas.reduce((soma, i) => soma + i.falhas, 0);
    const total = idiomas.reduce((soma, i) => soma + i.total, 0);
    porId('modal-resumo-titulo').textContent = textoDaVoz(falhas ? 'ENV-10.tituloEmParte' : 'ENV-10.titulo');
    porId('modal-resumo-detalhe').textContent = textoDaVoz('ENV-10.detalhe', { n: total, baralhos: idiomas.length });
    porId('modal-resumo-baralhos').replaceChildren(...idiomas.map(idioma => CartaoDoEnvio.montarBlocoDoResumo(idioma, lang => responderResumo({ tentar: lang }))));

    const aTirar = doPainel.frasesPorId(enviadas).length;
    const jaApagadas = enviadas.length - aTirar;
    porId('modal-resumo-pergunta').textContent = aTirar === 0 ? textoDaVoz('ENV-10.nadaParaTirar')
      : aTirar === 1 ? textoDaVoz('ENV-10.perguntaUma') : textoDaVoz('ENV-10.pergunta', { n: aTirar });
    const ajuda = [
      aTirar === 0 ? '' : textoDaVoz(aTirar === 1 ? 'ENV-10.ajudaUma' : 'ENV-10.ajuda'),
      jaApagadas ? textoDaVoz('ENV-10.jaApagadas', { n: jaApagadas }) : '',
    ].filter(Boolean).join(' ');
    porId('modal-resumo-ajuda').textContent = ajuda;
    porId('modal-resumo-ajuda').hidden = !ajuda;

    const tirar = porId('btn-resumo-apagar');
    const manter = porId('btn-resumo-manter');
    tirar.hidden = aTirar === 0;
    manter.textContent = textoDaVoz(aTirar === 0 ? 'ENV-10.pronto' : 'ENV-10.manter');
    tirar.toggleAttribute('data-foco-seguro', aTirar > 0);
    manter.toggleAttribute('data-foco-seguro', aTirar === 0);

    respostaDoResumo = null;
    const escolhas = { enviadas, duplicadas };
    despachar(EVENTO.RESUMIR);
    resumo = Veio.abrirModal(porId('modal-resumo'), { aoFechar: () => aoFecharResumo(escolhas) });
  }

  function responderResumo(resposta) {
    respostaDoResumo = resposta;
    resumo?.fechar();
  }

  async function aoFecharResumo({ enviadas, duplicadas }) {
    resumo = null;
    const resposta = respostaDoResumo;
    respostaDoResumo = null;

    if (resposta === 'descartar') return;
    despachar(EVENTO.RESPONDER, { tentar: Boolean(resposta?.tentar) });
    if (resposta?.tentar) {
      await tentarDeNovoOIdioma(resposta.tentar);
      return;
    }
    await esquecer();
    if (resposta === 'apagar') {
      const aindaAqui = doPainel.frasesPorId(enviadas).map(f => f.id);
      await doPainel.marcarComoEnviadas(duplicadas);
      await doPainel.apagar(aindaAqui);
      if (aindaAqui.length) Veio.mostrarToastDeSucesso(textoDaVoz('ENV-11', { n: aindaAqui.length }));
    } else {
      await doPainel.marcarComoEnviadas([...enviadas, ...duplicadas]);
    }
  }

  function tentarDeNovoOIdioma(lang) {
    abrirProgresso();
    return recomecar(async () => {
      for (const envio of [...remessa.envios]) {
        if (envio.lang !== lang || foraDoResumo(envio)) continue;
        if (!envio.jobId) await criarEnvio(envio);
        else if (SituacaoDoEnvio.retomavel(situacaoDe(envio))) await retomar(envio);
        const estado = estadoDoJob(envio);
        if (estado && terminou(envio) && !SituacaoDoEnvio.retomavel(situacaoDe(envio))) await CartaoDoEnvio.recriar(remessa, envio, estado, criarEnvio);
      }
    });
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
