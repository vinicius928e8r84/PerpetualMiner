'use strict';

// O movimento da landing (/sobre/), por cima de uma página que já está inteira sem ele: o que entra ao rolar
// e o Repetir da demonstração. Nada aqui fala com a rede nem guarda coisa alguma.
//
// Carregado no <head>, sem `defer`, só para marcar a página com `js` antes da primeira pintura: é essa classe que
// deixa o CSS esconder o que vai entrar ao rolar, então sem script nada fica escondido.

(function () {
  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js');

  document.addEventListener('DOMContentLoaded', () => {
    // Uma vez só: quem já entrou não sai e entra de novo a cada passada.
    const aoRolar = new IntersectionObserver(entradas => {
      for (const { target: alvo, isIntersecting: naTela } of entradas) {
        if (!naTela) continue;
        aoRolar.unobserve(alvo);
        alvo.setAttribute('data-visivel', '');
      }
    }, { rootMargin: '0px 0px -80px' });
    document.querySelectorAll('[data-revelar]').forEach(alvo => aoRolar.observe(alvo));

    const demo = document.querySelector('[data-demo]');
    const repetir = document.querySelector('[data-demo-repetir]');
    if (!demo || !repetir) return;
    repetir.hidden = false;
    repetir.addEventListener('click', () => {
      // Tirar e pôr o atributo recomeça as animações do CSS; ler a largura no meio obriga o navegador a notar.
      demo.removeAttribute('data-tocando');
      void demo.offsetWidth;
      demo.setAttribute('data-tocando', 'de-novo');
    });
  });
})();
