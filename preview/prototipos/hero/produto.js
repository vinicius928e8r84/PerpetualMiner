'use strict';

// Variante 4, Produto (a Produto-primeiro). Eixo: o modelo de interação. A primeira coisa na página é a tela da
// extensão, e quem opera a demonstração é o visitante: o atalho de verdade no teclado, ou um toque nas teclas.
// Se ele não tocar em nada, a sequência das três etapas (comum.js) toca sozinha uma vez, depois de quatro segundos
// parado diante dela. O Como funciona é a mesma ideia: três abas, uma por passo, que a pessoa troca na hora.

(function () {
  const P = window.ProtoHero;

  const fraseInteira = frase => P.esc(`${frase.antes}${frase.palavra}${frase.depois}`);

  // O que cada passo mostra: a captura e o trecho dela em que a câmera para.
  const tela = (d, indice) => [
    `<div class="ph-pro-recorte ph-pro-recorte--popup">${P.captura(d.capturas.popup, { preguicosa: true })}</div>`,
    `<div class="ph-pro-recorte" style="--plano: ${d.capturas.painel.planos.palavra}">${P.captura(d.capturas.painel, { preguicosa: true })}</div>`,
    `<div class="ph-pro-recorte" style="--plano: ${d.capturas.painel.planos.envio}">${P.captura(d.capturas.painel, { preguicosa: true })}</div>`,
  ][indice];

  const escrever = d => `
<div class="ph-pro">
  <section class="ph-pro-chamada" aria-labelledby="titulo">
    <figure class="ph-pro-janela" data-demo${P.parado() ? ' data-minerada' : ''}>
      <div class="ph-pro-tela">
        ${P.captura(d.capturas.antes)}
        ${P.captura(d.capturas.depois)}
        <span class="ph-anel" aria-hidden="true"></span>
        ${P.teclaNaTela(d)}
      </div>
      <figcaption>
        ${P.parado() ? P.quadros(d, { tira: true }) : P.comando(d, { antes: d.demo.convite })}
        <div class="ph-pro-historico">
          <p class="ph-pro-vazio">${P.esc(d.demo.vazio)}</p>
          <p class="ph-pro-resultado">
            <span class="ph-pro-idioma">${P.esc(d.frase.idioma)}</span>
            <span lang="${d.frase.lang}">${fraseInteira(d.frase)}</span>
          </p>
        </div>
      </figcaption>
    </figure>
    <div class="ph-pro-texto">
      <p class="site-selo"><span class="site-selo-ponto" aria-hidden="true"></span>${P.esc(d.selo)}</p>
      <h1 id="titulo">${P.esc(d.titulo.comeco)} <span class="site-brilho">${P.esc(d.titulo.brilho)}</span></h1>
      <p class="ph-pro-lead">${P.esc(d.leadCurto)}</p>
      <div class="ph-pro-acoes">
        <a class="site-botao" href="${d.loja}">${P.esc(d.botao)} <span class="site-seta" aria-hidden="true">→</span></a>
        <a class="site-link" href="#como-funciona">${P.esc(d.link)}</a>
      </div>
      <p class="site-nota">${P.esc(d.nota)}</p>
    </div>
  </section>

  <section id="como-funciona" class="ph-pro-como" aria-labelledby="como-funciona-titulo">
    <p class="site-sobretitulo">${P.esc(d.como.sobretitulo)}</p>
    <h2 id="como-funciona-titulo">${P.esc(d.como.titulo)}</h2>
    <div class="ph-pro-abas">
      <div class="ph-pro-lista" role="tablist" aria-labelledby="como-funciona-titulo">
        ${d.como.passos.map((passo, indice) => `
        <button class="ph-aba" type="button" role="tab" id="ph-aba-${indice}" aria-controls="ph-painel-${indice}" aria-selected="${indice === 0}" tabindex="${indice === 0 ? 0 : -1}"><b>${indice + 1}</b>${P.esc(passo.rotulo)}</button>`).join('')}
      </div>
      <div class="ph-pro-lista ph-pro-lista--acesa" aria-hidden="true">
        ${d.como.passos.map((passo, indice) => `
        <span class="ph-aba"><b>${indice + 1}</b>${P.esc(passo.rotulo)}</span>`).join('')}
      </div>
    </div>
    ${d.como.passos.map((passo, indice) => `
    <div class="ph-pro-painel" role="tabpanel" id="ph-painel-${indice}" aria-labelledby="ph-aba-${indice}" tabindex="0"${indice === 0 ? '' : ' hidden'}>
      <figure class="ph-pro-vista">
        ${tela(d, indice)}
        <figcaption>${P.esc(passo.destino || passo.legenda)}</figcaption>
      </figure>
      <div class="ph-pro-passo">
        <h3>${P.esc(passo.titulo)}</h3>
        <p>${P.comAtalho(passo.texto, d.atalho)}</p>
        ${indice === 2 ? `<ol class="ph-pro-etapas" aria-label="As etapas de um envio, como o painel as mostra">${d.como.etapas.map(etapa => `<li>${P.esc(etapa)}</li>`).join('')}</ol>` : ''}
      </div>
    </div>`).join('')}
  </section>
</div>`;

  class Produto extends P.Variante {
    ligar(sinal) {
      // Quem opera é o visitante. Só se ele ficar parado diante da tela sem tocar em nada é que a sequência toca
      // sozinha, uma vez, para a demonstração não passar em branco: o convite das teclas (2,5 s) tem a vez antes.
      this.armar(this.querySelector('.ph-pro-tela'), { espera: 3600 });
      this.abas = [...this.querySelectorAll('[role="tab"]')];
      this.paineis = [...this.querySelectorAll('[role="tabpanel"]')];
      this.acesa = this.querySelector('.ph-pro-lista--acesa');
      this.abas.forEach((aba, indice) => {
        aba.addEventListener('click', () => this.abrir(indice), { signal: sinal });
        aba.addEventListener('keydown', evento => {
          const destino = { ArrowRight: indice + 1, ArrowLeft: indice - 1, Home: 0, End: this.abas.length - 1 }[evento.key];
          if (destino === undefined) return;
          // As setas aqui andam entre as abas; sem isto, andariam também entre as variantes do seletor.
          evento.stopPropagation();
          evento.preventDefault();
          const proxima = (destino + this.abas.length) % this.abas.length;
          this.abrir(proxima);
          this.abas[proxima].focus();
        }, { signal: sinal });
      });
      window.addEventListener('resize', () => this.acender(), { signal: sinal });
      // As fontes chegam depois e mudam a largura das abas: o recorte se mede de novo.
      if (document.fonts) document.fonts.ready.then(() => { if (!sinal.aborted) this.acender(); });
      this.aberta = 0;
      this.acender();
      // A cor da aba só desliza depois da primeira pintura, para a página não abrir se mexendo.
      requestAnimationFrame(() => requestAnimationFrame(() => this.acesa.setAttribute('data-pronta', '')));
    }

    abrir(indice) {
      this.aberta = indice;
      this.abas.forEach((aba, i) => {
        aba.setAttribute('aria-selected', String(i === indice));
        aba.tabIndex = i === indice ? 0 : -1;
      });
      // O painel troca na hora: quem clicou numa aba quer o conteúdo, não a passagem.
      this.paineis.forEach((painel, i) => { painel.hidden = i !== indice; });
      this.acender();
    }

    /** A lista acesa (ouro) fica recortada na aba aberta; trocar de aba é mover o recorte. */
    acender() {
      const aba = this.abas[this.aberta];
      const lista = aba.parentElement;
      const direita = lista.offsetWidth - aba.offsetLeft - aba.offsetWidth;
      const embaixo = lista.offsetHeight - aba.offsetTop - aba.offsetHeight;
      // O canto é o da pílula numa aba de uma linha (22 de raio em 44 de altura) e não come o texto numa de três.
      this.acesa.style.clipPath = `inset(${aba.offsetTop}px ${direita}px ${embaixo}px ${aba.offsetLeft}px round 22px)`;
    }
  }

  P.registrar('pm-hero-produto', Produto, escrever);
})();
