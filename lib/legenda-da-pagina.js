'use strict';

(function (raiz) {
  const SUBTITLE_UI_TEXT = [
    'audio', 'áudio', 'caption', 'captions', 'configurações', 'detalhes',
    'episódio', 'episode', 'episodes', 'fullscreen', 'idioma', 'legenda',
    'legendas', 'next episode', 'pause', 'próximo episódio',
    'season', 'seasons', 'skip intro', 'skip recap', 'temporada',
    'temporadas', 'temporadas e episódios', 'subtitles',
    'аудио', 'воспроизвести', 'настройки', 'пауза', 'пропустить',
    'следующая серия', 'сезоны и серии', 'субтитры',
  ];
  const SO_SIMBOLOS = /^[\d\s:.,!?()[\]{}'"-]+$/;
  const ESCRITA_ASIATICA = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
  const AVISO_DE_INTERFACE = /\b(skip intro|skip recap|next episode|pr[oó]ximo epis[oó]dio)\b/i;
  const ELEMENTOS_DE_INTERFACE = 'button,a,input,textarea,select,[role="button"],[contenteditable="true"]';

  const SEGUE = Symbol('esta página não tem a legenda deste site');

  const normalizarTexto = texto => String(texto || '').replace(/\s+/g, ' ').trim();

  function legendaDe(texto, elementos) {
    return texto ? { texto, elementos } : null;
  }

  function videoVisivel(video) {
    const rect = video.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 80 && rect.bottom > 0 && rect.right > 0
      && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function areaDoVideo(video) {
    const rect = video.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function obterVideoAtivo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    const ranked = videos.map(video => ({ video, area: areaDoVideo(video), visible: videoVisivel(video), playing: !video.paused && !video.ended }));
    ranked.sort((a, b) => Number(b.visible) - Number(a.visible)
      || Number(b.playing) - Number(a.playing)
      || b.area - a.area);
    return ranked[0]?.video || videos[0] || null;
  }

  function tamanhoDeLegenda(texto) {
    return texto.length >= 2 && texto.length <= 220;
  }

  function ehTextoDeInterface(texto) {
    return SUBTITLE_UI_TEXT.includes(texto.toLowerCase()) || AVISO_DE_INTERFACE.test(texto);
  }

  function textoPareceLegenda(texto) {
    const limpo = normalizarTexto(texto);
    if (!tamanhoDeLegenda(limpo)) return false;
    if (SO_SIMBOLOS.test(limpo) || raiz.contarLetras(limpo) < 2) return false;
    if (ESCRITA_ASIATICA.test(limpo)) return false;
    return !ehTextoDeInterface(limpo);
  }

  const textoDoElemento = no => normalizarTexto(no?.innerText || no?.textContent || '');

  function textoLegendaDeElemento(el) {
    const texto = textoDoElemento(el);
    if (!textoPareceLegenda(texto)) return '';
    const repetidoNoFilho = Array.from(el.children || []).some(filho => textoDoElemento(filho) === texto);
    return repetidoNoFilho ? '' : texto;
  }

  function elementosDoSeletor(seletor) {
    try {
      return Array.from(document.querySelectorAll(seletor));
    } catch {
      return [];
    }
  }

  function legendaDoPrimeiroElemento(elementos, ignorar) {
    for (const el of elementos) {
      if (ignorar(el)) continue;
      const texto = textoLegendaDeElemento(el);
      if (texto) return legendaDe(texto, [el]);
    }
    return null;
  }

  function lerPorSeletores(seletores, ignorar = () => false) {
    for (const seletor of seletores) {
      const legenda = legendaDoPrimeiroElemento(elementosDoSeletor(seletor), ignorar);
      if (legenda) return legenda;
    }
    return null;
  }

  function elementoIgnoradoParaLegenda(el) {
    if (!el || raiz.Overlay.ehOHost(el)) return true;
    if (el.closest(ELEMENTOS_DE_INTERFACE)) return true;
    const style = window.getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0;
  }

  const PARTE_DE_CIMA_DO_VIDEO = 0.42;

  function cruzaOVideo(rect, rectVideo) {
    const foraNaVertical = rect.bottom < rectVideo.top || rect.top > rectVideo.bottom;
    const foraNaHorizontal = rect.right < rectVideo.left || rect.left > rectVideo.right;
    return !foraNaVertical && !foraNaHorizontal;
  }

  function estaNaMetadeDeBaixo(rect, rectVideo) {
    return rect.top >= rectVideo.top + rectVideo.height * PARTE_DE_CIMA_DO_VIDEO;
  }

  function valorDoCandidato(texto, rect, rectVideo) {
    const verticalScore = Math.max(0, rect.top - rectVideo.top);
    const compactScore = texto.length <= 90 ? 30 : 0;
    return verticalScore + compactScore + Math.min(80, (rect.width * rect.height) / 900);
  }

  function candidatoVisual(el, rectVideo, ignorar) {
    if (elementoIgnoradoParaLegenda(el) || ignorar(el)) return null;
    const texto = textoLegendaDeElemento(el);
    if (!texto) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    if (!cruzaOVideo(rect, rectVideo) || !estaNaMetadeDeBaixo(rect, rectVideo)) return null;
    return { texto, el, score: valorDoCandidato(texto, rect, rectVideo) };
  }

  function lerVisualmente(ignorar = () => false) {
    const video = obterVideoAtivo();
    if (!video) return null;
    const rectVideo = video.getBoundingClientRect();
    const candidatos = Array.from(document.querySelectorAll('span, div, p'))
      .map(el => candidatoVisual(el, rectVideo, ignorar))
      .filter(Boolean);
    candidatos.sort((a, b) => b.score - a.score);
    return candidatos[0] ? legendaDe(candidatos[0].texto, [candidatos[0].el]) : null;
  }

  const CONTEXTO_DO_PLAYER_DA_MAX = ['Title', 'SeasonEpisode', 'Subtitle', 'StyledVisiblyHiddenLabel']
    .flatMap(nome => [`[class^="${nome}-Fuse-"]`, `[class*=" ${nome}-Fuse-"]`])
    .join(',');
  const CUE_DA_MAX = '[class^="TextCue-Fuse-Web-Play"],[class*=" TextCue-Fuse-Web-Play"]';
  const SELETORES_DA_MAX = [
    '[data-testid*="caption" i]',
    '[data-testid*="subtitle" i]',
    '[data-testid*="timed" i]',
    '[data-testid*="cue" i]',
    '[class*="caption" i]',
    '[class*="subtitle" i]',
    '[class*="timedtext" i]',
    '[class*="texttrack" i]',
  ];
  const SELETORES_GENERICOS = [
    '[data-testid="caption_renderer_overlay"]',
    '[data-testid*="caption" i]',
    '[data-testid*="subtitle" i]',
    '[class*="caption" i]',
    '[class*="subtitle" i]',
    '.jw-text-track-cue',
    '.vjs-text-track-cue',
    '.caption-text',
  ];

  function ehContextoDoPlayerDaMax(el) {
    return Boolean(el.closest(CONTEXTO_DO_PLAYER_DA_MAX) || el.querySelector(CONTEXTO_DO_PLAYER_DA_MAX));
  }

  const cueDaMaxNaTela = el => !el.querySelector(CUE_DA_MAX)
    && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    && el.getClientRects().length > 0;

  function lerOsCuesDaMax() {
    const cues = Array.from(document.querySelectorAll(CUE_DA_MAX)).filter(cueDaMaxNaTela);
    const texto = normalizarTexto(cues.map(el => el.innerText).join(' '));
    return textoPareceLegenda(texto) ? legendaDe(texto, cues) : null;
  }

  function lerDaMax() {
    return lerOsCuesDaMax()
      || lerPorSeletores(SELETORES_DA_MAX, ehContextoDoPlayerDaMax)
      || lerVisualmente(ehContextoDoPlayerDaMax);
  }

  function lerDoYoutube() {
    const segmentos = Array.from(document.querySelectorAll('.ytp-caption-segment'));
    return segmentos.length ? legendaDe(segmentos.map(s => s.innerText).join(' '), segmentos) : SEGUE;
  }

  function lerDaNetflix() {
    const container = document.querySelector('.player-timedtext-text-container');
    return legendaDe(container?.innerText || '', [container]);
  }

  function lerDoKinopoisk() {
    const raizDaLegenda = document.querySelector('[data-tid="Subtitles"]');
    return raizDaLegenda ? legendaDe(raizDaLegenda.innerText.replace(/\s*\n\s*/g, ' ').trim(), [raizDaLegenda]) : SEGUE;
  }

  function lerEmQualquerSite() {
    const legenda = lerPorSeletores(SELETORES_GENERICOS);
    if (legenda) return legenda;
    const doKinopoisk = lerDoKinopoisk();
    return doKinopoisk === SEGUE ? lerVisualmente() : doKinopoisk;
  }

  function leitoresPorSite({ amazon }) {
    return [
      { sites: ['primevideo', 'amazon'], ler: amazon },
      { sites: ['youtube.com'], ler: lerDoYoutube },
      { sites: ['netflix.com'], ler: lerDaNetflix },
      { sites: ['kinopoisk'], ler: lerDoKinopoisk },
      { sites: ['hbomax.com', 'max.com', 'hbo.com'], ler: lerDaMax },
    ];
  }

  function criar({ amazon }) {
    const leitores = leitoresPorSite({ amazon });

    function lerLegenda() {
      if (!obterVideoAtivo()) return null;
      const host = window.location.hostname;
      for (const { sites, ler } of leitores) {
        if (!sites.some(site => host.includes(site))) continue;
        const legenda = ler();
        if (legenda !== SEGUE) return legenda;
      }
      return lerEmQualquerSite();
    }

    return Object.freeze({ lerLegenda });
  }

  raiz.LegendaDaPagina = Object.freeze({ criar, legendaDe, normalizarTexto, obterVideoAtivo, videoVisivel });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
