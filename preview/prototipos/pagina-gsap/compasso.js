'use strict';

// O protótipo "Compasso": quem se move é a letra, e quem rege é o relógio. Três timelines do GSAP: `abertura` (o
// título em versos e a frase palavra por palavra, uma vez, quando a fonte chega), `ato` (cada ato, uma vez, quando
// entra na janela: o número, o título em versos e a cortina da figura) e `altS` (a cena do Alt+S, comum.js, com a
// entrada desta variante). O SplitText divide o texto em linhas e palavras, cada uma atrás de uma máscara, e é
// desfeito quando a entrada acaba: parada, a página não guarda nada dele. Nada aqui fala com a rede nem guarda coisa
// alguma.

(function () {
  const { gsap, SplitText, PG } = window;
  if (!gsap || !SplitText || !PG) return;
  gsap.registerPlugin(SplitText);

  // O ritmo da fala, em segundos: cada palavra espera a anterior, e uma palavra comprida segura a seguinte por mais tempo.
  const PAUSA = .04;
  const POR_LETRA = .012;
  // As etapas do envio batem uma por tempo.
  const BATIDA = .35;
  const VERSO = { yPercent: 0, duration: .7, ease: 'expo.out' };

  const raiz = document.documentElement;
  const abertura = document.querySelector('.cp-abertura');

  const dividir = (alvo, tipo, aria = 'auto') => SplitText.create(alvo, {
    type: tipo, mask: tipo, aria, linesClass: 'cp-verso', wordsClass: 'cp-palavra', ignore: '[aria-hidden]',
  });

  /** Quando cada palavra entra, contando do começo da frase. */
  function ritmo(palavras) {
    let quando = 0;
    return palavras.map(palavra => {
      const vez = quando;
      quando += PAUSA + POR_LETRA * palavra.textContent.length;
      return vez;
    });
  }

  /** Põe na timeline a frase entrando palavra por palavra, a partir de `inicio`. Devolve quando a última assenta. */
  function falar(tl, palavras, inicio) {
    const vezes = ritmo(palavras);
    gsap.set(palavras, { yPercent: 110 });
    palavras.forEach((palavra, i) => {
      tl.to(palavra, { yPercent: 0, duration: .45, ease: 'power3.out' }, inicio + vezes[i]);
      // O grifo da palavra marcada chega com ela, e não antes.
      const grifo = palavra.closest('mark');
      if (grifo) tl.fromTo(grifo, { opacity: 0 }, { opacity: 1, duration: .2, ease: 'power1.out' }, inicio + vezes[i]);
    });
    return inicio + vezes[vezes.length - 1] + .45;
  }

  /** A abertura: o título puxa, em versos; a frase vem falada; a linha de ouro se desenha quando ela assenta. */
  function abrir() {
    const titulo = dividir(abertura.querySelector('h1'), 'lines');
    const frase = dividir(abertura.querySelector('.cp-frase'), 'words');
    const linha = abertura.querySelector('.pg-frase-linha');
    const lead = abertura.querySelector('.pg-lead');
    const movidos = [...titulo.lines, ...frase.words, linha, lead];
    const tl = gsap.timeline({
      id: 'abertura',
      onComplete() {
        frase.revert();
        gsap.set([linha, lead], PG.LIMPO);
      },
    });
    gsap.set(titulo.lines, { yPercent: 110 });
    gsap.set(linha, { scaleX: 0 });
    gsap.set(lead, { opacity: 0, y: 8 });
    tl.set(movidos, PG.CAMADA, 0)
      .to(titulo.lines, { yPercent: 0, duration: .8, ease: 'expo.out', stagger: .09 }, 0)
      // O título volta a ser um texto só assim que os versos assentam, sem esperar a frase: é quando o navegador o
      // conta como pintado (o LCP), e ele já está inteiro na tela.
      .add(() => titulo.revert(), .9)
      .to(lead, { opacity: 1, y: 0, duration: .5, ease: 'power2.out' }, .35);
    const assentou = falar(tl, frase.words, .45);
    tl.to(linha, { scaleX: 1, duration: .6, ease: 'power3.out' }, assentou - .15);
    raiz.classList.add('cp-pronta');
  }

  /** Um ato entra: o número e o título sobem em versos e a cortina da figura abre. Uma vez. */
  function revelar(ato) {
    const titulo = dividir(ato.querySelector('h2'), 'lines');
    const numero = ato.querySelector('.cp-numero span');
    const cortina = ato.querySelector('.cp-cortina');
    const legenda = ato.querySelector('.cp-legenda');
    const etapas = [...ato.querySelectorAll('.cp-etapas li')];
    const fio = ato.querySelector('.cp-etapas .pg-etapas-fio');
    const falada = legenda && dividir(legenda, 'words', 'none');
    const fixos = [numero, cortina, cortina?.firstElementChild, fio, ...etapas].filter(Boolean);
    const tl = gsap.timeline({
      id: 'ato',
      onComplete() {
        titulo.revert();
        falada?.revert();
        if (fixos.length) gsap.set(fixos, PG.LIMPO);
      },
    });
    gsap.set([...titulo.lines, numero].filter(Boolean), { yPercent: 110 });
    tl.set([...titulo.lines, ...fixos, ...(falada?.words || [])], PG.CAMADA, 0);
    if (numero) tl.to(numero, VERSO, 0);
    tl.to(titulo.lines, { ...VERSO, stagger: .08 }, .04);
    if (cortina) {
      // A cortina sobe e o conteúdo dela desce na mesma medida: ele fica parado, e a borda de cima é que anda.
      gsap.set(cortina, { yPercent: 101 });
      gsap.set(cortina.firstElementChild, { yPercent: -101, scale: 1.1 });
      tl.to([cortina, cortina.firstElementChild], { yPercent: 0, scale: 1, duration: .9, ease: 'expo.out' }, .1);
    }
    // A legenda do ato 1 é dita depois que a cortina abre.
    if (falada) falar(tl, falada.words, .55);
    if (fio) {
      // As etapas do ato 4: o fio desce em tempo constante e cada etapa bate quando ele chega.
      gsap.set(fio, { scaleY: 0 });
      gsap.set(etapas, { opacity: .55, x: -8 });
      tl.to(fio, { scaleY: 1, duration: BATIDA * (etapas.length - 1), ease: 'none' }, .3);
      etapas.forEach((etapa, i) => tl.to(etapa, { opacity: 1, x: 0, duration: .25, ease: 'power2.out' }, .3 + i * BATIDA));
    }
    // Só agora o ato deixa de esperar transparente: o que entra já está escondido pelas máscaras.
    ato.setAttribute('data-visto', '');
  }

  /** O filme do Alt+S desta variante: as teclas sobem de trás da placa, e a tela minerada varre a de antes, da esquerda. */
  function entradaCinetica(tl, { cortina, teclas, caps, anel }, t2, t3) {
    const depois = cortina.firstElementChild;
    tl.fromTo(teclas, { opacity: 0 }, { opacity: 1, duration: .15, ease: 'power1.out' }, t2)
      .fromTo(caps, { yPercent: 130 }, { yPercent: 0, duration: .5, ease: 'expo.out', stagger: .08 }, t2)
      // O aperto: as duas afundam juntas.
      .to(caps, { y: 4, duration: .09, ease: 'power2.out' }, t2 + .6)
      .to(caps, { y: 0, duration: .12, ease: 'power2.out' }, t3)
      // A tela minerada entra como a linha de ouro se desenha: da esquerda para a direita.
      .fromTo(cortina, { opacity: 1, xPercent: -101 }, { xPercent: 0, duration: .7, ease: 'expo.out' }, t3)
      .fromTo(depois, { xPercent: 101 }, { xPercent: 0, duration: .7, ease: 'expo.out' }, t3)
      .fromTo(anel, { opacity: 0 }, { opacity: 1, duration: .18, ease: 'power2.out' }, t3)
      .to(anel, { opacity: 0, duration: .72, ease: 'power2.inOut' }, t3 + .18)
      // As teclas saem por cima, mais depressa do que entraram.
      .to(caps, { yPercent: -130, duration: .22, ease: 'power2.inOut' }, t3 + .1)
      .fromTo(teclas, { opacity: 1 }, { opacity: 0, duration: .15, ease: 'power1.out', immediateRender: false }, t3 + .28);
  }

  gsap.matchMedia().add({ sempre: PG.SEMPRE, filme: PG.MOVIMENTO }, contexto => {
    const { filme } = contexto.conditions;
    raiz.classList.toggle('filme', filme);
    const demo = PG.demoAltS(document.querySelector('[data-demo]'), { filme, entrada: entradaCinetica });
    if (!filme) return () => demo.desligar();

    // A abertura espera a fonte: as linhas são medidas com a letra de verdade.
    let saiu = false;
    (document.fonts?.ready || Promise.resolve()).then(() => { if (!saiu) contexto.add(abrir); });

    const atos = [...document.querySelectorAll('[data-ato]')];
    const olho = new IntersectionObserver(entradas => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        olho.unobserve(entrada.target);
        contexto.add(() => revelar(entrada.target));
      }
    }, { rootMargin: '0px 0px -18% 0px' });
    atos.forEach(ato => olho.observe(ato));

    return () => {
      saiu = true;
      olho.disconnect();
      demo.desligar();
      raiz.classList.remove('cp-pronta');
      atos.forEach(ato => ato.setAttribute('data-visto', ''));
    };
  });
})();
