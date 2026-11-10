'use strict';

// Variante 1, Silenciosa. Eixo: o movimento, levado a quase zero. Uma coluna, fios em vez de sombras, e a
// demonstração não depende do tempo: as três etapas (antes, a tecla, depois) estão sempre na tela, lado a lado.
// O atalho de verdade acende a tecla e o quadro do resultado, na hora. Nada entra, nada roda sozinho.

(function () {
  const P = window.ProtoHero;

  const escrever = d => `
<div class="ph-sil">
  <section class="ph-sil-chamada" aria-labelledby="titulo">
    <p class="ph-sil-selo">${P.esc(d.selo)}</p>
    <h1 id="titulo">${P.esc(d.titulo.comeco)} <span>${P.esc(d.titulo.brilho)}</span></h1>
    <p class="ph-sil-lead">${P.esc(d.leadCurto)}</p>
    <div class="ph-sil-acoes">
      <a class="site-botao" href="${d.loja}">${P.esc(d.botao)} <span class="site-seta" aria-hidden="true">→</span></a>
      <a class="site-link" href="#como-funciona">${P.esc(d.link)}</a>
    </div>
    <p class="site-nota">${P.esc(d.nota)}</p>
    <div class="ph-sil-demo" data-demo>
      ${P.quadros(d)}
      <p class="ph-so-leitor" role="status" data-estado></p>
    </div>
  </section>

  <section id="como-funciona" class="ph-sil-como" aria-labelledby="como-funciona-titulo">
    <p class="site-sobretitulo">${P.esc(d.como.sobretitulo)}</p>
    <h2 id="como-funciona-titulo">${P.esc(d.como.titulo)}</h2>
    <ol class="ph-sil-passos">
      ${d.como.passos.map(passo => `
      <li>
        <h3>${P.esc(passo.titulo)}</h3>
        <p>${P.comAtalho(passo.texto, d.atalho)}</p>
      </li>`).join('')}
    </ol>
    <figure class="ph-sil-captura">
      <picture>
        <source media="(max-width: 640px)" srcset="${P.esc(d.capturas.painelEstreito.src)}" width="${d.capturas.painelEstreito.largura}" height="${d.capturas.painelEstreito.altura}">
        ${P.captura(d.capturas.painel, { preguicosa: true })}
      </picture>
      <figcaption>${P.esc(d.como.passos[2].legenda)}</figcaption>
    </figure>
  </section>
</div>`;

  P.registrar('pm-hero-silenciosa', class extends P.Variante {}, escrever);
})();
