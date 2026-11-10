'use strict';

// Variante 2, Flip. Eixo: a continuidade. A frase é um objeto só, que nunca some de um lugar para aparecer noutro:
// na chamada ela sai da legenda do vídeo e pousa na linha do histórico; no Como funciona ela é a linha do histórico,
// cresce para a palavra ser marcada e vira o cartão, sem corte. Quem mede de onde ela sai e aonde chega é o plugin
// Flip (First, Last, Invert, Play): o estado muda de uma vez no CSS, e o Flip toca a diferença só com `transform`.
// A frase tem a mesma largura em `em` nos três estados, e por isso quebra nas mesmas palavras: a escala é uma só
// para os dois lados e a letra não se deforma no caminho.

(function () {
  const P = window.ProtoHero;
  const { gsap, Flip } = window;
  gsap.registerPlugin(Flip);

  // Onde a legenda está na captura do vídeo (preview/site/capturas/legenda.jpg, 960 por 720): a caixa dela vai de
  // 136 a 824 px na largura e de 532 a 586 px na altura, e a letra tem 33,7 px (a frase de exemplo mede 658 px lá e
  // 292,7 px a 15 px). Refez a captura, refaça estas medidas.
  const LEGENDA = { left: '14.2%', top: '73.9%', width: '71.6%', height: '7.5%', letra: 33.7 / 960 };

  const marca = () =>
    `<span class="fx-legenda" aria-hidden="true" style="left: ${LEGENDA.left}; top: ${LEGENDA.top}; width: ${LEGENDA.width}; height: ${LEGENDA.height}"></span>`;

  const escrever = d => `
<div class="pg pg--flip">
  ${P.chamada(d, { naTela: marca(), historicoPrimeiro: true })}

  <section id="como-funciona" class="pg-como" aria-labelledby="como-funciona-titulo">
    ${P.cabecaDoComo(d)}
    ${P.abas(d)}
    <div class="fx-cena" data-passo="0">
      <div class="fx-palco">
        <div class="fx-objeto">
          <span class="fx-moldura fx-moldura--linha" aria-hidden="true"></span>
          <span class="fx-moldura fx-moldura--cartao" aria-hidden="true"></span>
          <p class="fx-meta"><span class="pg-idioma">${P.esc(d.frase.idioma)}</span> ${P.esc(d.frase.fonte)}</p>
          <p class="fx-frase" lang="${d.frase.lang}">${P.esc(d.frase.antes)}<mark><span class="fx-grifo" aria-hidden="true"></span>${P.esc(d.frase.palavra)}</mark>${P.esc(d.frase.depois)}</p>
          ${P.etapasDoEnvio(d)}
        </div>
      </div>
      <div class="pg-pilha fx-passos">
        ${d.como.passos.map((passo, indice) => `
        <div class="pg-painel pg-passo" role="tabpanel" id="pg-painel-${indice}" aria-labelledby="pg-aba-${indice}" tabindex="0"${indice === 0 ? ' data-aberto' : ''}>
          <h3>${P.esc(passo.titulo)}</h3>
          <p>${P.comAtalho(passo.texto, d.atalho)}</p>
          ${P.vistaDoPasso(d, indice, 'fx-vista')}
        </div>`).join('')}
      </div>
    </div>
  </section>
</div>`;

  class FlipDaFrase extends P.Variante {
    /** O roteiro da chamada: as teclas, o resultado, e a frase voando da legenda do vídeo até a linha do histórico. */
    roteiro(linha) {
      this.cenaDaTecla(linha);
      this.cenaDoResultado(linha);
      this.cenaDoVoo(linha);
    }

    /**
     * A frase não aparece no histórico: ela sai de onde estava. O ponto de partida é medido pelo Flip (`Flip.fit`
     * diz quanto a frase teria de andar para ficar em cima da legenda da captura) e a escala é a que deixa a letra
     * do tamanho da letra da legenda. A linha lê a medida por funções, e a medida é tirada de novo a cada vez que
     * a demonstração toca: a janela pode ter mudado de tamanho.
     */
    cenaDoVoo(linha) {
      const frase = this.querySelector('.pg-frase');
      const decolagem = 'resultado+=0.1';
      this.medirVoo();
      linha
        .fromTo(this.querySelector('.pg-vazio'), { autoAlpha: 1 }, { autoAlpha: 0, duration: P.tempo('--pg-mov-volta') }, 'resultado')
        // A frase aparece em cima da legenda, depressa, e só então viaja: vaivém, porque já está na tela e se move nela.
        .fromTo(frase, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12 }, decolagem)
        .fromTo(frase,
          { x: () => this.voo.x, y: () => this.voo.y, scale: () => this.voo.scale },
          { x: 0, y: 0, scale: 1, duration: 0.65, ease: P.curva('--site-curva-vaivem') }, decolagem)
        // O idioma não viaja: é da linha do histórico, e aparece quando a frase está pousando.
        .fromTo(this.querySelector('.pg-resultado .pg-idioma'), { opacity: 0 }, { opacity: 1, duration: P.tempo('--pg-mov-volta') }, 'resultado+=0.65');
    }

    /** De onde a frase sai: medido com ela no lugar dela, sem o `transform` de um voo anterior. */
    medirVoo() {
      const frase = this.querySelector('.pg-frase');
      gsap.set(frase, { x: 0, y: 0, scale: 1 });
      const { x, y } = Flip.fit(frase, this.querySelector('.fx-legenda'), { getVars: true, scale: true });
      this.voo = { x, y, scale: (LEGENDA.letra * this.querySelector('.pg-tela').offsetWidth) / parseFloat(getComputedStyle(frase).fontSize) };
    }

    tocar() {
      if (!this.parado) {
        this.medirVoo();
        this.medirDeNovo();
      }
      super.tocar();
    }

    minerar(origem) {
      if (!this.parado && origem === 'toque') {
        this.medirVoo();
        this.medirDeNovo();
      }
      super.minerar(origem);
    }

    ligar({ parado, sinal }) {
      const cena = this.querySelector('.fx-cena');
      const objeto = this.querySelector('.fx-objeto');
      const paineis = [...this.querySelectorAll('.fx-passos > *')];
      // O que acompanha a frase em cada estado: a moldura da linha (passo 1), o grifo na palavra (passos 2 e 3), a
      // moldura do cartão e as etapas do envio (passo 3).
      const pecas = [
        { alvo: this.querySelector('.fx-moldura--linha'), em: [0] },
        { alvo: this.querySelector('.fx-grifo'), em: [1, 2], grifo: true },
        { alvo: this.querySelector('.fx-moldura--cartao'), em: [2] },
        { alvo: this.querySelector('.fx-objeto .pg-etapas'), em: [2] },
      ];
      const marcar = indice => {
        cena.dataset.passo = indice;
        paineis.forEach((painel, i) => painel.toggleAttribute('data-aberto', i === indice));
      };
      // O palco se mede pela frase. A caixa dela tem a mesma altura em `em` nos três estados; o script a lê, soma
      // o que acompanha a frase em cada estado (a moldura da linha, o cartão com as etapas), e entrega ao CSS a
      // altura que o palco precisa e o topo que centra cada estado. São medidas de estado parado, tiradas quando a
      // largura muda: nada disto é animado.
      const palco = this.querySelector('.fx-palco');
      const etapas = this.querySelector('.fx-objeto .pg-etapas');
      const medir = () => {
        const letras = [0, 1, 2].map(estado => parseFloat(getComputedStyle(palco).getPropertyValue(`--fx-letra-${estado}`)));
        const em = parseFloat(getComputedStyle(objeto).fontSize);
        const frase = objeto.offsetHeight / em;
        const envio = etapas.offsetHeight / em;
        objeto.style.setProperty('--fx-etapas', `${envio.toFixed(2)}em`);
        // O que se vê em cada estado, em `em`: a frase; no cartão, a frase, um `em` de respiro e as etapas.
        const grupos = [frase, frase, frase + 1 + envio];
        const molduras = [0.8, 0, 1.3];
        // O palco tem a proporção dele, e cresce quando a frase é comprida demais para ela.
        const proporcao = parseFloat(getComputedStyle(palco).getPropertyValue('--fx-proporcao'));
        const alto = Math.ceil(Math.max(palco.offsetWidth * proporcao, ...grupos.map((grupo, estado) => (grupo + 2 * molduras[estado]) * letras[estado] + 48)));
        palco.style.setProperty('--fx-alto', `${alto}px`);
        grupos.forEach((grupo, estado) => palco.style.setProperty(`--fx-topo-${estado}`, `${Math.round((alto - grupo * letras[estado]) / 2)}px`));
      };
      medir();
      window.addEventListener('resize', medir, { signal: sinal });
      if (document.fonts) document.fonts.ready.then(() => { if (!sinal.aborted) medir(); });
      if (parado) return this.ligarAbas({ parado, sinal }, marcar);

      const vaivem = P.curva('--site-curva-vaivem');
      const saida = P.curva('--veio-curva-saida');
      const todos = [objeto, ...pecas.map(peca => peca.alvo)];
      // Em movimento, a opacidade das peças é do GSAP; o estado de partida é o do passo 1.
      pecas.forEach(peca => gsap.set(peca.alvo, { autoAlpha: peca.em.includes(0) ? 1 : 0, ...(peca.grifo ? { scaleX: 0 } : {}) }));
      this.ligarAbas({ parado, sinal }, (indice, { deTeclado }) => {
        // First: onde a frase está agora (no meio de um voo, é onde ela está na tela). Last: o estado novo, de uma vez.
        const antes = Flip.getState(objeto);
        marcar(indice);
        gsap.killTweensOf(pecas.map(peca => peca.alvo));
        if (deTeclado) {
          // Pelo teclado, o passo aparece na hora.
          Flip.killFlipsOf(objeto);
          pecas.forEach(peca => gsap.set(peca.alvo, { autoAlpha: peca.em.includes(indice) ? 1 : 0, ...(peca.grifo ? { scaleX: peca.em.includes(indice) ? 1 : 0 } : {}) }));
          return;
        }
        gsap.set(todos, { willChange: 'transform, opacity' });
        // Invert e Play: a frase volta, por `transform`, para onde estava, e viaja até o lugar novo.
        Flip.from(antes, {
          duration: 0.6,
          ease: vaivem,
          scale: true,
          onComplete: () => gsap.set(todos, { clearProps: 'willChange' }),
        });
        // O que sai, sai depressa e junto; o que entra espera a frase estar chegando.
        pecas.forEach(peca => {
          const entra = peca.em.includes(indice);
          gsap.to(peca.alvo, {
            autoAlpha: entra ? 1 : 0,
            ...(peca.grifo ? { scaleX: entra ? 1 : 0 } : {}),
            duration: entra ? 0.3 : P.tempo('--veio-transicao'),
            delay: entra ? 0.35 : 0,
            ease: saida,
          });
        });
      });
    }
  }

  P.registrar('pm-gsap-flip', FlipDaFrase, escrever);
})();
