'use strict';

// Variante 3, Cinema (a Cinematográfica). Eixo: a narrativa em movimento. A chamada é um quadro de filme com o
// título por cima, e a demonstração roda sozinha uma vez, em três etapas (comum.js), com a pessoa parada diante
// dela; o Como funciona é um roteiro: o quadro fica preso na tela e a câmera passa de uma captura à outra conforme
// a pessoa rola pelos três passos.

(function () {
  const P = window.ProtoHero;

  const numero = indice => String(indice + 1).padStart(2, '0');

  const escrever = d => `
<div class="ph-cin">
  <section class="ph-cin-chamada" aria-labelledby="titulo" data-demo${P.parado() ? ' data-minerada' : ''}>
    <div class="ph-cin-sala">
      <div class="ph-cin-palco">
        ${P.captura(d.capturas.antes)}
        ${P.captura(d.capturas.depois, { classe: 'ph-cin-depois' })}
        <span class="ph-anel" aria-hidden="true"></span>
        ${P.teclaNaTela(d)}
      </div>
      <div class="ph-cin-letreiro">
        <p class="site-selo"><span class="site-selo-ponto" aria-hidden="true"></span>${P.esc(d.selo)}</p>
        <h1 id="titulo">${P.esc(d.titulo.comeco)} <span class="site-brilho">${P.esc(d.titulo.brilho)}</span></h1>
      </div>
    </div>
    <div class="ph-cin-rodape">
      ${P.parado() ? P.quadros(d, { tira: true }) : P.comando(d, { classe: 'ph-cin-comando' })}
      <div class="ph-cin-acoes">
        <a class="site-botao" href="${d.loja}">${P.esc(d.botao)} <span class="site-seta" aria-hidden="true">→</span></a>
        <a class="site-link" href="#como-funciona">${P.esc(d.link)}</a>
      </div>
      <p class="ph-cin-lead">${P.esc(d.leadCurto)}</p>
      <p class="site-nota">${P.esc(d.nota)}</p>
    </div>
  </section>

  <section id="como-funciona" class="ph-cin-como" aria-labelledby="como-funciona-titulo" data-cena="1">
    <header class="ph-cin-cabeca">
      <p class="site-sobretitulo">${P.esc(d.como.sobretitulo)}</p>
      <h2 id="como-funciona-titulo">${P.esc(d.como.titulo)}</h2>
    </header>
    <div class="ph-cin-roteiro">
      <div class="ph-cin-quadro">
        <div class="ph-cin-janela">
          ${P.captura(d.capturas.depois, { classe: 'ph-cin-plano', preguicosa: true })}
          <div class="ph-cin-camera" style="--plano-1: ${d.capturas.painel.planos.abertura}; --plano-2: ${d.capturas.painel.planos.palavra}; --plano-3: ${d.capturas.painel.planos.envio}">${P.captura(d.capturas.painel, { preguicosa: true })}</div>
        </div>
        <p class="ph-cin-claquete" aria-hidden="true"><span></span><span></span><span></span></p>
      </div>
      <ol class="ph-cin-cenas">
        ${d.como.passos.map((passo, indice) => `
        <li data-cena="${indice + 1}">
          <span class="ph-cin-numero" aria-hidden="true">${numero(indice)}</span>
          <h3>${P.esc(passo.titulo)}</h3>
          <p>${P.comAtalho(passo.texto, d.atalho)}</p>
        </li>`).join('')}
      </ol>
    </div>
  </section>
</div>`;

  class Cinema extends P.Variante {
    ligar(sinal) {
      // A sequência toca sozinha uma vez, com a tela parada diante da pessoa: antes, a tecla, o resultado.
      this.armar(this.querySelector('.ph-cin-palco'));

      // O título mora no céu da captura, e o céu tem tamanho: um título que passa dele cobriria o aviso da extensão.
      // Quando não cabe, o título sai de cima do quadro e vai para antes dele, como no telefone.
      const sala = this.querySelector('.ph-cin-sala');
      const letreiro = this.querySelector('.ph-cin-letreiro');
      const palco = this.querySelector('.ph-cin-palco');
      const medir = () => {
        sala.removeAttribute('data-letreiro-fora');
        if (letreiro.offsetHeight > palco.offsetHeight * 0.46) sala.setAttribute('data-letreiro-fora', '');
      };
      medir();
      window.addEventListener('resize', medir, { signal: sinal });
      if (document.fonts) document.fonts.ready.then(() => { if (!sinal.aborted) medir(); });

      // A cena é a do passo que cruza o meio da tela. Rolar depressa só troca o alvo: as transições partem de onde estão.
      const roteiro = this.querySelector('.ph-cin-como');
      const noMeio = new IntersectionObserver(entradas => {
        for (const { target: alvo, isIntersecting: naTela } of entradas) {
          if (naTela) roteiro.dataset.cena = alvo.dataset.cena;
        }
      }, { rootMargin: '-50% 0px -50% 0px' });
      this.querySelectorAll('.ph-cin-cenas li').forEach(cena => noMeio.observe(cena));
      this.fim.signal.addEventListener('abort', () => noMeio.disconnect());
    }
  }

  P.registrar('pm-hero-cinema', Cinema, escrever);
})();
