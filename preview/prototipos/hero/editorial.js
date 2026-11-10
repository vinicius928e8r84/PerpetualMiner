'use strict';

// Variante 2, Editorial. Eixo: a tipografia. A imagem da chamada é a própria frase minerada, composta grande; o
// atalho risca a linha de ouro por baixo dela, como o overlay faz na legenda. As capturas viram pranchas numeradas.
// A demonstração vai em três etapas (comum.js): a frase crua, as teclas acesas logo abaixo dela, a linha riscada.

(function () {
  const P = window.ProtoHero;

  const numero = indice => String(indice + 1).padStart(2, '0');

  const escrever = d => `
<div class="ph-edi">
  <section class="ph-edi-chamada" aria-labelledby="titulo">
    <p class="ph-edi-cabeco"><span>PerpetualMiner</span><span>${P.esc(d.selo)}</span></p>
    <h1 id="titulo">${P.esc(d.titulo.comeco)} <span class="site-brilho">${P.esc(d.titulo.brilho)}</span></h1>
    <div class="ph-edi-grade">
      <div class="ph-edi-texto">
        <p class="ph-edi-lead">${P.esc(d.lead)}</p>
        <div class="ph-edi-acoes">
          <a class="site-botao" href="${d.loja}">${P.esc(d.botao)} <span class="site-seta" aria-hidden="true">→</span></a>
          <a class="site-link" href="#como-funciona">${P.esc(d.link)}</a>
        </div>
        <p class="site-nota">${P.esc(d.nota)}</p>
      </div>
      <figure class="ph-edi-especime" data-demo${P.parado() ? ' data-minerada' : ''}>
        <p class="ph-edi-fonte">${P.esc(d.frase.fonte)} · ${P.esc(d.frase.idioma)}</p>
        <blockquote class="ph-edi-frase" lang="${d.frase.lang}">
          <p>${P.frase(d.frase)}</p>
          <p class="ph-edi-frase-minerada" aria-hidden="true">${P.frase(d.frase)}</p>
        </blockquote>
        ${P.parado() ? `
        <figcaption>${P.quadros(d, { tira: true })}</figcaption>` : `
        <figcaption>${P.comando(d)}</figcaption>
        <div class="ph-edi-fig">
          <div class="ph-edi-fig-tela">
            ${P.captura(d.capturas.antes)}
            ${P.captura(d.capturas.depois)}
          </div>
          <p><b>Fig. 1</b> ${P.esc(d.demo.legenda)}</p>
        </div>`}
      </figure>
    </div>
  </section>

  <section id="como-funciona" class="ph-edi-como" aria-labelledby="como-funciona-titulo">
    <header class="ph-edi-cabeca">
      <p class="site-sobretitulo">${P.esc(d.como.sobretitulo)}</p>
      <h2 id="como-funciona-titulo">${P.esc(d.como.titulo)}</h2>
    </header>
    <ol class="ph-edi-capitulos">
      ${d.como.passos.map((passo, indice) => `
      <li class="ph-edi-capitulo" data-revelar>
        <span class="ph-edi-numero" aria-hidden="true">${numero(indice)}</span>
        <div class="ph-edi-corpo">
          <h3>${P.esc(passo.titulo)}</h3>
          <p>${P.comAtalho(passo.texto, d.atalho)}</p>
        </div>
        <figure class="ph-edi-prancha ph-edi-prancha--${indice + 1}">
          ${P.captura([d.capturas.depois, d.capturas.painelEstreito, d.capturas.painelEstreito][indice], { preguicosa: true })}
          <figcaption><b>Fig. ${indice + 2}</b> ${P.esc(passo.legenda)}</figcaption>
        </figure>
      </li>`).join('')}
    </ol>
  </section>
</div>`;

  class Editorial extends P.Variante {
    ligar() {
      // A sequência toca sozinha uma vez, com a frase parada diante da pessoa: antes, a tecla, e a linha se risca.
      this.armar(this.querySelector('.ph-edi-frase'));
      // Cada capítulo entra uma vez só, quando chega à tela: quem já entrou não sai para entrar de novo.
      const aoRolar = new IntersectionObserver(entradas => {
        for (const { target: alvo, isIntersecting: naTela } of entradas) {
          if (!naTela) continue;
          aoRolar.unobserve(alvo);
          alvo.setAttribute('data-visivel', '');
        }
      }, { rootMargin: '0px 0px -80px' });
      this.querySelectorAll('[data-revelar]').forEach(alvo => aoRolar.observe(alvo));
      this.fim.signal.addEventListener('abort', () => aoRolar.disconnect());
    }
  }

  P.registrar('pm-hero-editorial', Editorial, escrever);
})();
