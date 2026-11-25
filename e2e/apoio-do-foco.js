'use strict';

function aparenciaDoFocoNoPopup() {
  const no = document.activeElement;
  if (!no || no === document.body) return null;
  const alvo = no.getAttribute('role') === 'switch' ? no.nextElementSibling : no;
  const { outlineStyle, outlineWidth, boxShadow } = getComputedStyle(alvo);
  return { nome: no.getAttribute('aria-label') || no.textContent.trim(), visual: `${outlineStyle} ${outlineWidth} ${boxShadow}` };
}

function aparenciaDosControlesSemFocoNoPopup(nomes) {
  document.activeElement.blur();
  const controles = [...document.querySelectorAll('button, input, textarea')];
  return nomes.map(nome => {
    const no = controles.find(c => (c.getAttribute('aria-label') || c.textContent.trim()) === nome);
    const alvo = no.getAttribute('role') === 'switch' ? no.nextElementSibling : no;
    const { outlineStyle, outlineWidth, boxShadow } = getComputedStyle(alvo);
    return `${outlineStyle} ${outlineWidth} ${boxShadow}`;
  });
}

const aparenciaDoFocoDoPopup = page => page.evaluate(aparenciaDoFocoNoPopup);

const aparenciaDosControlesDoPopupSemFoco = (page, nomes) => page.evaluate(aparenciaDosControlesSemFocoNoPopup, nomes);

function ensinarODesenhoDoFoco() {
  window.desenhoDoFoco = async no => {
    await Promise.all(no.getAnimations().map(animacao => animacao.finished.catch(() => {})));
    const estilo = getComputedStyle(no);
    const anel = estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0
      ? `${estilo.outlineStyle} ${estilo.outlineWidth} ${estilo.outlineColor}`
      : 'sem anel';
    const pintado = no.nextElementSibling || no;
    return [anel, estilo.boxShadow, estilo.borderColor, estilo.backgroundColor,
      getComputedStyle(pintado).outlineStyle].join(' | ');
  };
}

async function anotarOFocadoNaVitrine(ordem) {
  const no = document.activeElement;
  if (!no || no.matches('body, [data-foco-de-teste]')) return null;
  if (no.classList.contains('amostra-de-foco-parado')) return { pular: true };
  no.dataset.focoDeTeste = String(ordem);
  return {
    controle: no.id || `${no.tagName.toLowerCase()}.${no.className}`,
    desenho: await window.desenhoDoFoco(no),
  };
}

function desenhosDosAnotadosSemFoco() {
  document.activeElement.blur();
  return Promise.all([...document.querySelectorAll('[data-foco-de-teste]')]
    .sort((a, b) => a.dataset.focoDeTeste - b.dataset.focoDeTeste)
    .map(no => window.desenhoDoFoco(no)));
}

const ensinarAVitrineADesenharOFoco = page => page.evaluate(ensinarODesenhoDoFoco);

const anotarOFocadoDaVitrine = (page, ordem) => page.evaluate(anotarOFocadoNaVitrine, ordem);

const desenhosDosAnotadosDaVitrineSemFoco = page => page.evaluate(desenhosDosAnotadosSemFoco);

module.exports = {
  aparenciaDoFocoDoPopup, aparenciaDosControlesDoPopupSemFoco,
  ensinarAVitrineADesenharOFoco, anotarOFocadoDaVitrine, desenhosDosAnotadosDaVitrineSemFoco,
};
