'use strict';

// A festa do quiz de nível (#171, #137 C · Festa e B · Revelação): o que um acerto rende e como o nível se revela, como dados e sem tela nem som. Quem desenha e toca é
// `painel-boas-vindas-quiz.js`. A festa cresce com a sequência (pontos, nota e confete sobem até um teto) e o confete grande fica para a Revelação, porque confete igual
// a cada acerto cansa.

(function (raiz) {
  const PASSO_DOS_PONTOS = 10;
  const TETO_DOS_PONTOS = 50;
  // A escala do acerto: pentatônica maior a partir do dó 5. Cada acerto seguido sobe uma nota; passada a última, fica nela.
  const ESCALA = Object.freeze([523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51]);
  const CONFETES_DO_ACERTO = Object.freeze({ primeiro: 6, passo: 2, teto: 14 });
  const CONFETES_DA_REVELACAO = 48;
  const NIVEIS = Object.freeze(['iniciante', 'intermediario', 'avancado']);

  /** O que o acerto da `sequencia`-ésima seguida rende: `pontos`, a `nota` (Hz) do som, quantos `confetes` e o quanto o pulo cresce (`pulo`, de 1 a 1,x). */
  function doAcerto(sequencia) {
    if (!Number.isInteger(sequencia) || sequencia < 1) throw new Error(`Sequência fora do acerto: ${sequencia}`);
    const { primeiro, passo, teto } = CONFETES_DO_ACERTO;
    return {
      pontos: Math.min(sequencia * PASSO_DOS_PONTOS, TETO_DOS_PONTOS),
      nota: ESCALA[Math.min(sequencia, ESCALA.length) - 1],
      confetes: Math.min(primeiro + (sequencia - 1) * passo, teto),
      pulo: 1 + Math.min(sequencia - 1, 4) * 0.05,
    };
  }

  /** As três portas da Revelação, da de baixo para a de cima: `cheia` até o `nivel` sugerido (as de cima ficam vazias). */
  function portas(nivel) {
    const ate = NIVEIS.indexOf(nivel);
    if (ate < 0) throw new Error(`Nível desconhecido: ${nivel}`);
    return NIVEIS.map((n, i) => ({ nivel: n, cheia: i <= ate }));
  }

  /** Para onde sai cada um dos `n` pedaços de confete (`dx`/`dy` em unidades da fonte e `giro` em graus): espalhados em leque pela razão áurea, sem sorteio. */
  function pedacos(n) {
    const ouro = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: n }, (_, i) => {
      const angulo = i * ouro;
      const alcance = 5 + ((i * 7) % 5) * 2.2;
      return { dx: +(Math.cos(angulo) * alcance).toFixed(2), dy: +(-Math.abs(Math.sin(angulo)) * alcance - 3).toFixed(2), giro: (i * 67) % 360 };
    });
  }

  raiz.FestaDoQuiz = Object.freeze({ doAcerto, portas, pedacos, ESCALA, TETO_DOS_PONTOS, CONFETES_DA_REVELACAO });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
