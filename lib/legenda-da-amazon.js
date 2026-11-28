'use strict';

(function (raiz) {
  const { legendaDe } = raiz.LegendaDaPagina;

  const SELETORES_DIRETOS = ['.atvwebplayersdk-captions-text span', '.atvwebplayersdk-captions-text', '.atvwebplayersdk-subtitle-text-container'];
  const LIMITE_DE_TEXTO_DIRETO = 250;
  const MAIOR_LEGENDA = 200;
  const MENOR_LEGENDA = 4;
  const SO_HORARIO_E_NUMEROS = /^[ \d\s:/]+$/;
  const CARACTERES_DE_OUTRA_ESCRITA = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
  const FRACAO_DA_FAIXA_DO_XRAY = 0.25;
  const FRACAO_DA_META_DE_BAIXO = 0.5;
  const CONTEINER_DO_PLAYER = '.dv-ui-web-player-container';
  const PLAYER_POR_CIMA_DA_PAGINA = '#dv-web-player';
  const TEXTOS_DE_INTERFACE = [
    'temporada', 'ep.', 'season', 'pular', 'skip', 'next', 'próximo',
    'prime video', 'termos', 'política', 'privacidade', 'cookies', 'mais', 'saiba', 'info',
    'detalhes', 'português', 'english', 'idioma', 'legenda', 'configurações', 'audio',
    'coreano', 'korean',
  ];

  const parecemLegenda = texto => Boolean(texto) && texto.length < LIMITE_DE_TEXTO_DIRETO && !SO_HORARIO_E_NUMEROS.test(texto);
  const temOutraEscrita = texto => CARACTERES_DE_OUTRA_ESCRITA.test(texto);
  const temTamanhoDeLegenda = texto => Boolean(texto) && texto.length >= MENOR_LEGENDA && texto.length <= MAIOR_LEGENDA;
  const ehTextoDeInterface = texto => TEXTOS_DE_INTERFACE.some(parte => texto.toLowerCase().includes(parte));

  function lerDosSeletoresDiretos() {
    for (const seletor of SELETORES_DIRETOS) {
      const elementos = Array.from(document.querySelectorAll(seletor));
      if (elementos.length === 0) continue;
      const texto = elementos.map(el => el.innerText).join(' ').replace(/\s*\n\s*/g, ' ').trim();
      if (parecemLegenda(texto)) return legendaDe(texto, elementos);
    }
    return null;
  }

  function faixaDaLegendaNoVideo(video) {
    const caixa = video.getBoundingClientRect();
    return {
      ateOFimDoVideo: caixa.bottom,
      aPartirDoMeio: caixa.top + caixa.height * FRACAO_DA_META_DE_BAIXO,
      aDireitaDoXray: caixa.left + caixa.width * FRACAO_DA_FAIXA_DO_XRAY,
    };
  }

  function estaNaFaixaDaLegenda(el, faixa) {
    const caixa = el.getBoundingClientRect();
    return caixa.top >= faixa.aPartirDoMeio && caixa.top < faixa.ateOFimDoVideo && caixa.left >= faixa.aDireitaDoXray;
  }

  function podeSerLegenda(el, texto, faixa) {
    return !temOutraEscrita(texto)
      && temTamanhoDeLegenda(texto)
      && !SO_HORARIO_E_NUMEROS.test(texto)
      && estaNaFaixaDaLegenda(el, faixa)
      && !ehTextoDeInterface(texto)
      && !el.closest(CONTEINER_DO_PLAYER);
  }

  function lerPelaPosicaoNaTela(video) {
    const faixa = faixaDaLegendaNoVideo(video);
    const ondeProcurar = video.closest(PLAYER_POR_CIMA_DA_PAGINA) || document;
    let ultimaCandidata = null;
    for (const el of ondeProcurar.querySelectorAll('span, div')) {
      const texto = el.innerText?.trim();
      if (podeSerLegenda(el, texto, faixa)) ultimaCandidata = legendaDe(texto, [el]);
    }
    return ultimaCandidata;
  }

  function ler() {
    const direta = lerDosSeletoresDiretos();
    if (direta) return direta;
    const video = document.querySelector(`${PLAYER_POR_CIMA_DA_PAGINA} video`) || document.querySelector('video');
    return video ? lerPelaPosicaoNaTela(video) : null;
  }

  raiz.LegendaDaAmazon = Object.freeze({ ler });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
