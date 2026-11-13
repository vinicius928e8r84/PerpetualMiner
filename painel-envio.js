'use strict';

// O Envio ao Anki no painel: guarda os fatos (a remessa, o que a Conexão disse de cada Envio) e manda os eventos. O que cada Envio é
// agora e em que fase a remessa está são as duas máquinas de `painel-envio-estado.js`; `pm_envio` é gravado por `lib/envio-gravado.js`.

(function (raiz) {
  /** De quanto em quanto tempo a Conexão é perguntada sobre os Envios. */
  const INTERVALO = 2000;

  const { textoDaVoz, Veio, Shell, ConexaoAnki, EnvioApagarFrases, ehRussa, AjustesDeEnvio, PedidoAoAnki, CartaoDoEnvio, EnvioComOAnkiFechado, SituacaoDoEnvio, FaseDaRemessa, EnvioGravado } = raiz;
  const { ETAPAS, nomeDoIdioma } = CartaoDoEnvio;
  const { FASE, EVENTO } = FaseDaRemessa;
  const { AREAS_DO_PAINEL } = Shell;
  const { ENDERECO: ENDERECO_DA_CONEXAO, SITUACAO: CONEXAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);
  const gravado = EnvioGravado.criar(chrome.storage.local);
  /** Todo pedido da remessa tem prazo: uma Conexão que aceita o pedido e não responde não segura a fase. */
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
  let aguardandoOAbridor = null; // o Envio sem começo que espera o abridor (#367)
  // A remessa acompanhada: { envios: [{ id, lang, ids, baralho, jobId, criadoEm, falhaAoCriar, corpo }] } (`pm_envio` leva também
  // `apagarFrases: true` até o Apagar tudo ser confirmado). `corpo`, o pedido, é gravado antes do primeiro POST e reenviado igual:
  // o `jobId` é o `id`, então é o mesmo Envio na Conexão (docs/design/envio-no-complemento.md).
  let remessa = null;
  const jobs = new Map();           // jobId → o último job lido de POST /jobs/list
  const falhasAoRetomar = new Map(); // jobId → a causa, quando Continuar envio não deu
  let fase = FASE.PARADA;           // parada → criando → acompanhando → resumo → parada
  const desconhecidos = new Set();  // jobIds que a Conexão respondeu sem conhecer (#245)
  const retomando = new Set();      // jobIds com um Continuar envio a caminho
  // Um Envio que não começou (ou não retomou) segura o resumo até a pessoa fechar o progresso.
  let desistiuDasPendencias = false;
  let semNoticia = false;
  let conexaoDesligada = false;
  let relogio = null;
  let progresso = null;             // o modal de progresso aberto ({ fechar })
  let resumo = null;                // o modal do resumo aberto
  const despachar = (tipo, dados) => { fase = FaseDaRemessa.proxima(fase, { tipo, ...dados }); };
  let respostaDoResumo = null;      // 'apagar' | 'descartar' | { tentar: lang } | null (Manter)
  const assinaturas = new Map();    // id do Envio → o que o cartão mostra agora

  async function usar(operacoes) {
    if (doPainel) return;
    doPainel = operacoes;
    porId('btn-send-anki').addEventListener('click', () => enviar());
    porId('modal-envio-fechar').addEventListener('click', () => progresso?.fechar());
    porId('modal-resumo-fechar').addEventListener('click', () => resumo?.fechar());
    porId('btn-resumo-manter').addEventListener('click', () => resumo?.fechar());
    porId('btn-resumo-apagar').addEventListener('click', () => responderResumo('apagar'));
    // O Apagar tudo em outra aba grava só a marca: esta aba também deixa de acompanhar os Envios.
    chrome.storage.onChanged.addListener((mudancas, area) => {
      const nova = mudancas[EnvioGravado.CHAVE]?.newValue;
      if (area === 'local' && nova?.apagarFrases && !nova.envios?.length && remessa) encerrarOAcompanhamento();
    });
    ConexaoAnki.acompanhar(situacao => {
      mostrarConexao(situacao);
      if (situacao !== CONEXAO.DESLIGADA) EnvioApagarFrases.pedir();
    });
    ankiFechado = EnvioComOAnkiFechado.criar({ aoLigar: aoLigarOAnki });
    // O resumo que esperou a Boas-vindas abre quando a pessoa chega ao painel.
    for (const area of AREAS_DO_PAINEL) Shell.aoEntrarNaArea(area, tentarAbrirResumo);

    const guardada = await gravado.ler();
    if (!remessa && guardada?.envios?.some(e => e.jobId || e.corpo)) {
      remessa = guardada;
      // Pedido sem resposta: o mesmo corpo de novo; a Conexão devolve o Envio que tem, ou o cria.
      await criarOsEnvios(remessa.envios.filter(e => !e.jobId && !e.falhaAoCriar && e.corpo));
      acompanhar();
    }
  }

  /** A fase `criando`: um pedido por Envio, gravado a cada um (recarregar no meio não deixa um órfão). Devolve se a remessa ainda é a mesma. */
  async function criarOsEnvios(envios, sobrou = () => true) {
    const estaRemessa = remessa;
    despachar(EVENTO.CRIAR);
    try {
      for (const envio of envios) {
        // O Apagar tudo no meio encerra a remessa: nada mais sai.
        if (remessa !== estaRemessa) break;
        await criarEnvio(envio);
        await gravar();
      }
    } finally {
      // Depois do Apagar tudo a fase já é outra (parada, ou a de uma remessa nova): este fim não é dela.
      if (remessa === estaRemessa) despachar(EVENTO.CRIOU, { sobrou: sobrou() });
    }
    return remessa === estaRemessa;
  }

  /** A Conexão respondeu: o Envio que esperava reenvia o mesmo corpo (mesmo jobId); senão é um Enviar. */
  function aoLigarOAnki(ids) {
    const envio = aguardandoOAbridor;
    aguardandoOAbridor = null;
    return envio?.ids === ids && remessa?.envios.includes(envio) ? recomecar(() => criarEnvio(envio)) : enviar(ids);
  }

  /** `ids`: as Frases que um Enviar com o Anki fechado guardou; sem eles, a seleção de agora. */
  async function enviar(ids) {
    if (!doPainel || !FaseDaRemessa.aceita(fase, EVENTO.CRIAR)) return;
    // Uma frase que já está na remessa não vai de novo: quem não começou tem o Tentar de novo dele.
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
    // ENV-05 é silêncio: o modal aberto na hora é a resposta.
    abrirProgresso();
    // Fechado sem nada ter começado: não há o que acompanhar.
    if (!await criarOsEnvios(envios, () => Boolean(progresso) || remessa.envios.some(e => e.jobId))) return;
    if (fase === FASE.PARADA) return esquecer();
    desenharProgresso();
    acompanhar();
  }

  /** Sem resposta ao `POST /jobs`. */
  function semRespostaAoCriar(envio) {
    return !envio.jobId && Boolean(envio.falhaAoCriar?.semResposta);
  }

  /** `POST /jobs` de um Envio; a causa de não começar fica no cartão (ENV-03). */
  async function criarEnvio(envio) {
    const aRemessaDoEnvio = remessa;
    envio.falhaAoCriar = null;
    if (!envio.corpo) {
      envio.criadoEm = Date.now();
      // Lidos na hora, não na abertura do painel: outra aba pode ter salvado no meio.
      let preset;
      try {
        preset = (await AjustesDeEnvio.ler())[envio.lang];
      } catch (erro) {
        envio.falhaAoCriar = { motivo: 'ENV-03.motivoAjustes', causa: String(erro.message || erro) };
        return;
      }
      // O baralho de quando o Envio foi criado: o resumo o diz, mesmo se os ajustes mudarem.
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
    // O Apagar tudo no meio encerra a remessa: as Frases não saem mais.
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

  /** Uma volta: lê os Envios na Conexão, redesenha, e abre o resumo se acabaram. */
  async function conferirEnvios() {
    if (!remessa) return pararDeAcompanhar();
    if (remessa.envios.some(e => e.jobId && !terminou(e))) {
      await lerJobs();
      raiz.TetoDoMes.atualizar();
      // O Anki fechou ou abriu: a Conexão é conferida agora, sem esperar o relógio.
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
        // Sem a Conexão conhecer o Envio, o cartão oferece Esquecer (#245).
        const job = porJob.get(envio.jobId);
        desconhecidos[job ? 'delete' : 'add'](envio.jobId);
        if (job) jobs.set(envio.jobId, job);
        else jobs.delete(envio.jobId);
      }
      semNoticia = false;
    } catch {
      // ENV-09: a leitura continua sozinha, então o texto é verdadeiro.
      semNoticia = true;
    }
  }

  function estadoDoJob(envio) {
    const job = jobs.get(envio.jobId);
    return job ? { status: job.state?.status || job.status, ...job.state } : null;
  }

  /** O que o Envio é agora (`SituacaoDoEnvio`): o cartão o desenha, e o resto daqui pergunta a ela. */
  function situacaoDe(envio) {
    return SituacaoDoEnvio.situacaoDoEnvio(envio, estadoDoJob(envio), {
      desconhecido: desconhecidos.has(envio.jobId),
      ankiFechado: ConexaoAnki.situacao() === CONEXAO.DESLIGADA && ConexaoAnki.jaConectou(),
    });
  }
  /** Terminou, ou nem começou. */
  const terminou = envio => SituacaoDoEnvio.terminou(situacaoDe(envio));
  /** A Conexão não o conhece, ou as Frases dele foram apagadas nela: o resumo não o conta, e o cartão oferece Esquecer. */
  const foraDoResumo = envio => SituacaoDoEnvio.foraDoResumo(situacaoDe(envio));

  /** Grava os Envios que já têm um pedido montado. O Apagar tudo ainda não confirmado continua marcado; vindo enquanto se lia, nada é gravado. */
  async function gravar() {
    const aRemessa = remessa;
    if (!aRemessa) return;
    const envios = aRemessa.envios.filter(e => e.jobId || e.falhaAoCriar || e.corpo);
    return gravado.mudar(EnvioGravado.EVENTO.ACOMPANHAR, { envios, seAinda: () => remessa === aRemessa });
  }

  // ─── Apagar tudo (CFG-17) ───

  /**
   * O painel deixa de acompanhar os Envios (as Frases deles não existem mais: sem resumo, sem o que reenviar) e a Conexão apaga as
   * dela (`POST /jobs/apagar-frases`) e para os Envios; em `pm_envio` fica só a marca do pedido, que sai de novo quando ela responder.
   */
  async function apagarTudo() {
    encerrarOAcompanhamento();
    await gravado.mudar(EnvioGravado.EVENTO.APAGAR_TUDO);
    return EnvioApagarFrases.pedir();
  }

  /** O painel deixa de acompanhar os Envios e fecha o que mostrava; nada é gravado nem enviado. */
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

  /** Nada mais é acompanhado (a fase já é `parada`): o guardado sai, menos a marca de um Apagar tudo por confirmar. */
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
    // Um envio que nunca começou não fica acompanhado.
    if (!remessa.envios.some(e => e.jobId)) {
      despachar(EVENTO.ESQUECER);
      return esquecer();
    }
    // Fechou com o resto terminado e um erro à vista: o resumo abre e conta o que falhou.
    if (remessa.envios.every(terminou) && remessa.envios.some(pendente)) {
      desistiuDasPendencias = true;
      setTimeout(tentarAbrirResumo, 0);
    }
  }

  /** O Envio espera uma ação da pessoa: não começou, o Continuar envio não deu, ou só resta Esquecer. */
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

  /** Esquecer (ENV-23): o Envio sai do acompanhamento; as Frases ficam no histórico. */
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

  /**
   * Tentar de novo de um Envio que não começou. Sem resposta ao POST, a Conexão é conferida antes: fora do ar, com o computador
   * já conectado, o abridor é chamado e o mesmo pedido sai quando ela responder (#367).
   */
  async function tentarCriarDeNovo(envio) {
    if (!FaseDaRemessa.aceita(fase, EVENTO.CRIAR)) return;
    if (semRespostaAoCriar(envio) && await ConexaoAnki.conferir() === CONEXAO.DESLIGADA && ConexaoAnki.jaConectou()) {
      if (!remessa?.envios.includes(envio)) return;
      aguardandoOAbridor = envio;
      return ankiFechado.pedir(envio.ids);
    }
    return recomecar(() => criarEnvio(envio));
  }

  /** Recomeça Envios: nada novo é criado no meio, e depois tudo volta a ser acompanhado. */
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

  /** Continuar envio (ENV-13): o Envio retoma de onde parou. */
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
      if (!resposta.ok) throw new Error(`POST /jobs/retry ${jobId} → HTTP ${resposta.status}`);
      falhasAoRetomar.delete(jobId);
      const job = jobs.get(jobId);
      // Como a Conexão: o erro anterior sai. Um que anda (limite do plano) fica como está.
      if (SituacaoDoEnvio.retomavel(situacaoDe(envio))) jobs.set(jobId, { ...job, status: 'queued', state: { ...job?.state, status: 'queued', stage: 'queued', progress: {}, lastError: null, ankiError: null } });
      return true;
    } catch (erro) {
      falhasAoRetomar.set(jobId, String(erro.message || erro));
      return false;
    }
  }

  /** O resumo abre quando nada anda e algum Envio chegou a começar. */
  function prontoParaResumo() {
    if (!remessa || fase !== FASE.ACOMPANHANDO) return false;
    return remessa.envios.some(e => e.jobId && !foraDoResumo(e)) && remessa.envios.every(terminou);
  }

  /** Outro modal na tela (o de progresso não conta: o resumo toma o lugar). */
  function outroModalAberto() {
    const scrims = [...document.querySelectorAll('.veio-scrim:not([hidden])')]
      .filter(s => s.id !== 'modal-envio' && s.id !== 'modal-resumo');
    return scrims.length > 0;
  }

  function tentarAbrirResumo() {
    // A Boas-vindas é a página da primeira configuração: nada abre por cima dela.
    if (!AREAS_DO_PAINEL.includes(Shell.areaAtual())) return;
    if (outroModalAberto()) return;
    if (!prontoParaResumo()) {
      if (remessa?.envios.some(foraDoResumo) && remessa.envios.every(terminou) && !progresso && !desistiuDasPendencias) abrirProgresso();
      return;
    }
    if (remessa.envios.some(pendente) && !desistiuDasPendencias) {
      // O erro de um Envio não some dentro do resumo: o progresso volta com ele à vista.
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

    // Tirar do histórico vale só para as enviadas que ainda estão lá.
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
    // O foco entra na ação principal: Tirar do histórico, ou Pronto se não há o que tirar.
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

    if (resposta === 'descartar') return; // o Apagar tudo (aqui ou em outra aba): as Frases do resumo não existem mais
    despachar(EVENTO.RESPONDER, { tentar: Boolean(resposta?.tentar) });
    if (resposta?.tentar) {
      await tentarDeNovoOIdioma(resposta.tentar);
      return;
    }
    // Manter, Pronto, × e Esc: as enviadas e as que já estavam viram Enviada ao Anki (ENV-12, sem toast).
    await esquecer();
    if (resposta === 'apagar') {
      // Conta só as que ainda estão no histórico: alguma pode ter sido apagada no meio.
      const aindaAqui = doPainel.frasesPorId(enviadas).map(f => f.id);
      await doPainel.marcarComoEnviadas(duplicadas);
      await doPainel.apagar(aindaAqui);
      if (aindaAqui.length) Veio.mostrarToastDeSucesso(textoDaVoz('ENV-11', { n: aindaAqui.length }));
    } else {
      await doPainel.marcarComoEnviadas([...enviadas, ...duplicadas]);
    }
  }

  /** Tentar de novo (ENV-10), por idioma: retoma os em parte e recria os que não começaram. */
  function tentarDeNovoOIdioma(lang) {
    abrirProgresso();
    return recomecar(async () => {
      for (const envio of [...remessa.envios]) {
        if (envio.lang !== lang || foraDoResumo(envio)) continue;
        const estado = estadoDoJob(envio);
        if (!envio.jobId) await criarEnvio(envio);
        else if (SituacaoDoEnvio.retomavel(situacaoDe(envio))) await retomar(envio);
        else if (estado && terminou(envio)) await CartaoDoEnvio.recriar(remessa, envio, estado, criarEnvio);
      }
    });
  }

  /** Desligada e nunca ligada (sem abridor): Enviar ao Anki fica `aria-disabled`, com o tooltip. */
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

  /** O nome de gente (a chave de ENV-07) da etapa `stage` do Envio, ou null. */
  function nomeDaEtapa(stage) {
    return ETAPAS.find(([etapa]) => etapa === stage)?.[1] || null;
  }

  raiz.Envio = { usar, nomeDaEtapa, apagarTudo };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
