'use strict';

// O cartão de um Envio no modal de progresso (ENV-06…14): a etapa com nome de gente, os 7 segmentos, o motivo e a ação quando ele
// precisa da pessoa, e o técnico em Detalhes. `painel-envio.js` guarda o que se sabe dos Envios e entra aqui com `criar`. O que o
// Envio é agora sai de `SituacaoDoEnvio` (`painel-envio-estado.js`): este arquivo desenha cada estado e não decide nenhum.

(function (raiz) {
  const { textoDaVoz, Veio, Contexto, IDIOMAS, SituacaoDoEnvio } = raiz;
  const { ESTADO, ESPERA, AJUDA } = SituacaoDoEnvio;

  // As etapas do Envio, na ordem, com o nome de gente de cada uma (ENV-07).
  const ETAPAS = [
    ['queued', 'naFila'],
    ['generate_cards', 'criandoCartoes'],
    ['extract_prompts', 'preparandoImagens'],
    ['generate_audio', 'gerandoAudio'],
    ['generate_images', 'escolhendoImagens'],
    ['wait_anki', 'esperandoOAnki'],
    ['send_to_anki', 'enviandoAoAnki'],
  ];
  // A etapa que o cartão diz no fim e antes do começo (a chave no catálogo da Voz) e o tom dela.
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

  // O Envio espera por causa do perfil do Anki (#149): `estado.waiting` diz qual, e a ação é a do cartão.
  const abrindoOPerfil = new Set();
  const falhasAoAbrirOPerfil = new Set();

  /** “Abrir <perfil>” (ENV-17): a Conexão fecha o perfil aberto pelo caminho do Anki (que sincroniza) e abre o marcado. */
  async function abrirOPerfil(envio) {
    if (abrindoOPerfil.has(envio.jobId)) return;
    abrindoOPerfil.add(envio.jobId);
    try {
      const resposta = await raiz.PedidoAoAnki.pedir(raiz.ConexaoAnki.ENDERECO, raiz.PedidoAoAnki.abrirOPerfilMarcado());
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      falhasAoAbrirOPerfil.delete(envio.jobId);
    } catch {
      falhasAoAbrirOPerfil.add(envio.jobId);
    } finally {
      abrindoOPerfil.delete(envio.jobId);
    }
  }

  /** “Escolher perfil” (ENV-17): o marcado já não existe; a escolha mora nas Configurações. */
  function escolherOutroPerfil() {
    document.getElementById('modal-envio-fechar')?.click();
    location.hash = '#configuracoes/anki';
  }

  // Gerenciar uso: a página de uso do ChatGPT, a mesma do card da IA (painel-ia-chatgpt.js).
  const GERENCIAR_USO = 'https://chatgpt.com/settings/usage';

  /** O que o painel diz do motivo (o `lastError`) de um Envio que não concluiu, pela tabela dos motivos: a frase e a ajuda; null quando ele não tem o que dizer. */
  function doMotivo(codigo) {
    const { noPainel, ajuda } = SituacaoDoEnvio.doCodigo(codigo);
    return noPainel ? { motivo: textoDaVoz(noPainel), ajuda } : null;
  }
  // A ajuda que leva ao card da IA: a chave recusada, sem crédito ou que falta (Trocar a chave), a conta que o plano não atende (Usar a chave, #156) e o login que acabou.
  const ROTULO_DA_CHAVE = { [AJUDA.TROCAR_A_CHAVE]: 'ONB-23.trocarAChave', [AJUDA.USAR_A_CHAVE]: 'CFG-35.erroChatgptUsarChave', [AJUDA.ESCOLHER_QUEM_PAGA]: 'CFG-46.abrir' };
  const gerenciarUso = ajuda => (ajuda === AJUDA.GERENCIAR_USO ? textoDaVoz('CFG-35.chatgptGerenciar') : null);

  /** “Usar a chave” e “Trocar a chave”: fecha o modal do Envio que está aberto e leva ao card da IA, que põe o foco no campo da chave. */
  function usarAChave() {
    document.querySelectorAll('.veio-scrim:not([hidden]) .veio-modal__fechar').forEach(fechar => fechar.click());
    location.hash = '#configuracoes/ia';
  }

  function ligacaoDeUso(rotulo, classe) {
    const link = elemento('a', classe, rotulo);
    Object.assign(link, { href: GERENCIAR_USO, target: '_blank', rel: 'noopener noreferrer' });
    return link;
  }

  /** As linhas que o resumo ganha no bloco de um idioma cujo Envio não concluiu: o motivo (com Gerenciar uso, se for o limite do plano) e, se a saída é a chave, o botão dela. */
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

  /**
   * As 7 etapas do caminho em segmentos: as feitas cheias, a atual enchendo pelo
   * `done/total` dela. No fim, todas na cor do desfecho.
   */
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
      // Não começou: nenhuma etapa andou.
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

  /** A ação do cartão: um link dourado, com a seta no fim. */
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

  /** As ações de um cartão que tem mais de uma (#158): a principal é um link (`href`) dourado cheio, as outras botões secundários. */
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

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  /**
   * `situacaoDe(envio)` é o estado do Envio (`SituacaoDoEnvio`); `estadoDoJob(envio)`, o que a Conexão disse dele (ou null); `esquecerOEnvio`, o Esquecer; `falhaAoRetomar(envio)`, a causa de um Continuar envio que não
   * deu; `tentarCriarDeNovo` e `continuarEnvio` são as ações do cartão; `redesenhar()` refaz os cartões. Devolve `montarCartao(envio)`.
   */
  function criar({ situacaoDe, estadoDoJob, esquecerOEnvio, falhaAoRetomar, tentarCriarDeNovo, continuarEnvio, redesenhar }) {
    /** Como o cartão desenha a situação: a etapa (a chave no catálogo), quanto da barra e o tom. */
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
      // Quando o cartão precisa da pessoa: uma frase curta com o motivo e a ação como link
      // logo embaixo (a variante A da rodada 3 do PR #64). Nada de caixa de erro.
      const pedido = pedidoDoCartao(envio, situacao, estado);
      // Enquanto o cartão espera a pessoa, a etapa e os segmentos ficam em tom calmo: quem fala é o motivo.
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
          // A mesma hora do “atualizado há …”: a da Conexão, ou a de quando o Envio foi criado.
          `updatedAt ${estado?.updatedAt || new Date(atualizadoEm).toISOString()}`,
          estado?.lastError || '',
          falhaAoContinuar || '',
          raiz.EnvioParado.causa(envio),
        ].filter(Boolean).join('\n');
      if (causa) cartao.append(Veio.montarDetalhes(causa));

      cartao.dataset.assinatura = [retrato.etapa, retrato.pct, retrato.tom, pedido?.motivo || '', pedido?.acoes?.map(a => a.rotulo + a.emAndamento) || '', meta.textContent, causa].join('|');
      return cartao;
    }

    /** O que o cartão pede de quem espera (`situacao.espera`): o plano (#158), o teto do mês (#160), o perfil do Anki (#149) ou o Anki que não responde (#246). */
    function pedidoDaEspera(envio, { espera }, estado, noLimite) {
      if (espera === ESPERA.PLANO) return noLimite;
      if (espera === ESPERA.TETO) return raiz.EnvioNoTeto.pedido(envio, estado);   // pausa sem valor, com Ver Custos
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

    /**
     * O que o cartão pede, quando pede: o motivo numa frase curta e a ação, um por estado. Não começou → Tentar de novo (ENV-03); a
     * Conexão não o conhece, ou as Frases dele foram apagadas → Esquecer; parado ou esperando → o que destrava; não concluído → o motivo
     * da tabela e a ajuda dela (Tentar de novo quando não há outra). Um Continuar que não deu fala por cima do resto (ENV-14).
     */
    function pedidoDoCartao(envio, situacao, estado) {
      const esquecer = motivo => ({ motivo, rotulo: textoDaVoz('ENV-23.esquecer'), foco: 'esquecer', aoUsar: () => esquecerOEnvio(envio) });
      // Tentar de novo no próprio cartão do Envio que ficou em parte ou não concluiu; Continuar envio só onde falta a pessoa agir antes.
      const continuar = { rotulo: textoDaVoz('ENV-03.tentarDeNovo'), foco: 'continuar', aoUsar: () => continuarEnvio(envio) };
      const falhou = Boolean(falhaAoRetomar(envio));
      // Perguntado a cada desenho: fora do limite, ele esquece que a pessoa já tinha escolhido a chave.
      const noLimite = estado ? raiz.EnvioNoLimite.pedido(envio, estado, { tentarDeNovo: () => continuarEnvio(envio), falhou, redesenhar }) : null;
      switch (situacao.estado) {
        case ESTADO.NAO_COMECOU:
          return { motivo: textoDaVoz(MOTIVO_DE_NAO_COMECAR[situacao.causa]), rotulo: textoDaVoz('ENV-03.tentarDeNovo'), foco: 'tentar', aoUsar: () => tentarCriarDeNovo(envio) };
        case ESTADO.DESCONHECIDO:
          return esquecer(textoDaVoz('ENV-23.motivo'));   // quem decide é a pessoa, e o Envio não é dado por falho (#245)
        case ESTADO.APAGADO:
          return esquecer(textoDaVoz('ENV-24.apagado'));   // nada a retomar: a Conexão não tem mais as Frases
        case ESTADO.PARADO:
          return raiz.EnvioParado.pedido(envio, estado);   // o que ficou em `waiting` é de antes: quem fala é o Envio parado (#151)
        case ESTADO.ESPERANDO: {
          const pedido = pedidoDaEspera(envio, situacao, estado, noLimite);
          if (pedido) return pedido;
          break;
        }
        case ESTADO.EM_PARTE:
        case ESTADO.NAO_CONCLUIDO: {
          if (falhou) break;
          if (!SituacaoDoEnvio.retomavel(situacao)) return null;   // sem as Frases na Conexão nada se retoma: o resumo monta um Envio novo
          const dito = doMotivo(situacao.motivo);
          if (!dito) return continuar;
          if (ROTULO_DA_CHAVE[dito.ajuda]) return { motivo: dito.motivo, rotulo: textoDaVoz(ROTULO_DA_CHAVE[dito.ajuda]), foco: 'usar-chave', aoUsar: usarAChave };
          return { motivo: dito.motivo, ligacao: gerenciarUso(dito.ajuda), ...continuar };
        }
        default:
      }
      return falhou ? { motivo: textoDaVoz('ENV-14.falha'), ...continuar } : null;
    }

    return { montarCartao };
  }

  /** O nome do baralho sem o `::` do Anki: os níveis ficam separados por ›. */
  function nomeDoBaralho({ lang, baralho }) {
    return raiz.AjustesDeEnvio.nomeDoBaralho(baralho || raiz.AjustesDeEnvio.atual()[lang].deckName);
  }

  /** Um bloco por idioma: +N cartões, baralho, o que já estava lá, o que não entrou, Tentar de novo. */
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

  // #372: o que de um Envio terminado não virou cartão. A ficha que a retenção deixa não se retoma, então o Tentar de novo do resumo
  // monta um Envio novo só com essas Frases (`recriar`; `criar` é o POST /jobs).
  const comoNumeros = lista => new Set((lista || []).map(Number));

  function conjuntos(estado) {
    return { sucesso: comoNumeros(estado.successfulPhraseIds), falha: comoNumeros(estado.failedPhraseIds), dup: comoNumeros(estado.duplicatePhraseIds) };
  }

  /** Na dúvida, a Frase fica entre as que não entraram: uma que a Conexão dá também como falha não é dada como enviada. */
  function naoEntrou(envio, estado) {
    const { sucesso, falha } = conjuntos(estado);
    return envio.ids.filter(id => !sucesso.has(Number(id)) || falha.has(Number(id)));
  }

  async function recriar(remessa, envio, estado, criar) {
    const resto = naoEntrou(envio, estado);
    if (!resto.length) return;
    const novo = { id: crypto.randomUUID(), lang: envio.lang, ids: resto, jobId: null, criadoEm: Date.now(), falhaAoCriar: null };
    // O Envio antigo fica só com o que entrou: o resumo seguinte não conta de novo o que já passou.
    envio.ids = envio.ids.filter(id => !resto.includes(id));
    remessa.envios.push(novo);
    await criar(novo);
  }

  raiz.CartaoDoEnvio = Object.freeze({ ETAPAS, IDIOMA_DO_LANG, nomeDoIdioma, botao, elemento, montarBlocoDoResumo, criar, conjuntos, recriar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
