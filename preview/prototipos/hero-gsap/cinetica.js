'use strict';

// Variante 4, Cinética. Eixo: a personalidade. A tecla é a personagem e a letra se mexe: na chamada, as teclas
// grandes entram com mola, o Alt desce e fica, o S bate, e a frase minerada chega ao histórico palavra por palavra,
// com o grifo riscando a palavra no fim. No Como funciona, cada passo entra uma vez, quando chega à tela: o título
// sobe palavra por palavra e a personagem do passo faz o gesto dela (a tecla, o grifo, as etapas).
// A mola é a da Veio (`--veio-curva-mola`, que passa 10% do alvo e volta): overshoot com teto, sem quicar.

(function () {
  const P = window.ProtoHero;
  const { gsap } = window;

  // Uma palavra que sobe por trás de uma máscara: a caixa de fora corta, a de dentro é a que o GSAP move.
  const palavra = miolo => `<span class="ci-palavra"><span class="ci-letra">${miolo}</span></span>`;

  /** Um texto em palavras, para os olhos; quem lê a tela ouve o texto inteiro, de uma vez. */
  const emPalavras = texto =>
    `<span class="pg-so-leitor">${P.esc(texto)}</span><span aria-hidden="true">${texto.split(/\s+/).filter(Boolean).map(parte => palavra(P.esc(parte))).join(' ')}</span>`;

  /** A frase minerada em palavras, com o grifo na palavra que o cartão ensina (que pode vir colada à pontuação). */
  const fraseEmPalavras = frase => {
    const palavras = [[]];
    for (const [texto, grifada] of [[frase.antes, false], [frase.palavra, true], [frase.depois, false]]) {
      for (const trecho of texto.split(/(\s+)/)) {
        if (!trecho) continue;
        if (/^\s+$/.test(trecho)) palavras.push([]);
        else palavras[palavras.length - 1].push(grifada ? `<mark><span class="ci-grifo"></span>${P.esc(trecho)}</mark>` : P.esc(trecho));
      }
    }
    const visivel = palavras.filter(partes => partes.length).map(partes => palavra(partes.join(''))).join(' ');
    return `<span class="pg-so-leitor">${P.fraseInteira(frase)}</span><span aria-hidden="true">${visivel}</span>`;
  };

  const historico = d => `
<div class="pg-historico">
  <p class="pg-vazio">${P.esc(d.demo.vazio)}</p>
  <p class="pg-resultado">
    <span class="pg-idioma">${P.esc(d.frase.idioma)}</span>
    <span class="pg-frase ci-frase" lang="${d.frase.lang}">${fraseEmPalavras(d.frase)}</span>
  </p>
</div>`;

  const escrever = d => `
<div class="pg pg--cinetica">
  ${P.chamada(d, { historico: historico(d) })}

  <section id="como-funciona" class="pg-como" aria-labelledby="como-funciona-titulo">
    ${P.cabecaDoComo(d)}
    <ol class="pg-empilhados">
      ${d.como.passos.map((item, indice) => `
      <li class="pg-empilhado ci-passo">
        <div class="pg-passo">
          <span class="pg-numero ci-numero" aria-hidden="true">${P.numero(indice)}</span>
          <h3>${emPalavras(item.titulo)}</h3>
          <p>${P.comAtalho(item.texto, d.atalho)}</p>
          ${indice === 1 ? `<p class="ci-especime" lang="${d.frase.lang}">${P.esc(d.frase.antes)}<mark><span class="ci-grifo" aria-hidden="true"></span>${P.esc(d.frase.palavra)}</mark>${P.esc(d.frase.depois)}</p>` : ''}
          ${indice === 2 ? P.etapasDoEnvio(d) : ''}
        </div>
        ${P.vistaDoPasso(d, indice)}
      </li>`).join('')}
    </ol>
  </section>
</div>`;

  class Cinetica extends P.Variante {
    /**
     * O roteiro da chamada. As teclas são apertadas como a mão aperta um atalho: o modificador desce primeiro e
     * fica embaixo, a última tecla bate, e é quando ela chega ao fundo que a frase é minerada. Depois as duas
     * voltam com mola, e a frase chega ao histórico palavra por palavra.
     */
    roteiro(linha) {
      const mola = P.curva('--veio-curva-mola');
      const corpo = this.querySelector('.pg-tecla-corpo');
      const teclas = [...corpo.querySelectorAll('kbd')];
      const anel = this.querySelector('.pg-anel');
      const letras = [...this.querySelectorAll('.ci-frase .ci-letra')];
      const grifo = this.querySelector('.ci-frase .ci-grifo');
      const chegada = `resultado+=${P.tempo('--pg-mov-minerar')}`;
      const modificadores = teclas.slice(0, -1);
      linha
        // Etapa 2: as teclas entram na ordem em que são apertadas, com mola.
        .fromTo(corpo, { autoAlpha: 0 }, { autoAlpha: 1, duration: P.tempo('--veio-transicao') }, 'tecla')
        .fromTo(teclas, { scale: 0.8, y: 14 }, { scale: 1, y: 0, duration: 0.5, ease: mola, stagger: 0.09 }, 'tecla');
      // O aperto: os modificadores (quando o atalho os tem) descem e ficam; a última tecla bate 20 ms antes do resultado.
      if (modificadores.length) linha.to(modificadores, { y: 5, scaleY: 0.9, duration: 0.14, stagger: 0.06 }, 'resultado-=0.55');
      linha
        .to(teclas[teclas.length - 1], { y: 6, scaleY: 0.88, duration: 0.12 }, 'resultado-=0.14')
        // Etapa 3: a captura de depois e o anel, como nas outras variantes.
        .fromTo(this.querySelector('.pg-depois'), { opacity: 0 }, { opacity: 1, duration: P.tempo('--pg-mov-minerar') }, 'resultado')
        .fromTo(anel, { opacity: 0 }, { opacity: 1, duration: 0.12 }, 'resultado')
        .to(anel, { opacity: 0, duration: P.TEMPOS.anel - 0.12 }, '>')
        // As teclas soltam, com mola, e só então saem: a personagem termina o gesto.
        .to(teclas, { y: 0, scaleY: 1, duration: 0.45, ease: mola, stagger: 0.05 }, 'resultado+=0.06')
        .to(corpo, { autoAlpha: 0, duration: P.tempo('--pg-mov-volta') }, 'resultado+=0.6')
        // A frase chega ao histórico depois da tela: as palavras sobem em onda, os intervalos encolhendo.
        .fromTo(this.querySelector('.pg-vazio'), { autoAlpha: 1 }, { autoAlpha: 0, duration: P.tempo('--pg-mov-volta') }, 'resultado+=0.12')
        .fromTo(this.querySelector('.pg-resultado .pg-idioma'), { opacity: 0 }, { opacity: 1, duration: P.tempo('--pg-mov-volta') }, chegada)
        .fromTo(letras, { yPercent: 110 }, { yPercent: 0, duration: 0.55, stagger: { amount: Math.min(0.3, 0.06 * letras.length), ease: 'power1.out' } }, chegada);
      // O grifo risca a palavra quando ela já pousou, e passa um pouco do fim antes de assentar.
      if (grifo) linha.fromTo(grifo, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: mola }, '>-0.25');
    }

    ligar({ parado, sinal }) {
      if (parado) return;
      const mola = P.curva('--veio-curva-mola');
      const passos = [...this.querySelectorAll('.ci-passo')];
      // Uma linha por passo, parada: toca uma vez, quando o passo chega à tela. Só o título, o número e a
      // personagem do passo se mexem; o texto e a captura estão sempre lá.
      const linhas = this.linhasDosPassos = passos.map((passo, indice) => {
        const linha = gsap.timeline({ id: `pm-passo-${indice + 1}`, paused: true, defaults: { ease: P.curva('--veio-curva-saida') } });
        const letras = [...passo.querySelectorAll('h3 .ci-letra')];
        linha
          .fromTo(passo.querySelector('.ci-numero'), { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: mola }, 0)
          .fromTo(letras, { yPercent: 110 }, { yPercent: 0, duration: 0.55, stagger: { amount: Math.min(0.2, 0.06 * letras.length), ease: 'power1.out' } }, 0.05);
        this.gestoDoPasso(linha, passo, indice, mola);
        // É uma entrada só: no fim, nada do que a linha escreveu fica no elemento.
        const alvos = P.alvosDe(linha);
        linha.eventCallback('onComplete', () => gsap.set(alvos, { clearProps: 'transform,opacity,visibility,willChange' }));
        return { linha, alvos };
      });
      const olho = new IntersectionObserver(entradas => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          const { linha, alvos } = linhas[passos.indexOf(entrada.target)];
          olho.unobserve(entrada.target);
          gsap.set(alvos, { willChange: 'transform, opacity' });
          linha.play();
        }
      // O passo entra quando um quinto dele passou da linha dos 85% da tela: cedo o bastante para o título já
      // estar subindo quando o olho chega nele.
      }, { rootMargin: '0px 0px -15% 0px', threshold: 0.2 });
      passos.forEach(passo => olho.observe(passo));
      sinal.addEventListener('abort', () => olho.disconnect());
    }

    /** O gesto de cada passo: a tecla bate, o grifo risca a palavra, as etapas do envio acendem na ordem. */
    gestoDoPasso(linha, passo, indice, mola) {
      if (indice === 0) {
        const teclas = [...passo.querySelectorAll('.pg-atalho kbd')];
        if (!teclas.length) return;
        linha
          .to(teclas, { y: 3, duration: 0.1, stagger: 0.07 }, 0.55)
          .to(teclas, { y: 0, duration: 0.45, ease: mola, stagger: 0.07 }, '>');
      } else if (indice === 1) {
        linha.fromTo(passo.querySelector('.ci-grifo'), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: mola }, 0.55);
      } else {
        const etapas = [...passo.querySelectorAll('.pg-etapas li')];
        linha.fromTo(etapas, { opacity: 0.6, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.4, ease: mola, stagger: 0.09 }, 0.5);
      }
    }
  }

  P.registrar('pm-gsap-cinetica', Cinetica, escrever);
})();
