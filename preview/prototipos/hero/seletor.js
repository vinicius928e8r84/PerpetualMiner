'use strict';

// O seletor das variantes. O miolo é a "Reference wiring" de PICKER.md (skill emil-prototype), copiada sem mexer:
// teclas 1 a 4 e as setas trocam de variante, R repete, a escolha fica no endereço (?v=2) e trocar remonta a
// variante, para a entrada dela rodar de novo. As variantes se registram em ProtoHero.variantes (comum.js).

(function () {
  const variants = window.ProtoHero.variantes;

  // `variants` is an array of render functions, one per variant, in picker order.
  const stage = document.getElementById('stage');
  const picker = document.querySelector('.proto-picker');
  const highlight = picker.querySelector('.proto-picker-highlight');
  const items = [...picker.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
  const replay = picker.querySelector('.proto-picker-replay');
  let current = 0;

  function moveHighlight() {
    const el = items[current];
    highlight.style.width = el.offsetWidth + 'px';
    highlight.style.transform = `translateX(${el.offsetLeft}px)`;
  }

  function mount(i) {
    stage.innerHTML = '';
    // Clear first, render next frame, so entrance animations re-run.
    requestAnimationFrame(() => { stage.innerHTML = variants[i](); });
  }

  function setActive(i) {
    if (i < 0 || i >= variants.length) return;
    current = i;
    items.forEach((el, j) => {
      el.toggleAttribute('data-active', j === i);
      if (j === i) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');
    });
    moveHighlight();
    const url = new URL(location);
    url.searchParams.set('v', i + 1);
    history.replaceState(null, '', url);
    mount(i);
  }

  items.forEach((el, i) => el.addEventListener('click', () => setActive(i)));
  replay?.addEventListener('click', () => mount(current));
  window.addEventListener('resize', moveHighlight);

  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= variants.length) setActive(num - 1);
    else if (e.key === 'ArrowRight') setActive((current + 1) % variants.length);
    else if (e.key === 'ArrowLeft') setActive((current - 1 + variants.length) % variants.length);
    else if (e.key === 'r' || e.key === 'R') mount(current);
  });

  setActive((parseInt(new URLSearchParams(location.search).get('v'), 10) || 1) - 1);
  // Enable the slide only after first paint, so load doesn't animate.
  requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));

  // O alternador de dados da skill break-ui: troca o conjunto na porta de entrada dos dados (conteudo.js lê ?data=)
  // e remonta a variante. A escolha fica no endereço, como a da variante.
  const segmentos = [...document.querySelectorAll('.proto-dados [data-dados]')];
  const marcarDados = () => {
    const pedido = new URLSearchParams(location.search).get('data');
    const atual = pedido in window.ProtoHero.conjuntos ? pedido : 'demo';
    segmentos.forEach(segmento => segmento.setAttribute('aria-pressed', String(segmento.dataset.dados === atual)));
  };
  segmentos.forEach(segmento => segmento.addEventListener('click', () => {
    const url = new URL(location);
    if (segmento.dataset.dados === 'demo') url.searchParams.delete('data');
    else url.searchParams.set('data', segmento.dataset.dados);
    history.replaceState(null, '', url);
    marcarDados();
    mount(current);
  }));
  marcarDados();
})();
