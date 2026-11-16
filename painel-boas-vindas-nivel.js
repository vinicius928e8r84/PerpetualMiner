'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, IDIOMAS, AjustesDeEnvio } = raiz;
  const IDIOMAS_DO_PASSO = [{ chave: 'en', idioma: IDIOMAS.INGLES }, { chave: 'ru', idioma: IDIOMAS.RUSSO }];
  const VOZ_DO_NIVEL = { iniciante: 'BRG-42.iniciante', intermediario: 'BRG-42.intermediario', avancado: 'BRG-42.avancado' };

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  function valorDoResumo(estado) {
    return IDIOMAS_DO_PASSO.filter(({ chave }) => estado.automatica[chave])
      .map(({ chave, idioma }) => textoDaVoz('ONB-13.nivel', { idioma, nivel: textoDaVoz(VOZ_DO_NIVEL[AjustesDeEnvio.atual()[chave].nivel]) })).join(' · ');
  }

  function guardarONivel(passo, lang, nivel) {
    passo.gravando = passo.gravando.then(async () => {
      passo.falha.hidden = true;
      try {
        const atuais = await AjustesDeEnvio.ler();
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
      const campo = raiz.EstiloDoCartao.campo(chave, bloco.rascunho, { prefixo: 'bv', aoEscolher: nivel => guardarONivel(passo, chave, nivel) });
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

    function desenhar(estado) {
      const ligados = IDIOMAS_DO_PASSO.filter(({ chave }) => estado?.automatica[chave]);
      semIdioma.hidden = !estado || ligados.length > 0;
      const grupos = ligados.map(({ chave, idioma }) => {
        const salvo = AjustesDeEnvio.atual()[chave];
        let bloco = passo.blocos.get(chave);
        const veioDeFora = bloco && salvo.nivel !== bloco.salvo && salvo.nivel !== bloco.rascunho.nivel;
        if (!bloco || (!bloco.quiz && veioDeFora)) {
          bloco?.quiz?.parar();
          const corpo = elemento('div', 'bv-nivel__corpo');
          const grupo = elemento('div', 'bv-nivel', elemento('h3', 'bv-nivel__idioma', idioma), corpo);
          grupo.setAttribute('role', 'group');
          grupo.setAttribute('aria-label', idioma);
          bloco = { grupo, corpo, rascunho: { nivel: salvo.nivel }, salvo: salvo.nivel, quiz: null };
          passo.blocos.set(chave, bloco);
          mostrarOCampo(chave, bloco);
        }
        if (!bloco.quiz) bloco.salvo = salvo.nivel;
        return bloco.grupo;
      });
      // Refazer a lista com os mesmos nós os tira da página e o foco cai no body: só troca quando a lista mudou.
      if (grupos.length !== campos.children.length || grupos.some((g, i) => g !== campos.children[i])) campos.replaceChildren(...grupos);
    }

    return { no, desenhar };
  }

  raiz.PassoDoNivel = Object.freeze({ montar, valorDoResumo });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
