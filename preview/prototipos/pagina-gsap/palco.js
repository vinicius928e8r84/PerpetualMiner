'use strict';

// O protótipo "Palco": a rolagem é a linha do tempo. Uma timeline do GSAP (`palco`), ligada à rolagem pelo
// ScrollTrigger (scrub), move o que está no palco preso: a câmera chega à legenda, os atos se revezam, o painel e o
// popup sobem por dentro da moldura e o envio enche. A cena do Alt+S (`altS`, comum.js) é a única que corre no
// relógio: só começa com a pessoa parada no ato 2. Nada aqui fala com a rede nem guarda coisa alguma.
//
// A linha do tempo tem 100 unidades, que são a trilha inteira. Cada ato tem um patamar em que nada troca (é onde se
// lê) e, entre dois patamares, uma passagem curta: o texto que sai some antes de o outro entrar, para os dois nunca
// se lerem um sobre o outro.

(function () {
  const { gsap, ScrollTrigger, PG } = window;
  if (!gsap || !ScrollTrigger || !PG) return;
  gsap.registerPlugin(ScrollTrigger);

  // Onde cada ato dá lugar ao seguinte (FIM) e onde a rolagem para quando se pede o ato pelo trilho (ALVO).
  // As proporções do trilho em palco.css são as de FIM.
  const FIM = [17, 43, 61, 87, 100];
  const ALVO = [2, 24, 48, 70, 93];
  // O patamar do ato 2, onde a cena do Alt+S pode tocar.
  const CENA = [20, 38];

  const raiz = document.documentElement;
  const trilha = document.querySelector('[data-trilha]');
  const palco = document.querySelector('[data-palco]');
  const onde = document.querySelector('[data-onde]');
  const cenaDoVideo = palco.querySelector('[data-demo]');
  const atos = [...palco.querySelectorAll('.pl-ato')];
  const pontos = [...palco.querySelectorAll('.pl-trilho a')];
  const camera = palco.querySelector('.pg-demo-camera');
  const [painel, popup] = palco.querySelectorAll('.pl-captura');
  const fioDoTrilho = palco.querySelector('.pl-trilho-fio i');
  const fioDasEtapas = palco.querySelector('.pg-etapas-fio');
  const etapas = [...palco.querySelectorAll('.pg-etapas li')];
  const movidos = [camera, painel, popup, fioDoTrilho, fioDasEtapas, ...atos, ...etapas];

  // Uma captura é mais alta que a moldura. Em % da altura dela: onde ela fica escondida abaixo da moldura, e onde
  // fica com o trecho `foco` (0 o topo, 1 o pé) no meio da moldura, sem mostrar o que há além das bordas.
  const moldura = imagem => imagem.parentElement.clientHeight / imagem.offsetHeight;
  const abaixo = imagem => 100 * moldura(imagem) + 1;
  const focar = (imagem, foco) => gsap.utils.clamp(100 * moldura(imagem) - 100, 0, 50 * moldura(imagem) - 100 * foco);

  /** O palco preso só vale se o ato mais comprido couber nele; senão a história é a página parada. */
  const naoCabe = () => palco.scrollHeight > palco.clientHeight + 1;

  function prender(largo, demo) {
    let atoDaVez = 0;
    onde.hidden = true;
    // As capturas do palco entram por transform, de fora da moldura: o navegador não as carregaria sozinho a tempo.
    // Decodificadas já, o quadro em que cada uma sobe não paga por isso.
    [painel, popup].forEach(imagem => {
      imagem.loading = 'eager';
      imagem.decode().catch(() => {});
    });

    const tl = gsap.timeline({
      id: 'palco',
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: trilha,
        start: () => `top ${parseFloat(getComputedStyle(palco).top)}px`,
        end: 'bottom bottom',
        scrub: .4,
        invalidateOnRefresh: true,
        onUpdate: aoAndar,
        onToggle: st => {
          // O fio do trilho se move a história inteira: a camada dele dura enquanto ela está na janela.
          gsap.set(fioDoTrilho, { willChange: st.isActive ? 'transform' : 'auto' });
          raiz.toggleAttribute('data-na-historia', st.isActive);
          onde.hidden = !st.isActive;
        },
      },
    });
    // will-change só na janela em que o alvo se move (a linha do tempo anda para trás também, e desfaz o que pôs).
    const camada = (alvo, de, ate) => {
      tl.set(alvo, PG.CAMADA, Math.max(de - .05, .01));
      tl.set(alvo, { willChange: 'auto' }, Math.min(ate + .05, 100));
    };
    const sair = (ato, quando) => {
      camada(ato, quando, quando + 2.5);
      tl.to(ato, { opacity: 0, y: -14, duration: 2.5 }, quando);
    };
    const entrar = (ato, quando) => {
      camada(ato, quando, quando + 3);
      tl.fromTo(ato, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 3 }, quando);
    };
    const [a1, a2, a3, a4, a5] = atos;

    // Ato 1, a legenda: a câmera chega 10% mais perto da linha (a origem do zoom é a legenda, em demo.css).
    camada(camera, 0, 14);
    tl.fromTo(camera, { scale: 1 }, { scale: 1.1, duration: 14 }, 0);
    sair(a1, 14);
    entrar(a2, 17);
    // Ato 2, o atalho: de 20 a 38 nada troca. É o patamar da cena do Alt+S.
    sair(a2, 38);
    // Ato 3, o painel: sobe por dentro da moldura, por cima do vídeo, e para na frase com a palavra grifada.
    camada(painel, 38, 46);
    tl.fromTo(painel, { yPercent: () => abaixo(painel) }, { yPercent: () => focar(painel, .69), duration: 8, ease: 'power1.inOut' }, 38);
    entrar(a3, 43);
    sair(a3, 56);
    // Ato 4, o envio: a câmera sobe da frase até a barra do Enviar ao Anki, e o fio das etapas enche com a rolagem.
    camada(painel, 56, 64);
    tl.to(painel, { yPercent: () => focar(painel, .5), duration: 8, ease: 'power1.inOut' }, 56);
    entrar(a4, 61);
    camada([fioDasEtapas, ...etapas], 66, 81.5);
    tl.fromTo(fioDasEtapas, { scaleY: 0 }, { scaleY: 1, duration: 14 }, 66);
    // Uma a uma, e não com `stagger`: num fromTo escalonado só a primeira nasce apagada. Apagada, a etapa ainda se lê.
    etapas.forEach((etapa, i) => tl.fromTo(etapa, { opacity: .55 }, { opacity: 1, duration: 1.5 }, 66 + 3.5 * i));
    sair(a4, 82);
    // Ato 5, sozinha: o popup sobe por cima do painel e a câmera desce da mineração automática às últimas mineradas.
    camada(popup, 82, 100);
    tl.fromTo(popup, { yPercent: () => abaixo(popup) }, { yPercent: () => focar(popup, .32), duration: 8, ease: 'power1.inOut' }, 82);
    entrar(a5, 87);
    tl.to(popup, { yPercent: () => focar(popup, .7), duration: 10 }, 90)
      // O trilho enche do começo ao fim, na mesma medida da rolagem.
      .fromTo(fioDoTrilho, largo ? { scaleY: 0 } : { scaleX: 0 }, { scaleX: 1, scaleY: 1, duration: 100 }, 0);
    raiz.classList.add('palco-pronto');

    const st = tl.scrollTrigger;
    demo.podeTocar = () => st.isActive && st.progress * 100 >= CENA[0] && st.progress * 100 <= CENA[1];

    function aoAndar() {
      const p = st.progress * 100;
      const numero = FIM.findIndex(fim => p < fim) + 1 || FIM.length;
      // Quem passa do patamar do ato 2 encontra a frase minerada, com ou sem cena; quem volta ao ato 1 a vê de novo.
      if (p > CENA[1] && cenaDoVideo.dataset.passo !== '3') demo.passar();
      else if (numero === 1 && cenaDoVideo.dataset.passo !== '0') demo.rearmar();
      if (numero === atoDaVez) return;
      atoDaVez = numero;
      palco.dataset.ato = numero;
      pontos.forEach((ponto, i) => {
        if (i === numero - 1) ponto.setAttribute('aria-current', 'step');
        else ponto.removeAttribute('aria-current');
      });
      onde.textContent = `${String(numero).padStart(2, '0')}/${String(atos.length).padStart(2, '0')} · ${atos[numero - 1].dataset.nome}`;
    }

    // Pedir um ato (pelo trilho, pelo link da abertura, ou pondo o foco num controle dele) leva a rolagem ao patamar dele.
    const irPara = numero => window.scrollTo({ top: Math.ceil(st.start + (st.end - st.start) * ALVO[numero - 1] / 100) });
    const numeroDe = link => Number(link.hash.replace('#ato-', ''));
    const aoClicar = evento => {
      const link = evento.target.closest('a[href^="#ato-"]');
      if (!link) return;
      evento.preventDefault();
      irPara(numeroDe(link));
    };
    const aoFocar = evento => {
      const numero = atos.indexOf(evento.target.closest('.pl-ato')) + 1;
      if (numero && numero !== atoDaVez) irPara(numero);
    };
    document.addEventListener('click', aoClicar);
    palco.addEventListener('focusin', aoFocar);
    if (/^#ato-[1-5]$/.test(location.hash)) irPara(numeroDe(location));
    aoAndar();

    return () => {
      document.removeEventListener('click', aoClicar);
      palco.removeEventListener('focusin', aoFocar);
      raiz.classList.remove('palco-pronto');
      raiz.removeAttribute('data-na-historia');
      palco.dataset.ato = 1;
      onde.textContent = '';
      onde.hidden = false;
      gsap.set(movidos, PG.LIMPO);
    };
  }

  let mm;
  let preso = false;
  function montar() {
    mm = gsap.matchMedia();
    mm.add({ sempre: PG.SEMPRE, filme: PG.MOVIMENTO, alta: raiz.dataset.quando, largo: '(min-width: 900px)' }, contexto => {
      const { filme, alta, largo } = contexto.conditions;
      raiz.classList.toggle('filme', filme);
      raiz.classList.toggle('palco-preso', filme && alta);
      preso = filme && alta && !naoCabe();
      raiz.classList.toggle('palco-preso', preso);

      const demo = PG.demoAltS(cenaDoVideo, { filme, pode: () => demo.podeTocar() });
      demo.podeTocar = () => true;
      const soltar = preso ? prender(largo, demo) : null;
      return () => {
        soltar?.();
        demo.desligar();
      };
    });
  }
  montar();

  // A janela mudou de tamanho, a fonte chegou ou o texto mudou: se o que cabia deixou de caber (ou o contrário),
  // monta de novo.
  function reconferir() {
    if (!raiz.classList.contains('filme') || !window.matchMedia(raiz.dataset.quando).matches) return;
    raiz.classList.add('palco-preso');
    const cabe = !naoCabe();
    raiz.classList.toggle('palco-preso', preso);
    if (cabe === preso) return;
    mm.revert();
    montar();
  }
  let espera = 0;
  window.addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(reconferir, 200);
  });
  document.fonts?.ready.then(reconferir);
})();
