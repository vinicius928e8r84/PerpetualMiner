'use strict';

// O que as três variantes com GSAP dividem: a demonstração do Alt+S (os tempos, a espera pela página parada, o
// Repetir e a limpeza) e duas ajudas pequenas. Cada variante monta as linhas do tempo dela no próprio arquivo
// (palco.js, travessia.js, compasso.js). Nada aqui fala com a rede nem guarda coisa alguma.
//
// As regras do movimento, que valem para os três arquivos:
//   - só `transform` e `opacity` se animam (x, y, scale e companhia são transform);
//   - `will-change` entra quando a linha do tempo começa e sai quando ela acaba, e no fim o GSAP apaga o que escreveu
//     (`clearProps`): parado, o elemento depende só do CSS;
//   - com "menos movimento" nada se anima: o que era passagem vira corte seco.

(function () {
  const { gsap } = window;
  if (!gsap) return;
  // O GSAP chegou: a página fica com as classes do movimento que cabeca.js pôs.
  clearTimeout(window.PGsemGsap);

  const MOVIMENTO = '(prefers-reduced-motion: no-preference)';
  // O gsap.matchMedia só chama quem tem ao menos uma consulta valendo. Com "menos movimento" numa janela qualquer
  // nenhuma das outras vale, e a página parada ainda precisa do Repetir: esta vale sempre.
  const SEMPRE = 'all';
  const CAMADA = { willChange: 'transform, opacity' };
  const LIMPO = { clearProps: 'all' };

  // A demonstração, em segundos. A legenda fica o tempo de achar a cena e ler a linha; as teclas, o de ler as duas.
  // O Repetir encurta os dois: quem pediu já sabe para onde olhar.
  const PRIMEIRA_VEZ = { legenda: 1.8, teclas: 1.2 };
  const DE_NOVO = { legenda: .7, teclas: 1 };
  const FECHO = .9;

  /** Chama `feito` quando `alvo` está à vista (na fração pedida), a página parou de rolar há `parada` ms e `pode()` deixa. */
  function quandoParar(alvo, feito, { aVista = .6, parada = 500, pode = () => true } = {}) {
    let espera = 0;
    let visivel = false;
    // `pode()` só é perguntado quando a espera vence: no instante da rolagem, quem responde ainda não a viu.
    const armar = () => {
      clearTimeout(espera);
      if (!visivel) return;
      const onde = window.scrollY;
      espera = setTimeout(() => {
        // Com a thread principal presa, o aviso de rolagem atrasa e a espera vence com a página ainda andando:
        // a posição diz a verdade.
        if (window.scrollY !== onde) armar();
        else if (visivel && pode()) feito();
      }, parada);
    };
    const olho = new IntersectionObserver(([entrada]) => {
      visivel = entrada.intersectionRatio >= aVista;
      armar();
    }, { threshold: [0, aVista] });
    olho.observe(alvo);
    // A rolagem de qualquer caixa da página conta, por isso a captura.
    document.addEventListener('scroll', armar, { capture: true, passive: true });
    return {
      armar,
      desligar() {
        clearTimeout(espera);
        olho.disconnect();
        document.removeEventListener('scroll', armar, true);
      },
    };
  }

  /** O filme padrão do Alt+S (Palco e Travessia): as teclas chegam e afundam; a tela minerada entra com o anel. */
  function entradaPadrao(tl, { cortina, teclas, caps, anel }, t2, t3) {
    // Passo 2. As teclas chegam de 92% (nada nasce do zero) e, 450 ms depois, afundam 4 px: é o aperto.
    tl.fromTo(teclas, { opacity: 0, scale: .92 }, { opacity: 1, scale: 1, duration: .24, ease: 'power3.out' }, t2)
      .to(caps, { y: 4, duration: .09, ease: 'power2.out' }, t2 + .45)
      // Passo 3. Soltam; a tela minerada entra e o anel acende e apaga. As teclas saem mais depressa do que entraram.
      .to(caps, { y: 0, duration: .12, ease: 'power2.out' }, t3)
      .fromTo(cortina, { opacity: 0 }, { opacity: 1, duration: .32, ease: 'power3.out' }, t3)
      .fromTo(anel, { opacity: 0 }, { opacity: 1, duration: .18, ease: 'power2.out' }, t3)
      .to(anel, { opacity: 0, duration: .72, ease: 'power2.inOut' }, t3 + .18)
      .fromTo(teclas, { opacity: 1, scale: 1 }, { opacity: 0, scale: .97, duration: .16, ease: 'power1.out', immediateRender: false }, t3 + .12);
  }

  /**
   * A demonstração do Alt+S. `dono` leva o `data-passo` e contém as capturas, as teclas, o anel, os passos e o Repetir.
   * `filme: false` (menos movimento) anda pelos mesmos passos em cortes secos, e só pelo Repetir. `entrada` troca o
   * filme padrão pelo da variante. `pode()` diz se ela pode começar sozinha (a página já parou diante dela).
   */
  function demoAltS(dono, { filme, entrada = entradaPadrao, pode = () => true, aVista = .6, parada = 500 } = {}) {
    const tela = dono.querySelector('.pg-demo-tela');
    const repetir = dono.querySelector('[data-repetir]');
    // Lidas a cada vez que a cena toca: as teclas do atalho são conteúdo, e conteúdo pode ter mudado.
    const lerPartes = () => ({
      tela,
      cortina: dono.querySelector('.pg-demo-cortina'),
      teclas: dono.querySelector('.pg-demo-teclas'),
      caps: [...dono.querySelectorAll('.pg-demo-teclas kbd')],
      anel: dono.querySelector('.pg-demo-anel'),
    });
    let animados = [];
    let tl = null;
    let tocou = false;
    let carregada = false;

    /** Para o filme onde estiver e deixa a demonstração num passo, sem nada escrito pelo GSAP. */
    function mostrar(passo) {
      tl?.kill();
      tl = null;
      if (animados.length) gsap.set(animados, LIMPO);
      dono.dataset.passo = passo;
    }

    function tocar(deNovo) {
      const tempos = deNovo ? DE_NOVO : PRIMEIRA_VEZ;
      const t2 = tempos.legenda;
      const t3 = t2 + tempos.teclas;
      mostrar(1);
      tocou = true;
      const partes = lerPartes();
      animados = [partes.cortina, partes.teclas, partes.anel, ...partes.caps, ...tela.querySelectorAll('[data-demo-animado]')];
      const esta = gsap.timeline({ id: 'altS', paused: true, onComplete: () => mostrar(3) })
        .set(dono, { attr: { 'data-passo': 2 } }, t2)
        .set(dono, { attr: { 'data-passo': 3 } }, t3);
      tl = esta;
      // Começa no próximo tique do GSAP, e não agora: o relógio dele só anda nos tiques, e uma linha do tempo criada
      // entre dois começaria atrasada de um quadro inteiro, encurtando o tempo de ler a legenda num aparelho lento.
      gsap.ticker.add(() => { if (tl === esta) esta.play(); }, true);
      if (filme) {
        tl.set(animados, CAMADA, 0);
        entrada(tl, partes, t2, t3);
      }
      // O fim da linha do tempo é o fim do passo 3, mesmo nos cortes: é quando a limpeza acontece.
      tl.to({}, { duration: .01 }, Math.max(tl.duration(), t3 + FECHO) - .01);
    }

    repetir.hidden = false;
    const aoRepetir = () => tocar(true);
    repetir.addEventListener('click', aoRepetir);

    // Sozinha ela só toca como filme, uma vez, e só com as capturas prontas, a pessoa parada diante dela e o Repetir
    // à vista (quem a vê tem de ter como ver de novo).
    const repetirAVista = () => {
      const { top, bottom } = repetir.getBoundingClientRect();
      return bottom > 0 && top < window.innerHeight;
    };
    const espera = filme ? quandoParar(tela, () => tocar(false), { aVista, parada, pode: () => carregada && !tocou && repetirAVista() && pode() }) : null;
    if (filme) {
      mostrar(0);
      Promise.all([...tela.querySelectorAll('img')].map(imagem => imagem.decode().catch(() => {}))).then(() => {
        carregada = true;
        espera.armar();
      });
    }

    return {
      /** Algo de que `pode()` depende mudou sem a página rolar: conta a espera de novo. */
      armar: () => espera?.armar(),
      /** A pessoa passou direto: fica a frase minerada, sem cena. */
      passar() {
        mostrar(3);
        tocou = true;
      },
      /** Volta ao começo para tocar de novo quando a pessoa parar diante dela. */
      rearmar() {
        mostrar(0);
        tocou = false;
        espera?.armar();
      },
      desligar() {
        espera?.desligar();
        repetir.removeEventListener('click', aoRepetir);
        repetir.hidden = true;
        mostrar(0);
      },
    };
  }

  window.PG = { MOVIMENTO, SEMPRE, CAMADA, LIMPO, quandoParar, demoAltS };
})();
