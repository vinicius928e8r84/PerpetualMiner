'use strict';

(function (raiz) {
  const { elemento } = raiz.Veio;

  function peca(tag, classe, atributos = {}, ...filhos) {
    const no = elemento(tag, classe, ...filhos);
    for (const [nome, valor] of Object.entries(atributos)) no.setAttribute(nome, valor);
    return no;
  }

  const icone = nome => peca('span', '', { 'data-icone': nome });
  const rotuloDaVoz = (id, atributos = {}) => peca('span', '', { 'data-voz': id, ...atributos });
  const OCULTO = { hidden: '' };

  function itemDoMenuDeMinerar([modo, voz, ajuda]) {
    const rotulo = peca('b', '', { 'data-voz': voz });
    const explicacao = peca('small', '', { 'data-voz': ajuda });
    return peca('button', 'minerar-menu__item', { role: 'menuitem', tabindex: '-1', 'data-minerar': modo },
      icone(modo), peca('span', '', {}, rotulo, explicacao));
  }

  const MODOS_DE_MINERAR = [
    ['colar', 'ADD-11.colar', 'ADD-11.colarAjuda'],
    ['arquivo', 'ADD-11.arquivo', 'ADD-11.arquivoAjuda'],
    ['foto', 'ADD-11.foto', 'ADD-11.fotoAjuda'],
  ];

  function menuDeMinerar() {
    const botao = peca('button', 'veio-botao veio-botao--primario', {
      id: 'btn-minerar-frases', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'menu-minerar',
    }, rotuloDaVoz('ADD-01.botao'), icone('abaixo'));
    const lista = peca('div', 'minerar-menu__lista', {
      id: 'menu-minerar', role: 'menu', 'data-voz-aria': 'ADD-01.botao', ...OCULTO,
    }, ...MODOS_DE_MINERAR.map(itemDoMenuDeMinerar));
    return peca('div', 'minerar-menu', {}, botao, lista);
  }

  function cabecalho() {
    const titulo = peca('h1', '', { id: 'titulo-frases', 'data-voz': 'SHL-02.frases' });
    return peca('header', 'shell-cabecalho', {}, titulo, menuDeMinerar());
  }

  const botaoDoLembrete = (classe, id, voz) => peca('button', `veio-botao ${classe} veio-botao--compacto`, { id, 'data-voz': voz });

  function lembrete() {
    const acoes = peca('div', 'frases-lembrete__acoes', {},
      botaoDoLembrete('veio-botao--fantasma', 'frases-lembrete-ocultar', 'ONB-15.ocultar'),
      botaoDoLembrete('veio-botao--contorno', 'frases-lembrete-continuar', 'ONB-15.continuar'));
    return peca('aside', 'frases-lembrete', { id: 'frases-lembrete', 'aria-labelledby': 'frases-lembrete-texto', ...OCULTO },
      peca('span', 'frases-lembrete__anel', { id: 'frases-lembrete-anel' }),
      peca('p', 'frases-lembrete__texto', { id: 'frases-lembrete-texto' }),
      acoes);
  }

  function seletorDeFiltro(id, voz, ...opcoes) {
    const campo = peca('select', 'veio-campo frases-filtro', { id, 'data-voz-aria': voz }, ...opcoes);
    return peca('span', 'veio-select', {}, campo);
  }

  const ORDENS = ['novas', 'antigas'];
  const opcaoDeOrdem = ordem => peca('option', '', { value: ordem, 'data-voz': `PAI-24.${ordem}` });

  function busca() {
    const lupa = peca('span', 'veio-busca__lupa', {}, icone('busca'));
    const campo = peca('input', 'veio-campo', {
      id: 'busca-frases', type: 'search', autocomplete: 'off', 'data-voz-aria': 'PAI-23', placeholder: '',
    });
    const limpar = peca('button', 'veio-botao-icone veio-busca__limpar', {
      id: 'btn-limpar-busca', 'data-voz-aria': 'PAI-04.acao', 'data-voz-title': 'PAI-04.acao', ...OCULTO,
    }, icone('fechar'));
    return peca('label', 'veio-busca frases-busca', {}, lupa, campo, limpar);
  }

  function filtroDeOcultar() {
    const chave = peca('input', '', { type: 'checkbox', role: 'switch', id: 'filtro-ocultar' });
    return peca('label', 'veio-toggle', {}, chave, peca('span', 'veio-toggle__trilho'), rotuloDaVoz('PAI-09'));
  }

  function filtros() {
    return peca('div', 'frases-filtros', {},
      seletorDeFiltro('filtro-fonte', 'PAI-25.fonte'),
      seletorDeFiltro('filtro-idioma', 'PAI-25.idioma'),
      seletorDeFiltro('filtro-ordem', 'PAI-25.ordem', ...ORDENS.map(opcaoDeOrdem)),
      busca(),
      filtroDeOcultar());
  }

  function botaoDaBarra(classe, id, desenho, voz) {
    return peca('button', `veio-botao ${classe} veio-botao--compacto`, { id }, icone(desenho), rotuloDaVoz(voz));
  }

  function envioAoAnki() {
    const enviar = botaoDaBarra('veio-botao--primario', 'btn-send-anki', 'enviar', 'PAI-32.enviar');
    return peca('span', 'veio-com-dica', {}, enviar, peca('span', 'veio-dica', { id: 'envio-indisponivel', role: 'tooltip' }));
  }

  function acoesDaSelecao() {
    return peca('span', 'frases-barra__acoes', {},
      botaoDaBarra('veio-botao--fantasma', 'btn-bulk-edit', 'contexto', 'PAI-32.editarContexto'),
      botaoDaBarra('veio-botao--fantasma', 'btn-export', 'arquivo', 'PAI-32.exportar'),
      botaoDaBarra('veio-botao--perigo-fantasma', 'btn-delete-selected', 'apagar', 'PAI-32.apagar'),
      envioAoAnki());
  }

  function barraDaSelecao() {
    const desmarcar = peca('button', 'veio-botao-icone', {
      id: 'btn-desmarcar-todas', 'data-voz-aria': 'PAI-32.desmarcar', 'data-voz-title': 'PAI-32.desmarcar',
    }, icone('fechar'));
    return peca('div', 'frases-barra', { id: 'frases-barra', ...OCULTO },
      desmarcar,
      peca('span', 'frases-barra__contagem', { id: 'selection-count', 'aria-live': 'polite' }),
      peca('button', 'veio-botao veio-botao--link frases-barra__todas', { id: 'btn-sel-todas', ...OCULTO }),
      acoesDaSelecao());
  }

  function selecao() {
    const marca = peca('input', 'veio-checkbox', { type: 'checkbox', id: 'sel-pagina', 'data-voz-aria': 'PAI-31' });
    const pagina = peca('label', 'frases-selecao__pagina', {}, marca, rotuloDaVoz('PAI-31', { id: 'sel-pagina-rotulo' }));
    return peca('div', 'frases-selecao', { id: 'frases-selecao', ...OCULTO }, pagina, barraDaSelecao());
  }

  const LINHAS_DE_ESPERA = 5;

  function lista() {
    const espera = () => peca('div', 'veio-esqueleto veio-frase-esqueleto', { 'aria-hidden': 'true' });
    return peca('div', 'frases-lista', { id: 'frases-lista', 'aria-busy': 'true' },
      ...Array.from({ length: LINHAS_DE_ESPERA }, espera));
  }

  function botaoDeNavegacao([id, voz, desenho]) {
    return peca('button', 'veio-botao-icone', { id, 'data-voz-aria': voz, 'data-voz-title': voz }, icone(desenho));
  }

  const NAVEGACAO = [
    ['btn-first', 'PAI-26.primeira', 'primeira'],
    ['btn-prev', 'PAI-26.anterior', 'anterior'],
    ['btn-next', 'PAI-26.proxima', 'proxima'],
    ['btn-last', 'PAI-26.ultima', 'ultima'],
  ];

  function paginas() {
    const [primeira, anterior, proxima, ultima] = NAVEGACAO.map(botaoDeNavegacao);
    return peca('nav', 'frases-paginas', { id: 'frases-paginas', 'data-voz-aria': 'PAI-26.rotulo', ...OCULTO },
      peca('span', 'frases-paginas__intervalo', { id: 'paginas-intervalo' }),
      primeira, anterior,
      peca('span', 'frases-paginas__atual', { id: 'paginas-atual' }),
      proxima, ultima);
  }

  function areaFrases() {
    return peca('section', 'shell-area', { 'data-area': 'frases', 'aria-labelledby': 'titulo-frases' },
      cabecalho(), lembrete(), peca('div', 'frases-avisos', { id: 'frases-avisos' }), filtros(), selecao(), lista(), paginas());
  }

  document.querySelector('.shell-conteudo').prepend(areaFrases());
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
