'use strict';

// Variante 1, Maestro. Eixo: o tempo na mão de quem vê. A demonstração é uma linha do tempo mestra (`pm-demo`), com
// os três rótulos à vista num trilho: dá para pausar, voltar, arrastar até qualquer quadro, e o Repetir é a mesma
// linha voltando ao primeiro quadro. O Como funciona é outra linha (`pm-como`), parada, com um rótulo por passo:
// as abas não trocam de painel, levam a linha até o rótulo, e a câmera vai junto, de onde estiver.

(function () {
  const P = window.ProtoHero;
  const { gsap } = window;

  // O trilho da demonstração: tocar e pausar, e a posição. O controle de verdade é um <input type="range">
  // invisível por cima do trilho desenhado: teclado, leitor de tela e dedo funcionam como em qualquer controle.
  const transporte = () => `
<div class="ms-transporte" role="group" aria-label="Reprodução da demonstração">
  <button class="ms-tocar" type="button" data-alternar aria-label="Tocar"><span aria-hidden="true"></span></button>
  <div class="ms-trilho">
    <span class="ms-fio" aria-hidden="true"><span class="ms-cheio"></span></span>
    <span class="ms-marcas" aria-hidden="true"><b>1</b><b>2</b><b>3</b></span>
    <input class="ms-barra" type="range" min="0" max="1000" step="1" value="0" aria-label="Posição na demonstração">
    <span class="ms-carro" aria-hidden="true"><span class="ms-cursor"></span></span>
  </div>
</div>`;

  const escrever = d => `
<div class="pg pg--maestro">
  ${P.chamada(d, { sobOComando: transporte() })}

  <section id="como-funciona" class="pg-como" aria-labelledby="como-funciona-titulo">
    ${P.cabecaDoComo(d)}
    ${P.abas(d)}
    <div class="ms-cena" data-passo="0">
      <figure class="pg-vista">
        <div class="pg-recorte">
          <div class="ms-camada ms-camada--popup pg-recorte--popup">${P.captura(d.capturas.popup, { preguicosa: true })}</div>
          <div class="ms-camada ms-camada--painel" style="--plano-1: ${d.capturas.painel.planos.palavra}; --plano-2: ${d.capturas.painel.planos.envio}">${P.captura(d.capturas.painel, { preguicosa: true })}</div>
        </div>
        <figcaption class="pg-pilha ms-legendas">
          ${d.como.passos.map((passo, indice) => `<span${indice === 0 ? ' data-aberto' : ''}>${P.esc(passo.destino || passo.legenda)}</span>`).join('')}
        </figcaption>
      </figure>
      <div class="pg-pilha ms-passos">
        ${d.como.passos.map((passo, indice) => `
        <div class="pg-painel pg-passo" role="tabpanel" id="pg-painel-${indice}" aria-labelledby="pg-aba-${indice}" tabindex="0"${indice === 0 ? ' data-aberto' : ''}>
          <h3>${P.esc(passo.titulo)}</h3>
          <p>${P.comAtalho(passo.texto, d.atalho)}</p>
          ${indice === 2 ? P.etapasDoEnvio(d) : ''}
        </div>`).join('')}
      </div>
    </div>
  </section>
</div>`;

  class Maestro extends P.Variante {
    ligar({ parado, sinal }) {
      this.ligarTransporte(parado, sinal);
      this.ligarComo(parado, sinal);
    }

    ligarTransporte(parado, sinal) {
      const linha = this.linha;
      this.alternar = this.querySelector('[data-alternar]');
      this.barra = this.querySelector('.ms-barra');
      const marcas = [...this.querySelectorAll('.ms-marcas b')];
      // Cada marca fica onde o rótulo dela está na linha: o trilho é a linha, desenhada.
      const rotulos = ['antes', 'tecla', 'resultado'];
      rotulos.forEach((rotulo, indice) => { marcas[indice].style.left = `${(linha.labels[rotulo] / linha.duration()) * 100}%`; });
      const cheio = this.querySelector('.ms-cheio');
      const carro = this.querySelector('.ms-carro');
      this.encher = gsap.quickSetter(cheio, 'scaleX');
      this.andar = gsap.quickSetter(carro, 'xPercent');
      // O fio e o cursor andam com a linha a cada quadro: entram na conta do `will-change`, como o que ela move.
      if (!parado) this.alvos.push(cheio, carro);
      this.desenharTrilho();

      this.alternar.addEventListener('click', () => {
        this.setAttribute('data-usada', '');
        if (this.tocando()) {
          linha.pause();
          this.esfriar();
        } else if (linha.progress() === 1) {
          this.tocar();
        } else {
          this.aquecer();
          linha.play();
        }
        this.sincronizar();
      }, { signal: sinal });

      // Arrastar leva a linha ao quadro, parada: quem arrasta quer ver aquele quadro, não que ela siga tocando.
      this.barra.addEventListener('pointerdown', () => this.aquecer(), { signal: sinal });
      this.barra.addEventListener('input', () => {
        this.setAttribute('data-usada', '');
        linha.pause().progress(this.barra.value / 1000);
        this.sincronizar();
      }, { signal: sinal });
      this.barra.addEventListener('change', () => this.esfriar(), { signal: sinal });
      // Pelo teclado, as setas andam de etapa em etapa: são os quadros que importam.
      this.barra.addEventListener('keydown', evento => {
        const passo = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[evento.key];
        if (!passo) return;
        evento.preventDefault();
        this.setAttribute('data-usada', '');
        const agora = rotulos.indexOf(this.etapa);
        const destino = rotulos[Math.min(rotulos.length - 1, Math.max(0, agora + passo))];
        // O quadro de cada etapa é ela pronta: as teclas já na tela, o resultado já assentado.
        // `false`: a linha avisa quem a acompanha (a legenda, o trilho) também quando salta parada.
        linha.pause({ antes: 0, tecla: linha.labels.tecla + 0.4, resultado: linha.duration() }[destino], false);
        this.esfriar();
        this.sincronizar();
      }, { signal: sinal });
      this.sincronizar();
    }

    /** O trilho segue a linha a cada quadro: o fio enche (scaleX) e o cursor anda (translate). */
    desenharTrilho() {
      const progresso = this.linha.progress();
      this.encher(progresso);
      this.andar(progresso * 100);
    }

    acompanhar() {
      super.acompanhar();
      // Com "menos movimento" o trilho não desliza: salta de uma etapa à outra, em irPara.
      if (this.encher && !this.parado) this.desenharTrilho();
    }

    irPara(etapa, opcoes) {
      super.irPara(etapa, opcoes);
      if (this.encher && this.parado) this.desenharTrilho();
      this.sincronizar();
    }

    esfriar() {
      super.esfriar();
      this.sincronizar();
    }

    tocar() {
      super.tocar();
      this.sincronizar();
    }

    minerar(origem) {
      super.minerar(origem);
      this.sincronizar();
    }

    /** O botão diz o que faz agora, e a barra invisível fica onde a linha está (é o que o leitor de tela anuncia). */
    sincronizar() {
      if (!this.alternar) return;
      const tocando = this.tocando();
      this.alternar.toggleAttribute('data-tocando', tocando);
      this.alternar.setAttribute('aria-label', tocando ? 'Pausar' : 'Tocar');
      if (!tocando) this.desenharTrilho();
      this.barra.value = String(Math.round(this.linha.progress() * 1000));
      this.barra.setAttribute('aria-valuetext', `${this.passo.textContent} ${this.estado.textContent}`);
    }

    ligarComo(parado, sinal) {
      const cena = this.querySelector('.ms-cena');
      const paineis = [...this.querySelectorAll('.ms-passos > *')];
      const legendas = [...this.querySelectorAll('.ms-legendas > *')];
      // O estado parado de cada passo, que o CSS desenha: é o que vale com "menos movimento" e para o leitor de tela.
      const marcar = indice => {
        cena.dataset.passo = indice;
        [paineis, legendas].forEach(pilha => pilha.forEach((item, i) => item.toggleAttribute('data-aberto', i === indice)));
      };
      if (parado) return this.ligarAbas({ parado, sinal }, marcar);

      const como = this.montarComo(paineis, legendas);
      const alvos = P.alvosDe(como);
      const vaivem = P.curva('--site-curva-vaivem');
      this.ligarAbas({ parado, sinal }, (indice, { deTeclado }) => {
        marcar(indice);
        const rotulo = `passo-${indice + 1}`;
        // Pelo teclado a linha salta para o rótulo: quem anda pelas abas com as setas quer o conteúdo, na hora.
        if (deTeclado) {
          gsap.killTweensOf(como);
          como.pause(rotulo);
          return;
        }
        // No clique, a linha vai até o rótulo de onde estiver: clicar noutra aba no meio do caminho só muda o destino
        // (a viagem anterior para ali mesmo, e a nova parte daquele quadro).
        gsap.killTweensOf(como);
        const distancia = Math.abs(como.labels[rotulo] - como.time());
        gsap.set(alvos, { willChange: 'transform, opacity' });
        como.tweenTo(rotulo, {
          duration: 0.45 + 0.15 * distancia,
          ease: vaivem,
          onComplete: () => gsap.set(alvos, { clearProps: 'willChange' }),
        });
      });
    }

    /**
     * A linha do Como funciona: um rótulo por passo, e entre um rótulo e outro, um segundo de linha. Os trechos são
     * lineares de propósito: quem dá a curva é a viagem até o rótulo (tweenTo), uma só para tudo o que se move junto.
     */
    montarComo(paineis, legendas) {
      const { planos } = this.dados.capturas.painel;
      const popup = this.querySelector('.ms-camada--popup');
      const painel = this.querySelector('.ms-camada--painel');
      const camera = painel.querySelector('img');
      const como = gsap.timeline({ id: 'pm-como', paused: true, defaults: { ease: 'none' } });
      como.addLabel('passo-1', 0).addLabel('passo-2', 1).addLabel('passo-3', 2);
      // Os três textos moram no mesmo lugar: a linha é dona da opacidade deles, e o primeiro começa à vista.
      gsap.set([...paineis, ...legendas], { autoAlpha: indice => (indice % 3 === 0 ? 1 : 0) });
      // De um texto para o outro: o que sai some antes de o que entra aparecer.
      const trocar = (pilha, de, para, quando) => como
        .to(pilha[de], { autoAlpha: 0, duration: 0.4 }, quando)
        .to(pilha[para], { autoAlpha: 1, duration: 0.5 }, quando + 0.5);
      // 1 → 2: o popup dá lugar ao painel, e a câmera já vem chegando na frase.
      como
        .fromTo(popup, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.5 }, 0)
        .fromTo(painel, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 0.15);
      if (camera) como.fromTo(camera, P.plano(planos.abertura), { ...P.plano(planos.palavra), duration: 1 }, 0);
      trocar(paineis, 0, 1, 0);
      trocar(legendas, 0, 1, 0);
      // 2 → 3: a mesma captura, e a câmera desliza da frase até a barra do envio.
      if (camera) como.to(camera, { ...P.plano(planos.envio), duration: 1 }, 1);
      trocar(paineis, 1, 2, 1);
      trocar(legendas, 1, 2, 1);
      return como;
    }
  }

  P.registrar('pm-gsap-maestro', Maestro, escrever);
})();
