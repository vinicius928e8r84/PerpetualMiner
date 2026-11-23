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
    ETAPAS.forEach((_, k) => {
      const segmento = document.createElement('i');
      if (!semEtapas && (fim || k < indice)) segmento.className = 'feito';
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
      const atualizadoEm = estado?.updatedAt ? Date.parse(estado.updatedAt) : envio.criadoEm;
      const retrato = retratoDe(situacao);
      const idioma = nomeDoIdioma(envio.lang);
      const cartao = elemento('section', 'envio-cartao');
      cartao.setAttribute('role', 'group');

      const titulo = elemento('h3', 'envio-cartao__titulo', textoDaVoz('ENV-08.titulo', { idioma, n: envio.ids.length }));
      titulo.id = `envio-titulo-${envio.id}`;
      cartao.setAttribute('aria-labelledby', titulo.id);
      const pedido = pedidoDoCartao(envio, situacao, estado);
      if (pedido) retrato.tom = 'calmo';
      const rotuloDaEtapa = elemento('span', `envio-cartao__etapa${retrato.tom ? ` envio-cartao__etapa--${retrato.tom}` : ''}`, textoDaVoz(retrato.etapa));
      const topo = elemento('div', 'envio-cartao__topo', titulo, rotuloDaEtapa);

      cartao.append(topo, montarEtapas(retrato, titulo.id));

      if (pedido?.motivo) {
        const motivo = elemento('p', 'envio-cartao__motivo');
        raiz.EnvioParado.escrever(motivo, pedido.motivo);
        cartao.append(motivo);
      }

      if (pedido?.acoes) cartao.append(montarAcoes(pedido.acoes));
      const atualizado = textoDaVoz('ENV-08.atualizado', { quando: Contexto.haQuanto(atualizadoEm) });
      const meta = elemento('div', 'envio-cartao__meta');
      if (pedido?.rotulo && !pedido.acoes) {
        const acao = botaoLink(pedido.rotulo, pedido.foco, pedido.aoUsar);
        if (pedido.emAndamento) acao.setAttribute('aria-disabled', 'true');
        meta.append(acao);
        if (pedido.ligacao) meta.append(ligacaoDeUso(pedido.ligacao, 'veio-botao veio-botao--link envio-cartao__acao'));
      }
      meta.append(elemento('span', '', retrato.indice == null ? atualizado : `${etapaDeSete(retrato)} · ${atualizado}`));
      cartao.append(meta);

      const falhaAoContinuar = falhaAoRetomar(envio);
      const causa = envio.falhaAoCriar ? envio.falhaAoCriar.causa : [
          `${envio.jobId || envio.id} · lang=${envio.lang} · stage=${estado?.stage || 'queued'}`,
          `updatedAt ${estado?.updatedAt || new Date(atualizadoEm).toISOString()}`,
          estado?.lastError || '',
          falhaAoContinuar || '',
          raiz.EnvioParado.causa(envio),
        ].filter(Boolean).join('\n');
      if (causa) cartao.append(Veio.montarDetalhes(causa));

      cartao.dataset.assinatura = [retrato.etapa, retrato.pct, retrato.tom, pedido?.motivo || '', pedido?.acoes?.map(a => a.rotulo + a.emAndamento) || '', meta.textContent, causa].join('|');
      return cartao;
    }

    function pedidoDaEspera(envio, { espera }, estado, noLimite) {
      if (espera === ESPERA.PLANO) return noLimite;
      if (espera === ESPERA.TETO) return raiz.EnvioNoTeto.pedido(envio, estado);
      const { profile: aberto, marked: perfil } = estado.waiting || {};
      if (espera === ESPERA.OUTRO_PERFIL) {
        return {
          motivo: textoDaVoz(falhasAoAbrirOPerfil.has(envio.jobId) ? 'ENV-17.falha' : 'ENV-17.espera', { aberto }),
          rotulo: textoDaVoz('ENV-17.abrir', { perfil }), foco: 'abrir-perfil', aoUsar: () => abrirOPerfil(envio),
        };
      }
      if (espera === ESPERA.PERFIL_SUMIU) return { motivo: textoDaVoz('ENV-17.sumiu', { perfil }), rotulo: textoDaVoz('ENV-17.escolher'), foco: 'escolher-perfil', aoUsar: escolherOutroPerfil };
      return { motivo: textoDaVoz('ENV-22.demora') };
    }

    const esquecer = (envio, motivo) => ({ motivo, rotulo: textoDaVoz('ENV-23.esquecer'), foco: 'esquecer', aoUsar: () => esquecerOEnvio(envio) });
    const continuar = envio => ({ rotulo: textoDaVoz('ENV-03.tentarDeNovo'), foco: 'continuar', aoUsar: () => continuarEnvio(envio) });

    function pedidoDeNaoComecou({ envio, situacao }) {
      return { motivo: textoDaVoz(MOTIVO_DE_NAO_COMECAR[situacao.causa]), rotulo: textoDaVoz('ENV-03.tentarDeNovo'), foco: 'tentar', aoUsar: () => tentarCriarDeNovo(envio) };
    }

    function pedidoDeEspera({ envio, situacao, estado, noLimite }) {
      return pedidoDaEspera(envio, situacao, estado, noLimite) || undefined;
    }

    function pedidoDeRetomar({ envio, situacao, falhou }) {
      if (falhou) return undefined;
      if (!SituacaoDoEnvio.retomavel(situacao)) return null;
      const dito = doMotivo(situacao.motivo);
      if (!dito) return continuar(envio);
      if (ROTULO_DA_CHAVE[dito.ajuda]) return { motivo: dito.motivo, rotulo: textoDaVoz(ROTULO_DA_CHAVE[dito.ajuda]), foco: 'usar-chave', aoUsar: usarAChave };
      return { motivo: dito.motivo, ligacao: gerenciarUso(dito.ajuda), ...continuar(envio) };
    }

    const PEDIDO_POR_ESTADO = {
      [ESTADO.NAO_COMECOU]: pedidoDeNaoComecou,
      [ESTADO.DESCONHECIDO]: ({ envio }) => esquecer(envio, textoDaVoz('ENV-23.motivo')),
      [ESTADO.APAGADO]: ({ envio }) => esquecer(envio, textoDaVoz('ENV-24.apagado')),
      [ESTADO.PARADO]: ({ envio, estado }) => raiz.EnvioParado.pedido(envio, estado),
      [ESTADO.ESPERANDO]: pedidoDeEspera,
      [ESTADO.EM_PARTE]: pedidoDeRetomar,
      [ESTADO.NAO_CONCLUIDO]: pedidoDeRetomar,
    };

    function pedidoDoCartao(envio, situacao, estado) {
      const falhou = Boolean(falhaAoRetomar(envio));
      const noLimite = estado ? raiz.EnvioNoLimite.pedido(envio, estado, { tentarDeNovo: () => continuarEnvio(envio), usarAChave: () => pedirAChave(envio), falhou, redesenhar }) : null;
      const pedido = PEDIDO_POR_ESTADO[situacao.estado]?.({ envio, situacao, estado, noLimite, falhou });
      if (pedido !== undefined) return pedido;
      return falhou ? { motivo: textoDaVoz('ENV-14.falha'), ...continuar(envio) } : null;
    }

    return { montarCartao };
  }

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
