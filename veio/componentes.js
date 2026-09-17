'use strict';

// Base Veio · o comportamento dos componentes que não cabe no CSS.
//
// Carregado por toda página da extensão depois de veio/componentes.css, e
// pendurado em `PerpetualMiner.Veio`, como o resto da base compartilhada:
//
//   const { abrirModal, mostrarToastDeSucesso } = PerpetualMiner.Veio;
//
// A cópia não mora aqui: quem chama passa o texto já buscado no catálogo da
// Voz (`textoDaVoz('PAI-13.titulo', { n })`).

(function (raiz) {
  /**
   * As três palavras que a base escreve por conta própria.
   *
   * Elas não têm ID no catálogo porque não são estado de tela nenhuma: são
   * nomes de padrão, fixados fora dele.
   *
   * - `palavra:` e `auto:` são o chip da Palavra, e o vocabulário está travado
   *   no glossário (CONTEXT.md): "o chip diz `palavra: …` quando foi escolhida
   *   e `auto: …` quando foi detectada". "keyword" nunca aparece na tela.
   * - `Detalhes` é o nome do recolhido onde a causa técnica vai morar, dado
   *   pela regra V3 da Voz.
   *
   * Qualquer outro texto vem de quem chama, já buscado no catálogo.
   */
  const ROTULOS_DO_PADRAO = {
    palavraEscolhida: 'palavra:',
    palavraDetectada: 'auto:',
    detalhes: 'Detalhes',
  };

  /** Toast curto: nunca menos que isso, mesmo numa palavra só. */
  const DURACAO_MINIMA_DO_TOAST = 2600;

  /** Tempo de leitura por caractere, somado ao mínimo. */
  const MS_POR_CARACTERE = 55;

  const SELETOR_FOCAVEL = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])', 'summary',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  /* ── Ícones ───────────────────────────────────────────────────────────────
     Traço de 2 px num grid de 24, cantos redondos. São desenhos fixos, então
     ficam aqui e não num arquivo por ícone. */

  const DESENHOS = {
    busca: ['<circle cx="11" cy="11" r="7"/>', '<path d="M20 20l-4-4"/>'],
    fechar: ['<path d="M6 6l12 12M18 6L6 18"/>'],
    certo: ['<path d="M4 12l5 5L20 6"/>'],
    arquivo: ['<path d="M14 3H6v18h12V7z"/>', '<path d="M14 3v4h4M9 13h6M9 17h6"/>'],
    copiar: ['<rect x="9" y="9" width="12" height="12" rx="2"/>', '<path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'],
    texto: ['<path d="M4 7V4h16v3M9 20h6M12 4v16"/>'],
    contexto: ['<path d="M4 20h4L19 9l-4-4L4 16z"/>'],
    apagar: ['<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'],
    enviar: ['<path d="M4 12l16-8-6 16-3-6z"/>'],
    netflix: ['<rect x="4" y="4" width="16" height="16" rx="2"/>', '<path d="M9 8l6 4-6 4z"/>'],
    youtube: ['<rect x="2" y="5" width="20" height="14" rx="4"/>', '<path d="M10 9l5 3-5 3z"/>'],
    web: ['<circle cx="12" cy="12" r="9"/>', '<path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'],
    pdf: ['<path d="M14 3H6v18h12V7z"/>', '<path d="M14 3v4h4"/>'],
    livro: ['<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/>', '<path d="M4 20a2 2 0 0 0 2 2h13v-4"/>'],
    manual: ['<path d="M4 20h4L19 9l-4-4L4 16z"/>'],
  };

  /**
   * O ícone `nome` como elemento SVG, pronto para entrar num botão ou selo.
   *
   * Ele herda a cor de quem o contém (`currentColor`) e fica escondido do
   * leitor de tela: quem diz o que o controle faz é o rótulo.
   */
  function iconeVeio(nome, documento = document) {
    const desenho = DESENHOS[nome];
    if (!desenho) throw new Error(`Ícone fora da Base Veio: ${nome}`);

    const svg = documento.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    // Os desenhos são constantes deste arquivo, nunca texto de fora.
    svg.innerHTML = desenho.join('');
    return svg;
  }

  /* ── Modal ────────────────────────────────────────────────────────────────
     Confirmação destrutiva e fim de envio. Nunca o confirm() do navegador. */

  /**
   * Abre o modal que está dentro de `scrim` e devolve como fechá-lo.
   *
   * O foco entra no botão seguro (o `[data-foco-seguro]`, ou o primeiro que
   * não seja de perigo), fica preso enquanto o modal está aberto, e volta
   * para quem abriu quando ele fecha. Esc e o clique fora fecham.
   *
   * @param {HTMLElement} scrim   O `.veio-scrim` com o `[role="dialog"]` dentro.
   * @param {object}      opcoes  `aoFechar` roda depois que o foco já voltou.
   * @returns {{ fechar: () => void }}
   */
  function abrirModal(scrim, { aoFechar } = {}) {
    const dialogo = scrim.querySelector('[role="dialog"]');
    if (!dialogo) throw new Error('Um modal da Veio precisa de um [role="dialog"] dentro do scrim');
    dialogo.setAttribute('aria-modal', 'true');

    const documento = scrim.ownerDocument;
    const quemAbriu = documento.activeElement;
    const forasInertes = tornarORestoInerte(scrim);

    scrim.hidden = false;
    focar(botaoSeguro(dialogo) || dialogo);

    function aoTeclar(evento) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        fechar();
        return;
      }
      if (evento.key === 'Tab') prenderOFoco(evento, dialogo);
    }

    function aoApontar(evento) {
      // Só o clique no próprio scrim é "fora": um arrasto que começa dentro
      // do modal e termina nele não fecha nada.
      if (evento.target !== scrim) return;
      // Sem isto, o navegador move o foco para o scrim depois do handler e
      // desfaz a devolução do foco a quem abriu.
      evento.preventDefault();
      fechar();
    }

    let fechado = false;
    function fechar() {
      if (fechado) return;
      fechado = true;

      documento.removeEventListener('keydown', aoTeclar, true);
      scrim.removeEventListener('mousedown', aoApontar);
      scrim.hidden = true;
      for (const fora of forasInertes) fora.removeAttribute('inert');

      if (quemAbriu && quemAbriu.isConnected) focar(quemAbriu);
      if (aoFechar) aoFechar();
    }

    documento.addEventListener('keydown', aoTeclar, true);
    scrim.addEventListener('mousedown', aoApontar);

    return { fechar };
  }

  /**
   * O botão em que o foco entra: o seguro, nunca o que destrói.
   *
   * A tela pode dizer qual é com `data-foco-seguro`. Sem isso, é o primeiro
   * controle que não está pintado de perigo — em "Apagar 12 frases?", o
   * "Cancelar".
   */
  function botaoSeguro(dialogo) {
    const marcado = dialogo.querySelector('[data-foco-seguro]');
    if (marcado) return marcado;
    const focaveis = focaveisDe(dialogo);
    return focaveis.find(no => !no.classList.contains('veio-botao--perigo')
      && !no.classList.contains('veio-botao--perigo-cheio')) || focaveis[0];
  }

  function focaveisDe(raizDoFoco) {
    return [...raizDoFoco.querySelectorAll(SELETOR_FOCAVEL)]
      .filter(no => !no.hidden && no.offsetParent !== null);
  }

  function prenderOFoco(evento, dialogo) {
    const focaveis = focaveisDe(dialogo);
    if (focaveis.length === 0) {
      evento.preventDefault();
      return;
    }
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const atual = dialogo.ownerDocument.activeElement;

    if (evento.shiftKey && (atual === primeiro || !dialogo.contains(atual))) {
      evento.preventDefault();
      focar(ultimo);
    } else if (!evento.shiftKey && (atual === ultimo || !dialogo.contains(atual))) {
      evento.preventDefault();
      focar(primeiro);
    }
  }

  /**
   * O resto da página fica inerte: o leitor de tela também não sai do modal.
   *
   * O scrim pode estar em qualquer profundidade, então a inércia sobe por
   * toda a linhagem dele: em cada nível, os irmãos que não o contêm saem.
   */
  function tornarORestoInerte(scrim) {
    const inertes = [];
    for (let no = scrim; no.parentElement; no = no.parentElement) {
      for (const irmao of no.parentElement.children) {
        if (irmao === no || irmao.hasAttribute('inert')) continue;
        irmao.setAttribute('inert', '');
        inertes.push(irmao);
      }
    }
    return inertes;
  }

  function focar(no) {
    if (!no.hasAttribute('tabindex') && no.tabIndex < 0) no.tabIndex = -1;
    no.focus();
  }

  /* ── Toast ────────────────────────────────────────────────────────────────
     Só sucesso curto, sem ação obrigatória. Erro que pede ação é o aviso
     persistente. */

  /**
   * Quanto tempo o toast fica na tela: nunca menos que o mínimo, e mais
   * quanto maior o texto, porque a pessoa precisa terminar de ler.
   */
  function duracaoDoToast(texto) {
    return DURACAO_MINIMA_DO_TOAST + texto.length * MS_POR_CARACTERE;
  }

  /**
   * Mostra um toast de sucesso, que some sozinho.
   *
   * @param {string} texto   Já vindo do catálogo da Voz.
   * @param {object} opcoes  `documento` e `aoSumir`.
   * @returns {HTMLElement}  O toast, já na tela.
   */
  function mostrarToastDeSucesso(texto, { documento = document, aoSumir } = {}) {
    const toast = documento.createElement('div');
    toast.className = 'veio-toast';
    toast.dataset.veioToast = 'sucesso';

    const ponto = documento.createElement('span');
    ponto.className = 'veio-toast__ponto';
    toast.append(ponto, documento.createTextNode(texto));

    regiaoDeToasts(documento).append(toast);
    setTimeout(() => {
      toast.remove();
      if (aoSumir) aoSumir();
    }, duracaoDoToast(texto));

    return toast;
  }

  /** A região onde os toasts entram; o leitor de tela lê o que chega nela. */
  function regiaoDeToasts(documento) {
    let regiao = documento.querySelector('.veio-toasts');
    if (regiao) return regiao;

    regiao = documento.createElement('div');
    regiao.className = 'veio-toasts';
    regiao.setAttribute('role', 'status');
    regiao.setAttribute('aria-live', 'polite');
    documento.body.append(regiao);
    return regiao;
  }

  /* ── Aviso persistente ────────────────────────────────────────────────────
     Todo erro que pede ação. Fica até ser resolvido ou fechado, e a causa
     técnica vai para um Detalhes recolhido e copiável. */

  /**
   * Monta o aviso e devolve o elemento, para a tela pô-lo no lugar do problema.
   *
   * @param {object} conteudo
   *   `texto`          o que aconteceu, nos termos da pessoa (catálogo da Voz);
   *   `acao`           `{ rotulo, aoUsar }` quando existe o que fazer;
   *   `detalhes`       a causa técnica, recolhida;
   *   `rotuloDeFechar` o nome do × para o leitor de tela, do catálogo;
   *   `aoFechar`       roda quando a pessoa fecha o aviso.
   *
   * O nome do recolhido é "Detalhes", da regra V3 da Voz, e só muda se quem
   * chama passar outro.
   */
  function montarAviso({
    texto,
    acao,
    detalhes,
    rotuloDeFechar,
    rotuloDosDetalhes = ROTULOS_DO_PADRAO.detalhes,
    aoFechar,
    documento = document,
  }) {
    if (!rotuloDeFechar) {
      throw new Error('O aviso precisa do rótulo de fechar, vindo do catálogo da Voz');
    }
    const aviso = documento.createElement('div');
    aviso.className = 'veio-aviso';
    aviso.setAttribute('role', 'alert');

    const paragrafo = documento.createElement('p');
    paragrafo.className = 'veio-aviso__texto';
    paragrafo.textContent = texto;

    const acoes = documento.createElement('div');
    acoes.className = 'veio-aviso__acoes';

    if (acao) {
      const botao = documento.createElement('button');
      botao.type = 'button';
      botao.className = 'veio-botao veio-botao--secundario';
      botao.textContent = acao.rotulo;
      botao.addEventListener('click', acao.aoUsar);
      acoes.append(botao);
    }

    const fechar = documento.createElement('button');
    fechar.type = 'button';
    fechar.className = 'veio-botao-icone';
    fechar.setAttribute('aria-label', rotuloDeFechar);
    fechar.append(iconeVeio('fechar', documento));
    fechar.addEventListener('click', () => {
      aviso.remove();
      if (aoFechar) aoFechar();
    });
    acoes.append(fechar);

    aviso.append(paragrafo, acoes);

    if (detalhes) {
      const recolhido = documento.createElement('details');
      recolhido.className = 'veio-aviso__detalhes';
      const resumo = documento.createElement('summary');
      resumo.textContent = rotuloDosDetalhes;
      const causa = documento.createElement('pre');
      causa.textContent = detalhes;
      recolhido.append(resumo, causa);
      aviso.append(recolhido);
    }

    return aviso;
  }

  /* ── Frase ────────────────────────────────────────────────────────────────
     A Palavra que o cartão ensina aparece grifada dentro da frase. */

  /**
   * Escreve a frase em `no`, com a Palavra grifada.
   *
   * O texto entra sempre como texto: marcação vinda de uma legenda ou de uma
   * seleção é mostrada literalmente, nunca vira elemento.
   *
   * @param {HTMLElement} no      Onde a frase é escrita (é esvaziado antes).
   * @param {string}      texto   A frase.
   * @param {string}      palavra A Palavra a grifar; vazia deixa a frase limpa.
   */
  function escreverFrase(no, texto, palavra) {
    no.textContent = '';
    const documento = no.ownerDocument;

    const inicio = palavra ? texto.toLowerCase().indexOf(palavra.toLowerCase()) : -1;
    if (inicio < 0) {
      no.append(documento.createTextNode(texto));
      return;
    }

    const fim = inicio + palavra.length;
    const grifo = documento.createElement('mark');
    grifo.className = 'veio-palavra';
    grifo.textContent = texto.slice(inicio, fim);

    no.append(documento.createTextNode(texto.slice(0, inicio)), grifo,
      documento.createTextNode(texto.slice(fim)));
  }

  /**
   * O chip que diz de onde a Palavra veio.
   *
   * O rótulo é `palavra:` quando a pessoa a escolheu e `auto:` quando foi
   * detectada — "keyword" é nome técnico do código, nunca da tela.
   */
  function montarChipDaPalavra(palavra, { detectada = false, documento = document } = {}) {
    const chip = documento.createElement('span');
    chip.className = 'veio-chip-palavra';

    const rotulo = documento.createElement('small');
    rotulo.className = 'veio-chip-palavra__rotulo';
    rotulo.textContent = detectada
      ? ROTULOS_DO_PADRAO.palavraDetectada
      : ROTULOS_DO_PADRAO.palavraEscolhida;

    chip.append(rotulo, documento.createTextNode(palavra));
    return chip;
  }

  /* ── Checkbox ─────────────────────────────────────────────────────────────
     O cabeçalho de uma lista com parte dela marcada. */

  /**
   * Põe o checkbox no estado que a seleção pede: marcado, vazio ou misto.
   *
   * @param {HTMLInputElement} checkbox
   * @param {number} selecionados
   * @param {number} total
   */
  function refletirSelecao(checkbox, selecionados, total) {
    checkbox.checked = total > 0 && selecionados === total;
    checkbox.indeterminate = selecionados > 0 && selecionados < total;
  }

  raiz.Veio = {
    ROTULOS_DO_PADRAO,
    iconeVeio,
    abrirModal,
    duracaoDoToast,
    mostrarToastDeSucesso,
    montarAviso,
    escreverFrase,
    montarChipDaPalavra,
    refletirSelecao,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
