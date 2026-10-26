'use strict';

// O cartão de um Envio no modal de progresso (ENV-06…14): a etapa com nome de gente, os 7 segmentos, o motivo e a ação quando ele
// precisa da pessoa, e o técnico em Detalhes. `painel-envio.js` guarda o que se sabe dos Envios e entra aqui com `criar`.

(function (raiz) {
  const { textoDaVoz, Veio, Contexto, IDIOMAS } = raiz;

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

  function nomeDoIdioma(lang) {
    return IDIOMAS[IDIOMA_DO_LANG[lang]].toLowerCase();
  }

  /** Terminou sem tudo virar cartão: Continuar envio retoma de onde parou. */
  function retomavel(estado) {
    return Boolean(estado) && (estado.status === 'partial' || estado.status === 'failed');
  }

  /** O Windows não deixou a Conexão fechar o Anki travado: a pessoa precisa fechá-lo antes. */
  function ankiTravado(estado) {
    return estado?.ankiError === 'repair_access_denied';
  }

  // O Envio espera por causa do perfil do Anki (#149): `estado.waiting` diz qual, e a ação é a do cartão.
  const abrindoOPerfil = new Set();
  const falhasAoAbrirOPerfil = new Set();

  /** “Abrir <perfil>” (ENV-16): a Conexão fecha o perfil aberto pelo caminho do Anki (que sincroniza) e abre o marcado. */
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

  /** “Escolher perfil” (ENV-16): o marcado já não existe; a escolha mora nas Configurações. */
  function escolherOutroPerfil() {
    document.getElementById('modal-envio-fechar')?.click();
    location.hash = '#configuracoes/anki';
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

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  /**
   * `estadoDoJob(envio)` é o que a Conexão disse do Envio (ou null); `falhaAoRetomar(envio)`, a causa de um Continuar envio que não
   * deu; `tentarCriarDeNovo` e `continuarEnvio` são as ações do cartão. Devolve `montarCartao(envio)`.
   */
  function criar({ estadoDoJob, falhaAoRetomar, tentarCriarDeNovo, continuarEnvio }) {
    /** O que o cartão diz: etapa, quanto da barra, se deu certo, e o técnico. */
    function situacaoDoEnvio(envio) {
      if (!envio.jobId) {
        if (!envio.falhaAoCriar) return { etapa: 'naFila', indice: 0, fracao: 0, pct: 0, tom: '', atualizadoEm: envio.criadoEm };
        return { etapa: 'naoComecou', fim: true, semEtapas: true, pct: 0, tom: 'erro', atualizadoEm: envio.criadoEm };
      }
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
        textoDaVoz(`ENV-07.${etapa}`));
      const topo = elemento('div', 'envio-cartao__topo', titulo, rotuloDaEtapa);

      cartao.append(topo, montarEtapas(situacao, titulo.id));

      // Quando o cartão precisa da pessoa: uma frase curta com o motivo e a ação como link
      // logo embaixo (a variante A da rodada 3 do PR #64). Nada de caixa de erro.
      const pedido = pedidoDoCartao(envio, estado);
      if (pedido?.motivo) cartao.append(elemento('p', 'envio-cartao__motivo', pedido.motivo));

      const atualizado = textoDaVoz('ENV-08.atualizado', { quando: Contexto.haQuanto(atualizadoEm) });
      const meta = elemento('div', 'envio-cartao__meta');
      if (pedido) meta.append(botaoLink(pedido.rotulo, pedido.foco, pedido.aoUsar));
      meta.append(elemento('span', '', situacao.fim ? atualizado : `${etapaDeSete(situacao)} · ${atualizado}`));
      cartao.append(meta);

      const falhaAoContinuar = falhaAoRetomar(envio);
      const causa = envio.falhaAoCriar ? envio.falhaAoCriar.causa : [
          `${envio.jobId} · lang=${envio.lang} · stage=${estado?.stage || 'queued'}`,
          // A mesma hora do “atualizado há …”: a da Conexão, ou a de quando o Envio foi criado.
          `updatedAt ${estado?.updatedAt || new Date(atualizadoEm).toISOString()}`,
          estado?.lastError || '',
          falhaAoContinuar || '',
        ].filter(Boolean).join('\n');
      if (causa) cartao.append(Veio.montarDetalhes(causa));

      cartao.dataset.assinatura = [etapa, pct, situacao.tom, pedido?.motivo || '', meta.textContent, causa].join('|');
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
      const espera = estado?.waiting;
      if (espera?.reason === 'other_profile') {
        return {
          motivo: textoDaVoz(falhasAoAbrirOPerfil.has(envio.jobId) ? 'ENV-16.falha' : 'ENV-16.espera', { aberto: espera.profile }),
          rotulo: textoDaVoz('ENV-16.abrir', { perfil: espera.marked }), foco: 'abrir-perfil', aoUsar: () => abrirOPerfil(envio),
        };
      }
      if (espera?.reason === 'profile_missing') {
        return { motivo: textoDaVoz('ENV-16.sumiu', { perfil: espera.marked }), rotulo: textoDaVoz('ENV-16.escolher'), foco: 'escolher-perfil', aoUsar: escolherOutroPerfil };
      }
      const falhaAoContinuar = falhaAoRetomar(envio);
      const continuar = { rotulo: textoDaVoz('ENV-13.continuar'), foco: 'continuar', aoUsar: () => continuarEnvio(envio) };
      if (falhaAoContinuar) return { motivo: textoDaVoz('ENV-14.falha'), ...continuar };
      if (ankiTravado(estado)) return { motivo: textoDaVoz('BRG-18'), ...continuar };
      if (retomavel(estado)) return continuar;
      return null;
    }

    return { montarCartao };
  }

  raiz.CartaoDoEnvio = Object.freeze({ ETAPAS, FIM, IDIOMA_DO_LANG, nomeDoIdioma, retomavel, botao, elemento, criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
