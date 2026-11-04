'use strict';

(function (raiz) {
  const CHAVE_GRAVADA = 'pm_envio';
  /** De quanto em quanto tempo a Conexão é perguntada sobre os Envios. */
  const INTERVALO = 2000;

  const { textoDaVoz, Veio, Shell, ConexaoAnki, IDIOMAS, ehRussa, AjustesDeEnvio, PedidoAoAnki, CartaoDoEnvio, EnvioComOAnkiFechado } = raiz;
  const { ETAPAS, FIM, IDIOMA_DO_LANG, nomeDoIdioma, retomavel, botao, elemento } = CartaoDoEnvio;
  const { AREAS_DO_PAINEL } = Shell;
  const { ENDERECO: ENDERECO_DA_CONEXAO, SITUACAO: CONEXAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);
  const { montarCartao } = CartaoDoEnvio.criar({
    estadoDoJob,
    falhaAoRetomar: envio => envio.jobId && falhasAoRetomar.get(envio.jobId),
    tentarCriarDeNovo,
    continuarEnvio,
    redesenhar: () => desenharProgresso(),
  });

  let doPainel = null;
  let ankiFechado = null;
  // A remessa acompanhada: { envios: [{ id, lang, ids, baralho, jobId, criadoEm, falhaAoCriar, corpo }] } (`pm_envio` leva também
  // `apagarFrases: true` até o Apagar tudo ser confirmado). `corpo`, o pedido, é gravado antes do primeiro POST e reenviado igual:
  // o `jobId` é o `id`, então é o mesmo Envio na Conexão (docs/design/envio-no-complemento.md).
  let remessa = null;
  const jobs = new Map();           // jobId → o último job lido de POST /jobs/list
  const falhasAoRetomar = new Map(); // jobId → a causa, quando Continuar envio não deu
  let criando = false;
  const retomando = new Set();      // jobIds com um Continuar envio a caminho
  // Um Envio que não começou (ou que não deu para retomar) segura o resumo até a pessoa fechar o progresso.
  let desistiuDasPendencias = false;
  let semNoticia = false;
  let conexaoDesligada = false;
  let relogio = null;
  let progresso = null;             // o modal de progresso aberto ({ fechar })
  let resumo = null;                // o modal do resumo aberto
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
      const nova = mudancas[CHAVE_GRAVADA]?.newValue;
      if (area === 'local' && nova?.apagarFrases && !nova.envios?.length && remessa) encerrarOAcompanhamento();
    });
    ConexaoAnki.acompanhar(situacao => {
      mostrarConexao(situacao);
      if (situacao !== CONEXAO.DESLIGADA) pedirAApagarAsFrases();
    });
    ankiFechado = EnvioComOAnkiFechado.criar({ aoLigar: enviar });
    // O resumo que esperou a Boas-vindas abre quando a pessoa chega ao painel.
    for (const area of AREAS_DO_PAINEL) Shell.aoEntrarNaArea(area, tentarAbrirResumo);

    const gravado = await new Promise(r => chrome.storage.local.get({ [CHAVE_GRAVADA]: null }, r));
    if (!remessa && gravado[CHAVE_GRAVADA]?.envios?.some(e => e.jobId || e.corpo)) {
      remessa = gravado[CHAVE_GRAVADA];
      // O painel fechou com um pedido sem resposta: o mesmo corpo de novo; a Conexão devolve o Envio que tem, ou o cria.
      const semResposta = remessa.envios.filter(e => !e.jobId && !e.falhaAoCriar && e.corpo);
      if (semResposta.length) {
        const estaRemessa = remessa;
        criando = true;
        try {
          for (const envio of semResposta) {
            // O Apagar tudo no meio encerra a remessa: nada mais sai.
            if (remessa !== estaRemessa) break;
            await criarEnvio(envio);
            await gravar();
          }
        } finally {
          criando = false;
        }
      }
      acompanhar();
    }
  }

  /** `ids`: as Frases que um Enviar com o Anki fechado guardou; sem eles, a seleção de agora. */
  async function enviar(ids) {
    if (criando || !doPainel) return;
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

    criando = true;
    desistiuDasPendencias = false;
    remessa = remessa || { envios: [] };
    remessa.envios.push(...envios);
    const estaRemessa = remessa;
    // ENV-05 é silêncio: o modal aberto na hora é a resposta.
    abrirProgresso();
    try {
      // Gravado a cada Envio criado: recarregar no meio não deixa um órfão.
      for (const envio of envios) {
        // O Apagar tudo no meio encerra a remessa: nada mais sai.
        if (remessa !== estaRemessa) break;
        await criarEnvio(envio);
        await gravar();
      }
    } finally {
      criando = false;
    }
    if (remessa !== estaRemessa) return;
    // Fechado enquanto nada começou: não sobra envio para acompanhar.
    if (!progresso && !remessa.envios.some(e => e.jobId)) return esquecer();
    desenharProgresso();
    acompanhar();
  }

  /** `POST /jobs` de um Envio; se não começa, a causa fica no cartão (ENV-03). O corpo é montado uma vez e vai sempre o mesmo. */
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
        tts: AjustesDeEnvio.ttsDoEnvio(preset),
        entries: doPainel.frasesPorId(envio.ids).map(frase => ({ phraseId: frase.id, line: doPainel.linha(frase) })),
      };
      await gravar();
    }
    // O Apagar tudo no meio encerra a remessa: as Frases não saem mais.
    if (remessa !== aRemessaDoEnvio) return;
    let resposta;
    try {
      resposta = await PedidoAoAnki.pedir(ENDERECO_DA_CONEXAO, PedidoAoAnki.criarEnvio(envio.corpo));
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

  /** Uma volta do acompanhamento: lê os Envios na Conexão, redesenha, e abre o resumo se acabaram. */
  async function conferirEnvios() {
    if (!remessa) return pararDeAcompanhar();
    if (remessa.envios.some(e => e.jobId && !terminou(e))) {
      await lerJobs();
      // O Anki fechou ou abriu: a Conexão é conferida agora, sem esperar o relógio.
      if (semNoticia || conexaoDesligada) ConexaoAnki.conferir();
    }
    desenharProgresso();
    tentarAbrirResumo();
  }

  async function lerJobs() {
    try {
      const resposta = await PedidoAoAnki.pedir(ENDERECO_DA_CONEXAO, PedidoAoAnki.listarEnvios());
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const lista = (await resposta.json()).jobs || [];
      const porJob = new Map(lista.map(job => [job.jobId, job]));
      for (const envio of remessa?.envios || []) {
        if (!envio.jobId) continue;
        // Um Envio que a Conexão não conhece mais conta como não concluído.
        jobs.set(envio.jobId, porJob.get(envio.jobId) || { jobId: envio.jobId, status: 'failed', state: { status: 'failed', stage: 'failed' } });
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

  /** Terminou na Conexão, ou nem começou. */
  function terminou(envio) {
    if (!envio.jobId) return Boolean(envio.falhaAoCriar);
    const estado = estadoDoJob(envio);
    return Boolean(estado && FIM[estado.status]);
  }

  /** Grava os Envios que já têm um pedido montado (ainda sem resposta, criado ou que não começou). */
  async function gravar() {
    const aRemessa = remessa;
    if (!aRemessa) return;
    const envios = aRemessa.envios.filter(e => e.jobId || e.falhaAoCriar || e.corpo);
    // O Apagar tudo ainda não confirmado continua marcado, mesmo com um Envio novo.
    const apagarFrases = (await new Promise(r => chrome.storage.local.get({ [CHAVE_GRAVADA]: null }, r)))[CHAVE_GRAVADA]?.apagarFrases;
    // O Apagar tudo enquanto se lia: o que ele gravou fica, e estas Frases não voltam a `pm_envio`.
    if (remessa !== aRemessa) return;
    return new Promise(r => chrome.storage.local.set({ [CHAVE_GRAVADA]: { envios, ...(apagarFrases ? { apagarFrases: true } : {}) } }, r));
  }

  // ─── Apagar tudo (CFG-17) ───

  /**
   * O painel deixa de acompanhar os Envios (as Frases deles não existem mais: sem resumo, sem o que reenviar) e a Conexão apaga as
   * dela (`POST /jobs/apagar-frases`) e para os Envios; em `pm_envio` fica só a marca do pedido, que sai de novo quando ela responder.
   */
  async function apagarTudo() {
    encerrarOAcompanhamento();
    await new Promise(r => chrome.storage.local.set({ [CHAVE_GRAVADA]: { envios: [], apagarFrases: true } }, r));
    return pedirAApagarAsFrases();
  }

  /** O painel deixa de acompanhar os Envios e fecha o que mostrava deles; nada é gravado nem enviado. */
  function encerrarOAcompanhamento() {
    remessa = null;
    desistiuDasPendencias = false;
    jobs.clear();
    falhasAoRetomar.clear();
    pararDeAcompanhar();
    progresso?.fechar();
    if (resumo) responderResumo('descartar');
  }

  let apagandoAsFrases = null;
  /** Pede à Conexão o apagamento das Frases dela, se marcado; devolve se ela confirmou (ou nada havia a pedir). */
  function pedirAApagarAsFrases() {
    if (apagandoAsFrases) return apagandoAsFrases;
    apagandoAsFrases = (async () => {
      const gravado = (await new Promise(r => chrome.storage.local.get({ [CHAVE_GRAVADA]: null }, r)))[CHAVE_GRAVADA];
      if (!gravado?.apagarFrases) return true;
      try {
        const resposta = await PedidoAoAnki.pedir(ENDERECO_DA_CONEXAO, PedidoAoAnki.apagarFrasesDosEnvios());
        if (!resposta.ok) return false;
      } catch {
        return false;
      }
      const envios = gravado.envios || [];
      if (envios.length) await new Promise(r => chrome.storage.local.set({ [CHAVE_GRAVADA]: { envios } }, r));
      else await new Promise(r => chrome.storage.local.remove(CHAVE_GRAVADA, r));
      return true;
    })().finally(() => { apagandoAsFrases = null; });
    return apagandoAsFrases;
  }

  async function esquecer() {
    remessa = null;
    desistiuDasPendencias = false;
    jobs.clear();
    falhasAoRetomar.clear();
    pararDeAcompanhar();
    const apagarFrases = (await new Promise(r => chrome.storage.local.get({ [CHAVE_GRAVADA]: null }, r)))[CHAVE_GRAVADA]?.apagarFrases;
    if (apagarFrases) return new Promise(r => chrome.storage.local.set({ [CHAVE_GRAVADA]: { envios: [], apagarFrases: true } }, r));
    return new Promise(r => chrome.storage.local.remove(CHAVE_GRAVADA, r));
  }

  function abrirProgresso() {
    if (resumo) return;
    desenharProgresso({ mesmoFechado: true });
    if (progresso) return;
    progresso = Veio.abrirModal(porId('modal-envio'), { aoFechar: aoFecharProgresso });
  }

  function aoFecharProgresso() {
    progresso = null;
    assinaturas.clear();
    porId('modal-envio-lista').textContent = '';
    if (!remessa || criando) return;
    // Um envio que nunca começou não fica acompanhado: não há o que esperar.
    if (!remessa.envios.some(e => e.jobId)) return esquecer();
    // Fechou com o resto terminado e um erro à vista: o resumo abre e conta o que falhou.
    if (remessa.envios.every(terminou) && remessa.envios.some(pendente)) {
      desistiuDasPendencias = true;
      setTimeout(tentarAbrirResumo, 0);
    }
  }

  /** O Envio espera uma ação da pessoa: não começou, ou o Continuar envio não deu. */
  function pendente(envio) {
    return Boolean(envio.falhaAoCriar) || Boolean(envio.jobId && falhasAoRetomar.has(envio.jobId));
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

  function tentarCriarDeNovo(envio) {
    if (criando) return;
    return recomecar(() => criarEnvio(envio));
  }

  /** Recomeça Envios: nada novo é criado no meio, e depois tudo volta a ser acompanhado. */
  async function recomecar(passo) {
    criando = true;
    desistiuDasPendencias = false;
    try {
      await passo();
    } finally {
      criando = false;
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
    const ok = await retomar(envio.jobId).finally(() => retomando.delete(envio.jobId));
    if (ok) Veio.mostrarToastDeSucesso(textoDaVoz('ENV-14.sucesso'));
    desenharProgresso();
    acompanhar();
  }

  async function retomar(jobId) {
    try {
      const resposta = await PedidoAoAnki.pedir(ENDERECO_DA_CONEXAO, PedidoAoAnki.tentarEnvioDeNovo(jobId));
      if (!resposta.ok) throw new Error(`POST /jobs/retry ${jobId} → HTTP ${resposta.status}`);
      falhasAoRetomar.delete(jobId);
      const job = jobs.get(jobId);
      // Como a Conexão ao retomar um Envio que terminou: o erro anterior sai. Um que anda (limite do plano) fica como está.
      if (retomavel(estadoDoJob({ jobId }))) jobs.set(jobId, { ...job, status: 'queued', state: { ...job?.state, status: 'queued', stage: 'queued', progress: {}, lastError: null, ankiError: null } });
      return true;
    } catch (erro) {
      falhasAoRetomar.set(jobId, String(erro.message || erro));
      return false;
    }
  }

  /** O resumo abre quando nada anda e algum Envio chegou a começar. */
  function prontoParaResumo() {
    if (!remessa || criando || resumo) return false;
    return remessa.envios.some(e => e.jobId) && remessa.envios.every(terminou);
  }

  /** Outro modal na tela (o de progresso não conta: o resumo toma o lugar dele). */
  function outroModalAberto() {
    const scrims = [...document.querySelectorAll('.veio-scrim:not([hidden])')]
      .filter(s => s.id !== 'modal-envio' && s.id !== 'modal-resumo');
    return scrims.length > 0;
  }

  /** O desfecho de cada idioma: o que virou cartão agora, o que já estava lá e o que não entrou. */
  function contagemPorIdioma() {
    const porLang = new Map();
    for (const envio of remessa.envios) {
      if (!porLang.has(envio.lang)) {
        porLang.set(envio.lang, { lang: envio.lang, baralho: envio.baralho, total: 0, enviadas: [], duplicadas: [], falhas: 0 });
      }
      const idioma = porLang.get(envio.lang);
      idioma.baralho = idioma.baralho || envio.baralho;
      idioma.total += envio.ids.length;
      const estado = envio.jobId ? estadoDoJob(envio) || {} : {};
      idioma.codigo ||= estado.lastError;
      const sucesso = new Set((estado.successfulPhraseIds || []).map(Number));
      const falha = new Set((estado.failedPhraseIds || []).map(Number));
      const dup = new Set((estado.duplicatePhraseIds || []).map(Number));
      for (const id of envio.ids) {
        // Na dúvida, a frase fica: uma que a Conexão dá também como falha não é apagada.
        if (!sucesso.has(Number(id)) || falha.has(Number(id))) idioma.falhas += 1;
        else if (dup.has(Number(id))) idioma.duplicadas.push(id);
        else idioma.enviadas.push(id);
      }
    }
    return ['en', 'ru'].filter(lang => porLang.has(lang)).map(lang => porLang.get(lang));
  }

  /** O nome do baralho sem o `::` do Anki: os níveis ficam separados por ›. */
  function nomeDoBaralho({ lang, baralho }) {
    return AjustesDeEnvio.nomeDoBaralho(baralho || AjustesDeEnvio.atual()[lang].deckName);
  }

  /** Um bloco por idioma: +N cartões, o baralho, o que já estava lá, o que não entrou e Tentar de novo. */
  function montarBlocoDoIdioma(idioma) {
    const bloco = elemento('section', 'envio-resumo__baralho');
    bloco.setAttribute('role', 'group');
    const titulo = elemento('h3', 'envio-resumo__idioma', IDIOMAS[IDIOMA_DO_LANG[idioma.lang]]);
    titulo.id = `envio-resumo-${idioma.lang}`;
    bloco.setAttribute('aria-labelledby', titulo.id);
    bloco.append(
      titulo,
      elemento('p', 'envio-resumo__cartoes', textoDaVoz('ENV-10.cartoes', { n: idioma.enviadas.length })),
    );
    const baralho = nomeDoBaralho(idioma);
    if (baralho) bloco.append(elemento('p', 'envio-resumo__nome', textoDaVoz('ENV-10.noBaralho', { baralho })));
    if (idioma.duplicadas.length) {
      bloco.append(elemento('p', 'envio-resumo__linha', textoDaVoz('ENV-10.jaEstavam', { n: idioma.duplicadas.length })));
    }
    if (idioma.falhas) {
      bloco.append(elemento('p', 'envio-resumo__linha envio-resumo__linha--erro', textoDaVoz('ENV-10.naoEntraram', { n: idioma.falhas })), ...CartaoDoEnvio.linhasDoPlano(idioma.codigo));
      const tentar = botao(textoDaVoz('ENV-10.tentarDeNovo'), 'tentar', () => responderResumo({ tentar: idioma.lang }));
      tentar.prepend(Veio.iconeVeio('atualizar'));
      bloco.append(tentar);
    }
    return bloco;
  }

  function tentarAbrirResumo() {
    // A Boas-vindas é a página da primeira configuração: nada abre por cima dela.
    if (!AREAS_DO_PAINEL.includes(Shell.areaAtual())) return;
    if (!prontoParaResumo() || outroModalAberto()) return;
    if (remessa.envios.some(pendente) && !desistiuDasPendencias) {
      // O erro de um Envio não some dentro do resumo: o progresso volta com ele à vista.
      if (!progresso) abrirProgresso();
      return;
    }
    if (progresso) progresso.fechar();

    const idiomas = contagemPorIdioma();
    const enviadas = idiomas.flatMap(i => i.enviadas);
    const duplicadas = idiomas.flatMap(i => i.duplicadas);
    const falhas = idiomas.reduce((soma, i) => soma + i.falhas, 0);
    const total = idiomas.reduce((soma, i) => soma + i.total, 0);
    porId('modal-resumo-titulo').textContent = textoDaVoz(falhas ? 'ENV-10.tituloEmParte' : 'ENV-10.titulo');
    porId('modal-resumo-detalhe').textContent = textoDaVoz('ENV-10.detalhe', { n: total, baralhos: idiomas.length });
    porId('modal-resumo-baralhos').replaceChildren(...idiomas.map(montarBlocoDoIdioma));

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
    if (resposta?.tentar) {
      await tentarDeNovoOIdioma(resposta.tentar);
      return;
    }
    // Manter, Pronto, o × e o Esc: as enviadas e as que já estavam viram Enviada ao Anki (ENV-12, sem toast).
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

  /** Tentar de novo (ENV-10), no bloco de um idioma: retoma os Envios em parte e recria os que não começaram. */
  function tentarDeNovoOIdioma(lang) {
    abrirProgresso();
    return recomecar(async () => {
      for (const envio of remessa.envios) {
        if (envio.lang !== lang) continue;
        if (!envio.jobId) await criarEnvio(envio);
        else if (retomavel(estadoDoJob(envio))) await retomar(envio.jobId);
      }
    });
  }

  /** Desligada e nunca ligada neste computador (sem abridor), Enviar ao Anki fica `aria-disabled`, e o tooltip diz por quê. */
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
