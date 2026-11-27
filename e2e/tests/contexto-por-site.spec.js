'use strict';

const { test, expect, botaoFlutuante } = require('../fixtures');

const FALA_EM_INGLES = 'Nobody is watching the pool tonight.';
const FALA_EM_RUSSO = 'Никто не смотрит на бассейн сегодня.';

const pagina = ({ titulo, corpo }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${titulo}</title>
  <style>
    body { margin: 0; background: #111; font-family: sans-serif; color: #fff; }
    .player { position: relative; width: 640px; height: 360px; margin: 24px; }
    video { width: 640px; height: 360px; background: #000; display: block; }
    .fala { position: absolute; left: 0; right: 0; bottom: 36px; text-align: center; font-size: 22px; }
  </style>
</head>
<body>${corpo}</body>
</html>`;

const TITULO_DA_NETFLIX_DE_HOJE = '<h4>Stranger Things</h4><span>E1</span><span>Chapter One: The Vanishing of Will Byers</span>';

const player = (fala, { id } = {}) =>
  `<div class="player"${id ? ` id="${id}"` : ''}><video muted></video>${fala}</div>`;

const CASOS = [
  {
    nome: 'no YouTube, o título do player e o canal, pelo texto inteiro do elemento',
    url: 'https://www.youtube.com/watch?v=abc',
    titulo: 'Aba do vídeo - YouTube',
    corpo: player(`<span class="fala"><span class="ytp-caption-segment">${FALA_EM_INGLES}</span></span>`
      + '<a class="ytp-title-link">  Como nadar <span style="display: none">no inverno</span> </a>', { id: 'movie_player' })
      + '<div id="channel-name"><yt-formatted-string><a> Canal da Piscina </a></yt-formatted-string></div>',
    contexto: { fonte: 'youtube', titulo: 'Como nadar no inverno', detalhe: 'Canal da Piscina' },
  },
  {
    nome: 'no YouTube, o título da página de vídeo e o canal do dono, quando o player não tem título',
    url: 'https://www.youtube.com/watch?v=abc',
    titulo: 'Aba do vídeo - YouTube',
    corpo: player(`<span class="fala"><span class="ytp-caption-segment">${FALA_EM_INGLES}</span></span>`, { id: 'movie_player' })
      + '<h1 class="ytd-watch-metadata"><yt-formatted-string>Piscina aquecida</yt-formatted-string></h1>'
      + '<div class="ytd-video-owner-renderer"><div id="channel-name"><a>Canal do Dono</a></div></div>',
    contexto: { fonte: 'youtube', titulo: 'Piscina aquecida', detalhe: 'Canal do Dono' },
  },
  {
    nome: 'no YouTube, sem título na página, o da aba sem o “YouTube”, e o canal do terceiro lugar',
    url: 'https://www.youtube.com/watch?v=abc',
    titulo: 'Aula de natação – YouTube',
    corpo: player(`<span class="fala"><span class="ytp-caption-segment">${FALA_EM_INGLES}</span></span>`, { id: 'movie_player' })
      + '<ytd-channel-name><yt-formatted-string><a>Terceiro Canal</a></yt-formatted-string></ytd-channel-name>',
    contexto: { fonte: 'youtube', titulo: 'Aula de natação', detalhe: 'Terceiro Canal' },
  },
  {
    nome: 'na Netflix, o título do player e a temporada e o episódio por extenso',
    url: 'https://www.netflix.com/watch/1',
    titulo: 'Netflix',
    corpo: player(`<div class="fala player-timedtext-text-container">${FALA_EM_INGLES}</div>`
      + '<div class="video-title"><h4>Dark</h4><span class="logo">N</span><span>Temporada 1: Episódio 3</span></div>'),
    contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: 'S01E03' },
  },
  {
    nome: 'na Netflix, os campos do data-uia, e o episódio escrito como 2x05',
    url: 'https://www.netflix.com/watch/1',
    titulo: 'Netflix',
    corpo: player(`<div class="fala player-timedtext-text-container">${FALA_EM_INGLES}</div>`
      + '<div data-uia="video-title">Ozark</div><div data-uia="controls-episode-title">2x05</div>'),
    contexto: { fonte: 'netflix', titulo: 'Ozark', detalhe: 'S02E05' },
  },
  {
    nome: 'na Netflix de hoje, o título da série no título e o episódio no detalhe, do mesmo bloco do player',
    url: 'https://www.netflix.com/watch/1',
    titulo: 'Netflix',
    corpo: player(`<div class="fala player-timedtext-text-container">${FALA_EM_INGLES}</div>`
      + `<div data-uia="video-title">${TITULO_DA_NETFLIX_DE_HOJE}</div>`),
    contexto: { fonte: 'netflix', titulo: 'Stranger Things', detalhe: 'E1' },
  },
  {
    nome: 'na Netflix, sem campos, o título da aba sem o “Netflix” e nenhum episódio',
    url: 'https://www.netflix.com/watch/1',
    titulo: 'Round 6 | Netflix',
    corpo: player(`<div class="fala player-timedtext-text-container">${FALA_EM_INGLES}</div>`),
    contexto: { fonte: 'netflix', titulo: 'Round 6', detalhe: '' },
  },
  {
    nome: 'no Prime Video, o título e o episódio do player',
    url: 'https://www.primevideo.com/detail/1',
    titulo: 'Prime Video',
    corpo: player(`<div class="fala atvwebplayersdk-captions-text"><span>${FALA_EM_INGLES}</span></div>`
      + '<div class="atvwebplayersdk-title-text">The Boys</div><div class="atvwebplayersdk-subtitle-text">Season 4, Ep. 2</div>'),
    contexto: { fonte: 'primevideo', titulo: 'The Boys', detalhe: 'S04E02' },
  },
  {
    nome: 'na Amazon, sem campos, o título da aba sem o “Amazon”, como Prime Video',
    url: 'https://www.amazon.com/gp/video/detail/1',
    titulo: 'Fallout | Amazon',
    corpo: player(`<div class="fala atvwebplayersdk-captions-text"><span>${FALA_EM_INGLES}</span></div>`),
    contexto: { fonte: 'primevideo', titulo: 'Fallout', detalhe: '' },
  },
  {
    nome: 'na Max, o título e o nome curto do episódio, que fica como está',
    url: 'https://www.max.com/video/watch/1',
    titulo: 'Max',
    corpo: player(`<div class="fala TextCue-Fuse-Web-Play__sc-1-4 aBc">${FALA_EM_INGLES}</div>`
      + '<div data-testid="player-ux-asset-title">Shameless</div><div data-testid="player-ux-asset-sub-title">DNR</div>'),
    contexto: { fonte: 'max', titulo: 'Shameless', detalhe: 'DNR' },
  },
  {
    nome: 'na HBO Max, o título pela classe, sem o episódio de nome longo demais',
    url: 'https://play.hbomax.com/video/watch/1',
    titulo: 'HBO Max',
    corpo: player(`<div class="fala TextCue-Fuse-Web-Play__sc-1-4 aBc">${FALA_EM_INGLES}</div>`
      + '<div class="PlayerTitleName-x">Euphoria</div><div class="PlayerEpisodeTitle-x">Um nome de episódio comprido demais</div>'),
    contexto: { fonte: 'max', titulo: 'Euphoria', detalhe: '' },
  },
  {
    nome: 'na HBO, sem campos, o título da aba sem o “HBO Max”',
    url: 'https://www.hbo.com/video/1',
    titulo: 'The Wire | HBO Max',
    corpo: player(`<div class="fala TextCue-Fuse-Web-Play__sc-1-4 aBc">${FALA_EM_INGLES}</div>`),
    contexto: { fonte: 'max', titulo: 'The Wire', detalhe: '' },
  },
  {
    nome: 'no Disney+, o título e o episódio dos campos do player',
    url: 'https://www.disneyplus.com/video/1',
    titulo: 'Disney+',
    corpo: player(`<div class="fala" data-testid="caption_renderer_overlay">${FALA_EM_INGLES}</div>`
      + '<div data-testid="title">Andor</div><div data-testid="subtitle">T1:E4</div>'),
    contexto: { fonte: 'disneyplus', titulo: 'Andor', detalhe: 'S01E04' },
  },
  {
    nome: 'no Star+, sem campos, o título da aba sem o “Star+” e a Fonte Star+',
    url: 'https://www.starplus.com/video/1',
    titulo: 'Futurama | Star+',
    corpo: player(`<div class="fala" data-testid="caption_renderer_overlay">${FALA_EM_INGLES}</div>`),
    contexto: { fonte: 'starplus', titulo: 'Futurama', detalhe: '' },
  },
  {
    nome: 'no Kinopoisk, o título e o episódio em russo, que fica como está',
    url: 'https://hd.kinopoisk.ru/film/1',
    titulo: 'Кинопоиск',
    corpo: player(`<div class="fala" data-tid="Subtitles">${FALA_EM_RUSSO}</div>`
      + '<div data-tid="title">Брат</div><div data-tid="episodeTitle">Сезон 1, серия 2</div>'),
    contexto: { fonte: 'kinopoisk', titulo: 'Брат', detalhe: 'Сезон 1, серия 2' },
  },
  {
    nome: 'no Kinopoisk, sem campos, o título da aba sem o “Кинопоиск”',
    url: 'https://hd.kinopoisk.ru/film/1',
    titulo: 'Брат - Кинопоиск',
    corpo: player(`<div class="fala" data-tid="Subtitles">${FALA_EM_RUSSO}</div>`),
    contexto: { fonte: 'kinopoisk', titulo: 'Брат', detalhe: '' },
  },
  {
    nome: 'num site qualquer, a Fonte web com o título inteiro da aba',
    url: 'https://www.exemplo-de-player.com/aula/1',
    titulo: 'Aula 3 - Netflix de natação',
    corpo: player(`<div class="fala" data-testid="caption_renderer_overlay">${FALA_EM_INGLES}</div>`),
    contexto: { fonte: 'web', titulo: 'Aula 3 - Netflix de natação', detalhe: '' },
  },
];

for (const caso of CASOS) {
  test(`Alt+S guarda o contexto do site: ${caso.nome}`, async ({ page, extensao }) => {
    await page.route(`${new URL(caso.url).origin}/**`, route =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: pagina(caso) }));
    await page.goto(caso.url);
    await expect(botaoFlutuante(page)).toBeVisible();

    await page.keyboard.press('Alt+KeyS');

    await expect.poll(async () => (await extensao.frases()).map(f => f.contexto)).toEqual([caso.contexto]);
  });
}

test('o botão guarda o contexto da Netflix mesmo com os controles do player escondidos', async ({ page, extensao }) => {
  const url = 'https://www.netflix.com/watch/1';
  await page.route(`${new URL(url).origin}/**`, route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: pagina({
      titulo: 'Netflix',
      corpo: player(`<div class="fala player-timedtext-text-container">${FALA_EM_INGLES}</div>`),
    }),
  }));
  await page.goto(url);
  await expect(botaoFlutuante(page)).toBeVisible();

  await page.evaluate(html => {
    document.querySelector('.player').insertAdjacentHTML('beforeend', `<div data-uia="video-title">${html}</div>`);
  }, TITULO_DA_NETFLIX_DE_HOJE);
  await page.mouse.move(300, 200);
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.querySelector('[data-uia="video-title"]').remove());

  await botaoFlutuante(page).click();

  await expect.poll(async () => (await extensao.frases()).map(f => f.contexto))
    .toEqual([{ fonte: 'netflix', titulo: 'Stranger Things', detalhe: 'E1' }]);
});
