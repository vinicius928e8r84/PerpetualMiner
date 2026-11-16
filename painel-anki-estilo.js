'use strict';

(function (raiz) {
  const { elemento } = raiz.Veio;
  const { textoDaVoz, AjustesDeEnvio, IDIOMAS, ConexaoAnki } = raiz;
  const { NIVEIS, FRENTES, frenteDisponivel } = AjustesDeEnvio;
  const AO_MUDAR_O_NIVEL = new WeakMap();
  const NOME_DO_IDIOMA = { en: IDIOMAS.INGLES, ru: IDIOMAS.RUSSO };
  const VOZ_DO_NIVEL = {
    iniciante: ['BRG-42.iniciante', 'BRG-42.textoIniciante'],
    intermediario: ['BRG-42.intermediario', 'BRG-42.textoIntermediario'],
    avancado: ['BRG-42.avancado', 'BRG-42.textoAvancado'],
  };

  const VOZ_DA_FRENTE = {
    frase_com_audio: ['BRG-44.fraseComAudio', 'BRG-44.textoFraseComAudio'],
    ouvir_primeiro: ['BRG-44.ouvirPrimeiro', 'BRG-44.textoOuvirPrimeiro'],
    lacuna: ['BRG-44.lacuna', 'BRG-44.textoLacuna'],
    producao: ['BRG-44.producao', 'BRG-44.textoProducao'],
    ditado: ['BRG-44.ditado', 'BRG-44.textoDitado'],
    criacao: ['BRG-44.criacao', 'BRG-44.textoCriacao'],
  };

  function preencher(lang, nivel, texto) {
    texto.textContent = textoDaVoz(VOZ_DO_NIVEL[nivel][1], { idioma: NOME_DO_IDIOMA[lang].toLowerCase() });
  }

  function campo(lang, rascunho, { prefixo = 'ajustes', aoEscolher, tipoProprio = prefixo === 'ajustes' } = {}) {
    const id = `${prefixo}-estilo-${lang}`;
    const rotulo = elemento('span', 'ajustes-campo__rotulo', textoDaVoz('BRG-42.titulo'));
    rotulo.id = `${id}-rotulo`;
    const texto = elemento('span', 'ajustes-campo__ajuda');
    texto.id = `${id}-texto`;
    preencher(lang, rascunho.nivel, texto);
    const previa = raiz.PreviaDoCartao.montar({ prefixo, lang });
    previa.mostrar(rascunho.nivel);
    previa.no.hidden = Boolean(rascunho.tipoProprio);
    const proprio = !tipoProprio ? null : raiz.TipoProprioDoCartao.montar({
      lang, rascunho, nivelAtual: () => rascunho.nivel,
      aoMudar: () => {
        previa.no.hidden = Boolean(rascunho.tipoProprio);
        const frente = document.getElementById(`ajustes-frente-${lang}-bloco`);
        if (frente) frente.hidden = Boolean(rascunho.tipoProprio);
      },
    });
    const grupo = elemento('div', 'veio-segmentado', ...NIVEIS.map(nivel => {
      const radio = elemento('input', '');
      radio.type = 'radio';
      radio.name = id;
      radio.value = nivel;
      radio.checked = rascunho.nivel === nivel;
      radio.addEventListener('change', () => {
        rascunho.nivel = nivel;
        preencher(lang, nivel, texto);
        previa.mostrar(nivel);
        proprio?.mostrarNivel();
        AO_MUDAR_O_NIVEL.get(rascunho)?.(nivel);
        aoEscolher?.(nivel);
      });
      return elemento('label', 'veio-segmentado__opcao', radio, elemento('span', '', textoDaVoz(VOZ_DO_NIVEL[nivel][0])));
    }));
    grupo.setAttribute('role', 'radiogroup');
    grupo.setAttribute('aria-labelledby', rotulo.id);
    grupo.setAttribute('aria-describedby', texto.id);
    return elemento('div', 'ajustes-campo', rotulo, grupo, texto, previa.no, ...(proprio ? [proprio.no] : []));
  }

  function campoDaFrente(lang, rascunho) {
    const id = `ajustes-frente-${lang}`;
    const rotulo = elemento('span', 'ajustes-campo__rotulo', textoDaVoz('BRG-44.titulo'));
    rotulo.id = `${id}-rotulo`;
    const texto = elemento('span', 'ajustes-campo__ajuda', textoDaVoz(VOZ_DA_FRENTE[rascunho.frente][1]));
    texto.id = `${id}-texto`;
    const nota = elemento('span', 'ajustes-campo__ajuda', textoDaVoz('BRG-44.nota', { idioma: NOME_DO_IDIOMA[lang].toLowerCase() }));
    const notaDaCriacao = elemento('span', 'ajustes-campo__ajuda', textoDaVoz('BRG-44.notaCriacao'));
    notaDaCriacao.id = `${id}-nota-criacao`;
    notaDaCriacao.hidden = rascunho.frente !== 'criacao';
    const grupo = elemento('div', 'veio-segmentado', ...FRENTES.map(frente => {
      const radio = elemento('input', '');
      radio.type = 'radio';
      radio.name = id;
      radio.value = frente;
      radio.checked = rascunho.frente === frente;
      radio.addEventListener('change', () => {
        rascunho.frente = frente;
        texto.textContent = textoDaVoz(VOZ_DA_FRENTE[frente][1]);
        notaDaCriacao.hidden = frente !== 'criacao';
      });
      return elemento('label', 'veio-segmentado__opcao', radio, elemento('span', '', textoDaVoz(VOZ_DA_FRENTE[frente][0])));
    }));
    const radios = [...grupo.querySelectorAll('input')];
    const ajustarAoNivel = (voltar) => {
      for (const radio of radios) radio.disabled = !frenteDisponivel(radio.value, rascunho.nivel);
      const marcado = radios.find(radio => radio.checked);
      if (voltar && marcado?.disabled) {
        rascunho.frente = FRENTES[0];
        radios.find(radio => radio.value === FRENTES[0]).checked = true;
        texto.textContent = textoDaVoz(VOZ_DA_FRENTE[FRENTES[0]][1]);
        notaDaCriacao.hidden = true;
      }
    };
    ajustarAoNivel(false);
    AO_MUDAR_O_NIVEL.set(rascunho, () => ajustarAoNivel(true));
    grupo.setAttribute('role', 'radiogroup');
    grupo.setAttribute('aria-labelledby', rotulo.id);
    grupo.setAttribute('aria-describedby', texto.id);
    const bloco = elemento('div', 'ajustes-campo', rotulo, grupo, texto, notaDaCriacao, nota);
    bloco.id = `${id}-bloco`;
    bloco.hidden = Boolean(rascunho.tipoProprio);
    return bloco;
  }

  async function trocarAFrente(lang, frente) {
    let resposta;
    try {
      resposta = await raiz.PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, raiz.PedidoAoAnki.trocarAFrente(lang, frente));
    } catch {
      return 'BRG-44.semConexao';
    }
    if (resposta.ok) return null;
    if (resposta.status === 503) return 'BRG-44.ankiOcupado';
    const dados = await resposta.json().catch(() => ({}));
    return dados.error === 'note_type_changed' ? 'BRG-44.tipoMexido' : 'BRG-44.falhou';
  }

  async function trocarSeMudou(lang, escolhida, gravada) {
    const falha = escolhida === gravada ? null : await trocarAFrente(lang, escolhida);
    return { frente: falha ? gravada : escolhida, falha };
  }

  function avisoDaFrente(lang, motivo, aoTentarDeNovo) {
    const idioma = NOME_DO_IDIOMA[lang].toLowerCase();
    return { texto: textoDaVoz('BRG-44.naoMudou', { motivo: textoDaVoz(motivo, { idioma }) }), acao: { rotulo: textoDaVoz('BRG-44.tentarDeNovo'), aoUsar: aoTentarDeNovo } };
  }

  function maisEstilosEmAjustes() {
    const link = elemento('a', 'veio-botao veio-botao--link', textoDaVoz('BRG-43.maisEstilos'));
    link.href = '#anki/ajustes';
    return link;
  }

  raiz.EstiloDoCartao = Object.freeze({ campo, campoDaFrente, trocarSeMudou, avisoDaFrente, maisEstilosEmAjustes });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
