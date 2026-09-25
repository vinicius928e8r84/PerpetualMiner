'use strict';

// O Envio ao Anki no painel (docs/design/painel/frases/, ENV-03…15).
//
// Enviar ao Anki abre o modal de progresso na hora, com um cartão por Envio (um
// por idioma). Os Envios acompanhados ficam gravados em `pm_envio`, então
// recarregar o painel não os perde. Quando nenhum está andando, o resumo
// (ENV-10) abre sozinho, em qualquer área, depois que outro modal aberto fechar.
//
// `painel.js` entrega o que só ele sabe fazer com as frases, por `Envio.usar`,
// depois da primeira leitura do histórico:
//   selecionadas()            as frases que a barra manda enviar;
//   frasesPorId(ids)          as frases do histórico, para (re)criar um Envio;
//   linha(frase)              a linha de mineração que a Conexão recebe;
//   ajustes()                 os ajustes de envio de cada idioma ({ en, ru });
//   apagar(ids)               apaga pelo caminho de sempre (tombstone, nuvem), sem toast;
//   marcarComoEnviadas(ids)   grava Enviada ao Anki, sem toast e sem mexer na seleção.

(function (raiz) {
  const CHAVE_GRAVADA = 'pm_envio';
  /** De quanto em quanto tempo a Conexão é perguntada sobre os Envios. */
  const INTERVALO = 2000;

  // As etapas do bridge, na ordem, com o nome de gente de cada uma (ENV-07).
  const ETAPAS = [
    ['queued', 'naFila'],
    ['generate_cards', 'criandoCartoes'],
    ['extract_prompts', 'preparandoImagens'],
    ['generate_audio', 'gerandoAudio'],
    ['generate_images', 'escolhendoImagens'],
    ['wait_anki', 'esperandoOAnki'],
    ['send_to_anki', 'enviandoAoAnki'],
  ];
  const FIM = { completed: 'concluido', partial: 'concluidoEmParte', failed: 'falhou' };
  const IDIOMA_DO_LANG = { en: 'INGLES', ru: 'RUSSO' };

  const { textoDaVoz, Veio, Shell, IDIOMAS, ehRussa } = raiz;
  const { ENDERECO_DA_CONEXAO, CONEXAO } = Shell;
  const porId = id => document.getElementById(id);

  let doPainel = null;
  // A remessa acompanhada: { envios: [{ id, lang, ids, jobId, criadoEm, falhaAoCriar }] }.
  let remessa = null;
  const jobs = new Map();           // jobId → o último job lido de GET /jobs
  const falhasAoRetomar = new Map(); // jobId → a causa, quando Continuar envio não deu
  let criando = false;
  const retomando = new Set();      // jobIds com um Continuar envio a caminho
  // Um Envio que não começou (ou que não deu para retomar) segura o resumo: o
  // progresso volta com o erro à vista, e o resumo só abre quando a pessoa o fecha.
  let desistiuDasPendencias = false;
  let semNoticia = false;
  let conexaoDesligada = false;
  let relogio = null;
  let progresso = null;             // o modal de progresso aberto ({ fechar })
  let resumo = null;                // o modal do resumo aberto
  let respostaDoResumo = null;      // 'apagar' | 'tentar' | null (Manter)
  const assinaturas = new Map();    // id do Envio → o que o cartão mostra agora

  // ─── Começo ────────────────────────────────────────────────────────────────

  async function usar(operacoes) {
    if (doPainel) return;
    doPainel = operacoes;
    porId('btn-send-anki').addEventListener('click', enviar);
    porId('modal-envio-fechar').addEventListener('click', () => progresso?.fechar());
    porId('modal-resumo-fechar').addEventListener('click', () => resumo?.fechar());
    porId('btn-resumo-manter').addEventListener('click', () => resumo?.fechar());
    porId('btn-resumo-apagar').addEventListener('click', () => responderResumo('apagar'));
    porId('btn-resumo-tentar').addEventListener('click', () => responderResumo('tentar'));
    Shell.aoMudarAConexao(mostrarConexao);

    const gravado = await new Promise(r => chrome.storage.local.get({ [CHAVE_GRAVADA]: null }, r));
    if (!remessa && gravado[CHAVE_GRAVADA]?.envios?.some(e => e.jobId)) {
      remessa = gravado[CHAVE_GRAVADA];
      acompanhar();
    }
  }

  // ─── Enviar ao Anki ────────────────────────────────────────────────────────

  async function enviar() {
    if (conexaoDesligada || criando || !doPainel) return;
    // Uma frase que já está na remessa não vai de novo: quem não começou tem o Tentar de novo dele.
    const acompanhadas = new Set((remessa?.envios || []).flatMap(e => e.ids));
    const novas = doPainel.selecionadas().filter(f => !acompanhadas.has(f.id));
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
    // ENV-05 é silêncio: o modal aberto na hora é a resposta.
    abrirProgresso();
    try {
      // Gravado a cada Envio criado: recarregar no meio não deixa um órfão.
      for (const envio of envios) {
        await criarEnvio(envio);
        await gravar();
      }
    } finally {
      criando = false;
    }
    // Fechado enquanto nada começou: não sobra envio para acompanhar.
    if (!progresso && !remessa.envios.some(e => e.jobId)) return esquecer();
    desenharProgresso();
    acompanhar();
  }

  /** `POST /jobs` de um Envio; se não começa, a causa fica no cartão (ENV-03). */
  async function criarEnvio(envio) {
    envio.falhaAoCriar = null;
    envio.criadoEm = Date.now();
    const preset = doPainel.ajustes()[envio.lang];
    const corpo = {
      lang: envio.lang,
      deckName: preset.deckName,
      imageSource: preset.imageSource,
      tts: { wordTld: preset.ttsWordTld, phraseTld: preset.ttsPhraseTld },
      entries: doPainel.frasesPorId(envio.ids).map(frase => ({ phraseId: frase.id, line: doPainel.linha(frase) })),
    };
    let resposta;
    try {
      resposta = await fetch(`${ENDERECO_DA_CONEXAO}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
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

  // ─── Acompanhar ────────────────────────────────────────────────────────────

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
    if (remessa.envios.some(e => e.jobId && !terminou(e))) await lerJobs();
    desenharProgresso();
    tentarAbrirResumo();
  }

  async function lerJobs() {
    try {
      const resposta = await fetch(`${ENDERECO_DA_CONEXAO}/jobs`);
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const lista = (await resposta.json()).jobs || [];
      const porJob = new Map(lista.map(job => [job.jobId, job]));
      for (const envio of remessa?.envios || []) {
        if (!envio.jobId) continue;
        // Um Envio que a Conexão não conhece mais não volta: conta como não concluído.
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

  /** Terminou: o Envio acabou na Conexão, ou nem começou. */
  function terminou(envio) {
    if (!envio.jobId) return Boolean(envio.falhaAoCriar);
    const estado = estadoDoJob(envio);
    return Boolean(estado && FIM[estado.status]);
  }

  /** Grava só os Envios que já têm um desfecho do POST: criado, ou não começou. */
  function gravar() {
    const envios = remessa.envios.filter(e => e.jobId || e.falhaAoCriar);
    return new Promise(r => chrome.storage.local.set({ [CHAVE_GRAVADA]: { envios } }, r));
  }

  function esquecer() {
    remessa = null;
    desistiuDasPendencias = false;
    jobs.clear();
    falhasAoRetomar.clear();
    pararDeAcompanhar();
    return new Promise(r => chrome.storage.local.remove(CHAVE_GRAVADA, r));
  }

  // ─── Modal de progresso (ENV-06 · 07 · 08 · 09 · 13 · 15) ────────────────────

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
    // Fechou com o resto terminado e um erro à vista: o resumo abre, e conta o que falhou.
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
    porId('modal-envio-sem-noticia').hidden = !semNoticia;

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

  function nomeDoIdioma(lang) {
    return IDIOMAS[IDIOMA_DO_LANG[lang]].toLowerCase();
  }

  /** O que o cartão diz: etapa, quanto da barra, se deu certo, e o técnico. */
  function situacaoDoEnvio(envio) {
    if (!envio.jobId) {
      if (!envio.falhaAoCriar) return { etapa: 'naFila', pct: 0, tom: '', atualizadoEm: envio.criadoEm };
      return { etapa: 'naoComecou', pct: 100, tom: 'erro', atualizadoEm: envio.criadoEm };
    }
    const estado = estadoDoJob(envio) || { status: 'queued', stage: 'queued' };
    const atualizadoEm = estado.updatedAt ? Date.parse(estado.updatedAt) : envio.criadoEm;
    const fim = FIM[estado.status];
    if (fim) return { etapa: fim, pct: 100, tom: estado.status === 'completed' ? 'ok' : 'erro', atualizadoEm, estado };
    const indice = Math.max(0, ETAPAS.findIndex(([stage]) => stage === estado.stage));
    const { done, total } = estado.progress || {};
    const fracao = total > 0 ? Math.min(1, Number(done || 0) / Number(total)) : 0;
    return {
      etapa: ETAPAS[indice][1],
      pct: Math.round(((indice + fracao) / ETAPAS.length) * 100),
      tom: '',
      atualizadoEm,
      estado,
    };
  }

  function quando(momento) {
    const minutos = Math.floor((Date.now() - momento) / 60000);
    if (!(minutos >= 1)) return textoDaVoz('ENV-08.agora');
    if (minutos < 60) return textoDaVoz('ENV-08.minutos', { n: minutos });
    return textoDaVoz('ENV-08.horas', { n: Math.floor(minutos / 60) });
  }

  function montarCartao(envio) {
    const { etapa, pct, tom, atualizadoEm, estado } = situacaoDoEnvio(envio);
    const idioma = nomeDoIdioma(envio.lang);
    const cartao = elemento('section', 'envio-cartao');
    cartao.setAttribute('role', 'group');

    const titulo = elemento('h3', 'envio-cartao__titulo', textoDaVoz('ENV-08.titulo', { idioma, n: envio.ids.length }));
    titulo.id = `envio-titulo-${envio.id}`;
    cartao.setAttribute('aria-labelledby', titulo.id);
    const rotuloDaEtapa = elemento('span', `envio-cartao__etapa${tom ? ` envio-cartao__etapa--${tom}` : ''}`,
      textoDaVoz(`ENV-07.${etapa}`));
    const topo = elemento('div', 'envio-cartao__topo', titulo, rotuloDaEtapa);

    const barra = elemento('div', `veio-medidor envio-cartao__barra${tom ? ` envio-cartao__barra--${tom}` : ''}`);
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-labelledby', titulo.id);
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', '100');
    barra.setAttribute('aria-valuenow', String(pct));
    const preenchido = document.createElement('i');
    preenchido.style.width = `${pct}%`;
    barra.append(preenchido);
    cartao.append(topo, barra);

    // O erro que pede ação é o aviso da Veio, no próprio cartão, com a causa em Detalhes.
    const falhaAoRetomar = envio.jobId && falhasAoRetomar.get(envio.jobId);
    if (envio.falhaAoCriar) {
      const aviso = envio.falhaAoCriar.semResposta ? 'ENV-03.avisoSemResposta' : 'ENV-03.aviso';
      cartao.append(avisoNoCartao({
        texto: textoDaVoz(aviso, { idioma }),
        acao: { rotulo: textoDaVoz('ENV-03.tentarDeNovo'), aoUsar: () => tentarCriarDeNovo(envio) },
        detalhes: envio.falhaAoCriar.causa,
      }, 'tentar'));
    } else if (falhaAoRetomar || ankiTravado(estado)) {
      // Continuar envio fica no aviso, que diz o que fazer antes dele.
      cartao.append(avisoNoCartao({
        texto: textoDaVoz(falhaAoRetomar ? 'ENV-14.falha' : 'BRG-18'),
        acao: { rotulo: textoDaVoz('ENV-13.continuar'), aoUsar: () => continuarEnvio(envio) },
      }, 'continuar'));
    }

    const meta = elemento('div', 'envio-cartao__meta',
      elemento('span', '', textoDaVoz('ENV-08.atualizado', { quando: quando(atualizadoEm) })));
    if (!falhaAoRetomar && !ankiTravado(estado) && retomavel(estado)) {
      meta.append(botao(textoDaVoz('ENV-13.continuar'), 'continuar', () => continuarEnvio(envio)));
    }
    cartao.append(meta);

    const causa = envio.falhaAoCriar ? '' : [
        `${envio.jobId} · lang=${envio.lang} · stage=${estado?.stage || 'queued'}`,
        // A mesma hora do “atualizado há …”: a da Conexão, ou a de quando o Envio foi criado.
        `updatedAt ${estado?.updatedAt || new Date(atualizadoEm).toISOString()}`,
        estado?.lastError || '',
        falhaAoRetomar || '',
      ].filter(Boolean).join('\n');
    if (causa) cartao.append(Veio.montarDetalhes(causa));

    cartao.dataset.assinatura = [etapa, pct, tom, meta.textContent, causa, falhaAoRetomar || ''].join('|');
    return cartao;
  }

  /** Terminou sem tudo virar cartão: Continuar envio retoma de onde parou. */
  function retomavel(estado) {
    return Boolean(estado) && (estado.status === 'partial' || estado.status === 'failed');
  }

  /** O Windows não deixou a Conexão fechar o Anki travado: a pessoa precisa fechá-lo antes. */
  function ankiTravado(estado) {
    return estado?.ankiError === 'repair_access_denied';
  }

  function avisoNoCartao(conteudo, foco) {
    const aviso = Veio.montarAviso({ ...conteudo, fechavel: false });
    aviso.querySelector('button').dataset.foco = foco;
    return aviso;
  }

  function botao(rotulo, foco, aoUsar) {
    const no = elemento('button', 'veio-botao veio-botao--secundario veio-botao--compacto', rotulo);
    no.type = 'button';
    no.dataset.foco = foco;
    no.addEventListener('click', aoUsar);
    return no;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
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

  /** Continuar envio (ENV-13): o bridge retoma de onde parou. */
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
      const resposta = await fetch(`${ENDERECO_DA_CONEXAO}/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
      if (!resposta.ok) throw new Error(`POST /jobs/${jobId}/retry → HTTP ${resposta.status}`);
      falhasAoRetomar.delete(jobId);
      const job = jobs.get(jobId);
      // Como a Conexão faz ao retomar: o erro da vez anterior sai junto.
      jobs.set(jobId, { ...job, status: 'queued', state: { ...job?.state, status: 'queued', stage: 'queued', progress: {}, lastError: null, ankiError: null } });
      return true;
    } catch (erro) {
      falhasAoRetomar.set(jobId, String(erro.message || erro));
      return false;
    }
  }

  // ─── Resumo (ENV-10 · 11 · 12) ─────────────────────────────────────────────

  /** O resumo abre quando nada anda e algum Envio chegou a começar. */
  function prontoParaResumo() {
    if (!remessa || criando || resumo) return false;
    return remessa.envios.some(e => e.jobId) && remessa.envios.every(terminou);
  }

  /** Outro modal na tela (o de progresso não conta: o resumo toma o lugar dele). */
  function outroModalAberto() {
    const scrims = [...document.querySelectorAll('.veio-scrim:not([hidden])')]
      .filter(s => s.id !== 'modal-envio' && s.id !== 'modal-resumo');
    const antigos = document.querySelectorAll('.modal-overlay:not(.hidden), .import-overlay:not(.hidden)');
    return scrims.length > 0 || antigos.length > 0;
  }

  function contagem() {
    const enviadas = [];
    const duplicadas = [];
    const falhasPorLang = { en: 0, ru: 0 };
    for (const envio of remessa.envios) {
      const estado = envio.jobId ? estadoDoJob(envio) || {} : {};
      const sucesso = new Set((estado.successfulPhraseIds || []).map(Number));
      const falha = new Set((estado.failedPhraseIds || []).map(Number));
      const dup = new Set((estado.duplicatePhraseIds || []).map(Number));
      for (const id of envio.ids) {
        // Na dúvida, a frase fica: uma que a Conexão dá também como falha não é apagada.
        if (!sucesso.has(Number(id)) || falha.has(Number(id))) falhasPorLang[envio.lang] += 1;
        else if (dup.has(Number(id))) duplicadas.push(id);
        else enviadas.push(id);
      }
    }
    return { enviadas, duplicadas, falhasPorLang };
  }

  function tentarAbrirResumo() {
    if (!prontoParaResumo() || outroModalAberto()) return;
    if (remessa.envios.some(pendente) && !desistiuDasPendencias) {
      // O erro de um Envio não some dentro do resumo: o progresso volta com ele à vista.
      if (!progresso) abrirProgresso();
      return;
    }
    if (progresso) progresso.fechar();

    const { enviadas, duplicadas, falhasPorLang } = contagem();
    const falhas = falhasPorLang.en + falhasPorLang.ru;
    porId('modal-resumo-titulo').textContent = textoDaVoz(falhas ? 'ENV-10.tituloEmParte' : 'ENV-10.titulo');

    const selos = porId('modal-resumo-selos');
    selos.textContent = '';
    const selo = (classe, texto) => selos.append(elemento('span', `veio-selo ${classe}`, texto));
    selo('veio-selo--ok', textoDaVoz('ENV-10.enviadas', { n: enviadas.length }));
    if (duplicadas.length) selo('veio-selo--info', textoDaVoz('ENV-10.duplicadas', { n: duplicadas.length }));
    if (falhas) selo('veio-selo--erro', textoDaVoz('ENV-10.falhas', { n: falhas }));

    const linhas = porId('modal-resumo-falhas-linhas');
    linhas.textContent = '';
    for (const lang of ['en', 'ru']) {
      if (!falhasPorLang[lang]) continue;
      linhas.append(elemento('p', '', textoDaVoz('ENV-10.falhasNoIdioma', { n: falhasPorLang[lang], idioma: nomeDoIdioma(lang) })));
    }
    porId('modal-resumo-falhas').hidden = falhas === 0;

    // Apagar oferece só as enviadas que ainda estão no histórico: alguma pode ter sido apagada no meio.
    const aApagar = doPainel.frasesPorId(enviadas).length;
    const apagar = porId('btn-resumo-apagar');
    apagar.hidden = aApagar === 0;
    apagar.textContent = aApagar === 1
      ? textoDaVoz('ENV-10.apagarUma')
      : textoDaVoz('ENV-10.apagar', { n: aApagar });
    // O foco entra na ação principal: Apagar as enviadas, ou Manter se não há o que apagar.
    apagar.toggleAttribute('data-foco-seguro', aApagar > 0);
    porId('btn-resumo-manter').toggleAttribute('data-foco-seguro', aApagar === 0);

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

    if (resposta === 'tentar') {
      await tentarDeNovoAsQueFalharam();
      return;
    }
    // Manter, o × e o Esc: as enviadas e as que já estavam viram Enviada ao Anki (ENV-12, sem toast).
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

  /** Tentar de novo as que falharam (ENV-13): retoma os que ficaram em parte, recria os que não começaram. */
  function tentarDeNovoAsQueFalharam() {
    abrirProgresso();
    return recomecar(async () => {
      for (const envio of remessa.envios) {
        if (!envio.jobId) await criarEnvio(envio);
        else if (retomavel(estadoDoJob(envio))) await retomar(envio.jobId);
      }
    });
  }

  // ─── Conexão desligada ─────────────────────────────────────────────────────

  /** Com a Conexão desligada, Enviar ao Anki fica `aria-disabled` e o tooltip diz por quê. */
  function mostrarConexao(situacao) {
    conexaoDesligada = situacao === CONEXAO.DESLIGADA;
    const enviarAoAnki = porId('btn-send-anki');
    const dica = porId('envio-indisponivel');
    dica.textContent = textoDaVoz('PAI-32.enviarIndisponivel');
    if (conexaoDesligada) {
      enviarAoAnki.setAttribute('aria-disabled', 'true');
      enviarAoAnki.setAttribute('aria-describedby', dica.id);
    } else {
      enviarAoAnki.removeAttribute('aria-disabled');
      enviarAoAnki.removeAttribute('aria-describedby');
    }
  }

  raiz.Envio = { usar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
