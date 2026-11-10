'use strict';

// Variante 3, Diretor. Eixo: a rolagem dirige. A chamada é a da Produto, com a demonstração em três etapas
// (variante.js). No Como funciona, a cena fica presa na tela (ScrollTrigger, `pin`) e a linha `pm-rolagem` anda com a
// rolagem (`scrub`): a câmera passa do popup ao painel e desliza da frase até o envio, na velocidade de quem rola.
// Só aqui: o resto da página rola como qualquer página. Quando a cena não cabe na tela (texto comprido demais para
// o telefone), e com "menos movimento", o Como funciona são os três passos empilhados, parados.

(function () {
  const P = window.ProtoHero;
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  // No telefone, a barra de endereço some e volta enquanto se rola: isso não é motivo para medir a cena de novo.
  ScrollTrigger.config({ ignoreMobileResize: true });

  const passo = (d, item, indice) => `
          <span class="pg-numero" aria-hidden="true">${P.numero(indice)}</span>
          <h3>${P.esc(item.titulo)}</h3>
          <p>${P.comAtalho(item.texto, d.atalho)}</p>
          ${indice === 2 ? P.etapasDoEnvio(d) : ''}`;

  const escrever = d => `
<div class="pg pg--diretor">
  ${P.chamada(d)}

  <section id="como-funciona" class="pg-como" aria-labelledby="como-funciona-titulo">
    ${P.cabecaDoComo(d)}
    <ol class="pg-empilhados">
      ${d.como.passos.map((item, indice) => `
      <li class="pg-empilhado">
        <div class="pg-passo">${passo(d, item, indice)}
        </div>
        ${P.vistaDoPasso(d, indice)}
      </li>`).join('')}
    </ol>
    <div class="dr-cena" hidden>
      <figure class="pg-vista">
        <div class="pg-recorte">
          <div class="dr-camada dr-camada--popup pg-recorte--popup">${P.captura(d.capturas.popup, { preguicosa: true })}</div>
          <div class="dr-camada dr-camada--painel">${P.captura(d.capturas.painel, { preguicosa: true })}</div>
        </div>
        <figcaption class="dr-legendas">
          ${d.como.passos.map(item => `<span>${P.esc(item.destino || item.legenda)}</span>`).join('')}
        </figcaption>
      </figure>
      <div class="dr-roteiro">
        <span class="dr-fio" aria-hidden="true"><span class="dr-fio-cheio"></span></span>
        <ol class="dr-passos">
          ${d.como.passos.map((item, indice) => `
          <li class="pg-passo dr-passo">${passo(d, item, indice)}
          </li>`).join('')}
        </ol>
      </div>
    </div>
  </section>
</div>`;

  class Diretor extends P.Variante {
    ligar({ parado, sinal }) {
      if (parado) return;
      const pilha = this.querySelector('.pg-empilhados');
      const cena = this.querySelector('.dr-cena');
      const topo = document.querySelector('.site-topo');
      // A cena fica presa logo abaixo do topo da página, quando ele acompanha a rolagem.
      const folga = () => (getComputedStyle(topo).position === 'sticky' ? topo.getBoundingClientRect().height + 28 : 16);
      // A cena só fica presa se couber inteira na tela: o que fica preso e não cabe não pode ser lido.
      const cabe = () => {
        cena.hidden = false;
        const altura = cena.offsetHeight;
        cena.hidden = true;
        return altura <= window.innerHeight - folga() - 16;
      };
      if (!cabe()) return;

      pilha.hidden = true;
      cena.hidden = false;
      const linha = this.montarRolagem();
      const alvos = P.alvosDe(linha);
      const gatilho = ScrollTrigger.create({
        id: 'pm-rolagem',
        animation: linha,
        trigger: cena,
        pin: true,
        anticipatePin: 1,
        start: () => `top top+=${folga()}`,
        // Dois e pouco de tela para os três passos: cada passo e cada passagem têm uns 30% de tela de rolagem.
        end: '+=220%',
        // A linha alcança a rolagem em 0,4 s: a roda do mouse anda aos saltos, e a câmera não deve saltar com ela.
        scrub: 0.4,
        invalidateOnRefresh: true,
        // `will-change` só enquanto a cena está presa.
        onToggle: ({ isActive }) => gsap.set(alvos, isActive ? { willChange: 'transform, opacity' } : { clearProps: 'willChange' }),
      });
      // Se a janela mudar a ponto de a cena deixar de caber, voltam os passos empilhados.
      let altura = window.innerHeight;
      window.addEventListener('resize', () => {
        if (Math.abs(window.innerHeight - altura) < 120) return;
        altura = window.innerHeight;
        if (cena.offsetHeight <= window.innerHeight - folga() - 16) return;
        gatilho.kill(true);
        linha.revert();
        cena.hidden = true;
        pilha.hidden = false;
        ScrollTrigger.refresh();
      }, { signal: sinal });
      sinal.addEventListener('abort', () => {
        cena.hidden = true;
        pilha.hidden = false;
      });
    }

    /**
     * A linha que a rolagem toca, em dez tempos: cada passo fica dois tempos parado e cada passagem leva dois. Os
     * trechos têm uma curva suave (devagar no começo e no fim de cada passagem); o fio é linear, porque mede a
     * rolagem. Os três textos moram no mesmo lugar: o que sai sobe, o que entra vem de baixo, como a página.
     */
    montarRolagem() {
      const { planos } = this.dados.capturas.painel;
      const popup = this.querySelector('.dr-camada--popup');
      const painel = this.querySelector('.dr-camada--painel');
      const camera = painel.querySelector('img');
      const passos = [...this.querySelectorAll('.dr-passo')];
      const legendas = [...this.querySelectorAll('.dr-legendas > *')];
      const etapas = [...this.querySelectorAll('.dr-passos .pg-etapas li')];
      const linha = gsap.timeline({ id: 'pm-rolagem', defaults: { ease: 'power1.inOut' } });
      linha.addLabel('passo-1', 0).addLabel('passo-2', 4).addLabel('passo-3', 8);
      linha.fromTo(this.querySelector('.dr-fio-cheio'), { scaleX: 0 }, { scaleX: 1, duration: 10, ease: 'none' }, 0);
      const passar = (de, para, quando) => linha
        .to(passos[de], { autoAlpha: 0, y: -14, duration: 0.8 }, quando)
        .fromTo(passos[para], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.8 }, quando + 1)
        .to(legendas[de], { autoAlpha: 0, duration: 0.8 }, quando)
        .fromTo(legendas[para], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, quando + 1);
      // 1 → 2: o popup dá lugar ao painel, e a câmera chega na frase.
      linha
        .fromTo(popup, { autoAlpha: 1 }, { autoAlpha: 0, duration: 1 }, 2)
        .fromTo(painel, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2 }, 2.3);
      if (camera) linha.fromTo(camera, P.plano(planos.abertura), { ...P.plano(planos.palavra), duration: 2 }, 2);
      passar(0, 1, 2);
      // 2 → 3: a mesma captura; a câmera desliza da frase até a barra do envio.
      if (camera) linha.to(camera, { ...P.plano(planos.envio), duration: 2 }, 6);
      passar(1, 2, 6);
      // No último passo, as etapas do envio acendem uma a uma, na ordem em que acontecem.
      if (etapas.length) linha.fromTo(etapas, { opacity: 0.6 }, { opacity: 1, duration: 0.3, stagger: 0.28, ease: 'none' }, 8.2);
      linha.set({}, {}, 10);
      return linha;
    }
  }

  P.registrar('pm-gsap-diretor', Diretor, escrever);
})();
