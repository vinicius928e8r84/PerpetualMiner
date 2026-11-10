'use strict';

// O que abre por cima da tela: Toast, Tooltip, Dropdown Menu, Dialog, Alert Dialog, Sheet e a moldura da paleta
// (Command). Cada um com o teclado dele: o menu anda com as setas, o diálogo prende o foco, Esc fecha e o foco volta
// para quem abriu.

(function (PS) {
  // ---------- Toast ----------
  PS.avisar = function (texto, { erro = false } = {}) {
    const regiao = document.getElementById('avisos');
    const aviso = document.createElement('div');
    aviso.className = `aviso${erro ? ' aviso--erro' : ''}`;
    aviso.innerHTML = `${PS.ic(erro ? 'erro-circulo' : 'certo-circulo')}<span>${PS.esc(texto)}</span>`;
    regiao.append(aviso);
    setTimeout(() => {
      aviso.classList.add('aviso--saindo');
      setTimeout(() => aviso.remove(), 200);
    }, 3600);
  };

  // ---------- Tooltip: `data-dica` em qualquer controle ----------
  let dica = null;
  let esperaDaDica = 0;
  function esconderDica() {
    clearTimeout(esperaDaDica);
    if (dica) dica.remove();
    dica = null;
  }
  function mostrarDica(alvo) {
    esconderDica();
    dica = document.createElement('div');
    dica.className = 'dica';
    dica.setAttribute('role', 'tooltip');
    dica.innerHTML = PS.esc(alvo.dataset.dica) + (alvo.dataset.dicaTecla ? `<kbd class="tecla">${PS.esc(alvo.dataset.dicaTecla)}</kbd>` : '');
    document.body.append(dica);
    const caixa = alvo.getBoundingClientRect();
    const minha = dica.getBoundingClientRect();
    const acima = caixa.top - minha.height - 6;
    const topo = acima > 4 ? acima : caixa.bottom + 6;
    const esquerda = Math.min(Math.max(4, caixa.left + caixa.width / 2 - minha.width / 2), innerWidth - minha.width - 4);
    dica.style.top = `${topo}px`;
    dica.style.left = `${esquerda}px`;
  }
  document.addEventListener('mouseover', evento => {
    const alvo = evento.target.closest('[data-dica]');
    if (!alvo) return;
    clearTimeout(esperaDaDica);
    esperaDaDica = setTimeout(() => mostrarDica(alvo), 350);
  });
  document.addEventListener('mouseout', evento => { if (evento.target.closest('[data-dica]')) esconderDica(); });
  document.addEventListener('focusin', evento => {
    const alvo = evento.target.closest('[data-dica]');
    if (alvo && alvo.matches(':focus-visible')) mostrarDica(alvo);
  });
  document.addEventListener('focusout', esconderDica);
  document.addEventListener('pointerdown', esconderDica);
  document.addEventListener('scroll', esconderDica, true);

  // ---------- Dropdown Menu ----------
  // `itens`: { rotulo, ajuda, icone, atalho, perigo, acao } | { separador: true } | { titulo }.
  let menuAberto = null;
  PS.fecharMenu = function ({ devolverFoco = true } = {}) {
    if (!menuAberto) return;
    const { el, gatilho } = menuAberto;
    menuAberto = null;
    el.remove();
    gatilho.setAttribute('aria-expanded', 'false');
    if (devolverFoco) gatilho.focus();
  };
  PS.abrirMenu = function (gatilho, itens, { rotulo = '', alinhar = 'fim' } = {}) {
    if (menuAberto && menuAberto.gatilho === gatilho) { PS.fecharMenu(); return; }
    PS.fecharMenu({ devolverFoco: false });
    esconderDica();
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    if (rotulo) el.setAttribute('aria-label', rotulo);
    el.innerHTML = itens.map((item, i) => {
      if (item.separador) return '<div class="menu__separador" role="separator"></div>';
      if (item.titulo) return `<div class="menu__rotulo">${PS.esc(item.titulo)}</div>`;
      return `<button type="button" class="menu__item${item.perigo ? ' menu__item--perigo' : ''}" role="menuitem" tabindex="-1" data-i="${i}">`
        + `${item.icone ? PS.ic(item.icone) : ''}<span>${PS.esc(item.rotulo)}${item.ajuda ? `<small>${PS.esc(item.ajuda)}</small>` : ''}</span>`
        + `${item.atalho ? `<span class="menu__atalho">${PS.esc(item.atalho)}</span>` : ''}</button>`;
    }).join('');
    document.body.append(el);
    const caixa = gatilho.getBoundingClientRect();
    const minha = el.getBoundingClientRect();
    let esquerda = alinhar === 'fim' ? caixa.right - minha.width : caixa.left;
    esquerda = Math.min(Math.max(8, esquerda), innerWidth - minha.width - 8);
    const abaixo = caixa.bottom + 4;
    const topo = abaixo + minha.height > innerHeight - 8 && caixa.top - minha.height - 4 > 8 ? caixa.top - minha.height - 4 : abaixo;
    el.style.left = `${esquerda}px`;
    el.style.top = `${topo}px`;
    gatilho.setAttribute('aria-expanded', 'true');
    menuAberto = { el, gatilho };
    const botoes = () => [...el.querySelectorAll('[role="menuitem"]')];
    botoes()[0].focus();
    el.addEventListener('click', evento => {
      const botao = evento.target.closest('[role="menuitem"]');
      if (!botao) return;
      const item = itens[Number(botao.dataset.i)];
      PS.fecharMenu();
      item.acao();
    });
    el.addEventListener('keydown', evento => {
      const lista = botoes();
      const atual = lista.indexOf(document.activeElement);
      if (evento.key === 'ArrowDown') lista[(atual + 1) % lista.length].focus();
      else if (evento.key === 'ArrowUp') lista[(atual - 1 + lista.length) % lista.length].focus();
      else if (evento.key === 'Home') lista[0].focus();
      else if (evento.key === 'End') lista[lista.length - 1].focus();
      else if (evento.key === 'Escape') PS.fecharMenu();
      else if (evento.key === 'Tab') PS.fecharMenu({ devolverFoco: false });
      else return;
      if (evento.key !== 'Tab') evento.preventDefault();
      evento.stopPropagation();
    });
    el.addEventListener('mouseover', evento => {
      const botao = evento.target.closest('[role="menuitem"]');
      if (botao) botao.focus({ preventScroll: true });
    });
  };
  document.addEventListener('pointerdown', evento => {
    if (menuAberto && !menuAberto.el.contains(evento.target) && !menuAberto.gatilho.contains(evento.target)) PS.fecharMenu({ devolverFoco: false });
  });
  addEventListener('resize', () => PS.fecharMenu({ devolverFoco: false }));
  addEventListener('hashchange', () => PS.fecharMenu({ devolverFoco: false }));

  // ---------- Dialog, Alert Dialog e Sheet ----------
  // Um de cada vez. O foco fica preso dentro, Esc fecha, e ao fechar o foco volta para quem abriu.
  const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  let camada = null;

  PS.fecharCamada = function () {
    if (!camada) return;
    const { veu, quemAbriu, aoFechar } = camada;
    camada = null;
    veu.remove();
    document.body.style.overflow = '';
    if (aoFechar) aoFechar();
    if (quemAbriu && document.contains(quemAbriu)) quemAbriu.focus();
    else {
      const guardado = quemAbriu && quemAbriu.dataset && quemAbriu.dataset.foco;
      const novo = guardado && document.querySelector(`[data-foco="${CSS.escape(guardado)}"]`);
      if (novo) novo.focus();
    }
  };

  /**
   * Abre uma camada. `tipo`: 'dialogo' (padrão), 'alerta' (Alert Dialog: clicar fora não fecha), 'gaveta',
   * 'gaveta-esquerda' ou 'comando'. `conteudo` é o HTML de dentro; `aoAbrir(el)` liga o que for preciso.
   */
  PS.abrirCamada = function ({ tipo = 'dialogo', rotulo, classe = '', conteudo, aoAbrir, aoFechar }) {
    const quemAbriu = camada ? camada.quemAbriu : document.activeElement;
    if (camada) { camada.aoFechar = null; camada.quemAbriu = null; PS.fecharCamada(); }
    PS.fecharMenu({ devolverFoco: false });
    esconderDica();
    const veu = document.createElement('div');
    const ehGaveta = tipo.startsWith('gaveta');
    veu.className = `veu${ehGaveta ? ` veu--gaveta${tipo === 'gaveta-esquerda' ? ' veu--gaveta-esquerda' : ''}` : ''}${tipo === 'comando' ? ' veu--comando' : ''}`;
    const el = document.createElement('div');
    el.className = `${ehGaveta ? 'gaveta' : tipo === 'comando' ? 'comando' : 'dialogo'} ${classe}`;
    el.setAttribute('role', tipo === 'alerta' ? 'alertdialog' : 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', rotulo);
    el.innerHTML = conteudo;
    veu.append(el);
    document.body.append(veu);
    document.body.style.overflow = 'hidden';
    camada = { veu, el, quemAbriu, aoFechar, tipo };
    veu.addEventListener('pointerdown', evento => {
      if (evento.target === veu && tipo !== 'alerta') PS.fecharCamada();
    });
    veu.addEventListener('keydown', evento => {
      if (evento.key === 'Escape') { evento.stopPropagation(); PS.fecharCamada(); return; }
      if (evento.key !== 'Tab') return;
      const lista = [...el.querySelectorAll(FOCAVEIS)].filter(item => item.offsetParent !== null);
      if (!lista.length) { evento.preventDefault(); return; }
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
      else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
    });
    if (aoAbrir) aoAbrir(el);
    const inicial = el.querySelector('[data-foco-inicial]') || el.querySelector(FOCAVEIS);
    if (inicial) inicial.focus();
    return el;
  };
  PS.camadaAberta = () => (camada ? camada.el : null);
  PS.acoes['camada.fechar'] = () => PS.fecharCamada();

  /** O HTML de um Dialog comum: título, descrição, corpo e rodapé. */
  PS.dialogo = function ({ titulo, descricao = '', corpo = '', pe = '', semFechar = false }) {
    return `${semFechar ? '' : `<button type="button" class="botao botao--fantasma botao--icone botao--p dialogo__fechar" data-acao="camada.fechar" aria-label="Fechar">${PS.ic('fechar')}</button>`}`
      + `<div class="dialogo__topo"><h2 class="dialogo__titulo">${titulo}</h2>${descricao ? `<p class="dialogo__descricao">${descricao}</p>` : ''}</div>`
      + `${corpo ? `<div class="dialogo__corpo">${corpo}</div>` : ''}${pe ? `<div class="dialogo__pe">${pe}</div>` : ''}`;
  };
  PS.gaveta = function ({ titulo, descricao = '', corpo = '', pe = '' }) {
    return `<div class="gaveta__topo"><button type="button" class="botao botao--fantasma botao--icone botao--p dialogo__fechar" data-acao="camada.fechar" aria-label="Fechar">${PS.ic('fechar')}</button>`
      + `<h2 class="gaveta__titulo">${titulo}</h2>${descricao ? `<p class="gaveta__descricao">${descricao}</p>` : ''}</div>`
      + `<div class="gaveta__corpo">${corpo}</div>${pe ? `<div class="gaveta__pe">${pe}</div>` : ''}`;
  };
})(window.PS);
