'use strict';

(function (raiz) {
  const ROTULOS_DO_PADRAO = {
    palavraEscolhida: 'palavra:',
    palavraDetectada: 'auto:',
    detalhes: 'Detalhes',
  };

  const DURACAO_MINIMA_DO_TOAST = 2600;

  const MS_POR_CARACTERE = 55;

  const SELETOR_FOCAVEL = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])', 'summary',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

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
    netflix: ['<rect x="2" y="5" width="20" height="13" rx="2"/>', '<path d="M8 21h8"/>'],
    youtube: ['<rect x="2" y="5" width="20" height="14" rx="4"/>', '<path d="M10 9l5 3-5 3z"/>'],
    web: ['<circle cx="12" cy="12" r="9"/>', '<path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'],
    pdf: ['<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>', '<path d="M14 3v6h6"/>'],
    livro: ['<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/>'],
    manual: ['<path d="M12 5v14M5 12h14"/>'],
    ler: ['<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>', '<path d="M7 12h10"/>'],
    frases: ['<path d="M4 6h16M4 12h16M4 18h10"/>'],
    anki: ['<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5"/>'],
    configuracoes: ['<circle cx="12" cy="12" r="3"/>', '<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'],
    conta: ['<circle cx="12" cy="8" r="4"/>', '<path d="M4 21a8 8 0 0 1 16 0"/>'],
    abaixo: ['<path d="M6 9l6 6 6-6"/>'],
    primeira: ['<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>'],
    anterior: ['<path d="M15 18l-6-6 6-6"/>'],
    proxima: ['<path d="M9 18l6-6-6-6"/>'],
    ultima: ['<path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>'],
    entrar: ['<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>', '<path d="M10 17l5-5-5-5M15 12H3"/>'],
    atualizar: ['<path d="M20 11a8 8 0 0 0-14.7-4.4L4 8"/>', '<path d="M4 3v5h5M4 13a8 8 0 0 0 14.7 4.4L20 16"/>', '<path d="M20 21v-5h-5"/>'],
    teclado: ['<rect x="2" y="6" width="20" height="12" rx="2"/>', '<path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'],
    ia: ['<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/>', '<path d="M19 15v5M16.5 17.5h5"/>'],
    chave: ['<circle cx="8" cy="15" r="4"/>', '<path d="m10.8 12.2 9.2-9.2M17 6l3 3M15 8l2 2"/>'],
    tema: ['<circle cx="12" cy="12" r="9"/>', '<path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>'],
    perigo: ['<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>', '<path d="M12 9v4M12 17h.01"/>'],
    abrir: ['<path d="m6 9 6 6 6-6"/>'],
    legenda: ['<rect x="3" y="5" width="18" height="14" rx="2"/>', '<path d="M7 14h4M13 14h4M7 10h10"/>'],
    selecao: ['<path d="M4 6h16M4 12h10M4 18h7"/>'],
    automatica: ['<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'],
    info: ['<circle cx="12" cy="12" r="9"/>', '<path d="M12 16.5V11M12 7.5v.01"/>'],
    colar: ['<rect x="8" y="2" width="8" height="4" rx="1"/>', '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'],
    foto: ['<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>', '<circle cx="12" cy="13" r="3.5"/>'],
    externo: ['<path d="M7 17 17 7M9 7h8v8"/>'],
    picareta: ['<path d="M14 10L4 20"/>', '<path d="M5 7c4-4 10-4 14 0-2-1-5-1-8 1"/>', '<path d="M17 5c4 4 4 10 0 14 1-2 1-5-1-8"/>'],
    alerta: ['<circle cx="12" cy="12" r="9"/>', '<path d="M12 7v6M12 16.5v.5"/>'],
  };

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
    svg.innerHTML = desenho.join('');
    return svg;
  }

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
      // O segundo toque de um duplo clique não é “clicar fora”: é o fim do
      // clique que abriu o modal, que ainda cai onde o botão estava.
      if (evento.detail > 1) return;
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

  function abrirConfirmacao({ titulo, corpo, cancelar, confirmar, aoConfirmar, id, confirmarComContorno = false, documento = document }) {
    const no = (tag, classe, texto) => {
      const elemento = documento.createElement(tag);
      elemento.className = classe;
      if (texto !== undefined) elemento.textContent = texto;
      return elemento;
    };
    const cabeca = no('h2', 'veio-modal__titulo', titulo);
    cabeca.id = `${id}-titulo`;
    const texto = no('p', 'veio-modal__corpo', corpo);
    texto.id = `${id}-corpo`;
    const seguro = no('button', 'veio-botao veio-botao--fantasma', cancelar);
    seguro.type = 'button';
    seguro.dataset.focoSeguro = '';
    const perigo = no('button', `veio-botao ${confirmarComContorno ? 'veio-botao--perigo' : 'veio-botao--perigo-cheio'}`, confirmar);
    perigo.type = 'button';
    const acoes = no('div', 'veio-modal__acoes');
    acoes.append(seguro, perigo);

    const dialogo = no('div', 'veio-modal');
    dialogo.setAttribute('role', 'dialog');
    dialogo.setAttribute('aria-labelledby', cabeca.id);
    dialogo.setAttribute('aria-describedby', texto.id);
    dialogo.append(cabeca, texto, acoes);
    const scrim = no('div', 'veio-scrim');
    scrim.hidden = true;
    scrim.append(dialogo);
    documento.body.append(scrim);

    const modal = abrirModal(scrim, { aoFechar: () => scrim.remove() });
    seguro.addEventListener('click', () => modal.fechar());
    perigo.addEventListener('click', () => {
      modal.fechar();
      aoConfirmar();
    });
    return modal;
  }

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

  function duracaoDoToast(texto) {
    return DURACAO_MINIMA_DO_TOAST + texto.length * MS_POR_CARACTERE;
  }

  function mostrarToastDeSucesso(texto, { dentroDe = document.body, aoSumir } = {}) {
    const documento = dentroDe.ownerDocument;
    const toast = documento.createElement('div');
    toast.className = 'veio-toast';
    toast.dataset.veioToast = 'sucesso';

    const ponto = documento.createElement('span');
    ponto.className = 'veio-toast__ponto';
    toast.append(ponto, documento.createTextNode(texto));

    regiaoDeToasts(dentroDe).append(toast);
    setTimeout(() => {
      toast.remove();
      if (aoSumir) aoSumir();
    }, duracaoDoToast(texto));

    return toast;
  }

  function regiaoDeToasts(dentroDe) {
    let regiao = dentroDe.querySelector(':scope > .veio-toasts');
    if (regiao) return regiao;

    regiao = dentroDe.ownerDocument.createElement('div');
    regiao.className = 'veio-toasts';
    regiao.setAttribute('role', 'status');
    regiao.setAttribute('aria-live', 'polite');
    dentroDe.append(regiao);
    return regiao;
  }

  function montarAviso({
    texto,
    abertura,
    icone,
    tom = 'perigo',
    acao,
    detalhes,
    rotuloDeFechar,
    aoFechar,
    fechavel = true,
    documento = document,
  }) {
    if (fechavel && !rotuloDeFechar) {
      throw new Error('O aviso precisa do rótulo de fechar, vindo do catálogo da Voz');
    }
    if (!TONS_DO_AVISO.includes(tom)) throw new Error(`Tom de aviso fora da Base Veio: ${tom}`);
    const aviso = documento.createElement('div');
    aviso.className = tom === 'info' ? 'veio-aviso veio-aviso--info' : 'veio-aviso';
    aviso.setAttribute('role', tom === 'info' ? 'status' : 'alert');

    const paragrafo = documento.createElement('p');
    paragrafo.className = 'veio-aviso__texto';
    if (icone) paragrafo.append(iconeVeio(icone, documento));
    if (abertura) {
      const negrito = documento.createElement('strong');
      negrito.textContent = abertura;
      paragrafo.append(negrito, ' ');
    }
    paragrafo.append(texto);

    const acoes = documento.createElement('div');
    acoes.className = 'veio-aviso__acoes';

    if (acao) {
      const botao = documento.createElement('button');
      botao.type = 'button';
      botao.className = 'veio-botao veio-botao--contorno';
      botao.textContent = acao.rotulo;
      botao.addEventListener('click', acao.aoUsar);
      acoes.append(botao);
    }

    if (fechavel) {
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
    }

    aviso.append(paragrafo, acoes);

    if (detalhes) aviso.append(montarDetalhes(detalhes, documento));

    return aviso;
  }

  const TONS_DO_AVISO = ['perigo', 'info'];

  function montarDetalhes(causa, documento = document, rotulo = ROTULOS_DO_PADRAO.detalhes) {
    const recolhido = documento.createElement('details');
    recolhido.className = 'veio-aviso__detalhes';
    const resumo = documento.createElement('summary');
    resumo.textContent = rotulo;
    const texto = documento.createElement('pre');
    texto.textContent = causa;
    recolhido.append(resumo, texto);
    return recolhido;
  }

  function escreverFrase(no, texto, palavra) {
    no.textContent = '';
    const documento = no.ownerDocument;

    const inicio = posicaoDaPalavra(texto, palavra);
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

  function posicaoDaPalavra(texto, palavra) {
    if (!palavra) return -1;
    const escapada = palavra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const inteira = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapada}(?![\\p{L}\\p{M}\\p{N}])`, 'iu').exec(texto);
    return inteira ? inteira.index : texto.toLowerCase().indexOf(palavra.toLowerCase());
  }

  function escreverFraseClicavel(no, trechos) {
    no.textContent = '';
    const documento = no.ownerDocument;
    let primeira = true;
    for (const trecho of trechos) {
      if (!trecho.palavra) {
        no.append(documento.createTextNode(trecho.texto));
        continue;
      }
      const palavra = documento.createElement('span');
      palavra.className = trecho.grifada ? 'veio-palavra-clicavel veio-palavra' : 'veio-palavra-clicavel';
      palavra.textContent = trecho.texto;
      palavra.setAttribute('role', 'button');
      palavra.setAttribute('aria-pressed', String(Boolean(trecho.grifada)));
      palavra.tabIndex = primeira ? 0 : -1;
      Object.assign(palavra.dataset, trecho.dados);
      primeira = false;
      no.append(palavra);
    }
  }

  function andarEntrePalavras(evento) {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[evento.key];
    const palavra = evento.target.closest?.('.veio-palavra-clicavel');
    if (!passo || !palavra) return false;
    evento.preventDefault();
    const todas = [...palavra.parentElement.querySelectorAll('.veio-palavra-clicavel')];
    const vizinha = todas[todas.indexOf(palavra) + passo];
    if (vizinha) focarPalavra(vizinha);
    return true;
  }

  function focarPalavra(palavra) {
    palavra.parentElement.querySelectorAll('.veio-palavra-clicavel').forEach(outra => { outra.tabIndex = -1; });
    palavra.tabIndex = 0;
    palavra.focus();
  }

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

  function refletirSelecao(checkbox, selecionados, total) {
    checkbox.checked = total > 0 && selecionados === total;
    checkbox.indeterminate = selecionados > 0 && selecionados < total;
  }

  function montarTecla(rotulo, { seVazia, documento = document } = {}) {
    const kbd = documento.createElement('kbd');
    kbd.className = rotulo ? 'veio-kbd' : 'veio-kbd veio-kbd--sem-atalho';
    kbd.textContent = rotulo || seVazia;
    return kbd;
  }

  /** “Ctrl++” é a tecla + com Ctrl: o último + nunca separa. */
  function separarTeclas(rotulo) {
    return String(rotulo).split(/\+(?!$)/);
  }

  function montarTeclas(rotulo, { seVazia, documento = document } = {}) {
    if (!rotulo) return montarTecla(null, { seVazia, documento });
    const teclas = documento.createElement('span');
    teclas.className = 'veio-teclas';
    separarTeclas(rotulo).forEach((tecla, i) => {
      if (i > 0) teclas.append('+');
      teclas.append(montarTecla(tecla, { documento }));
    });
    return teclas;
  }

  function montarAnelDeProgresso(n, total, { documento = document } = {}) {
    const svg = documento.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'veio-anel');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const circulo = classe => {
      const c = documento.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', classe);
      c.setAttribute('cx', '12');
      c.setAttribute('cy', '12');
      c.setAttribute('r', String(RAIO_DO_ANEL));
      return c;
    };
    const progresso = circulo('veio-anel__progresso');
    const volta = 2 * Math.PI * RAIO_DO_ANEL;
    const parte = total > 0 ? Math.min(Math.max(n / total, 0), 1) : 0;
    progresso.setAttribute('stroke-dasharray', `${volta * parte} ${volta}`);
    progresso.setAttribute('transform', 'rotate(-90 12 12)');
    svg.append(circulo('veio-anel__trilho'));
    if (parte > 0) svg.append(progresso);
    return svg;
  }
  const RAIO_DO_ANEL = 9;

  raiz.Veio = {
    iconeVeio,
    abrirModal,
    abrirConfirmacao,
    mostrarToastDeSucesso,
    montarAviso,
    montarDetalhes,
    escreverFrase,
    posicaoDaPalavra,
    escreverFraseClicavel,
    andarEntrePalavras,
    focarPalavra,
    montarChipDaPalavra,
    refletirSelecao,
    montarTecla,
    montarTeclas,
    separarTeclas,
    montarAnelDeProgresso,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
