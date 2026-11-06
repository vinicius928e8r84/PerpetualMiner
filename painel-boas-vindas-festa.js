'use strict';

// A festa do quiz de nível na tela (#171, ONB-21 e ONB-22): o pulo, o “+10” que sobe, o placar, o confete e a Revelação do nível. O que cada acerto rende é de
// `lib/festa-do-quiz.js`; o som, de `lib/som-do-quiz.js`; os tempos e as curvas, dos tokens de movimento do Veio (`veio/tokens.css`). Nada começa sozinho: tudo nasce de uma
// resposta ou do fim do quiz. Com “menos movimento” só a cor muda: o confete nem é criado, e o CSS tira o resto (`painel-quiz.css`).

(function (raiz) {
  const { textoDaVoz } = raiz;
  const VOZ_DO_NIVEL = { iniciante: 'BRG-42.iniciante', intermediario: 'BRG-42.intermediario', avancado: 'BRG-42.avancado' };

  const semMovimento = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  /** Um token de tempo do Veio (`--veio-mov-…`) em milissegundos. */
  function tempoDoToken(nome) {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    return valor.endsWith('ms') ? parseFloat(valor) : parseFloat(valor) * 1000;
  }

  function elemento(tag, classe, texto) {
    const no = document.createElement(tag);
    no.className = classe;
    if (texto !== undefined) no.textContent = texto;
    return no;
  }

  /** Reinicia a animação de “subiu” de um número do cabeçalho (o placar ou a sequência). */
  function saltar(no) {
    delete no.dataset.subiu;
    void no.offsetWidth;
    no.dataset.subiu = '';
  }

  /** O confete de `n` pedaços dentro de `dentro`, a começar `atraso` ms adiante; some sozinho ao fim. Com “menos movimento” não nasce. */
  function confete(dentro, n, { atraso = 0, classe = '' } = {}) {
    if (semMovimento()) return;
    const caixa = elemento('div', `quiz__confete ${classe}`.trim());
    caixa.setAttribute('aria-hidden', 'true');
    for (const { dx, dy, giro } of raiz.FestaDoQuiz.pedacos(n)) {
      const pedaco = elemento('span', 'quiz__pedaco');
      pedaco.style.setProperty('--dx', dx);
      pedaco.style.setProperty('--dy', dy);
      pedaco.style.setProperty('--giro', giro);
      pedaco.style.setProperty('--atraso', `${atraso}ms`);
      pedaco.addEventListener('animationend', () => { pedaco.remove(); if (!caixa.childElementCount) caixa.remove(); });
      caixa.append(pedaco);
    }
    dentro.append(caixa);
  }

  /** O acerto: a certa pula (mais a cada acerto seguido), o confete sai dela e o “+pontos” sobe no canto do quiz. Devolve o `ganho` que a festa deu. */
  function acertou({ quiz, certa, sequencia }) {
    const ganho = raiz.FestaDoQuiz.doAcerto(sequencia);
    certa.style.setProperty('--pulo', ganho.pulo);
    certa.dataset.pulo = '';
    confete(certa, ganho.confetes);
    if (!semMovimento()) {
      const pontos = elemento('span', 'quiz__ganho', textoDaVoz('ONB-21.ganhou', { n: ganho.pontos }));
      pontos.setAttribute('aria-hidden', 'true');
      pontos.addEventListener('animationend', () => pontos.remove());
      quiz.append(pontos);
    }
    return ganho;
  }

  /** As portas da Revelação: enchem uma a uma até o `nivel` (a do nível, em ouro) e as de cima ficam vazias. Só desenho: o nível é dito pelo resto do resultado. */
  function portas(nivel) {
    const lista = elemento('div', 'quiz__portas');
    lista.setAttribute('aria-hidden', 'true');
    raiz.FestaDoQuiz.portas(nivel).forEach(({ nivel: n, cheia }, ordem) => {
      const porta = elemento('div', 'quiz__porta');
      porta.style.setProperty('--ordem', ordem);
      if (cheia) porta.dataset.cheia = '';
      if (n === nivel) porta.dataset.alvo = '';
      porta.append(elemento('span', 'quiz__porta-enchimento'), elemento('span', 'quiz__porta-nome', textoDaVoz(VOZ_DO_NIVEL[n])));
      lista.append(porta);
    });
    return lista;
  }

  /**
   * A Revelação: devolve `{ portas, revelado }`, as portas e o invólucro (`revelado`, onde vai o resto do resultado, que entra depois da última porta). O rufar acompanha as portas,
   * o acorde e o confete grande vêm quando a última para. `som` é o do quiz; mudo, não toca.
   */
  function revelacao({ nivel, som, quiz }) {
    const cheias = raiz.FestaDoQuiz.portas(nivel).filter(p => p.cheia).length;
    const revelado = elemento('div', 'quiz__revelado');
    revelado.style.setProperty('--cheias', cheias);
    const ate = ((cheias - 1) * tempoDoToken('--veio-mov-entre-portas') + tempoDoToken('--veio-mov-porta')) / 1000;
    som.rufar(8 + cheias * 6, ate);
    som.acorde(ate);
    confete(quiz, raiz.FestaDoQuiz.CONFETES_DA_REVELACAO, { atraso: ate * 1000, classe: 'quiz__confete--revelacao' });
    return { portas: portas(nivel), revelado };
  }

  raiz.FestaNaTela = Object.freeze({ acertou, revelacao, saltar, semMovimento });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
