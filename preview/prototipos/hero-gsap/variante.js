'use strict';

// O que as quatro variantes movem do mesmo jeito. Cada variante é um elemento próprio (<pm-gsap-…>): o seletor
// troca o HTML do palco inteiro, e é o navegador que avisa a variante quando ela entra e quando sai, para ligar e
// desligar o que ela escuta.
//
// A demonstração é uma linha do tempo do GSAP, com nome (`pm-demo`) e três rótulos: `antes` (a legenda na tela),
// `tecla` (o atalho apertado) e `resultado` (a frase minerada). Ela só começa sozinha com a pessoa parada diante
// dela, dá a cada etapa o tempo de ser lida, termina no resultado e fica nele, com o Repetir à vista.
//
// As regras do movimento, que valem para as quatro:
// - Só `transform` e `opacity` se mexem (o GSAP escreve `visibility` junto com a opacidade zero, e mais nada).
// - `will-change` só enquanto a linha toca (`aquecer`); no fim, `gsap.set(…, { clearProps: 'willChange' })`.
// - Tudo é criado dentro de `gsap.matchMedia()`: com "menos movimento" a linha tem os rótulos e nenhum movimento,
//   as três etapas aparecem paradas, lado a lado, e o Repetir passa por elas em cortes secos, no mesmo tempo.
// - O GSAP roda na thread da página: nada dele toca enquanto a página carrega. Tudo começa com a página parada
//   diante da pessoa, com um toque, ou com a rolagem.
// - O atalho de verdade não anima: a linha vai para o fim na hora (ação de teclado não ganha animação).

(function () {
  const P = window.ProtoHero;
  const { gsap } = window;

  // O relógio do GSAP é um requestAnimationFrame, e ele só confere se pode dormir de tantos em tantos quadros
  // (120, uns 2 s, por padrão). Com 30, a página volta a não pedir quadro nenhum meio segundo depois do fim.
  gsap.config({ autoSleep: 30 });

  // As curvas são as dos tokens (cubic-bezier do CSS), lidas uma vez e entregues ao GSAP como função: o protótipo
  // não traz curva nova, e não precisa do plugin CustomEase para isso.
  const bezier = (x1, y1, x2, y2) => {
    const eixo = (a, b, t) => (((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t + 3 * a) * t;
    const inclinacao = (a, b, t) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
    return progresso => {
      if (progresso <= 0 || progresso >= 1) return progresso <= 0 ? 0 : 1;
      let t = progresso;
      for (let volta = 0; volta < 8; volta++) {
        const queda = inclinacao(x1, x2, t);
        if (Math.abs(queda) < 1e-6) break;
        t -= (eixo(x1, x2, t) - progresso) / queda;
      }
      return eixo(y1, y2, Math.min(1, Math.max(0, t)));
    };
  };
  const curvas = new Map();
  /** A curva de um token (`--veio-curva-saida`, `--veio-curva-mola`, `--site-curva-vaivem`) como easing do GSAP. */
  P.curva = token => {
    if (!curvas.has(token)) {
      const pontos = (getComputedStyle(document.body).getPropertyValue(token).match(/cubic-bezier\(([^)]+)\)/) || [])[1];
      curvas.set(token, pontos ? bezier(...pontos.split(',').map(Number)) : 'power3.out');
    }
    return curvas.get(token);
  };

  /** A duração de um token (`--veio-transicao`, `--site-mov-entrada`…), em segundos, que é a unidade do GSAP. */
  P.tempo = token => {
    const valor = getComputedStyle(document.body).getPropertyValue(token).trim();
    return parseFloat(valor) / (valor.endsWith('ms') ? 1000 : 1);
  };

  /** Um plano da câmera (`translate(-53%, -49%) scale(2.2)`, em conteudo.js) nas propriedades que o GSAP anima. */
  P.plano = texto => {
    const [, x, y, escala] = texto.match(/translate\((-?[\d.]+)%,\s*(-?[\d.]+)%\)\s*scale\(([\d.]+)\)/) || [0, 0, 0, 1];
    return { xPercent: Number(x), yPercent: Number(y), scale: Number(escala) };
  };

  /** Os elementos que uma linha do tempo move: é neles que o `will-change` entra enquanto ela toca, e sai no fim. */
  P.alvosDe = linha =>
    [...new Set(linha.getChildren(true, true, false).flatMap(filho => filho.targets()))].filter(alvo => alvo instanceof Element);

  const MODIFICADORES = { Ctrl: 'ctrlKey', Shift: 'shiftKey', Alt: 'altKey', Meta: 'metaKey' };
  const ETAPAS = ['antes', 'tecla', 'resultado'];

  // Os tempos da demonstração, em segundos, e o motivo de cada um. Quem lê devagar lê umas 4 palavras por segundo.
  const TEMPOS = {
    // Parada diante da pessoa: a demonstração inteira na tela (60% dela ou mais) e nenhuma rolagem há 0,4 s.
    parada: 0.4,
    visivel: 0.6,
    // Quem opera é o visitante: a demonstração só toca sozinha depois de 4 s parada (0,4 + 3,6), e o convite das
    // teclas (2,5 s) tem a vez antes.
    espera: 3.6,
    // Etapa 1, antes: achar a legenda no vídeo (~1 s) e ler a legenda da etapa, de 5 palavras (~1,3 s), com folga.
    antes: 2.6,
    // Etapa 2, tecla: notar as teclas acesas no meio da captura (~0,5 s) e ler "Você aperta Alt+S." (~0,8 s).
    tecla: 1.4,
    // Etapa 3, resultado: não tem fim. O destaque (o anel) dura 0,9 s e a frase minerada fica na tela.
    anel: 0.9,
  };
  P.TEMPOS = TEMPOS;

  const ehATecla = (tecla, evento) => (tecla.length === 1 ? evento.code === `Key${tecla.toUpperCase()}` : evento.key === tecla);

  class Variante extends HTMLElement {
    connectedCallback() {
      this.dados = P.dados();
      this.fim = new AbortController();
      this.esperas = new Set();
      this.demo = this.querySelector('[data-demo]');
      this.estado = this.querySelector('[data-estado]');
      this.passo = this.querySelector('[data-passo]');
      this.tira = this.querySelector('.pg-quadros');
      this.ligarAtalho(this.fim.signal);
      // Uma captura que não carrega dá lugar ao texto que a descreve. O `error` de imagem não sobe: só na captura.
      this.addEventListener('error', evento => {
        if (evento.target.tagName !== 'IMG' || !evento.target.alt) return;
        const texto = document.createElement('p');
        texto.className = 'pg-sem-captura';
        texto.textContent = evento.target.alt;
        evento.target.replaceWith(texto);
      }, { capture: true, signal: this.fim.signal });
      // Tudo o que se mexe nasce aqui dentro. Quando a preferência de movimento muda, o GSAP desfaz o que foi
      // criado (tweens, ScrollTriggers, estilos escritos) e a função roda de novo com a outra resposta.
      this.mm = gsap.matchMedia();
      this.mm.add({ mexe: '(prefers-reduced-motion: no-preference)', parado: '(prefers-reduced-motion: reduce)' }, contexto => {
        const parado = Boolean(contexto.conditions.parado);
        const vida = new AbortController();
        this.parado = parado;
        this.toggleAttribute('data-parado', parado);
        if (this.tira) this.tira.hidden = !parado;
        this.linha = this.montarDemo(parado);
        this.repousar();
        if (this.ligar) this.ligar({ parado, sinal: vida.signal });
        if (!parado) this.armar(this.querySelector('.pg-tela'), vida.signal);
        return () => vida.abort();
      });
    }

    disconnectedCallback() {
      this.fim.abort();
      for (const espera of this.esperas) clearTimeout(espera);
      this.mm.revert();
      gsap.killTweensOf([this, ...this.querySelectorAll('*')]);
    }

    /** Um setTimeout que morre com a variante: trocar de variante no meio não deixa nada para disparar depois. */
    depois(segundos, feito) {
      const espera = setTimeout(() => {
        this.esperas.delete(espera);
        feito();
      }, segundos * 1000);
      this.esperas.add(espera);
      return espera;
    }

    cancelar(espera) {
      clearTimeout(espera);
      this.esperas.delete(espera);
    }

    ligarAtalho(sinal) {
      const { atalho } = this.dados;
      const principal = atalho[atalho.length - 1];
      const modificadores = atalho.slice(0, -1);
      // A tecla na página acende enquanto a do teclado está embaixo: resposta na descida, sem animação.
      const acender = evento => {
        for (const tecla of this.querySelectorAll('[data-tecla]')) {
          const nome = tecla.dataset.tecla;
          const embaixo = nome in MODIFICADORES ? evento[MODIFICADORES[nome]] : evento.type === 'keydown' && ehATecla(nome, evento);
          tecla.toggleAttribute('data-embaixo', Boolean(embaixo));
        }
      };
      const apagar = () => this.querySelectorAll('[data-embaixo]').forEach(tecla => tecla.removeAttribute('data-embaixo'));
      document.addEventListener('keydown', evento => {
        acender(evento);
        const comOsModificadores = Object.entries(MODIFICADORES).every(([nome, campo]) => evento[campo] === modificadores.includes(nome));
        if (!comOsModificadores || !ehATecla(principal, evento)) return;
        evento.preventDefault();
        if (!evento.repeat) this.minerar('tecla');
      }, { signal: sinal });
      document.addEventListener('keyup', acender, { signal: sinal });
      window.addEventListener('blur', apagar, { signal: sinal });
      for (const botao of this.querySelectorAll('[data-minerar]')) {
        botao.addEventListener('click', () => this.minerar('toque'), { signal: sinal });
      }
      for (const botao of this.querySelectorAll('[data-repetir]')) {
        botao.addEventListener('click', () => {
          this.setAttribute('data-usada', '');
          this.tocar();
        }, { signal: sinal });
      }
    }

    /**
     * A linha do tempo da demonstração, parada no começo. Os três rótulos existem sempre; o movimento entre eles é
     * o `roteiro` de cada variante, e com "menos movimento" não há roteiro: a linha só marca o tempo das etapas.
     */
    montarDemo(parado) {
      const linha = gsap.timeline({
        id: 'pm-demo',
        paused: true,
        defaults: { ease: P.curva('--veio-curva-saida') },
        onUpdate: () => this.acompanhar(),
        onComplete: () => this.esfriar(),
      });
      linha.addLabel('antes', 0).addLabel('tecla', TEMPOS.antes).addLabel('resultado', TEMPOS.antes + TEMPOS.tecla);
      if (!parado) this.roteiro(linha);
      // A linha acaba depois de tudo o que o roteiro pôs nela; sem roteiro, logo depois de chegar ao resultado.
      linha.set({}, {}, Math.max(linha.duration(), linha.labels.resultado + 0.05));
      this.alvos = P.alvosDe(linha);
      return linha;
    }

    /** O roteiro que as variantes dividem: as teclas grandes entram e descem, e a frase minerada chega. */
    roteiro(linha) {
      this.cenaDaTecla(linha);
      this.cenaDoResultado(linha);
      this.cenaDoHistorico(linha);
    }

    /** Etapa 2: as teclas grandes aparecem no meio da captura e, no fim da etapa, descem: a causa antes do efeito. */
    cenaDaTecla(linha) {
      const corpo = this.querySelector('.pg-tecla-corpo');
      linha
        .fromTo(corpo, { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: P.tempo('--pg-mov-volta') }, 'tecla')
        // O aperto termina 20 ms antes do resultado: a tecla chega ao fundo e a frase é minerada.
        .to(corpo, { y: 3, scale: 0.95, duration: 0.14 }, 'resultado-=0.16');
    }

    /** Etapa 3: a captura de depois entra por cima, as teclas grandes saem e o anel de ouro acende e apaga. */
    cenaDoResultado(linha) {
      const anel = this.querySelector('.pg-anel');
      linha
        .fromTo(this.querySelector('.pg-depois'), { opacity: 0 }, { opacity: 1, duration: P.tempo('--pg-mov-minerar') }, 'resultado')
        .to(this.querySelector('.pg-tecla-corpo'), { autoAlpha: 0, duration: P.tempo('--veio-transicao') }, 'resultado')
        .fromTo(anel, { opacity: 0 }, { opacity: 1, duration: 0.12 }, 'resultado')
        .to(anel, { opacity: 0, duration: TEMPOS.anel - 0.12 }, '>');
    }

    /** A linha do histórico vem depois da tela, não junto: primeiro a frase é minerada no vídeo, depois ela chega. */
    cenaDoHistorico(linha) {
      const atraso = `resultado+=${P.tempo('--pg-mov-minerar')}`;
      linha
        .fromTo(this.querySelector('.pg-vazio'), { autoAlpha: 1 }, { autoAlpha: 0, duration: P.tempo('--pg-mov-volta') }, atraso)
        .fromTo(this.querySelector('.pg-resultado'), { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: P.tempo('--pg-mov-volta') }, atraso);
    }

    /** A linha está tocando? (Solta e antes do fim: vale desde o instante em que mandam tocar.) */
    tocando() {
      return !this.linha.paused() && this.linha.progress() < 1;
    }

    /** `will-change` só enquanto a linha toca: o navegador separa as camadas antes do primeiro quadro. */
    aquecer() {
      if (this.alvos.length) gsap.set(this.alvos, { willChange: 'transform, opacity' });
    }

    /** No fim, as camadas são devolvidas: fica o estilo da última etapa, que é da linha, e nenhum `will-change`. */
    esfriar() {
      if (this.alvos.length) gsap.set(this.alvos, { clearProps: 'willChange' });
    }

    /** A etapa em que a linha está, pelos rótulos: é a linha que diz o que a legenda mostra, em qualquer sentido. */
    acompanhar() {
      const { labels } = this.linha;
      const agora = this.linha.time();
      const etapa = agora >= labels.resultado ? 'resultado' : agora >= labels.tecla ? 'tecla' : 'antes';
      if (etapa !== this.etapa || this.convidando) this.irPara(etapa);
    }

    /**
     * Põe a demonstração numa etapa: o que o CSS lê (`data-etapa`, `data-minerada`) e o que a legenda diz. Em
     * repouso, antes de tudo, a legenda da primeira etapa é o convite para apertar.
     */
    irPara(etapa, { convite = false } = {}) {
      this.etapa = etapa;
      this.convidando = convite;
      if (!this.demo) return;
      this.demo.dataset.etapa = etapa;
      this.demo.toggleAttribute('data-minerada', etapa === 'resultado');
      if (this.passo) this.passo.textContent = `${ETAPAS.indexOf(etapa) + 1}/${ETAPAS.length}`;
      if (this.estado) this.estado.textContent = convite ? this.dados.demo.convite : P.legendaDaEtapa(this.dados, etapa);
      if (this.aoMudarDeEtapa) this.aoMudarDeEtapa(etapa);
    }

    /** De volta ao começo, parada: é como a demonstração espera, e como fica quando sai da tela no meio. */
    repousar() {
      this.linha.pause(0);
      this.esfriar();
      this.irPara('antes', { convite: true });
    }

    /**
     * Para o roteiro que tira medidas da página (de onde a frase sai, na variante Flip): a linha esquece os valores,
     * vai ao fim e volta ao começo, calada. Cada trecho lê os valores novos e deixa escrito o estado de partida
     * dele, que é o que a etapa de antes mostra.
     */
    medirDeNovo() {
      this.linha.invalidate().progress(1, true).progress(0, true);
    }

    /** A demonstração inteira, do primeiro quadro: é a mesma linha voltando ao começo, e por isso nada se empilha. */
    tocar() {
      this.setAttribute('data-tocou', '');
      this.aquecer();
      this.linha.restart();
      this.irPara('antes');
    }

    /**
     * O atalho de verdade, ou o toque nas teclas: a frase é minerada agora. Pelo teclado a linha vai para o fim na
     * hora, sem animação; no toque, toca só o trecho do resultado.
     */
    minerar(origem) {
      this.setAttribute('data-usada', '');
      if (origem === 'tecla' || this.parado) {
        this.linha.pause().progress(1);
        this.esfriar();
        this.irPara('resultado');
        return;
      }
      this.aquecer();
      this.linha.play('resultado');
      // A legenda e o estado mudam já, no quadro do toque, sem esperar o próximo quadro da linha.
      this.acompanhar();
    }

    /**
     * Arma a demonstração para tocar sozinha uma vez: só com ela parada diante da pessoa (inteira na tela, sem
     * rolagem, com a aba à vista) há 4 s. Se ela sair da tela no meio, volta ao começo e espera de novo. Quem já
     * usou a demonstração não é atropelado.
     */
    armar(alvo, sinal) {
      if (!alvo) return;
      let naTela = false;
      let tocou = false;
      let quieta = null;
      const tentar = () => {
        this.cancelar(quieta);
        if (!naTela || tocou || document.visibilityState !== 'visible' || this.hasAttribute('data-usada')) return;
        quieta = this.depois(TEMPOS.parada + TEMPOS.espera, () => {
          if (sinal.aborted || this.hasAttribute('data-usada')) return;
          tocou = true;
          this.tocar();
        });
      };
      const olho = new IntersectionObserver(([entrada]) => {
        naTela = entrada.intersectionRatio >= TEMPOS.visivel;
        if (naTela) return tentar();
        this.cancelar(quieta);
        // Saiu da tela no meio da demonstração: ninguém viu o fim. Volta ao começo e fica armada.
        if (this.tocando() && !this.hasAttribute('data-usada')) {
          this.repousar();
          tocou = false;
        }
      }, { threshold: [0, TEMPOS.visivel, 1] });
      olho.observe(alvo);
      window.addEventListener('scroll', tentar, { passive: true, signal: sinal });
      document.addEventListener('visibilitychange', tentar, { signal: sinal });
      sinal.addEventListener('abort', () => {
        olho.disconnect();
        this.cancelar(quieta);
      });
    }

    /**
     * Liga as abas dos três passos. `aoAbrir(indice, { deTeclado })` é da variante: é ela quem decide como o passo
     * aparece. A janela de ouro desliza até a aba aberta; pelo teclado, e com "menos movimento", vai na hora.
     */
    ligarAbas({ parado, sinal }, aoAbrir) {
      const abas = [...this.querySelectorAll('[role="tab"]')];
      const janela = this.querySelector('.pg-abas-janela');
      const acesa = this.querySelector('.pg-lista--acesa');
      let aberta = 0;
      const acender = naHora => {
        const aba = abas[aberta];
        const x = aba.offsetLeft - abas[0].offsetLeft;
        const movimento = { duration: naHora || parado ? 0 : P.tempo('--pg-mov-aba'), ease: P.curva('--site-curva-vaivem'), overwrite: true };
        gsap.to(janela, { x, ...movimento });
        gsap.to(acesa, { x: -x, ...movimento });
      };
      const abrir = (indice, deTeclado) => {
        if (indice === aberta) return;
        aberta = indice;
        abas.forEach((aba, i) => {
          aba.setAttribute('aria-selected', String(i === indice));
          aba.tabIndex = i === indice ? 0 : -1;
        });
        acender(deTeclado);
        aoAbrir(indice, { deTeclado });
      };
      abas.forEach((aba, indice) => {
        aba.addEventListener('click', () => abrir(indice, false), { signal: sinal });
        aba.addEventListener('keydown', evento => {
          const destino = { ArrowRight: indice + 1, ArrowLeft: indice - 1, Home: 0, End: abas.length - 1 }[evento.key];
          if (destino === undefined) return;
          // As setas aqui andam entre as abas; sem isto, andariam também entre as variantes do seletor.
          evento.stopPropagation();
          evento.preventDefault();
          const proxima = (destino + abas.length) % abas.length;
          abrir(proxima, true);
          abas[proxima].focus();
        }, { signal: sinal });
      });
      window.addEventListener('resize', () => acender(true), { signal: sinal });
      // As fontes chegam depois e mudam a largura das abas: a janela se mede de novo.
      if (document.fonts) document.fonts.ready.then(() => { if (!sinal.aborted) acender(true); });
      acender(true);
    }
  }

  P.Variante = Variante;
  P.variantes = [];
  /** Registra uma variante: o elemento que a liga e a função que a escreve a partir dos dados. */
  P.registrar = (etiqueta, Classe, escrever) => {
    customElements.define(etiqueta, Classe);
    P.variantes.push(() => `<${etiqueta}>${escrever(P.dados())}</${etiqueta}>`);
  };
})();
