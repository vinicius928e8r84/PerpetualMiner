'use strict';

// O protótipo "Travessia": a frase é um objeto só, e é ela que se move. Nasce sobre a legenda do vídeo, voa para o
// painel quando ele chega e de lá para a frente do cartão (Flip: cada palavra vai do lugar que tinha ao lugar novo,
// e as linhas se rearrumam no caminho). No cartão, as etapas do envio acendem uma vez (`envio`). A cena do Alt+S
// (`altS`, comum.js) só começa com a pessoa parada no ato 2. Nada aqui fala com a rede nem guarda coisa alguma.
//
// Com "menos movimento" não há frase viajante: as capturas mostram a frase que já trazem, e a demonstração anda
// pelo Repetir, em cortes.

(function () {
  const { gsap, Flip, PG } = window;
  if (!gsap || !Flip || !PG) return;
  gsap.registerPlugin(Flip);

  // A vaga seguinte é alcançada quando o topo dela passa desta fração da janela: as duas pontas do voo estão à vista.
  const LINHA = .72;
  // O envio, em segundos: uma etapa por batida.
  const BATIDA = .5;

  const raiz = document.documentElement;
  const historia = document.querySelector('[data-historia]');
  const onde = document.querySelector('[data-onde]');
  const origem = document.querySelector('[data-frase]');
  const cenaDoVideo = historia.querySelector('[data-demo]');
  const cenaDoEnvio = historia.querySelector('[data-envio]');
  const atos = [...historia.querySelectorAll('.tv-ato')];
  const vagas = ['legenda', 'painel', 'cartao'].map(nome => historia.querySelector(`[data-vaga="${nome}"]`));
  const tampas = vagas.map(vaga => vaga.querySelector('.tv-tampa'));
  const estacaoDe = vaga => vaga.closest('.tv-estacao');

  /** Escreve em `frase` as palavras da frase da abertura, cada uma na sua caixa, e devolve as caixas. */
  function escrever(frase) {
    const palavras = [];
    const andar = (no, chave) => {
      for (const filho of no.childNodes) {
        if (filho.nodeType === Node.ELEMENT_NODE) {
          if (!filho.hasAttribute('aria-hidden')) andar(filho, chave || filho.tagName === 'MARK');
          continue;
        }
        for (const texto of filho.textContent.split(/\s+/).filter(Boolean)) {
          const palavra = document.createElement('span');
          palavra.className = chave ? 'tv-palavra tv-palavra--chave' : 'tv-palavra';
          palavra.textContent = texto;
          palavras.push(palavra);
        }
      }
    };
    andar(origem, false);
    frase.replaceChildren(...palavras.flatMap((palavra, i) => (i ? [' ', palavra] : [palavra])));
    return palavras;
  }

  /** A viagem da frase. Devolve como desfazê-la. */
  function viajar(demo) {
    // Só enfeite para quem vê: quem ouve a página tem a frase na abertura e na descrição de cada captura.
    const frase = document.createElement('span');
    frase.className = 'tv-frase';
    frase.lang = origem.lang;
    frase.setAttribute('aria-hidden', 'true');
    let escrita = origem.textContent;
    let palavras = escrever(frase);
    let atual = 0;
    frase.classList.add('tv-frase--pousada');
    vagas[0].append(frase);
    estacaoDe(vagas[0]).classList.add('tv-estacao--com-a-frase');

    // O envio: o fio desce em tempo constante e cada etapa acende quando ele chega; o verso do cartão se preenche junto.
    const etapas = [...cenaDoEnvio.querySelectorAll('.pg-etapas li')];
    const campos = [...cenaDoEnvio.querySelectorAll('.tv-cartao-verso i')];
    const fio = cenaDoEnvio.querySelector('.pg-etapas-fio');
    const anel = cenaDoEnvio.querySelector('.tv-cartao-anel');
    const pecas = [fio, anel, ...etapas, ...campos];
    const doPasso = numero => campos.filter(campo => campo.dataset.etapa === String(numero));
    // Apagada, a etapa ainda se lê (55% dá contraste de leitura); os traços do verso esperam vazios.
    gsap.set(etapas, { opacity: .55 });
    gsap.set(campos, { scaleX: 0 });
    gsap.set(fio, { scaleY: 0 });
    const envio = gsap.timeline({
      id: 'envio',
      paused: true,
      defaults: { duration: .3, ease: 'power2.out' },
      onStart: () => gsap.set(pecas, PG.CAMADA),
      onComplete: () => gsap.set(pecas, PG.LIMPO),
    });
    envio.to(fio, { scaleY: 1, duration: BATIDA * 4, ease: 'none' }, 0);
    etapas.forEach((etapa, i) => envio.to(etapa, { opacity: 1 }, i * BATIDA));
    envio.to(doPasso(1), { scaleX: 1, stagger: .06 }, 0)
      .to(doPasso(2), { scaleX: 1 }, BATIDA)
      .to(doPasso(3), { scaleX: 1 }, BATIDA * 2)
      .to(anel, { opacity: 1, duration: .25 }, BATIDA * 3)
      .to(anel, { opacity: 0, duration: .9, ease: 'power2.inOut' }, BATIDA * 4);

    /** Leva a frase à vaga `destino`: grava onde cada palavra está, muda a frase de lugar e voa da posição gravada. */
    function pousar(destino) {
      if (destino === atual) return;
      // Um voo pela metade continua de onde as palavras estão, e não do começo.
      Flip.killFlipsOf(palavras);
      frase.classList.remove('tv-frase--pousada');
      const estado = Flip.getState(palavras);
      gsap.set(palavras, { clearProps: 'transform,translate,rotate,scale' });
      const indo = destino > atual;
      estacaoDe(vagas[atual]).classList.remove('tv-estacao--com-a-frase');
      atual = destino;
      vagas[atual].append(frase);
      estacaoDe(vagas[atual]).classList.add('tv-estacao--com-a-frase');
      // Quem passa da legenda sem a cena encontra a frase já minerada.
      if (cenaDoVideo.dataset.passo !== '3') demo.passar();
      // A tampa de onde a frase já saiu some: a captura volta a mostrar a frase que ela traz.
      tampas.forEach((tampa, i) => tampa && gsap.to(tampa, { opacity: i < atual ? 0 : 1, duration: .2, ease: 'power1.out', overwrite: true }));
      Flip.from(estado, {
        duration: .8,
        ease: 'power3.inOut',
        scale: true,
        // As palavras saem em fila, 18 ms uma da outra, a da ponta de onde a frase vai primeiro.
        stagger: { each: .018, from: indo ? 'start' : 'end' },
        onStart: () => gsap.set(palavras, PG.CAMADA),
        onComplete: () => {
          gsap.set(palavras, PG.LIMPO);
          frase.classList.add('tv-frase--pousada');
          if (atual === 2 && !envio.progress()) envio.play();
        },
      });
    }

    // A raiz do observador vai de muito acima da janela até a linha: uma vaga "cruza" quando o topo dela passa a linha,
    // mesmo num salto.
    const alcancadas = vagas.map((vaga, i) => i === 0);
    const olho = new IntersectionObserver(entradas => {
      for (const entrada of entradas) alcancadas[vagas.indexOf(entrada.target)] = entrada.isIntersecting;
      pousar(alcancadas.lastIndexOf(true));
    }, { rootMargin: `100000px 0px -${Math.round((1 - LINHA) * 100)}% 0px` });
    vagas.slice(1).forEach(vaga => olho.observe(vaga));

    // O texto da frase mudou (o teste de pior caso troca): a viajante acompanha.
    const aoMudar = () => {
      if (origem.textContent === escrita) return;
      escrita = origem.textContent;
      Flip.killFlipsOf(palavras);
      palavras = escrever(frase);
    };
    window.addEventListener('resize', aoMudar);

    return {
      naLegenda: () => atual === 0,
      desfazer() {
        window.removeEventListener('resize', aoMudar);
        olho.disconnect();
        Flip.killFlipsOf(palavras);
        estacaoDe(vagas[atual]).classList.remove('tv-estacao--com-a-frase');
        frase.remove();
        gsap.set([...pecas, ...tampas.filter(Boolean)], PG.LIMPO);
      },
    };
  }

  gsap.matchMedia().add({ sempre: PG.SEMPRE, filme: PG.MOVIMENTO, estreita: '(max-width: 899px)' }, contexto => {
    const { filme, estreita } = contexto.conditions;
    raiz.classList.toggle('filme', filme);
    let atoDaVez = 0;
    let viagem = null;
    const demo = PG.demoAltS(cenaDoVideo, { filme, pode: () => atoDaVez === 2 && (!viagem || viagem.naLegenda()) });
    if (filme) viagem = viajar(demo);

    // O ato da vez é o que cruza uma linha da janela: o meio dela no computador e, no celular, abaixo da estação presa.
    const linha = estreita ? 62 : 50;
    const margens = { rootMargin: `-${linha}% 0px -${100 - linha}% 0px` };
    const aoCruzar = new IntersectionObserver(entradas => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        atoDaVez = atos.indexOf(entrada.target) + 1;
        onde.textContent = `${String(atoDaVez).padStart(2, '0')}/${String(atos.length).padStart(2, '0')} · ${entrada.target.dataset.nome}`;
        // De volta ao ato 1 com a frase ainda na legenda: a cena toca de novo na próxima descida.
        if (atoDaVez === 1 && filme && viagem.naLegenda() && cenaDoVideo.dataset.passo === '3') demo.rearmar();
        else demo.armar();
      }
    }, margens);
    atos.forEach(ato => aoCruzar.observe(ato));
    const naHistoria = new IntersectionObserver(([entrada]) => { onde.hidden = !entrada.isIntersecting; }, margens);
    naHistoria.observe(historia);

    return () => {
      aoCruzar.disconnect();
      naHistoria.disconnect();
      viagem?.desfazer();
      demo.desligar();
      onde.textContent = '';
    };
  });
})();
