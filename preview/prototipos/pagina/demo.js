'use strict';

// A demonstração do Alt+S (Mosaico e Abas) como um filme de três passos, por cima dos passos parados que a página já
// mostra sem script. Só começa quando a pessoa pode ver: as capturas carregadas, a tela 60% à vista e a página parada
// há 600 ms (rolar de novo zera a espera). Se ela sair de vista antes do fim, volta ao começo e toca de novo quando a
// pessoa parar diante dela. Com "menos movimento" não faz nada: ficam os passos parados. Nada aqui fala com a rede
// nem guarda coisa alguma.

// Carregado no <head>, sem `defer`, para marcar a página com `demo-filme` antes da primeira pintura: é essa classe que
// empilha as duas capturas, então a página não muda de lugar quando o filme assume.

(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('demo-filme');

  // Em ms. O passo 1 dá tempo de achar a cena e ler a legenda; o 2, de ler as duas teclas. Repetir encurta os dois:
  // quem pediu já sabe para onde olhar.
  const PARADA = 600;
  const PRIMEIRA_VEZ = { legenda: 1800, teclas: 1200 };
  const DE_NOVO = { legenda: 700, teclas: 1000 };
  const A_VISTA = .6;

  function preparar(demo) {
    const tela = demo.querySelector('.pp-demo-tela');
    const repetir = demo.querySelector('[data-demo-repetir]');
    let relogios = [];
    let espera = 0;
    let aVista = false;
    let carregada = false;
    let tocou = false;

    const passo = numero => { demo.dataset.passo = numero; };
    const parar = () => { relogios.forEach(clearTimeout); relogios = []; };

    function tocar(tempos) {
      parar();
      // Quem tocou foi o Repetir, antes de a espera vencer? Então ela não toca por cima.
      clearTimeout(espera);
      document.removeEventListener('scroll', armar, true);
      tocou = true;
      passo(1);
      relogios.push(setTimeout(() => passo(2), tempos.legenda));
      relogios.push(setTimeout(() => passo(3), tempos.legenda + tempos.teclas));
    }

    /** Recomeça a espera pela página parada. É o ouvinte de rolagem, e só existe até a primeira vez que o filme toca. */
    function armar() {
      clearTimeout(espera);
      if (tocou || !aVista || !carregada) return;
      espera = setTimeout(() => tocar(PRIMEIRA_VEZ), PARADA);
    }

    passo(0);
    repetir.hidden = false;
    repetir.addEventListener('click', () => tocar(DE_NOVO));

    new IntersectionObserver(([entrada]) => {
      aVista = entrada.intersectionRatio >= A_VISTA;
      // Saiu de vista no meio do filme: volta ao começo, para tocar inteiro quando a pessoa voltar.
      if (!entrada.isIntersecting && tocou && demo.dataset.passo !== '3') {
        parar();
        passo(0);
        tocou = false;
        document.addEventListener('scroll', armar, { capture: true, passive: true });
      }
      armar();
    }, { threshold: [0, A_VISTA] }).observe(tela);
    // A rolagem de qualquer caixa da página conta (a da ilha, nas Abas), por isso a captura.
    document.addEventListener('scroll', armar, { capture: true, passive: true });
    Promise.all([...tela.querySelectorAll('img')].map(imagem => imagem.decode().catch(() => {}))).then(() => {
      carregada = true;
      armar();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-demo]').forEach(preparar);
  });
})();
