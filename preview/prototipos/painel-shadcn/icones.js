'use strict';

// Os ícones do protótipo: traços próprios, desenhados para esta pasta numa grade de 24 com traço de 2 (a mesma
// convenção de traço dos ícones que o shadcn usa, sem copiar nenhum desenho de lá). `PS.ic('nome')` devolve o SVG.

(function (PS) {
  const TRACOS = {
    frases: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    tomada: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
    'tomada-fora': '<path d="M9 3v3M15 3v5M10 8h8v3a6 6 0 0 1-1 3.3M14.5 16.4A6 6 0 0 1 6 11V8M12 17v4M3 3l18 18"/>',
    engrenagem: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    abaixo: '<path d="M6 9l6 6 6-6"/>',
    acima: '<path d="M6 15l6-6 6 6"/>',
    direita: '<path d="M9 6l6 6-6 6"/>',
    esquerda: '<path d="M15 6l-6 6 6 6"/>',
    primeira: '<path d="M17 6l-6 6 6 6M7 6v12"/>',
    ultima: '<path d="M7 6l6 6-6 6M17 6v12"/>',
    fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
    visto: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    busca: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    pontos: '<circle cx="5" cy="12" r=".6"/><circle cx="12" cy="12" r=".6"/><circle cx="19" cy="12" r=".6"/>',
    lapis: '<path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5zM14.5 6l3 3"/>',
    etiqueta: '<path d="M3 5a2 2 0 0 1 2-2h6l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r=".6"/>',
    copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    lixeira: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
    enviar: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
    arquivo: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6"/>',
    colar: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 15h4"/>',
    foto: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    atualizar: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    lua: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    painel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    teclado: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    brilho: '<path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8zM18 15l.8 2.2 2.2.8-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
    chave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M13.5 9.5l2 2"/>',
    perigo: '<path d="M12 4L2.5 20h19zM12 10v4M12 17h.01"/>',
    tema: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
    externo: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    tocar: '<path d="M7 4l13 8-13 8z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    'certo-circulo': '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    'erro-circulo': '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    carregando: '<path d="M21 12a9 9 0 1 1-9-9"/>',
    tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
    video: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M10 9.5l5 2.5-5 2.5z"/>',
    livro: '<path d="M5 4h13v16H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h11"/>',
    globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    pagina: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
    sair: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
    baixar: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    'seta-direita': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    nuvem: '<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18z"/>',
    'nuvem-fora': '<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 2-3.3M12 6a6 6 0 0 1 6 5.5 3.5 3.5 0 0 1 2.2 5.3M17 18H7M3 3l18 18"/>',
    baralho: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
    moeda: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
    letras: '<path d="M3 18l4-11 4 11M4.5 14h5M14 14a3 3 0 1 0 6 0 3 3 0 1 0-6 0M20 10v8"/>',
    ajustes: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    caixa: '<path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5"/>',
    som: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    comando: '<path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zm0 0v6m0-6h6m-6 6H6.5A2.5 2.5 0 1 0 9 17.5V15zm0 0h6m0 0v2.5a2.5 2.5 0 1 0 2.5-2.5H15zm0 0V9m0 0V6.5A2.5 2.5 0 1 1 17.5 9H15z"/>',
    estrela: '<path d="M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.1L12 17l-5.6 3 1.2-6.1L3 9.6l6.3-.8z"/>',
    olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  };

  PS.ic = function (nome, classe) {
    const traco = TRACOS[nome];
    if (!traco) throw new Error(`ícone sem desenho: ${nome}`);
    return `<svg class="ic${classe ? ` ${classe}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${traco}</svg>`;
  };

  // A marca do PerpetualMiner (o cristal da Veio), a mesma de veio/icones/icone.svg, escrita aqui para a pasta não
  // depender de nada de fora dela.
  PS.marca = '<svg viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="28" fill="#1B1A17"/>'
    + '<polygon points="64,14 64,114 38,92 38,36" fill="#FFD27A"/><polygon points="64,14 90,36 90,92 64,114" fill="#D9901A"/>'
    + '<polygon points="64,14 90,36 64,46 38,36" fill="#FFE3A6"/><rect x="30" y="68" width="68" height="10" fill="#1B1A17"/></svg>';
})(window.PS = window.PS || {});
