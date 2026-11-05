'use strict';

// O estilo do Cartão (#162, BRG-42): o nível de cada idioma, um controle segmentado Iniciante · Intermediário · Avançado (os dois idiomas têm os três níveis, o russo
// desde o #163). Sob o escolhido fica o texto dele (o do quiz de nível, com o idioma) e a prévia do Cartão desse nível (#164, `painel-anki-previa.js`), que muda com a
// escolha, antes de salvar. Dois lugares montam este campo: `painel-ajustes.js` (Ajustes de envio, que grava o rascunho em Salvar ajustes) e o passo do nível da
// Boas-vindas (que grava ao escolher, por `aoEscolher`).

(function (raiz) {
  const { textoDaVoz, AjustesDeEnvio, IDIOMAS, ConexaoAnki } = raiz;
  const { NIVEIS, FRENTES } = AjustesDeEnvio;
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
  };

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    no.className = classe;
    no.append(...filhos);
    return no;
  }

  /** O texto do nível escolhido (o do quiz de nível, com o idioma em minúsculas), no nó que descreve o controle. */
  function preencher(lang, nivel, texto) {
    texto.textContent = textoDaVoz(VOZ_DO_NIVEL[nivel][1], { idioma: NOME_DO_IDIOMA[lang].toLowerCase() });
  }

  /**
   * O campo Estilo do cartão do idioma `lang`; escolher um nível muda `rascunho.nivel` (e só isso: quem grava é quem montou o campo) e chama `aoEscolher(nivel)`.
   * `prefixo` separa os ids de quem monta (Ajustes de envio e a Boas-vindas vivem na mesma página).
   */
  function campo(lang, rascunho, { prefixo = 'ajustes', aoEscolher } = {}) {
    const id = `${prefixo}-estilo-${lang}`;
    const rotulo = elemento('span', 'ajustes-campo__rotulo', textoDaVoz('BRG-42.titulo'));
    rotulo.id = `${id}-rotulo`;
    const texto = elemento('span', 'ajustes-campo__ajuda');
    texto.id = `${id}-texto`;
    preencher(lang, rascunho.nivel, texto);
    const previa = raiz.PreviaDoCartao.montar({ prefixo, lang });
    previa.mostrar(rascunho.nivel);
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
        aoEscolher?.(nivel);
      });
      return elemento('label', 'veio-segmentado__opcao', radio, elemento('span', '', textoDaVoz(VOZ_DO_NIVEL[nivel][0])));
    }));
    grupo.setAttribute('role', 'radiogroup');
    grupo.setAttribute('aria-labelledby', rotulo.id);
    grupo.setAttribute('aria-describedby', texto.id);
    return elemento('div', 'ajustes-campo', rotulo, grupo, texto, previa.no);
  }

  /** O campo Frente do idioma `lang`: escolher uma frente muda `rascunho.frente`; quem a troca no Anki é o Salvar ajustes (`painel-ajustes.js`). */
  function campoDaFrente(lang, rascunho) {
    const id = `ajustes-frente-${lang}`;
    const rotulo = elemento('span', 'ajustes-campo__rotulo', textoDaVoz('BRG-44.titulo'));
    rotulo.id = `${id}-rotulo`;
    const texto = elemento('span', 'ajustes-campo__ajuda', textoDaVoz(VOZ_DA_FRENTE[rascunho.frente][1]));
    texto.id = `${id}-texto`;
    const nota = elemento('span', 'ajustes-campo__ajuda', textoDaVoz('BRG-44.nota', { idioma: NOME_DO_IDIOMA[lang].toLowerCase() }));
    const grupo = elemento('div', 'veio-segmentado', ...FRENTES.map(frente => {
      const radio = elemento('input', '');
      radio.type = 'radio';
      radio.name = id;
      radio.value = frente;
      radio.checked = rascunho.frente === frente;
      radio.addEventListener('change', () => {
        rascunho.frente = frente;
        texto.textContent = textoDaVoz(VOZ_DA_FRENTE[frente][1]);
      });
      return elemento('label', 'veio-segmentado__opcao', radio, elemento('span', '', textoDaVoz(VOZ_DA_FRENTE[frente][0])));
    }));
    grupo.setAttribute('role', 'radiogroup');
    grupo.setAttribute('aria-labelledby', rotulo.id);
    grupo.setAttribute('aria-describedby', texto.id);
    return elemento('div', 'ajustes-campo', rotulo, grupo, texto, nota);
  }

  /** Pede à Conexão que ponha a frente no modelo de Cartão do idioma; devolve null (trocou) ou o ID da Voz que diz por que não trocou. */
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

  /** Antes de salvar: se a frente mudou, pede a troca à Conexão. Devolve a `frente` a gravar (a nova, se a Conexão a trocou; senão a gravada, que é a que o Anki tem) e a `falha` (o ID da Voz, ou null). */
  async function trocarSeMudou(lang, escolhida, gravada) {
    const falha = escolhida === gravada ? null : await trocarAFrente(lang, escolhida);
    return { frente: falha ? gravada : escolhida, falha };
  }

  /** O aviso de uma frente que não trocou (o resto foi salvo), com o Tentar de novo; `motivo` é o ID que `trocarAFrente` devolveu. */
  function avisoDaFrente(lang, motivo, aoTentarDeNovo) {
    const idioma = NOME_DO_IDIOMA[lang].toLowerCase();
    return { texto: textoDaVoz('BRG-44.naoMudou', { motivo: textoDaVoz(motivo, { idioma }) }), acao: { rotulo: textoDaVoz('BRG-44.tentarDeNovo'), aoUsar: aoTentarDeNovo } };
  }


  /** “Mais estilos em Ajustes de envio”: o onboarding só pergunta o nível, e o resto do estilo mora lá (#138). */
  function maisEstilosEmAjustes() {
    const link = elemento('a', 'veio-botao veio-botao--link', textoDaVoz('BRG-43.maisEstilos'));
    link.href = '#anki/ajustes';
    return link;
  }

  raiz.EstiloDoCartao = Object.freeze({ campo, campoDaFrente, trocarSeMudou, avisoDaFrente, maisEstilosEmAjustes });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
