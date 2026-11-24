'use strict';

(function (raiz) {
  const { contarLetras, Overlay } = raiz;

  const TEXTOS_DE_INTERFACE = [
    'audio', 'áudio', 'caption', 'captions', 'configurações', 'detalhes',
    'episódio', 'episode', 'episodes', 'fullscreen', 'idioma', 'legenda',
    'legendas', 'next episode', 'pause', 'próximo episódio',
    'season', 'seasons', 'skip intro', 'skip recap', 'temporada',
    'temporadas', 'temporadas e episódios', 'subtitles',
    'аудио', 'воспроизвести', 'настройки', 'пауза', 'пропустить',
    'следующая серия', 'сезоны и серии', 'субтитры',
  ];

  const SELETORES_DA_PAGINA_SEM_SITE = [
    '[data-testid="caption_renderer_overlay"]',
    '[data-testid*="caption" i]',
    '[data-testid*="subtitle" i]',
    '[class*="caption" i]',
    '[class*="subtitle" i]',
    '.jw-text-track-cue',
    '.vjs-text-track-cue',
    '.caption-text',
  ];

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

  const SELETOR_DA_LEGENDA_DO_KINOPOISK = '[data-tid="Subtitles"]';

  const CONTEXTO_DO_PLAYER_DA_MAX = ['Title', 'SeasonEpisode', 'Subtitle', 'StyledVisiblyHiddenLabel']
    .flatMap(nome => [`[class^="${nome}-Fuse-"]`, `[class*=" ${nome}-Fuse-"]`])
    .join(',');
  const CUE_DA_MAX = '[class^="TextCue-Fuse-Web-Play"],[class*=" TextCue-Fuse-Web-Play"]';

  const CARACTERES_DE_OUTRA_ESCRITA = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
  const PEDIDO_DA_PLATAFORMA = /\b(skip intro|skip recap|next episode|pr[oó]ximo epis[oó]dio)\b/i;
  const SO_NUMEROS_E_PONTUACAO = /^[\d\s:.,!?()[\]{}'"-]+$/;
  const FRACAO_DE_CIMA_DO_VIDEO_SEM_LEGENDA = 0.42;

  function normalizarTexto(texto) {
    return String(texto || '').replace(/\s+/g, ' ').trim();
  }

  function legendaDe(texto, elementos) {
    return texto ? { texto, elementos } : null;
  }

  function lugarDaLegenda({ texto, elementos }) {
    const capturado = normalizarTexto(texto);
    return () => {
      if (!elementos.every(el => el?.isConnected)) return null;
      const agora = normalizarTexto(elementos.map(el => el.innerText).join(' '));
      if (agora !== capturado) return null;
      const faixa = document.createRange();
      faixa.setStartBefore(elementos[0]);
      faixa.setEndAfter(elementos[elementos.length - 1]);
      return faixa;
    };
  }

  function videoVisivel(video) {
    const rect = video.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 80 && rect.bottom > 0 && rect.right > 0
      && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function obterVideoAtivo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    const ranked = videos.map(video => {
      const rect = video.getBoundingClientRect();
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return { video, area, visible: videoVisivel(video), playing: !video.paused && !video.ended };
    });
    ranked.sort((a, b) => Number(b.visible) - Number(a.visible)
      || Number(b.playing) - Number(a.playing)
      || b.area - a.area);
    return ranked[0]?.video || videos[0] || null;
  }

  const temSoNumerosOuPontuacao = texto => SO_NUMEROS_E_PONTUACAO.test(texto);
  const eTextoDeInterface = texto => TEXTOS_DE_INTERFACE.some(parte => texto.toLowerCase() === parte) || PEDIDO_DA_PLATAFORMA.test(texto);
  const temTamanhoDeLegenda = texto => texto.length >= 2 && texto.length <= 220;

  function textoPareceLegenda(texto) {
    const limpo = normalizarTexto(texto);
    if (!temTamanhoDeLegenda(limpo) || temSoNumerosOuPontuacao(limpo)) return false;
    if (contarLetras(limpo) < 2 || CARACTERES_DE_OUTRA_ESCRITA.test(limpo)) return false;
    return !eTextoDeInterface(limpo);
  }

  const textoDoElemento = el => normalizarTexto(el?.innerText || el?.textContent || '');

  function textoLegendaDeElemento(el) {
    const texto = textoDoElemento(el);
    if (!textoPareceLegenda(texto)) return '';
    const filhoComOMesmoTexto = Array.from(el.children || []).some(filho => textoDoElemento(filho) === texto);
    return filhoComOMesmoTexto ? '' : texto;
  }

  function elementoIgnoradoParaLegenda(el) {
    if (!el || Overlay.ehOHost(el)) return true;
    if (el.closest('button,a,input,textarea,select,[role="button"],[contenteditable="true"]')) return true;
    const style = window.getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0;
  }

  function minerarLegendaPorSeletores(selectors, ignorar = () => false) {
    for (const selector of selectors) {
      let elementos = [];
      try {
        elementos = Array.from(document.querySelectorAll(selector));
      } catch {
        continue;
      }
      for (const el of elementos) {
        if (ignorar(el)) continue;
        const texto = textoLegendaDeElemento(el);
        if (texto) return legendaDe(texto, [el]);
      }
    }
    return null;
  }

  const temTamanho = rect => Boolean(rect.width && rect.height);
  const estaSobreOVideo = (rect, rectVideo) => rect.bottom >= rectVideo.top && rect.top <= rectVideo.bottom && rect.right >= rectVideo.left && rect.left <= rectVideo.right;
  const estaNaMetadeDeBaixo = (rect, rectVideo) => rect.top >= rectVideo.top + rectVideo.height * FRACAO_DE_CIMA_DO_VIDEO_SEM_LEGENDA;
  const estaNaFaixaDaLegenda = (rect, rectVideo) => temTamanho(rect) && estaSobreOVideo(rect, rectVideo) && estaNaMetadeDeBaixo(rect, rectVideo);

  function valorDoCandidato(texto, rect, rectVideo) {
    const distanciaDoTopo = Math.max(0, rect.top - rectVideo.top);
    const bonusDeTextoCurto = texto.length <= 90 ? 30 : 0;
    return distanciaDoTopo + bonusDeTextoCurto + Math.min(80, (rect.width * rect.height) / 900);
  }

  function candidatoVisual(el, rectVideo, ignorar) {
    if (elementoIgnoradoParaLegenda(el) || ignorar(el)) return null;
    const texto = textoLegendaDeElemento(el);
    if (!texto) return null;
    const rect = el.getBoundingClientRect();
    return estaNaFaixaDaLegenda(rect, rectVideo) ? { texto, el, score: valorDoCandidato(texto, rect, rectVideo) } : null;
  }

  function minerarLegendaVisual(ignorar = () => false) {
    const video = obterVideoAtivo();
    if (!video) return null;
    const rectVideo = video.getBoundingClientRect();
    const candidatos = Array.from(document.querySelectorAll('span, div, p'))
      .map(el => candidatoVisual(el, rectVideo, ignorar))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return candidatos[0] ? legendaDe(candidatos[0].texto, [candidatos[0].el]) : null;
  }

  function ehContextoDoPlayerDaMax(el) {
    return Boolean(el.closest(CONTEXTO_DO_PLAYER_DA_MAX) || el.querySelector(CONTEXTO_DO_PLAYER_DA_MAX));
  }

  const estaAEsconder = el => !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || el.getClientRects().length === 0;

  function lerLegendaDaMax() {
    const cues = Array.from(document.querySelectorAll(CUE_DA_MAX)).filter(el => !el.querySelector(CUE_DA_MAX) && !estaAEsconder(el));
    const texto = normalizarTexto(cues.map(el => el.innerText).join(' '));
    return textoPareceLegenda(texto) ? legendaDe(texto, cues) : null;
  }

  const textoEmUmaLinha = el => el.innerText.replace(/\s*\n\s*/g, ' ').trim();

  function lerDoYouTube() {
    const segmentos = Array.from(document.querySelectorAll('.ytp-caption-segment'));
    return segmentos.length ? legendaDe(segmentos.map(s => s.innerText).join(' '), segmentos) : undefined;
  }

  function lerDaNetflix() {
    const container = document.querySelector('.player-timedtext-text-container');
    return legendaDe(container?.innerText || '', [container]);
  }

  function lerDoKinopoisk() {
    const legenda = document.querySelector(SELETOR_DA_LEGENDA_DO_KINOPOISK);
    return legenda ? legendaDe(textoEmUmaLinha(legenda), [legenda]) : undefined;
  }

  function lerDaMax() {
    return lerLegendaDaMax()
      || minerarLegendaPorSeletores(SELETORES_DA_MAX, ehContextoDoPlayerDaMax)
      || minerarLegendaVisual(ehContextoDoPlayerDaMax);
  }

  const LEITORES_POR_SITE = [
    { hosts: ['primevideo', 'amazon'], ler: leitores => leitores.amazon() },
    { hosts: ['youtube.com'], ler: lerDoYouTube },
    { hosts: ['netflix.com'], ler: lerDaNetflix },
    { hosts: ['kinopoisk'], ler: lerDoKinopoisk },
    { hosts: ['hbomax.com', 'max.com', 'hbo.com'], ler: lerDaMax },
  ];

  function lerDeQualquerSite() {
    const porSeletores = minerarLegendaPorSeletores(SELETORES_DA_PAGINA_SEM_SITE);
    if (porSeletores) return porSeletores;
    const doKinopoisk = lerDoKinopoisk();
    return doKinopoisk === undefined ? minerarLegendaVisual() : doKinopoisk;
  }

  function lerLegenda(leitores) {
    if (!obterVideoAtivo()) return null;
    const host = window.location.hostname;
    const doSite = LEITORES_POR_SITE.find(({ hosts }) => hosts.some(parte => host.includes(parte)));
    const lida = doSite?.ler(leitores);
    return lida === undefined ? lerDeQualquerSite() : lida;
  }

  raiz.LegendaDaPagina = Object.freeze({ lerLegenda, legendaDe, lugarDaLegenda, obterVideoAtivo, videoVisivel, normalizarTexto });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
