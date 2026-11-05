'use strict';

// O passo do nível do cartão da Boas-vindas (#164, ONB-20): para cada idioma ligado na mineração automática, o Estilo do cartão de Ajustes de envio
// (o controle do nível e a prévia do Cartão, `painel-anki-estilo.js`), que aqui salva ao escolher. Sem idioma ligado, o passo diz onde ligar.
// “Mais estilos em Ajustes de envio” fecha o passo: o onboarding só pergunta o nível. `painel-boas-vindas.js` o põe na lista de passos.

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

  /** O que Tudo pronto mostra do passo feito: o idioma e o nível salvo de cada idioma ligado (“Inglês: Intermediário”). */
  function valorDoResumo(estado) {
    return IDIOMAS_DO_PASSO.filter(({ chave }) => estado.automatica[chave])
      .map(({ chave, idioma }) => textoDaVoz('ONB-13.nivel', { idioma, nivel: textoDaVoz(VOZ_DO_NIVEL[AjustesDeEnvio.atual()[chave].nivel]) })).join(' · ');
  }

  /** Escolher um nível o salva na hora, como Ajustes de envio o guarda (só o nível do idioma; o resto fica como está). */
  function guardarONivel(passo, lang, nivel) {
    passo.gravando = passo.gravando.then(async () => {
      passo.falha.hidden = true;
      try {
        const atuais = await AjustesDeEnvio.ler();
        let resposta = await AjustesDeEnvio.salvar(lang, { ...atuais[lang], nivel }, atuais[lang].versao);
        // Outra aba salvou este idioma no meio: o nível vale por cima do que ela salvou.
        if (!resposta.ok) resposta = await AjustesDeEnvio.salvar(lang, { ...resposta.ajustes[lang], nivel }, resposta.ajustes[lang].versao);
        if (!resposta.ok) throw new Error('ajustes_desatualizados');
      } catch {
        passo.falha.replaceChildren(Veio.iconeVeio('alerta'), textoDaVoz('ONB-20.falha'));
        passo.falha.hidden = false;
      }
    });
    return passo.gravando;
  }

  /** O corpo do passo; `aoLigar` leva à mineração automática (o aviso de não haver idioma ligado). Devolve `{ no, desenhar(estado) }`. */
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

    /** Um campo por idioma ligado; o de um idioma que continua ligado não é refeito (a prévia não pisca), salvo se o nível salvo mudou por fora. */
    function desenhar(estado) {
      const ligados = IDIOMAS_DO_PASSO.filter(({ chave }) => estado?.automatica[chave]);
      semIdioma.hidden = !estado || ligados.length > 0;
      campos.replaceChildren(...ligados.map(({ chave, idioma }) => {
        const salvo = AjustesDeEnvio.atual()[chave];
        let bloco = passo.blocos.get(chave);
        if (!bloco || bloco.rascunho.nivel !== salvo.nivel) {
          const rascunho = { nivel: salvo.nivel };
          const campo = raiz.EstiloDoCartao.campo(chave, rascunho, { prefixo: 'bv', aoEscolher: nivel => guardarONivel(passo, chave, nivel) });
          const grupo = elemento('div', 'bv-nivel', elemento('h3', 'bv-nivel__idioma', idioma), campo);
          grupo.setAttribute('role', 'group');
          grupo.setAttribute('aria-label', idioma);
          bloco = { grupo, rascunho };
          passo.blocos.set(chave, bloco);
        }
        return bloco.grupo;
      }));
    }

    return { no, desenhar };
  }

  raiz.PassoDoNivel = Object.freeze({ montar, valorDoResumo });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
