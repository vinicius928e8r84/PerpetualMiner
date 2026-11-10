'use strict';

// O teste de pior caso dos protótipos (skill break-ui). Só existe no seletor, e só com `?dados` no endereço
// (`?dados=pior` já abre no pior caso): troca, dentro do quadro, os textos de exemplo de cada variante pelo pior valor
// plausível de cada um (a frase longa, a palavra russa que não quebra, doze players, o rótulo traduzido mais comprido,
// o teto de quatro dígitos). As páginas das variantes não sabem que isto existe: nada daqui vai para elas.

(function () {
  const endereco = new URL(location);
  if (!endereco.searchParams.has('dados')) return;

  const FRASE = 'Notwithstanding the harbormaster’s <mark>counterrevolutionary</mark> misgivings, the quiet harbor woke before the gulls did, and nobody had thought to tell the lighthouse keeper.';
  const FRASE_RU = 'Не всё то <mark>достопримечательность</mark>, что переосвидетельствуется человеконенавистничеством.';
  const PLAYERS = ['YouTube', 'Netflix', 'Prime Video', 'Max', 'Kinopoisk', 'Disney+', 'Apple TV+', 'Crunchyroll', 'Globoplay', 'Paramount+', 'Okko', 'Amazon Prime Video (Channels)']
    .map(nome => `<span>${nome}</span>`).join('');
  const INSTALAR = 'Adicionar o PerpetualMiner ao Google Chrome';
  const PERGUNTA = 'Preciso do Anki instalado e aberto no mesmo computador para conseguir usar a mineração automática de legendas?';
  const ETAPA = 'Escolhendo imagens de licença aberta';

  // [seletor, o que entra]. Um texto troca o conteúdo de todos os que casam; um objeto troca atributos.
  const PIOR = {
    'roteiro.html': [
      ['.rt-frase', FRASE],
      ['.rt-ato .pp-fichas', PLAYERS],
      ['#ato-2', { 'data-nome': 'A mineração automática de legendas' }],
      ['#ato-2 h2', '<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>F12</kbd>. A frase é sua.'],
      ['.rt-etapas li:nth-child(3)', ETAPA],
      ['.rt-ficha [lang="en"]', FRASE],
      ['.rt-ficha [lang="ru"]', FRASE_RU],
      ['.rt-ficha .pp-valor', 'US$ 1.250,00'],
      ['.pp-perguntas details:first-child summary', PERGUNTA],
      ['.pp-botao:not(.pp-botao--curto)', INSTALAR],
      ['.pp-botao--curto', 'Adicionar ao Chrome'],
    ],
    'mosaico.html': [
      ['.ms-chamada .pp-botao', INSTALAR],
      ['.ms-topo .pp-botao', 'Adicionar ao Chrome'],
      ['.ms-numeros div:nth-child(1) dt', '128'],
      ['.ms-numeros div:nth-child(2) dt', '12'],
      ['.ms-numeros div:nth-child(3) dt', '1'],
      ['.ms-numeros div:nth-child(1) dd', 'players e sites de vídeo com leitor próprio de legenda'],
      ['.ms-peca .pp-fichas', PLAYERS],
      ['.ms-linhas li:nth-child(2) b', 'Intermediário-avançado'],
      ['.ms-etapas li:nth-child(3)', ETAPA],
      ['.ms-idiomas [lang="en"]', FRASE],
      ['.ms-idiomas [lang="ru"]', FRASE_RU],
      ['.ms-teto .pp-valor', 'US$ 1.250,00'],
      ['.pp-perguntas details:first-child summary', PERGUNTA],
      ['.ms-fecho .pp-botao', INSTALAR],
    ],
    'abas.html': [
      ['.ab-abas a:nth-child(2)', 'Mineração automática'],
      ['.ab-abas a:nth-child(5)', 'Privacidade e os seus dados'],
      ['.ab-abas a:nth-child(7)', 'Perguntas frequentes'],
      ['.ab-instalar', 'Adicionar<span> o PerpetualMiner ao Google Chrome</span>'],
      ['.ab-acoes .pp-botao, #instalar .pp-botao', INSTALAR],
      ['.ab-painel .pp-fichas', PLAYERS],
      ['.ab-etapas li:nth-child(3)', ETAPA],
      ['.ab-idiomas [lang="en"]', FRASE],
      ['.ab-idiomas [lang="ru"]', FRASE_RU],
      ['.ab-teto', 'US$ 1.250,00'],
      ['.pp-perguntas details:first-child summary', PERGUNTA],
    ],
  };

  function aplicar(pagina) {
    const trocas = PIOR[pagina.location.pathname.split('/').pop()] || [];
    for (const [seletor, valor] of trocas) {
      for (const alvo of pagina.querySelectorAll(seletor)) {
        if (typeof valor === 'string') alvo.innerHTML = valor;
        else for (const [atributo, texto] of Object.entries(valor)) alvo.setAttribute(atributo, texto);
      }
    }
    // As variantes medem o que mostram (o marcador das abas): avisar que o tamanho mudou.
    pagina.defaultView.dispatchEvent(new Event('resize'));
  }

  const palco = document.getElementById('stage');
  const pior = () => endereco.searchParams.get('dados') === 'pior';
  new MutationObserver(() => {
    const quadro = palco.querySelector('iframe');
    quadro?.addEventListener('load', () => { if (pior()) aplicar(quadro.contentDocument); });
  }).observe(palco, { childList: true });
  // Este arquivo chega depois de o seletor já ter montado a variante: monta de novo, para a troca valer desde a primeira.
  if (pior()) mount(current);

  // O interruptor: moldura do teste, cinza e sem a Veio. Fica em cima porque embaixo, no meio, está o seletor.
  const estilo = document.createElement('style');
  estilo.textContent = `
    .pior-caso { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483646; display: flex; gap: 2px;
      padding: 3px; border-radius: 9px; background: #d4d4d4; font: 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; white-space: nowrap; }
    .pior-caso button { padding: 6px 10px; border: 0; border-radius: 7px; background: transparent; color: #404040; font: inherit; cursor: pointer; }
    .pior-caso button[aria-pressed="true"] { background: #fff; color: #0a0a0a; box-shadow: 0 1px 2px rgba(0, 0, 0, .2); }`;
  const controle = document.createElement('div');
  controle.className = 'pior-caso';
  controle.setAttribute('role', 'group');
  controle.setAttribute('aria-label', 'Dados do teste');
  for (const [valor, rotulo] of [['exemplo', 'Dados de exemplo'], ['pior', 'Pior caso']]) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = rotulo;
    botao.setAttribute('aria-pressed', String((valor === 'pior') === pior()));
    botao.addEventListener('click', () => {
      endereco.searchParams.set('v', current + 1);
      endereco.searchParams.set('dados', valor);
      history.replaceState(null, '', endereco);
      for (const outro of controle.children) outro.setAttribute('aria-pressed', String(outro === botao));
      mount(current);
    });
    controle.append(botao);
  }
  document.head.append(estilo);
  document.body.append(controle);
})();
