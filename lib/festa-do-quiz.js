'use strict';

(function (raiz) {
  const PASSO_DOS_PONTOS = 10;
  const TETO_DOS_PONTOS = 50;
  const ESCALA = Object.freeze([523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51]);
  const CONFETES_DO_ACERTO = Object.freeze({ primeiro: 6, passo: 2, teto: 14 });
  const CONFETES_DA_REVELACAO = 48;
  const NIVEIS = Object.values(raiz.QuizDeNivel.NIVEIS);

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

  function portas(nivel) {
    const ate = NIVEIS.indexOf(nivel);
    if (ate < 0) throw new Error(`Nível desconhecido: ${nivel}`);
    return NIVEIS.map((n, i) => ({ nivel: n, cheia: i <= ate }));
  }

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
