'use strict';

// O movimento da landing (/sobre/), por cima de uma página que já está inteira sem ele: as etapas do envio, que
// acendem quando aparecem, e a demonstração do Alt+S, em três etapas. Nada aqui fala com a rede nem guarda coisa alguma.
//
// Carregado no <head>, sem `defer`, só para marcar a página com `js` antes da primeira pintura: é essa classe que
// deixa o CSS apagar as etapas que vão acender, então sem script nada fica apagado.

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

    // A demonstração, uma etapa de cada vez, cada uma com tempo de ler o passo dela: antes (a legenda na tela), tecla
    // (o Alt+S aparece sobre o vídeo e desce) e resultado (a frase minerada, em destaque). O CSS lê data-etapa, e
    // recomeçar no meio volta de onde cada coisa está. Com menos movimento as etapas são as mesmas, em corte seco.
    const TECLA = 1200;
    const RESULTADO = 2200;
    let marcados = [];
    let terminou = false;
    const parar = () => {
      marcados.forEach(clearTimeout);
      marcados = [];
    };
    const tocar = antes => {
      parar();
      demo.setAttribute('data-etapa', 'antes');
      marcados = [
        setTimeout(() => demo.setAttribute('data-etapa', 'tecla'), antes),
        setTimeout(() => demo.setAttribute('data-etapa', 'resultado'), antes + TECLA),
        setTimeout(() => {
          demo.setAttribute('data-etapa', 'fim');
          terminou = true;
        }, antes + TECLA + RESULTADO),
      ];
    };

    // Começa só com a demonstração na tela e a página parada há 400 ms: quem está rolando não está olhando. Se ela
    // sair da tela antes do fim, volta ao começo e toca de novo quando a pessoa parar nela.
    let espera = 0;
    const armar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        if (document.hidden) return armar();
        desarmar();
        tocar(1600);
      }, 400);
    };
    const desarmar = () => {
      clearTimeout(espera);
      removeEventListener('scroll', armar);
    };
    const aoVer = new IntersectionObserver(([entrada]) => {
      if (terminou) return aoVer.disconnect();
      if (entrada.intersectionRatio >= 0.6) {
        addEventListener('scroll', armar, { passive: true });
        armar();
      } else if (entrada.intersectionRatio < 0.3) {
        desarmar();
        parar();
        demo.removeAttribute('data-etapa');
      }
    }, { threshold: [0.3, 0.6] });
    aoVer.observe(demo.querySelector('.demo-tela'));

    repetir.hidden = false;
    // Repetir não refaz a espera toda: a pessoa acabou de pedir e já está olhando.
    repetir.addEventListener('click', () => {
      desarmar();
      tocar(700);
    });
  });
})();
