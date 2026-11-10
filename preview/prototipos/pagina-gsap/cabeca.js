'use strict';

// Carregado no <head>, sem `defer`, só para marcar a página antes da primeira pintura: `js` (há script), `filme`
// (a pessoa não pediu menos movimento: a demonstração do Alt+S é um filme, e não os passos lado a lado) e a classe
// que a variante pede em `data-classe`, quando a consulta de `data-quando` vale (o palco preso do Palco só existe
// numa janela alta). É o CSS dessas classes que arruma a página para o movimento, então nada muda de lugar quando
// o GSAP chega. E se ele não chegar em 4 s (um arquivo que falhou), as classes saem: a página volta a ser a parada,
// inteira e legível.

(function () {
  const raiz = document.documentElement;
  raiz.classList.add('js');
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  const classes = ['filme'];
  const { classe, quando } = raiz.dataset;
  if (classe && window.matchMedia(quando).matches) classes.push(classe);
  raiz.classList.add(...classes);
  window.PGsemGsap = setTimeout(() => raiz.classList.remove(...classes), 4000);
})();
