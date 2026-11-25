'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, Contexto, IDIOMAS, SituacaoDoEnvio } = raiz;
  const { elemento } = Veio;
  const { ESTADO, ESPERA, AJUDA } = SituacaoDoEnvio;

  const ETAPAS = [
    ['queued', 'naFila'],
    ['generate_cards', 'criandoCartoes'],
    ['extract_prompts', 'preparandoImagens'],
    ['generate_audio', 'gerandoAudio'],
    ['generate_images', 'escolhendoImagens'],
    ['wait_anki', 'esperandoOAnki'],
    ['send_to_anki', 'enviandoAoAnki'],
  ];
  const FORA_DAS_ETAPAS = {
    [ESTADO.CRIANDO]: ['ENV-24.pedindo', ''], [ESTADO.NAO_COMECOU]: ['ENV-07.naoComecou', 'erro'], [ESTADO.DESCONHECIDO]: ['ENV-23.etapa', 'erro'],
    [ESTADO.CONCLUIDO]: ['ENV-07.concluido', 'ok'], [ESTADO.EM_PARTE]: ['ENV-07.concluidoEmParte', 'erro'], [ESTADO.NAO_CONCLUIDO]: ['ENV-07.falhou', 'erro'],
    [ESTADO.APAGADO]: ['ENV-07.falhou', 'erro'],
  };
  const NAO_ANDOU = [ESTADO.CRIANDO, ESTADO.NAO_COMECOU, ESTADO.DESCONHECIDO];
  const MOTIVO_DE_NAO_COMECAR = { semResposta: 'ENV-03.motivoSemResposta', erro: 'ENV-03.motivo', ajustes: 'ENV-03.motivoAjustes' };
  const IDIOMA_DO_LANG = { en: 'INGLES', ru: 'RUSSO' };

  function nomeDoIdioma(lang) {
    return IDIOMAS[IDIOMA_DO_LANG[lang]].toLowerCase();
  }

  const abrindoOPerfil = new Set();
  const falhasAoAbrirOPerfil = new Set();

  async function abrirOPerfil(envio) {
    if (abrindoOPerfil.has(envio.jobId)) return;
    abrindoOPerfil.add(envio.jobId);
    const desfecho = await raiz.ConversaComOAnki.pedir(raiz.PedidoAoAnki.abrirOPerfilMarcado());
    falhasAoAbrirOPerfil[desfecho.ok ? 'delete' : 'add'](envio.jobId);
    abrindoOPerfil.delete(envio.jobId);
  }

  function escolherOutroPerfil() {
    document.getElementById('modal-envio-fechar')?.click();
    location.hash = '#configuracoes/anki';
  }

  const GERENCIAR_USO = 'https://chatgpt.com/settings/usage';

  function doMotivo(codigo) {
    const { noPainel, ajuda } = SituacaoDoEnvio.doCodigo(codigo);
    return noPainel ? { motivo: textoDaVoz(noPainel), ajuda } : null;
  }
  const ROTULO_DA_CHAVE = { [AJUDA.TROCAR_A_CHAVE]: 'ONB-23.trocarAChave', [AJUDA.USAR_A_CHAVE]: 'CFG-35.erroChatgptUsarChave', [AJUDA.ESCOLHER_QUEM_PAGA]: 'CFG-46.abrir' };
  const gerenciarUso = ajuda => (ajuda === AJUDA.GERENCIAR_USO ? textoDaVoz('CFG-35.chatgptGerenciar') : null);

  function usarAChave() {
    document.querySelectorAll('.veio-scrim:not([hidden]) .veio-modal__fechar').forEach(fechar => fechar.click());
    location.hash = '#configuracoes/ia';
  }

  function ligacaoDeUso(rotulo, classe) {
    const link = elemento('a', classe, rotulo);
    Object.assign(link, { href: GERENCIAR_USO, target: '_blank', rel: 'noopener noreferrer' });
    return link;
  }

  function linhasDoMotivo(codigo) {
    const dito = doMotivo(codigo);
    if (!dito) return [];
    const linha = elemento('p', 'envio-resumo__linha', dito.motivo);
    if (gerenciarUso(dito.ajuda)) linha.append(' ', ligacaoDeUso(gerenciarUso(dito.ajuda), 'veio-botao veio-botao--link'));
    const daChave = ROTULO_DA_CHAVE[dito.ajuda];
    return daChave ? [linha, botao(textoDaVoz(daChave), 'usar-chave', usarAChave)] : [linha];
  }

  function etapaDeSete({ indice }) {
    return textoDaVoz('ENV-08.etapa', { n: indice + 1, total: ETAPAS.length });
  }

  function montarEtapas(situacao, rotuladoPor) {
    const { indice, fracao, fim, semEtapas, tom, pct } = situacao;
    const etapas = elemento('div', `envio-cartao__etapas${tom ? ` envio-cartao__etapas--${tom}` : ''}`);
    etapas.setAttribute('role', 'progressbar');
    etapas.setAttribute('aria-labelledby', rotuladoPor);
    etapas.setAttribute('aria-valuemin', '0');
    etapas.setAttribute('aria-valuemax', '100');
    etapas.setAttribute('aria-valuenow', String(pct));
    if (indice != null) etapas.setAttribute('aria-valuetext', etapaDeSete(situacao));
    const etapaFeita = k => fim || k < indice;
    ETAPAS.forEach((_, k) => {
      const segmento = document.createElement('i');
      if (!semEtapas && etapaFeita(k)) segmento.className = 'feito';
      if (!fim && k === indice) {
        const enchendo = document.createElement('b');
        enchendo.style.width = `${Math.round(fracao * 100)}%`;
        segmento.append(enchendo);
      }
      etapas.append(segmento);
    });
    return etapas;
  }

  function botaoLink(rotulo, foco, aoUsar) {
    const no = elemento('button', 'veio-botao veio-botao--link envio-cartao__acao', rotulo);
    no.type = 'button';
    no.dataset.foco = foco;
    no.addEventListener('click', aoUsar);
    return no;
  }

  function botao(rotulo, foco, aoUsar) {
    const no = elemento('button', 'veio-botao veio-botao--secundario veio-botao--compacto', rotulo);
    no.type = 'button';
    no.dataset.foco = foco;
    no.addEventListener('click', aoUsar);
    return no;
  }

  function montarAcoes(acoes) {
    const lista = elemento('div', 'envio-cartao__acoes');
    for (const { rotulo, foco, href, principal, emAndamento, aoUsar } of acoes) {
      const no = href ? elemento('a', `veio-botao veio-botao--${principal ? 'primario' : 'secundario'} veio-botao--compacto`, rotulo) : botao(rotulo, foco, aoUsar);
      if (href) Object.assign(no, { href, target: '_blank', rel: 'noopener noreferrer' });
      no.dataset.foco = foco;
      if (emAndamento) no.setAttribute('aria-disabled', 'true');
      lista.append(no);
    }
    return lista;
  }

  function montarTitulo(envio) {
    const titulo = elemento('h3', 'envio-cartao__titulo', textoDaVoz('ENV-08.titulo', { idioma: nomeDoIdioma(envio.lang), n: envio.ids.length }));
    titulo.id = `envio-titulo-${envio.id}`;
    return titulo;
  }

  function montarTopo(titulo, retrato) {
    const rotuloDaEtapa = elemento('span', `envio-cartao__etapa${retrato.tom ? ` envio-cartao__etapa--${retrato.tom}` : ''}`, textoDaVoz(retrato.etapa));
    return elemento('div', 'envio-cartao__topo', titulo, rotuloDaEtapa);
  }

  function montarMotivo(texto) {
    const motivo = elemento('p', 'envio-cartao__motivo');
    raiz.EnvioParado.escrever(motivo, texto);
    return motivo;
  }

  const temAcaoSolta = pedido => Boolean(pedido?.rotulo && !pedido.acoes);

  function montarAcaoSolta(pedido) {
    const acao = botaoLink(pedido.rotulo, pedido.foco, pedido.aoUsar);
    if (pedido.emAndamento) acao.setAttribute('aria-disabled', 'true');
    return pedido.ligacao ? [acao, ligacaoDeUso(pedido.ligacao, 'veio-botao veio-botao--link envio-cartao__acao')] : [acao];
  }

  function montarLinhaDeBaixo(pedido, retrato, atualizadoEm) {
    const atualizado = textoDaVoz('ENV-08.atualizado', { quando: Contexto.haQuanto(atualizadoEm) });
    const meta = elemento('div', 'envio-cartao__meta');
    if (temAcaoSolta(pedido)) meta.append(...montarAcaoSolta(pedido));
    meta.append(elemento('span', '', retrato.indice == null ? atualizado : `${etapaDeSete(retrato)} · ${atualizado}`));
    return meta;
  }

  const atualizadoEmDe = (estado, envio) => (estado?.updatedAt ? Date.parse(estado.updatedAt) : envio.criadoEm);

  function linhasDaCausa(envio, estado, atualizadoEm) {
    return [
      `${envio.jobId || envio.id} · lang=${envio.lang} · stage=${estado?.stage || 'queued'}`,
      `updatedAt ${estado?.updatedAt || new Date(atualizadoEm).toISOString()}`,
      estado?.lastError || '',
    ];
  }

  function causaDoCartao(envio, estado, falhaAoContinuar, atualizadoEm) {
    if (envio.falhaAoCriar) return envio.falhaAoCriar.causa;
    return [...linhasDaCausa(envio, estado, atualizadoEm), falhaAoContinuar || '', raiz.EnvioParado.causa(envio)].filter(Boolean).join('\n');
  }

  function montarMotivoEAcoes(pedido) {
    return [pedido?.motivo && montarMotivo(pedido.motivo), pedido?.acoes && montarAcoes(pedido.acoes)].filter(Boolean);
  }

  function assinaturaDoCartao(retrato, pedido, meta, causa) {
    return [retrato.etapa, retrato.pct, retrato.tom, pedido?.motivo || '', pedido?.acoes?.map(a => a.rotulo + a.emAndamento) || '', meta.textContent, causa].join('|');
  }

  function criar({ situacaoDe, estadoDoJob, esquecerOEnvio, falhaAoRetomar, tentarCriarDeNovo, continuarEnvio, pedirAChave, redesenhar }) {
    function retratoDe(situacao) {
      const fora = FORA_DAS_ETAPAS[situacao.estado];
      if (fora) {
        const andou = !NAO_ANDOU.includes(situacao.estado);
        return { etapa: fora[0], tom: fora[1], fim: situacao.estado !== ESTADO.CRIANDO, semEtapas: !andou, pct: andou ? 100 : 0 };
      }
      const indice = Math.max(0, ETAPAS.findIndex(([stage]) => stage === situacao.etapa));
      const fracao = situacao.total > 0 ? Math.min(1, situacao.feitos / situacao.total) : 0;
      return { etapa: `ENV-07.${ETAPAS[indice][1]}`, indice, fracao, pct: Math.round(((indice + fracao) / ETAPAS.length) * 100), tom: '' };
    }

    function montarCartao(envio) {
      const situacao = situacaoDe(envio);
      const estado = envio.jobId && situacao.estado !== ESTADO.DESCONHECIDO ? estadoDoJob(envio) || { status: 'queued', stage: 'queued' } : undefined;
      const atualizadoEm = atualizadoEmDe(estado, envio);
      const retrato = retratoDe(situacao);
      const pedido = pedidoDoCartao(envio, situacao, estado);
      if (pedido) retrato.tom = 'calmo';
      const titulo = montarTitulo(envio);
      const cartao = elemento('section', 'envio-cartao');
      cartao.setAttribute('role', 'group');
      cartao.setAttribute('aria-labelledby', titulo.id);
      cartao.append(montarTopo(titulo, retrato), montarEtapas(retrato, titulo.id));
      cartao.append(...montarMotivoEAcoes(pedido));
      const meta = montarLinhaDeBaixo(pedido, retrato, atualizadoEm);
      cartao.append(meta);
      const causa = causaDoCartao(envio, estado, falhaAoRetomar(envio), atualizadoEm);
      if (causa) cartao.append(Veio.montarDetalhes(causa));
      cartao.dataset.assinatura = assinaturaDoCartao(retrato, pedido, meta, causa);
      return cartao;
    }

    function pedidoDoCartao(envio, situacao, estado) {
      const falhou = Boolean(falhaAoRetomar(envio));
      const fatos = {
        envio, situacao, estado, falhou,
        noLimite: estado ? raiz.EnvioNoLimite.pedido(envio, estado, { tentarDeNovo: () => continuarEnvio(envio), usarAChave: () => pedirAChave(envio), falhou, redesenhar }) : null,
        acoes: { esquecerOEnvio, continuarEnvio, tentarCriarDeNovo },
      };
      const doEstado = Object.hasOwn(PEDIDO_DO_ESTADO, situacao.estado) ? PEDIDO_DO_ESTADO[situacao.estado] : () => SEM_PEDIDO_DO_ESTADO;
      const pedido = doEstado(fatos);
      return pedido === SEM_PEDIDO_DO_ESTADO ? pedidoDaFalhaAoRetomar(fatos) : pedido;
    }

    return { montarCartao, pedidoDoCartao };
  }

  const SEM_PEDIDO_DO_ESTADO = Object.freeze({});

  const pedidoParaContinuar = ({ envio, acoes }) => ({ rotulo: textoDaVoz('ENV-03.tentarDeNovo'), foco: 'continuar', aoUsar: () => acoes.continuarEnvio(envio) });

  const pedidoParaEsquecer = (motivo, { envio, acoes }) => ({ motivo, rotulo: textoDaVoz('ENV-23.esquecer'), foco: 'esquecer', aoUsar: () => acoes.esquecerOEnvio(envio) });

  const pedidoDaFalhaAoRetomar = fatos => (fatos.falhou ? { motivo: textoDaVoz('ENV-14.falha'), ...pedidoParaContinuar(fatos) } : null);

  function pedidoParaTentarCriarDeNovo({ envio, situacao, acoes }) {
    return { motivo: textoDaVoz(MOTIVO_DE_NAO_COMECAR[situacao.causa]), rotulo: textoDaVoz('ENV-03.tentarDeNovo'), foco: 'tentar', aoUsar: () => acoes.tentarCriarDeNovo(envio) };
  }

  function pedidoDoQueTerminouSemChegar(fatos) {
    if (fatos.falhou) return SEM_PEDIDO_DO_ESTADO;
    if (!SituacaoDoEnvio.retomavel(fatos.situacao)) return null;
    const dito = doMotivo(fatos.situacao.motivo);
    if (!dito) return pedidoParaContinuar(fatos);
    if (ROTULO_DA_CHAVE[dito.ajuda]) return { motivo: dito.motivo, rotulo: textoDaVoz(ROTULO_DA_CHAVE[dito.ajuda]), foco: 'usar-chave', aoUsar: usarAChave };
    return { motivo: dito.motivo, ligacao: gerenciarUso(dito.ajuda), ...pedidoParaContinuar(fatos) };
  }

  const pedidoDeAbrirOPerfil = ({ envio, estado }) => {
    const { profile: aberto, marked: perfil } = estado.waiting || {};
    return {
      motivo: textoDaVoz(falhasAoAbrirOPerfil.has(envio.jobId) ? 'ENV-17.falha' : 'ENV-17.espera', { aberto }),
      rotulo: textoDaVoz('ENV-17.abrir', { perfil }), foco: 'abrir-perfil', aoUsar: () => abrirOPerfil(envio),
    };
  };

  const pedidoDeEscolherOutroPerfil = ({ estado }) => ({
    motivo: textoDaVoz('ENV-17.sumiu', { perfil: (estado.waiting || {}).marked }), rotulo: textoDaVoz('ENV-17.escolher'), foco: 'escolher-perfil', aoUsar: escolherOutroPerfil,
  });

  const PEDIDO_DA_ESPERA = {
    [ESPERA.PLANO]: ({ noLimite }) => noLimite,
    [ESPERA.TETO]: ({ envio, estado }) => raiz.EnvioNoTeto.pedido(envio, estado),
    [ESPERA.OUTRO_PERFIL]: pedidoDeAbrirOPerfil,
    [ESPERA.PERFIL_SUMIU]: pedidoDeEscolherOutroPerfil,
    [ESPERA.ANKI]: () => ({ motivo: textoDaVoz('ENV-22.demora') }),
  };

  function pedidoDeQuemEspera(fatos) {
    const doQueEspera = Object.hasOwn(PEDIDO_DA_ESPERA, fatos.situacao.espera) ? PEDIDO_DA_ESPERA[fatos.situacao.espera] : PEDIDO_DA_ESPERA[ESPERA.ANKI];
    return doQueEspera(fatos) || SEM_PEDIDO_DO_ESTADO;
  }

  const PEDIDO_DO_ESTADO = {
    [ESTADO.NAO_COMECOU]: pedidoParaTentarCriarDeNovo,
    [ESTADO.DESCONHECIDO]: fatos => pedidoParaEsquecer(textoDaVoz('ENV-23.motivo'), fatos),
    [ESTADO.APAGADO]: fatos => pedidoParaEsquecer(textoDaVoz('ENV-24.apagado'), fatos),
    [ESTADO.PARADO]: ({ envio, estado }) => raiz.EnvioParado.pedido(envio, estado),
    [ESTADO.ESPERANDO]: pedidoDeQuemEspera,
    [ESTADO.EM_PARTE]: pedidoDoQueTerminouSemChegar,
    [ESTADO.NAO_CONCLUIDO]: pedidoDoQueTerminouSemChegar,
  };

  function nomeDoBaralho({ lang, baralho }) {
    return raiz.AjustesDeEnvio.nomeDoBaralho(baralho || raiz.AjustesDeEnvio.atual()[lang].deckName);
  }

  function montarBlocoDoResumo(idioma, aoTentar) {
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
      bloco.append(elemento('p', 'envio-resumo__linha envio-resumo__linha--erro', textoDaVoz('ENV-10.naoEntraram', { n: idioma.falhas })), ...linhasDoMotivo(idioma.codigo));
      const tentar = botao(textoDaVoz('ENV-10.tentarDeNovo'), 'tentar', () => aoTentar(idioma.lang));
      tentar.prepend(Veio.iconeVeio('atualizar'));
      bloco.append(tentar);
    }
    return bloco;
  }

  const comoNumeros = lista => new Set((lista || []).map(Number));

  function conjuntos(estado) {
    return { sucesso: comoNumeros(estado.successfulPhraseIds), falha: comoNumeros(estado.failedPhraseIds), dup: comoNumeros(estado.duplicatePhraseIds) };
  }

  function naoEntrou(envio, estado) {
    const { sucesso, falha } = conjuntos(estado);
    return envio.ids.filter(id => !sucesso.has(Number(id)) || falha.has(Number(id)));
  }

  async function recriar(remessa, envio, estado, criar) {
    const resto = naoEntrou(envio, estado);
    if (!resto.length) return;
    const novo = { id: crypto.randomUUID(), lang: envio.lang, ids: resto, jobId: null, criadoEm: Date.now(), falhaAoCriar: null };
    envio.ids = envio.ids.filter(id => !resto.includes(id));
    remessa.envios.push(novo);
    await criar(novo);
  }

  raiz.CartaoDoEnvio = Object.freeze({ ETAPAS, IDIOMA_DO_LANG, nomeDoIdioma, botao, elemento, montarBlocoDoResumo, criar, conjuntos, recriar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
