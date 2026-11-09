'use strict';

// O cartão de um Envio no modal de progresso (ENV-06…14): a etapa com nome de gente, os 7 segmentos, o motivo e a ação quando ele
// precisa da pessoa, e o técnico em Detalhes. `painel-envio.js` guarda o que se sabe dos Envios e entra aqui com `criar`.

(function (raiz) {
  const { textoDaVoz, Veio, Contexto, IDIOMAS } = raiz;

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
  const FIM = { completed: 'concluido', partial: 'concluidoEmParte', failed: 'falhou' };
  const IDIOMA_DO_LANG = { en: 'INGLES', ru: 'RUSSO' };

  function nomeDoIdioma(lang) {
    return IDIOMAS[IDIOMA_DO_LANG[lang]].toLowerCase();
  }

  /** Terminou sem tudo virar cartão: Continuar envio retoma de onde parou. */
  function retomavel(estado) {
    return Boolean(estado) && (estado.status === 'partial' || estado.status === 'failed');
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

  /**
   * O que o plano do ChatGPT pede da pessoa quando parou o Envio (#156, docs/design/imagem-pelo-plano.md), pelo `lastError` dele; null para
   * outro. O limite de uso (o primeiro 429 logo depois de entrar também chega assim) leva a Gerenciar uso e a tentar de novo, sem dizer que a
   * cota acabou; a conta que o plano não atende leva à chave.
   */
  function doPlano(codigo) {
    if (codigo === 'chatgpt_usage_limit') return { motivo: textoDaVoz('ENV-20.limite'), ligacao: textoDaVoz('CFG-35.chatgptGerenciar') };
    if (codigo === 'chatgpt_not_eligible') return { motivo: textoDaVoz('CFG-35.erroChatgptNaoServe'), usarAChave: textoDaVoz('CFG-35.erroChatgptUsarChave') };
    return null;
  }

  /** “Usar a chave” (CFG-35): fecha o modal do Envio que está aberto e leva ao card da IA, que põe o foco no campo da chave. */
  function usarAChave() {
    document.querySelectorAll('.veio-scrim:not([hidden]) .veio-modal__fechar').forEach(fechar => fechar.click());
    location.hash = '#configuracoes/ia';
  }

  function ligacaoDeUso(rotulo, classe) {
    const link = elemento('a', classe, rotulo);
    Object.assign(link, { href: GERENCIAR_USO, target: '_blank', rel: 'noopener noreferrer' });
    return link;
  }

  /** As linhas que o resumo ganha no bloco de um idioma cujo Envio o plano parou: o motivo (com Gerenciar uso) e, se for o caso, Usar a chave. */
  function linhasDoPlano(codigo) {
    const plano = doPlano(codigo);
    if (!plano) return [];
    const linha = elemento('p', 'envio-resumo__linha', plano.motivo);
    if (plano.ligacao) linha.append(' ', ligacaoDeUso(plano.ligacao, 'veio-botao veio-botao--link'));
    return plano.usarAChave ? [linha, botao(plano.usarAChave, 'usar-chave', usarAChave)] : [linha];
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
    if (!fim) etapas.setAttribute('aria-valuetext', etapaDeSete(situacao));
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
   * `estadoDoJob(envio)` é o que a Conexão disse do Envio (ou null); `desconhecido(envio)`, se ela respondeu sem conhecê-lo (Esquecer: `esquecerOEnvio`); `falhaAoRetomar(envio)`, a causa de um Continuar envio que não
   * deu; `tentarCriarDeNovo` e `continuarEnvio` são as ações do cartão; `redesenhar()` refaz os cartões. Devolve `montarCartao(envio)`.
   */
  function criar({ estadoDoJob, desconhecido, esquecerOEnvio, falhaAoRetomar, tentarCriarDeNovo, continuarEnvio, redesenhar }) {
    /** O que o cartão diz: etapa, quanto da barra, se deu certo, e o técnico. */
    function situacaoDoEnvio(envio) {
      if (!envio.jobId) {
        if (!envio.falhaAoCriar) return { etapa: 'naFila', indice: 0, fracao: 0, pct: 0, tom: '', atualizadoEm: envio.criadoEm };
        return { etapa: 'naoComecou', fim: true, semEtapas: true, pct: 0, tom: 'erro', atualizadoEm: envio.criadoEm };
      }
      if (desconhecido(envio)) return { etapa: 'naoEncontrado', fim: true, semEtapas: true, pct: 0, tom: 'erro', atualizadoEm: envio.criadoEm };
      const estado = estadoDoJob(envio) || { status: 'queued', stage: 'queued' };
      const atualizadoEm = estado.updatedAt ? Date.parse(estado.updatedAt) : envio.criadoEm;
      const fim = FIM[estado.status];
      if (fim) return { etapa: fim, fim: true, pct: 100, tom: estado.status === 'completed' ? 'ok' : 'erro', atualizadoEm, estado };
      const indice = Math.max(0, ETAPAS.findIndex(([stage]) => stage === estado.stage));
      const { done, total } = estado.progress || {};
      const fracao = total > 0 ? Math.min(1, Number(done || 0) / Number(total)) : 0;
      return {
        etapa: ETAPAS[indice][1],
        indice,
        fracao,
        pct: Math.round(((indice + fracao) / ETAPAS.length) * 100),
        tom: '',
        atualizadoEm,
        estado,
      };
    }

    function montarCartao(envio) {
      const situacao = situacaoDoEnvio(envio);
      const { etapa, pct, atualizadoEm, estado } = situacao;
      const idioma = nomeDoIdioma(envio.lang);
      const cartao = elemento('section', 'envio-cartao');
      cartao.setAttribute('role', 'group');

      const titulo = elemento('h3', 'envio-cartao__titulo', textoDaVoz('ENV-08.titulo', { idioma, n: envio.ids.length }));
      titulo.id = `envio-titulo-${envio.id}`;
      cartao.setAttribute('aria-labelledby', titulo.id);
      // Enquanto o cartão espera a pessoa, a etapa e os segmentos ficam em tom calmo: quem fala é o motivo.
      if (pedidoDoCartao(envio, estado)) situacao.tom = 'calmo';
      const rotuloDaEtapa = elemento('span', `envio-cartao__etapa${situacao.tom ? ` envio-cartao__etapa--${situacao.tom}` : ''}`,
        textoDaVoz(etapa === 'naoEncontrado' ? 'ENV-22.etapa' : `ENV-07.${etapa}`));
      const topo = elemento('div', 'envio-cartao__topo', titulo, rotuloDaEtapa);

      cartao.append(topo, montarEtapas(situacao, titulo.id));

      // Quando o cartão precisa da pessoa: uma frase curta com o motivo e a ação como link
      // logo embaixo (a variante A da rodada 3 do PR #64). Nada de caixa de erro.
      const pedido = pedidoDoCartao(envio, estado);
      if (pedido?.motivo) {
        const motivo = elemento('p', 'envio-cartao__motivo');
        raiz.EnvioParado.escrever(motivo, pedido.motivo);
        cartao.append(motivo);
      }

      if (pedido?.acoes) cartao.append(montarAcoes(pedido.acoes));
      const atualizado = textoDaVoz('ENV-08.atualizado', { quando: Contexto.haQuanto(atualizadoEm) });
      const meta = elemento('div', 'envio-cartao__meta');
      if (pedido && !pedido.acoes) {
        const acao = botaoLink(pedido.rotulo, pedido.foco, pedido.aoUsar);
        if (pedido.emAndamento) acao.setAttribute('aria-disabled', 'true');
        meta.append(acao);
        if (pedido.ligacao) meta.append(ligacaoDeUso(pedido.ligacao, 'veio-botao veio-botao--link envio-cartao__acao'));
      }
      meta.append(elemento('span', '', situacao.fim ? atualizado : `${etapaDeSete(situacao)} · ${atualizado}`));
      cartao.append(meta);

      const falhaAoContinuar = falhaAoRetomar(envio);
      const causa = envio.falhaAoCriar ? envio.falhaAoCriar.causa : [
          `${envio.jobId} · lang=${envio.lang} · stage=${estado?.stage || 'queued'}`,
          // A mesma hora do “atualizado há …”: a da Conexão, ou a de quando o Envio foi criado.
          `updatedAt ${estado?.updatedAt || new Date(atualizadoEm).toISOString()}`,
          estado?.lastError || '',
          falhaAoContinuar || '',
          raiz.EnvioParado.causa(envio),
        ].filter(Boolean).join('\n');
      if (causa) cartao.append(Veio.montarDetalhes(causa));

      cartao.dataset.assinatura = [etapa, pct, situacao.tom, pedido?.motivo || '', pedido?.acoes?.map(a => a.rotulo + a.emAndamento) || '', meta.textContent, causa].join('|');
      return cartao;
    }

    /**
     * O que o cartão pede, quando pede: o motivo numa frase curta e a ação. Não começou →
     * Tentar de novo (ENV-03); Anki travado ou Continuar que não deu → o motivo e Continuar
     * envio; terminou em parte → só Continuar envio (a etapa já diz).
     */
    function pedidoDoCartao(envio, estado) {
      if (envio.falhaAoCriar) {
        return {
          motivo: textoDaVoz(envio.falhaAoCriar.motivo || (envio.falhaAoCriar.semResposta ? 'ENV-03.motivoSemResposta' : 'ENV-03.motivo')),
          rotulo: textoDaVoz('ENV-03.tentarDeNovo'), foco: 'tentar', aoUsar: () => tentarCriarDeNovo(envio),
        };
      }
      // A Conexão responde e não conhece o Envio (#245): quem decide é a pessoa, e o Envio não é dado por falho.
      if (desconhecido(envio)) return { motivo: textoDaVoz('ENV-22.motivo'), rotulo: textoDaVoz('ENV-22.esquecer'), foco: 'esquecer', aoUsar: () => esquecerOEnvio(envio) };
      // O Anki fechou no meio: o que ficou em `waiting` é de antes, e quem fala é o Envio parado (#151).
      const parado = raiz.EnvioParado.pedido(envio, estado);
      if (parado) return parado;
      const noLimite = raiz.EnvioNoLimite.pedido(envio, estado, { tentarDeNovo: () => continuarEnvio(envio), falhou: Boolean(falhaAoRetomar(envio)), redesenhar });
      if (noLimite) return noLimite;
      const noTeto = raiz.EnvioNoTeto.pedido(envio, estado); // o teto do mês (#160): pausa sem valor, com Ver Custos
      if (noTeto) return noTeto;
      const espera = estado?.waiting;
      if (espera?.reason === 'other_profile') {
        return {
          motivo: textoDaVoz(falhasAoAbrirOPerfil.has(envio.jobId) ? 'ENV-17.falha' : 'ENV-17.espera', { aberto: espera.profile }),
          rotulo: textoDaVoz('ENV-17.abrir', { perfil: espera.marked }), foco: 'abrir-perfil', aoUsar: () => abrirOPerfil(envio),
        };
      }
      if (espera?.reason === 'profile_missing') {
        return { motivo: textoDaVoz('ENV-17.sumiu', { perfil: espera.marked }), rotulo: textoDaVoz('ENV-17.escolher'), foco: 'escolher-perfil', aoUsar: escolherOutroPerfil };
      }
      const falhaAoContinuar = falhaAoRetomar(envio);
      // Tentar de novo no próprio cartão do Envio que ficou em parte ou não concluiu; Continuar envio só onde falta a pessoa agir antes.
      const continuar = { rotulo: textoDaVoz('ENV-03.tentarDeNovo'), foco: 'continuar', aoUsar: () => continuarEnvio(envio) };
      if (falhaAoContinuar) return { motivo: textoDaVoz('ENV-14.falha'), ...continuar };
      const plano = retomavel(estado) ? doPlano(estado.lastError) : null;
      if (plano?.usarAChave) return { motivo: plano.motivo, rotulo: plano.usarAChave, foco: 'usar-chave', aoUsar: usarAChave };
      if (plano) return { motivo: plano.motivo, ligacao: plano.ligacao, ...continuar };
      return retomavel(estado) ? continuar : null;
    }

    return { montarCartao };
  }

  raiz.CartaoDoEnvio = Object.freeze({ ETAPAS, FIM, IDIOMA_DO_LANG, nomeDoIdioma, retomavel, botao, elemento, linhasDoPlano, criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
