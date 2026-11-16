'use strict';

(function (raiz) {
  const { textoDaVoz } = raiz;
  const VOZ_DO_NIVEL = { iniciante: 'BRG-42.iniciante', intermediario: 'BRG-42.intermediario', avancado: 'BRG-42.avancado' };

  const semMovimento = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

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

  function saltar(no) {
    delete no.dataset.subiu;
    void no.offsetWidth;
    no.dataset.subiu = '';
  }

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

  function acertou({ certa, sequencia }) {
    const ganho = raiz.FestaDoQuiz.doAcerto(sequencia);
    certa.style.setProperty('--pulo', ganho.pulo);
    certa.dataset.pulo = '';
    confete(certa, ganho.confetes);
    if (!semMovimento()) {
      const pontos = elemento('span', 'quiz__ganho', textoDaVoz('ONB-21.ganhou', { n: ganho.pontos }));
      pontos.setAttribute('aria-hidden', 'true');
      pontos.addEventListener('animationend', () => pontos.remove());
      certa.append(pontos);
    }
    return ganho;
  }

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
