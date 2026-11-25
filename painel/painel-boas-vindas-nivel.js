'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, IDIOMAS, AjustesDeEnvio } = raiz;
  const { elemento } = Veio;
  const IDIOMAS_DO_PASSO = [{ chave: 'en', idioma: IDIOMAS.INGLES }, { chave: 'ru', idioma: IDIOMAS.RUSSO }];
  const VOZ_DO_NIVEL = { iniciante: 'BRG-42.iniciante', intermediario: 'BRG-42.intermediario', avancado: 'BRG-42.avancado' };

  function valorDoResumo(estado) {
    return IDIOMAS_DO_PASSO.filter(({ chave }) => estado.automatica[chave])
      .map(({ chave, idioma }) => textoDaVoz('ONB-13.nivel', { idioma, nivel: textoDaVoz(VOZ_DO_NIVEL[AjustesDeEnvio.atual()[chave].nivel]) })).join(' · ');
  }

  const nivelJaSalvo = (ajustes, nivel) => ajustes.versao > 0 && ajustes.nivel === nivel;

  function mudouPorFora(bloco, nivelSalvo) {
    return nivelSalvo !== bloco.salvo && nivelSalvo !== bloco.rascunho.nivel;
  }

  function blocoPrecisaSerRefeito(bloco, nivelSalvo) {
    if (!bloco) return true;
    return !bloco.quiz && mudouPorFora(bloco, nivelSalvo);
  }

  function novoBloco(idioma, nivelSalvo) {
    const corpo = elemento('div', 'bv-nivel__corpo');
    const grupo = elemento('div', 'bv-nivel', elemento('h3', 'bv-nivel__idioma', idioma), corpo);
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', idioma);
    return { grupo, corpo, rascunho: { nivel: nivelSalvo }, salvo: nivelSalvo, quiz: null };
  }

  function listaMudou(grupos, campos) {
    return grupos.length !== campos.children.length || grupos.some((g, i) => g !== campos.children[i]);
  }

  function guardarONivel(passo, lang, nivel, { soSeNaoSalvo = false } = {}) {
    passo.gravando = passo.gravando.then(async () => {
      passo.falha.hidden = true;
      try {
        const atuais = await AjustesDeEnvio.ler();
        if (soSeNaoSalvo && nivelJaSalvo(atuais[lang], nivel)) return;
        let resposta = await AjustesDeEnvio.salvar(lang, { ...atuais[lang], nivel }, atuais[lang].versao);
        if (!resposta.ok) resposta = await AjustesDeEnvio.salvar(lang, { ...resposta.ajustes[lang], nivel }, resposta.ajustes[lang].versao);
        if (!resposta.ok) throw new Error('ajustes_desatualizados');
      } catch {
        passo.falha.replaceChildren(Veio.iconeVeio('alerta'), textoDaVoz('ONB-20.falha'));
        passo.falha.hidden = false;
      }
    });
    return passo.gravando;
  }

  function montar({ aoLigar }) {
    const ligar = elemento('button', 'veio-botao veio-botao--secundario', textoDaVoz('ONB-20.ligar'));
    ligar.type = 'button';
    ligar.addEventListener('click', aoLigar);
    const semIdioma = elemento('div', 'bv-controle', elemento('p', 'bv-texto', textoDaVoz('ONB-20.semIdioma')), ligar);
    const campos = elemento('div', 'bv-controle bv-niveis');
    const falha = elemento('p', 'bv-falha');
    falha.setAttribute('role', 'alert');
    falha.hidden = true;
    const passo = { gravando: Promise.resolve(), falha, blocos: new Map() };
    const no = elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-20.corpo')), semIdioma, campos, falha, raiz.EstiloDoCartao.maisEstilosEmAjustes());

    function mostrarOCampo(chave, bloco) {
      const campo = raiz.EstiloDoCartao.campo(chave, bloco.rascunho, { prefixo: 'bv', aoEscolher: nivel => guardarONivel(passo, chave, nivel), aoConfirmar: nivel => guardarONivel(passo, chave, nivel, { soSeNaoSalvo: true }) });
      const descobrir = elemento('button', 'veio-botao veio-botao--secundario bv-nivel__descobrir', textoDaVoz('ONB-21.descobrir'));
      descobrir.type = 'button';
      descobrir.addEventListener('click', () => abrirOQuiz(chave, bloco));
      bloco.corpo.replaceChildren(campo, descobrir);
    }

    function abrirOQuiz(chave, bloco) {
      bloco.quiz = raiz.QuizNaTela.montar({
        lang: chave,
        aoSair: () => fecharOQuiz(chave, bloco),
        aoUsar: async nivel => {
          await guardarONivel(passo, chave, nivel);
          if (!passo.falha.hidden) return false;
          bloco.rascunho.nivel = nivel;
          fecharOQuiz(chave, bloco);
          return true;
        },
      });
      bloco.corpo.replaceChildren(bloco.quiz.no);
      bloco.quiz.iniciar();
    }

    function fecharOQuiz(chave, bloco) {
      bloco.quiz?.parar();
      bloco.quiz = null;
      mostrarOCampo(chave, bloco);
    }

    function grupoDoIdioma(chave, idioma) {
      const nivelSalvo = AjustesDeEnvio.atual()[chave].nivel;
      let bloco = passo.blocos.get(chave);
      if (blocoPrecisaSerRefeito(bloco, nivelSalvo)) {
        bloco?.quiz?.parar();
        bloco = novoBloco(idioma, nivelSalvo);
        passo.blocos.set(chave, bloco);
        mostrarOCampo(chave, bloco);
      }
      if (!bloco.quiz) bloco.salvo = nivelSalvo;
      return bloco.grupo;
    }

    function desenhar(estado) {
      const ligados = IDIOMAS_DO_PASSO.filter(({ chave }) => estado?.automatica[chave]);
      semIdioma.hidden = !estado || ligados.length > 0;
      const grupos = ligados.map(({ chave, idioma }) => grupoDoIdioma(chave, idioma));
      if (listaMudou(grupos, campos)) campos.replaceChildren(...grupos);
    }

    return { no, desenhar };
  }

  raiz.PassoDoNivel = Object.freeze({ montar, valorDoResumo });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
