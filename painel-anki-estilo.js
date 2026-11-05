'use strict';

// O estilo do Cartão (#162, BRG-42): o nível de cada idioma, um controle segmentado Iniciante · Intermediário · Avançado (os dois idiomas têm os três níveis, o russo
// desde o #163). Sob o escolhido fica o texto dele (o do quiz de nível, com o idioma) e a prévia do Cartão desse nível (#164, `painel-anki-previa.js`), que muda com a
// escolha, antes de salvar. Dois lugares montam este campo: `painel-ajustes.js` (Ajustes de envio, que grava o rascunho em Salvar ajustes) e o passo do nível da
// Boas-vindas (que grava ao escolher, por `aoEscolher`).

(function (raiz) {
  const { textoDaVoz, AjustesDeEnvio, IDIOMAS } = raiz;
  const { NIVEIS } = AjustesDeEnvio;
  const NOME_DO_IDIOMA = { en: IDIOMAS.INGLES, ru: IDIOMAS.RUSSO };
  const VOZ_DO_NIVEL = {
    iniciante: ['BRG-42.iniciante', 'BRG-42.textoIniciante'],
    intermediario: ['BRG-42.intermediario', 'BRG-42.textoIntermediario'],
    avancado: ['BRG-42.avancado', 'BRG-42.textoAvancado'],
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

  /** “Mais estilos em Ajustes de envio”: o onboarding só pergunta o nível, e o resto do estilo mora lá (#138). */
  function maisEstilosEmAjustes() {
    const link = elemento('a', 'veio-botao veio-botao--link', textoDaVoz('BRG-43.maisEstilos'));
    link.href = '#anki/ajustes';
    return link;
  }

  raiz.EstiloDoCartao = Object.freeze({ campo, maisEstilosEmAjustes });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
