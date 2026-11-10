'use strict';

// O que as quatro variantes dividem: escrever os dados como HTML sem deixar passar marcação, e a demonstração do
// atalho. Cada variante é um elemento próprio (<pm-hero-…>): o seletor troca o HTML do palco inteiro, e é o
// navegador que avisa a variante quando ela entra e quando sai, para ligar e desligar o que ela escuta.
//
// A demonstração tem três etapas, uma de cada vez: antes (a legenda na tela), tecla (o atalho apertado) e resultado
// (a frase minerada). Ela só começa sozinha com a pessoa parada diante dela, dá a cada etapa o tempo de ser lida,
// termina no resultado e fica nele, com o Repetir à vista. Com "menos movimento" não há sequência: as três etapas
// aparecem lado a lado, paradas (P.quadros).

(function () {
  const P = (window.ProtoHero = window.ProtoHero || {});

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  P.esc = texto => String(texto).replace(/[&<>"']/g, c => ESCAPES[c]);

  /** Com "menos movimento", cada variante se escreve parada: os três quadros no lugar da sequência. */
  P.parado = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** As teclas do atalho, cada uma na sua <kbd>. `data-tecla` é o que a demonstração acende quando a tecla desce. */
  P.teclas = atalho => atalho.map(tecla => `<kbd data-tecla="${P.esc(tecla)}">${P.esc(tecla)}</kbd>`).join('');

  /** O texto de um passo, com `{atalho}` trocado pelas teclas como a landing as escreve (Alt+S). */
  P.comAtalho = (texto, atalho) =>
    P.esc(texto).replace('{atalho}', `<span class="ph-atalho">${atalho.map(tecla => `<kbd>${P.esc(tecla)}</kbd>`).join('+<wbr>')}</span>`);

  /** A frase minerada, com a palavra grifada. */
  P.frase = frase => `${P.esc(frase.antes)}<mark>${P.esc(frase.palavra)}</mark>${P.esc(frase.depois)}`;

  /** Uma captura de preview/site/capturas, com as medidas que guardam o lugar dela antes de carregar. */
  P.captura = (captura, { classe = '', preguicosa = false, alt = captura.alt } = {}) =>
    `<img${classe ? ` class="${classe}"` : ''} src="${P.esc(captura.src)}" width="${captura.largura}" height="${captura.altura}"${preguicosa ? ' loading="lazy"' : ''} alt="${P.esc(alt)}">`;

  /** O botão com as teclas: no teclado é o atalho de verdade; no toque, é onde se toca. */
  P.botaoDasTeclas = dados =>
    `<button class="ph-teclas" type="button" data-minerar aria-label="Minerar a legenda (${P.esc(dados.atalho.join('+'))})">${P.teclas(dados.atalho)}</button>`;

  /** O que a legenda da demonstração diz em cada etapa. */
  P.legendaDaEtapa = (dados, etapa) => dados.demo[etapa].replace('{atalho}', dados.atalho.join('+'));

  /**
   * O comando da demonstração: as teclas, a legenda da etapa de agora ("2/3 Você aperta Alt+S.") e o Repetir.
   * `antes` troca a legenda da primeira etapa (a variante Produto põe ali o convite para apertar).
   */
  P.comando = (dados, { classe = '', antes = P.legendaDaEtapa(dados, 'antes') } = {}) => `
<div class="ph-comando${classe ? ` ${classe}` : ''}">
  ${P.botaoDasTeclas(dados)}
  <p class="ph-legenda" role="status"><b data-passo>1/3</b> <span data-estado data-antes="${P.esc(antes)}">${P.esc(antes)}</span></p>
  <button class="ph-repetir" type="button" data-repetir>${P.esc(dados.demo.repetir)}</button>
</div>`;

  /** As teclas grandes por cima da captura, na etapa da tecla: o destaque fica onde a pessoa já está olhando. */
  P.teclaNaTela = dados => `<div class="ph-tecla-na-tela" aria-hidden="true">${dados.atalho.map(tecla => `<kbd>${P.esc(tecla)}</kbd>`).join('')}</div>`;

  /**
   * As três etapas paradas, lado a lado: a captura de antes, as teclas, a captura de depois, cada uma com a sua
   * legenda. É a demonstração da variante Silenciosa e a de todas as outras com "menos movimento". Em `tira`, as
   * capturas são miniaturas de apoio de uma tela que já está na página, e por isso não repetem o texto alternativo.
   */
  P.quadros = (dados, { tira = false } = {}) => {
    const alt = captura => (tira ? '' : captura.alt);
    return `
<ol class="ph-quadros${tira ? ' ph-quadros--tira' : ''}" aria-label="A demonstração do atalho, em três quadros">
  <li class="ph-quadro">
    ${P.captura(dados.capturas.antes, { alt: alt(dados.capturas.antes) })}
    <p><b>1</b> ${P.esc(P.legendaDaEtapa(dados, 'antes'))}</p>
  </li>
  <li class="ph-quadro ph-quadro--tecla">
    ${P.botaoDasTeclas(dados)}
    <p><b>2</b> ${P.esc(P.legendaDaEtapa(dados, 'tecla'))}</p>
  </li>
  <li class="ph-quadro ph-quadro--resultado">
    ${P.captura(dados.capturas.depois, { alt: alt(dados.capturas.depois) })}
    <p><b>3</b> ${P.esc(P.legendaDaEtapa(dados, 'resultado'))}</p>
  </li>
</ol>`;
  };

  const MODIFICADORES = { Ctrl: 'ctrlKey', Shift: 'shiftKey', Alt: 'altKey', Meta: 'metaKey' };
  const ETAPAS = ['antes', 'tecla', 'resultado'];

  // Os tempos da sequência, em ms, e o motivo de cada um. Quem lê devagar lê umas 4 palavras por segundo.
  const TEMPOS = {
    // A entrada da chamada acaba (a mais longa dura 700 ms) antes de a demonstração poder começar.
    entrada: 900,
    // Parada diante da pessoa: a demonstração inteira na tela (60% dela ou mais) e nenhuma rolagem há 400 ms.
    parada: 400,
    visivel: 0.6,
    // Etapa 1, antes: achar a legenda no vídeo (~1 s) e ler a legenda da etapa, de 5 palavras (~1,3 s), com folga.
    antes: 2600,
    // Etapa 2, tecla: notar as teclas acesas no meio da captura (~0,5 s) e ler "Você aperta Alt+S." (~0,8 s).
    tecla: 1400,
    // Etapa 3, resultado: não tem fim. O destaque (o anel) dura 900 ms e a frase minerada fica na tela.
  };
  P.TEMPOS = TEMPOS;

  const ehATecla = (tecla, evento) => (tecla.length === 1 ? evento.code === `Key${tecla.toUpperCase()}` : evento.key === tecla);

  class Variante extends HTMLElement {
    connectedCallback() {
      this.dados = P.dados();
      this.fim = new AbortController();
      this.esperas = new Set();
      this.sequencia = [];
      this.menosMovimento = P.parado();
      this.demo = this.querySelector('[data-demo]');
      this.estado = this.querySelector('[data-estado]');
      this.passo = this.querySelector('[data-passo]');
      this.anel = this.querySelector('.ph-anel');
      this.ligarAtalho(this.fim.signal);
      // Uma captura que não carrega dá lugar ao texto que a descreve. O `error` de imagem não sobe: só na captura.
      this.addEventListener('error', evento => {
        if (evento.target.tagName !== 'IMG' || !evento.target.alt) return;
        const texto = document.createElement('p');
        texto.className = 'ph-sem-captura';
        texto.textContent = evento.target.alt;
        evento.target.replaceWith(texto);
      }, { capture: true, signal: this.fim.signal });
      if (this.ligar) this.ligar(this.fim.signal);
    }

    disconnectedCallback() {
      this.fim.abort();
      for (const espera of this.esperas) clearTimeout(espera);
    }

    /** Um setTimeout que morre com a variante: trocar de variante no meio não deixa nada para disparar depois. */
    depois(ms, feito) {
      const espera = setTimeout(() => {
        this.esperas.delete(espera);
        feito();
      }, ms);
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
     * Põe a demonstração numa etapa. `origem` diz quem pediu, e o CSS de cada variante decide o movimento por ela:
     * 'tecla' (o atalho de verdade: troca na hora, sem animação), 'toque', 'auto' (a sequência) ou 'volta' (o recomeço).
     */
    irPara(etapa, origem) {
      if (!this.demo) return;
      this.demo.dataset.origem = origem;
      this.demo.dataset.etapa = etapa;
      this.demo.toggleAttribute('data-minerada', etapa === 'resultado');
      if (this.passo) this.passo.textContent = `${ETAPAS.indexOf(etapa) + 1}/${ETAPAS.length}`;
      if (this.estado) this.estado.textContent = etapa === 'antes' ? (this.estado.dataset.antes || P.legendaDaEtapa(this.dados, 'antes')) : P.legendaDaEtapa(this.dados, etapa);
      if (etapa === 'resultado') this.destacar(origem);
    }

    /** O anel de ouro acende com a frase minerada e apaga. Pelo teclado não há anel: a resposta é a troca, na hora. */
    destacar(origem) {
      if (this.clarao) this.clarao.cancel();
      if (!this.anel || origem === 'tecla' || this.menosMovimento) return;
      const tempos = getComputedStyle(this);
      this.clarao = this.anel.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: parseFloat(tempos.getPropertyValue('--ph-mov-anel')) || 900,
        easing: tempos.getPropertyValue('--veio-curva-saida').trim() || 'ease-out',
      });
    }

    parar() {
      this.sequencia.forEach(espera => this.cancelar(espera));
      this.sequencia = [];
    }

    /** A sequência inteira, do começo: antes, tecla, resultado. Pedir de novo no meio recomeça; nada se empilha. */
    tocar() {
      this.parar();
      this.irPara('antes', 'volta');
      this.sequencia = [
        this.depois(TEMPOS.antes, () => this.irPara('tecla', 'auto')),
        this.depois(TEMPOS.antes + TEMPOS.tecla, () => {
          this.sequencia = [];
          this.irPara('resultado', 'auto');
        }),
      ];
    }

    /** O atalho de verdade, ou o toque nas teclas: a frase é minerada agora, e a sequência que estiver rodando cede. */
    minerar(origem) {
      this.setAttribute('data-usada', '');
      this.parar();
      this.irPara('resultado', origem);
    }

    /**
     * Arma a sequência para tocar sozinha uma vez: só com a demonstração parada diante da pessoa (inteira na tela,
     * sem rolagem, com a aba à vista), e `espera` ms depois disso. Se ela sair da tela no meio, volta ao começo e
     * espera de novo. Quem já usou a demonstração não é atropelado.
     */
    armar(alvo, { espera = 0 } = {}) {
      if (this.menosMovimento || !alvo) return;
      const sinal = this.fim.signal;
      let naTela = false;
      let tocou = false;
      let quieta = null;
      const tentar = () => {
        this.cancelar(quieta);
        if (!naTela || tocou || document.visibilityState !== 'visible' || this.hasAttribute('data-usada')) return;
        quieta = this.depois(TEMPOS.parada + espera, () => {
          if (this.hasAttribute('data-usada')) return;
          tocou = true;
          this.tocar();
        });
      };
      const olho = new IntersectionObserver(([entrada]) => {
        naTela = entrada.intersectionRatio >= TEMPOS.visivel;
        if (naTela) return tentar();
        this.cancelar(quieta);
        // Saiu da tela no meio da sequência: ninguém viu o fim. Volta ao começo e fica armada.
        if (this.sequencia.length) {
          this.parar();
          this.irPara('antes', 'volta');
          tocou = false;
        }
      }, { threshold: [0, TEMPOS.visivel, 1] });
      this.depois(TEMPOS.entrada, () => olho.observe(alvo));
      window.addEventListener('scroll', tentar, { passive: true, signal: sinal });
      document.addEventListener('visibilitychange', tentar, { signal: sinal });
      sinal.addEventListener('abort', () => olho.disconnect());
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
