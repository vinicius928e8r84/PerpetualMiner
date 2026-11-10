'use strict';

// O protótipo "Roteiro": marca em que ato da história a pessoa está, para o palco, o trilho e o topo responderem;
// encena o Alt+S do ato 2; e marca o que já entrou ao rolar. Quem avisa do ato é o IntersectionObserver. Nada aqui
// fala com a rede nem guarda coisa alguma.
//
// Carregado no <head>, sem `defer`, só para marcar a página com `js` antes da primeira pintura: é essa classe que
// transforma a fila de telas em palco, então sem script nada fica escondido.

(function () {
  if (!('IntersectionObserver' in window)) return;
  const raiz = document.documentElement;
  raiz.classList.add('js');

  // A cena do Alt+S, em ms. Só começa com a pessoa parada no ato 2 (rolar de novo zera a espera): quem está rolando
  // está lendo o texto, não olhando o palco. As teclas ficam o tempo de ler as duas antes de a tela minerada entrar.
  const PARADA = 400;
  const TECLAS = 1100;
  const ANTES_DE_REPETIR = 500;

  document.addEventListener('DOMContentLoaded', () => {
    const historia = document.querySelector('[data-historia]');
    const onde = document.querySelector('[data-onde]');
    const repetir = document.querySelector('[data-repetir]');
    const atos = [...historia.querySelectorAll('.rt-ato')];
    const pontos = [...historia.querySelectorAll('.rt-trilho a')];
    const estreita = window.matchMedia('(max-width: 899px)');
    const menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

    // data-minerar na história: "espera" (a legenda na tela), "tecla" (as teclas sobre o vídeo), "feita" (a tela minerada,
    // com o anel aceso) e "passada" (minerada sem cena: quem já viu, passou direto ou pediu menos movimento).
    let relogios = [];
    const cena = estado => { historia.dataset.minerar = estado; };
    const parar = () => {
      relogios.forEach(clearTimeout);
      relogios = [];
      document.removeEventListener('scroll', aoParar, true);
    };
    const depois = (ms, feito) => relogios.push(setTimeout(feito, ms));
    function encenar() {
      parar();
      cena('tecla');
      depois(TECLAS, () => cena('feita'));
    }
    function aoParar() {
      relogios.forEach(clearTimeout);
      relogios = [];
      depois(PARADA, encenar);
    }

    function marcar(ato) {
      const numero = Number(ato.dataset.ato);
      historia.dataset.ato = numero;
      ato.setAttribute('data-visto', '');
      pontos.forEach((ponto, i) => {
        if (i === numero - 1) ponto.setAttribute('aria-current', 'step');
        else ponto.removeAttribute('aria-current');
      });
      onde.textContent = `${String(numero).padStart(2, '0')}/${String(atos.length).padStart(2, '0')} · ${ato.dataset.nome}`;

      if (numero === 1) {
        // De volta ao começo: a frase ainda não foi minerada, e a cena toca de novo na próxima descida.
        parar();
        cena('');
      } else if (numero > 2 || menosMovimento.matches) {
        // Quem passou do ato 2, ou pediu menos movimento, encontra a frase já minerada, sem cena.
        parar();
        cena('passada');
      } else if (!['tecla', 'feita', 'passada'].includes(historia.dataset.minerar)) {
        cena('espera');
        document.addEventListener('scroll', aoParar, { capture: true, passive: true });
        aoParar();
      }
    }

    if (!menosMovimento.matches) {
      repetir.hidden = false;
      repetir.addEventListener('click', () => {
        // A pessoa pediu: volta à legenda só o bastante para se ver a diferença, e não espera a página parar.
        parar();
        cena('espera');
        depois(ANTES_DE_REPETIR, encenar);
      });
    }

    // O ato da vez é o que cruza uma linha da janela: o meio dela no computador e, no celular, logo abaixo do palco preso.
    let aoCruzar;
    let naHistoria;
    function observar() {
      aoCruzar?.disconnect();
      naHistoria?.disconnect();
      const linha = estreita.matches ? 62 : 50;
      const opcoes = { rootMargin: `-${linha}% 0px -${100 - linha}% 0px` };
      aoCruzar = new IntersectionObserver(entradas => {
        for (const entrada of entradas) if (entrada.isIntersecting) marcar(entrada.target);
      }, opcoes);
      atos.forEach(ato => aoCruzar.observe(ato));
      naHistoria = new IntersectionObserver(([entrada]) => {
        raiz.toggleAttribute('data-na-historia', entrada.isIntersecting);
      }, opcoes);
      naHistoria.observe(historia);
    }
    observar();
    estreita.addEventListener('change', observar);

    // Uma vez só: quem já entrou não sai e entra de novo a cada passada.
    const aoRolar = new IntersectionObserver(entradas => {
      for (const { target: alvo, isIntersecting: naTela } of entradas) {
        if (!naTela) continue;
        aoRolar.unobserve(alvo);
        alvo.setAttribute('data-visivel', '');
      }
    }, { rootMargin: '0px 0px -80px' });
    document.querySelectorAll('[data-revelar]').forEach(alvo => aoRolar.observe(alvo));
  });
})();
