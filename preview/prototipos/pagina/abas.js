'use strict';

// O protótipo "Abas": transforma a fila de seções numa tela só, com abas. Os links da coluna viram abas (role, setas,
// Home e End), a seção da vez é a única à mostra e o endereço guarda qual é (#custo abre no custo). Sem este script a
// página é a fila de seções, inteira. Nada aqui fala com a rede nem guarda coisa alguma.
//
// Carregado no <head>, sem `defer`, para marcar a página antes da primeira pintura: com `js`, e com a seção que o
// endereço pede em `data-aba-inicial` (o CSS já mostra só ela enquanto o HTML ainda chega).

(function () {
  document.documentElement.classList.add('js');
  document.documentElement.dataset.abaInicial = location.hash.slice(1) || 'inicio';

  document.addEventListener('DOMContentLoaded', () => {
    const janela = document.querySelector('[data-janela]');
    const trilho = document.querySelector('[data-trilho]');
    const lista = document.querySelector('[data-abas]');
    const ilha = document.querySelector('[data-ilha]');
    const marcador = trilho.querySelector('.ab-marcador');
    const abas = [...lista.querySelectorAll('a')];
    const paineis = abas.map(aba => document.getElementById(aba.hash.slice(1)));
    const emPe = window.matchMedia('(min-width: 900px)');
    let atual = -1;

    lista.setAttribute('role', 'tablist');
    abas.forEach((aba, i) => {
      aba.id = `aba-${paineis[i].id}`;
      aba.setAttribute('role', 'tab');
      aba.setAttribute('aria-controls', paineis[i].id);
      paineis[i].setAttribute('role', 'tabpanel');
      paineis[i].setAttribute('aria-labelledby', aba.id);
    });

    /** O marcador vai até a aba da vez só com transform: desce a coluna no computador; no celular anda e estica o traço. */
    function moverMarcador() {
      const aba = abas[atual];
      lista.setAttribute('aria-orientation', emPe.matches ? 'vertical' : 'horizontal');
      marcador.style.transform = emPe.matches
        ? `translateY(${aba.offsetTop}px)`
        : `translateX(${aba.offsetLeft}px) scaleX(${aba.offsetWidth / 100})`;
    }

    /** Abre a aba `i`. `seco` é a troca sem animação: a primeira, a do teclado e a que vem do endereço. */
    function abrir(i, { seco = false, focar = false } = {}) {
      if (i < 0 || i === atual) return;
      janela.dataset.sentido = i > atual ? 'frente' : 'tras';
      janela.toggleAttribute('data-seco', seco);
      atual = i;
      paineis.forEach((painel, j) => { painel.hidden = j !== i; });
      abas.forEach((aba, j) => {
        aba.setAttribute('aria-selected', String(j === i));
        aba.tabIndex = j === i ? 0 : -1;
      });
      ilha.scrollTop = 0;
      moverMarcador();
      // No celular a aba da vez vem para o meio da faixa.
      if (!emPe.matches) trilho.scrollLeft = abas[i].offsetLeft - (trilho.clientWidth - abas[i].offsetWidth) / 2;
      if (focar) abas[i].focus();
      if (location.hash !== abas[i].hash) history.replaceState(null, '', abas[i].hash);
    }

    const daVez = () => Math.max(0, paineis.findIndex(painel => `#${painel.id}` === location.hash));
    abrir(daVez(), { seco: true });
    // Daqui em diante quem esconde as seções é o `hidden`; a regra do CSS que valia até agora sai.
    document.documentElement.setAttribute('data-abas', '');
    window.addEventListener('hashchange', () => abrir(daVez(), { seco: true }));
    window.addEventListener('resize', moverMarcador);
    emPe.addEventListener('change', moverMarcador);
    // A fonte chega depois da primeira pintura e muda a largura das abas.
    document.fonts?.ready.then(moverMarcador);
    // O marcador só desliza depois de estar no lugar: a chegada dele não é animada.
    requestAnimationFrame(() => requestAnimationFrame(() => janela.setAttribute('data-pronto', '')));

    // As capturas das abas fechadas só carregariam ao abrir, com a moldura vazia por um instante. Com a página pronta,
    // elas vêm de uma vez: a troca de aba já encontra a imagem.
    window.addEventListener('load', () => {
      document.querySelectorAll('.ab-painel img[loading="lazy"]').forEach(imagem => { imagem.loading = 'eager'; });
    });

    // Qualquer link da página para uma seção troca a aba, em vez de rolar até ela.
    document.addEventListener('click', evento => {
      const link = evento.target.closest('a[href^="#"]');
      const i = link ? paineis.findIndex(painel => `#${painel.id}` === link.hash) : -1;
      if (i < 0) return;
      evento.preventDefault();
      abrir(i, { seco: evento.detail === 0, focar: !abas.includes(link) });
    });

    lista.addEventListener('keydown', evento => {
      const passos = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      let i = -1;
      if (evento.key in passos) i = (atual + passos[evento.key] + abas.length) % abas.length;
      else if (evento.key === 'Home') i = 0;
      else if (evento.key === 'End') i = abas.length - 1;
      else if (evento.key === ' ') i = abas.indexOf(evento.target);
      if (i < 0) return;
      evento.preventDefault();
      abrir(i, { seco: true, focar: true });
    });
  });
})();
