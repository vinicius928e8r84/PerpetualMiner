'use strict';

// O protótipo "Mosaico": o que entra ao rolar e a luz que acompanha o ponteiro dentro de cada peça (a demonstração do
// Alt+S é de demo.js). Por cima de uma página que já está inteira sem ele. Nada aqui fala com a rede nem guarda coisa alguma.
//
// Carregado no <head>, sem `defer`, só para marcar a página com `js` antes da primeira pintura: é essa classe que
// deixa o CSS esconder o que vai entrar ao rolar, então sem script nada fica escondido.

(function () {
  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js');

  /** A luz de uma peça segue o ponteiro com um pouco de atraso (a cada quadro anda um quinto do que falta), como uma mola sem quique. */
  function acenderLuz(peca) {
    const luz = document.createElement('span');
    luz.className = 'ms-luz';
    luz.setAttribute('aria-hidden', 'true');
    peca.prepend(luz);
    let x = 0, y = 0, alvoX = 0, alvoY = 0, quadro = 0;
    const mover = () => { luz.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; };
    const passo = () => {
      x += (alvoX - x) * .2;
      y += (alvoY - y) * .2;
      mover();
      quadro = Math.abs(alvoX - x) + Math.abs(alvoY - y) > .5 ? requestAnimationFrame(passo) : 0;
    };
    const mirar = evento => {
      const caixa = peca.getBoundingClientRect();
      alvoX = evento.clientX - caixa.left;
      alvoY = evento.clientY - caixa.top;
    };
    // Ao entrar, a luz já nasce sob o ponteiro: não atravessa a peça para chegar nele.
    peca.addEventListener('pointerenter', evento => { mirar(evento); x = alvoX; y = alvoY; mover(); });
    peca.addEventListener('pointermove', evento => { mirar(evento); if (!quadro) quadro = requestAnimationFrame(passo); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Uma vez só: quem já entrou não sai e entra de novo a cada passada.
    const aoRolar = new IntersectionObserver(entradas => {
      for (const { target: alvo, isIntersecting: naTela } of entradas) {
        if (!naTela) continue;
        aoRolar.unobserve(alvo);
        alvo.setAttribute('data-visivel', '');
      }
    }, { rootMargin: '0px 0px -60px' });
    document.querySelectorAll('[data-revelar]').forEach(alvo => aoRolar.observe(alvo));

    // Enfeite de ponteiro fino, e de quem não pediu menos movimento. No toque não existe.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.ms-peca').forEach(acenderLuz);
    }
  });
})();
