'use strict';

(function (raiz) {
  const SITES = [
    {
      fonte: 'youtube',
      hosts: ['youtube.com'],
      campoDoTexto: 'textContent',
      titulo: ['.ytp-title-link', 'h1.ytd-watch-metadata yt-formatted-string'],
      sufixoDaAba: /\s*[-–|]?\s*YouTube\s*$/i,
      canal: [
        '#channel-name yt-formatted-string a',
        '.ytd-video-owner-renderer #channel-name a',
        'ytd-channel-name yt-formatted-string a',
      ],
    },
    {
      fonte: 'netflix',
      hosts: ['netflix.com'],
      lembrarOUltimo: true,
      titulo: ['.video-title h4', '[data-uia="video-title"] h4', '[data-uia="video-title"]'],
      sufixoDaAba: /\s*[-–|]?\s*Netflix\s*$/i,
      episodio: ['.video-title span:not(.logo)', '[data-uia="video-title"] span', '[data-uia="controls-episode-title"]'],
    },
    {
      fonte: 'primevideo',
      hosts: ['primevideo', 'amazon'],
      lembrarOUltimo: true,
      titulo: ['.atvwebplayersdk-title-text'],
      prefixoDaAba: /^(Prime Video|Amazon)\s*[:\-–|]\s*/i,
      sufixoDaAba: /\s*[-–|]?\s*(Prime Video|Amazon)\s*$/i,
      episodio: ['.atvwebplayersdk-subtitle-text', '.atvwebplayersdk-episode-info'],
    },
    {
      fonte: 'max',
      hosts: ['hbomax.com', 'max.com', 'hbo.com'],
      titulo: ['[class*="TitleName"],[class*="titleName"],[data-testid="player-ux-asset-title"]'],
      sufixoDaAba: /\s*[-–|]?\s*(HBO|Max|HBO Max)\s*$/i,
      episodio: ['[class*="EpisodeTitle"],[class*="episodeTitle"],[data-testid="player-ux-asset-sub-title"]'],
    },
    {
      fonte: 'disneyplus',
      outraFonte: { quandoOHostTem: 'star', fonte: 'starplus' },
      hosts: ['disneyplus.com', 'starplus.com'],
      titulo: ['[class*="title-field"],[data-testid="title"]'],
      sufixoDaAba: /\s*[-–|]?\s*(Disney\+|Star\+)\s*$/i,
      episodio: ['[class*="subtitle-field"],[data-testid="subtitle"]'],
    },
    {
      fonte: 'kinopoisk',
      hosts: ['kinopoisk'],
      titulo: ['[data-tid="title"], [class*="title"] [class*="text"]'],
      sufixoDaAba: /\s*[-–|]?\s*(Кинопоиск|Kinopoisk|КиноПоиск)\s*$/i,
      episodio: ['[data-tid="episodeTitle"], [class*="episode"]'],
    },
  ];

  function siteDoHost(host) {
    return SITES.find(site => site.hosts.some(trecho => host.includes(trecho)));
  }

  function textoDoPrimeiro(documento, seletores, campo) {
    for (const seletor of seletores) {
      const texto = documento.querySelector(seletor)?.[campo];
      if (texto) return texto;
    }
    return '';
  }

  function fonteDe(site, host) {
    const outra = site.outraFonte;
    return outra && host.includes(outra.quandoOHostTem) ? outra.fonte : site.fonte;
  }

  function tituloDe(site, documento, campo) {
    const daAba = documento.title.replace(site.prefixoDaAba || '', '').replace(site.sufixoDaAba, '');
    return (textoDoPrimeiro(documento, site.titulo, campo) || daAba).trim();
  }

  function detalheDe(site, documento, campo) {
    if (site.canal) return textoDoPrimeiro(documento, site.canal, campo).trim();
    return formatarEpisodio(textoDoPrimeiro(documento, site.episodio, campo).trim());
  }

  function formatarEpisodio(texto) {
    if (!texto) return '';
    const m = texto.match(
      /(?:S|Season|Temporada|T)\s*(\d{1,2})\s*[:\-,\s]\s*(?:E|Ep\.?\s*|Epis[oó]dio\s*)(\d{1,2})/i
    ) || texto.match(/(\d{1,2})[xX](\d{1,2})/);
    if (m) return `S${String(m[1]).padStart(2, '0')}E${String(m[2]).padStart(2, '0')}`;
    if (/^S\d{2}E\d{2}$/i.test(texto)) return texto.toUpperCase();
    return texto.length <= 25 ? texto : '';
  }

  let ultimoContextoDosCampos = null;

  function lerDosCampos(site, host, documento, campo) {
    return { fonte: fonteDe(site, host), titulo: tituloDe(site, documento, campo), detalhe: detalheDe(site, documento, campo) };
  }

  function lerLembrandoOUltimo(site, host, documento, campo) {
    const endereco = host + (documento.location?.pathname || '');
    const temTituloNosCampos = Boolean(textoDoPrimeiro(documento, site.titulo, campo).trim());
    if (!temTituloNosCampos && ultimoContextoDosCampos?.endereco === endereco) return { ...ultimoContextoDosCampos.contexto };
    const contexto = lerDosCampos(site, host, documento, campo);
    if (temTituloNosCampos) ultimoContextoDosCampos = { endereco, contexto: { ...contexto } };
    return contexto;
  }

  function ler(host, documento) {
    const site = siteDoHost(host);
    if (!site) return { fonte: 'web', titulo: documento.title.trim(), detalhe: '' };
    const campo = site.campoDoTexto || 'innerText';
    return (site.lembrarOUltimo ? lerLembrandoOUltimo : lerDosCampos)(site, host, documento, campo);
  }

  function lembraOUltimo(host) {
    return Boolean(siteDoHost(host)?.lembrarOUltimo);
  }

  raiz.ContextoDoSite = { ler, lembraOUltimo };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
