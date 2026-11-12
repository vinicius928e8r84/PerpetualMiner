// A base compartilhada (catálogo da Voz e detecção de idioma) é carregada antes
// deste arquivo, pelo manifest: a busca no catálogo é `PerpetualMiner.textoDaVoz`.
const { detectarIdioma, Atalhos, Overlay, textoDaVoz, IDIOMAS, MineracaoDoDia, Mineracao } = PerpetualMiner;

const AUTO_MINER_POLL_MS = 700;
const AUTO_MINER_LAST_EVENT_KEY = MineracaoDoDia.CHAVES.ultimoEvento;
const SUBTITLE_UI_TEXT = [
    'audio', 'áudio', 'caption', 'captions', 'configurações', 'detalhes',
    'episódio', 'episode', 'episodes', 'fullscreen', 'idioma', 'legenda',
    'legendas', 'next episode', 'pause', 'próximo episódio',
    'season', 'seasons', 'skip intro', 'skip recap', 'temporada',
    'temporadas', 'temporadas e episódios', 'subtitles',
    'аудио', 'воспроизвести', 'настройки', 'пауза', 'пропустить',
    'следующая серия', 'сезоны и серии', 'субтитры',
];

// “Minerar legenda” (padrão Alt+S) e “Minerar seleção” (padrão sem atalho), como
// estão gravados em Configurações › Atalhos (lib/atalhos.js). Um atalho novo vale
// na hora, sem recarregar a página.

let _atalhos = { ...Atalhos.ATALHOS_PADRAO };
let _autoMinerState = null;
let _autoMinerLastText = '';
let _autoMinerLastSentText = '';
let _autoMinerStableSince = 0;
let _autoMinerLastEvent = null;
/** O idioma da legenda na tela (ou da última captura), `'en'`/`'ru'`: o do contador do botão. */
let _idiomaDaLegenda = null;

Atalhos.acompanharAtalhos(atalhos => {
  _atalhos = atalhos;
  const tecla = Atalhos.rotuloDoAtalho(atalhos.legenda);
  Overlay.definirRotulo(tecla ? textoDaVoz('MIN-07.comAtalho', { atalho: tecla }) : textoDaVoz('MIN-07.semAtalho'),
    { nome: textoDaVoz('MIN-07.semAtalho'), tecla });
});

Overlay.aoClicar(evento => minerarLegenda(evento));

chrome.runtime.sendMessage({ type: 'AUTO_MINER_GET_STATE' }, response => {
  if (!chrome.runtime.lastError && response?.state) {
    _autoMinerState = response.state;
    atualizarAutoMinerBadge();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MineracaoDoDia.MENSAGEM_ESTADO_MUDOU) {
    _autoMinerState = message.state;
    atualizarAutoMinerBadge();
  }
});

// Mouse — fase de captura, para interceptar antes de o navegador navegar (voltar
// e avançar). O botão só é tomado quando há o que minerar: numa página sem
// legenda ou sem seleção, ele continua fazendo o que sempre fez.
document.addEventListener('mousedown', (e) => {
  if (Atalhos.correspondeAoAtalho(_atalhos.legenda, e) && lerLegenda()?.texto) {
    _tomarOBotao(e);
    minerarLegenda(e);
    return;
  }
  if (!Atalhos.correspondeAoAtalho(_atalhos.selecao, e)) return;

  const texto = window.getSelection()?.toString().trim();
  if (!texto) return;

  _tomarOBotao(e);
  _ativarCaptura(texto, e);
}, true);

// O botão é tomado inteiro: o `mousedown` e a soltura, que é quando voltar e
// avançar navegariam.
function _tomarOBotao(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  Atalhos.guardarSolturaDoBotao(e.button);
}

// Teclado — os dois atalhos deixam a digitação em paz: num campo de texto, a
// tecla é da pessoa, não da extensão. Sem nada selecionado numa página sem
// vídeo, não há o que minerar (MIN-10); com um vídeo, o atalho não diz nada.
document.addEventListener('keydown', (e) => {
  if (!Atalhos.correspondeAoAtalho(_atalhos.selecao, e)) return;
  if (Atalhos.digitandoNumCampo(e)) return;

  const texto = window.getSelection()?.toString().trim();
  if (!texto) {
    if (e.isTrusted) dizerSeNaoHaVideo();
    return;
  }

  e.preventDefault();
  _ativarCaptura(texto, e);
}, true);

// Só a pessoa minera: quem pede uma captura passa o evento que a disparou, e um
// evento sintético (disparado pela página) não conta.
function _ativarCaptura(texto, evento) {
  if (!evento?.isTrusted) return;
  minerarCaptura({
    texto,
    contexto: Mineracao.contextoDaSelecao({
      url: window.location.href,
      titulo: document.title,
      preservarTitulo: true,
    }),
    idioma: detectarIdioma(texto),
    lugar:  lugarDaSelecao(texto),
  });
}

// A pílula espera o service worker: só diz “minerada” depois que a frase foi
// gravada, e só diz “copiada” depois que o clipboard aceitou.

/**
 * Grava a captura (a legenda também vai para o clipboard) e diz na pílula só o
 * que aconteceu: MIN-01 gravou e copiou, MIN-02 gravou sem copiar, MIN-05 a
 * seleção gravada; MIN-03 se não gravou.
 */
async function minerarCaptura(captura, { copia = false } = {}) {
  const [copiou, resposta] = await Promise.all([copia && copiar(captura.texto), Mineracao.gravar(captura)]);
  if (!resposta?.ok) {
    mostrarFalha('MIN-03');
    return;
  }
  let titulo = textoDaVoz('MIN-05');
  if (copia) titulo = copiou ? textoDaVoz('MIN-01') : textoDaVoz('MIN-02');
  Overlay.mostrar({
    tipo: 'sucesso',
    icone: copia ? 'legenda' : 'selecao',
    titulo,
    frase: captura.texto,
    ...palavraDe(resposta.frase),
    // A meta: o idioma da legenda (`EN`); a Fonte da seleção, “Web” (PAI-29).
    meta: copia ? siglaDoIdioma(captura.idioma) : textoDaVoz('PAI-29.web'),
    // A marca vai sobre o texto se ele ainda estiver lá quando a resposta chega.
    lugar: captura.lugar,
  });
}

/** O idioma da captura como a pílula o mostra: `EN`, `RU`. */
function siglaDoIdioma(idioma) {
  return codigoDoIdioma(idioma).toUpperCase();
}

/** Uma falha na pílula, com o título e a dica do catálogo: MIN-03, e MIN-04/MIN-10 quando não há o que minerar. */
function mostrarFalha(id) {
  Overlay.mostrar({ tipo: 'erro', icone: 'alerta', titulo: textoDaVoz(`${id}.titulo`), dica: textoDaVoz(`${id}.dica`) });
}

/**
 * MIN-10, só quando nenhum frame da página tem vídeo: um player num iframe de
 * outra origem não aparece neste frame, então os outros são perguntados antes.
 */
async function dizerSeNaoHaVideo() {
  if (obterVideoAtivo() || await haVideoEmOutroFrame()) return;
  mostrarFalha('MIN-10');
}

/** Se algum outro frame da aba tem vídeo, perguntado pelo service worker (TEM_VIDEO_NESTE_FRAME). */
function haVideoEmOutroFrame() {
  if (window === window.top && window.frames.length === 0) return Promise.resolve(false);
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'HA_VIDEO_EM_OUTRO_FRAME' }, resposta => {
        resolve(!chrome.runtime.lastError && resposta?.temVideo === true);
      });
    } catch {
      resolve(false);
    }
  });
}

/** O site, como a Frase grava a origem de uma legenda (`netflix`, `youtube`…). */
function origemDaPagina() {
  return window.location.hostname.replace('www.', '').split('.')[0];
}

/** O código de idioma que o service worker usa na mineração automática. */
function codigoDoIdioma(idioma) {
  return idioma === IDIOMAS.RUSSO ? 'ru' : 'en';
}

/** O inverso de `codigoDoIdioma`: `'ru'` → Russo, o resto Inglês. */
function idiomaDoCodigo(lang) {
  return lang === 'ru' ? IDIOMAS.RUSSO : IDIOMAS.INGLES;
}

/**
 * Copia a frase e diz se deu certo. Num iframe sem permissão de clipboard, pede
 * ao frame de cima (pelo service worker) e espera a resposta dele.
 */
async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    if (window === window.top) return false;
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'COPIAR_NO_FRAME_DE_CIMA', texto }, resposta => {
          resolve(!chrome.runtime.lastError && resposta?.ok === true);
        });
      } catch {
        resolve(false);
      }
    });
  }
}

/**
 * A Palavra da frase gravada, como o overlay a mostra: as palavras do primeiro
 * grupo (`palavra@índice`, grupos separados por `|`) e se ela foi detectada
 * (`auto:`) ou escolhida (`palavra:`).
 */
function palavraDe(frase) {
  const palavras = [];
  for (const chave of frase?.keywords || []) {
    if (chave === '|') {
      if (palavras.length) break;
      continue;
    }
    if (chave) palavras.push(String(chave).split('@')[0]);
  }
  return { palavras, palavraDetectada: frase?.autoKeyword !== false };
}

// Nada passa por window.postMessage: a página divide a janela com o content
// script e vê as mensagens entre frames, então poderia forjá-las. Quando o
// clipboard falha num iframe, o pedido de cópia vai pelo service worker, que o
// entrega só ao frame de cima da mesma aba; a resposta diz se a cópia saiu.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'COPIAR_PARA_CLIPBOARD') return;
    if (sender.id !== chrome.runtime.id || window !== window.top) return;
    if (typeof message.texto !== 'string' || !message.texto.trim()) return;
    navigator.clipboard.writeText(message.texto)
        .then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
});

// O service worker pergunta, a pedido de outro frame, se este tem vídeo. Só quem
// tem um player visível responde (um vídeo de anúncio escondido não conta): sem
// resposta de nenhum frame, a página não tem vídeo.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'TEM_VIDEO_NESTE_FRAME' || sender.id !== chrome.runtime.id) return;
    const video = obterVideoAtivo();
    if (video && videoVisivel(video)) sendResponse({ temVideo: true });
});

document.addEventListener('keydown', function(event) {
    if (!Atalhos.correspondeAoAtalho(_atalhos.legenda, event)) return;
    if (Atalhos.digitandoNumCampo(event)) return;
    event.preventDefault();
    minerarLegenda(event);
});

setInterval(() => {
    const video = obterVideoAtivo();
    if (!video) return;
    const container = containerDoPlayer(video);
    if (!container) return;
    Overlay.mostrarBotao(container);
    atualizarAutoMinerBadge();
}, 1000);

setInterval(processarAutoMinerLegenda, AUTO_MINER_POLL_MS);

// O botão vive no container do player, como antes: em tela cheia, só o que está
// dentro do elemento em tela cheia aparece.
function containerDoPlayer(video) {
    if (window.location.hostname.includes('youtube.com')) {
        return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    }
    return video.parentElement;
}

function processarAutoMinerLegenda() {
    // Sem idioma ligado nada é lido.
    if (!MineracaoDoDia.idiomasLigados(_autoMinerState).length) return;
    const legenda = lerLegenda();
    const texto = legenda?.texto || '';
    acompanharIdiomaDaLegenda(texto);
    if (!autoMinerAtivoNaPagina(texto)) return;
    const normalizado = normalizarTextoAutoMiner(texto);
    if (!normalizado || normalizado === _autoMinerLastSentText) return;

    const agora = Date.now();
    if (normalizado !== _autoMinerLastText) {
        _autoMinerLastText = normalizado;
        _autoMinerStableSince = agora;
        return;
    }
    if (agora - _autoMinerStableSince < 650) return;

    _autoMinerLastSentText = normalizado;
    const contexto = extrairContexto();
    const idioma = detectarIdioma(normalizado);
    chrome.runtime.sendMessage({
        type: 'AUTO_MINER_CANDIDATE',
        texto: normalizado,
        origem: contexto?.fonte || origemDaPagina() || 'auto',
        contexto,
        lang: codigoDoIdioma(idioma),
    }, response => {
        if (chrome.runtime.lastError || !response) return;
        if (response.state) {
            _autoMinerState = response.state;
            atualizarAutoMinerBadge();
        }
        registrarAutoMinerEvento(response, normalizado, idioma);
        if (response.action === 'saved') mostrarNotificacaoAutoMiner(normalizado, idioma, response, lugarDaLegenda(legenda));
    });
}

/** O contador do botão segue o idioma da legenda na tela, lido a cada volta da mineração automática. */
function acompanharIdiomaDaLegenda(texto) {
    if (!texto) return;
    const lang = codigoDoIdioma(detectarIdioma(texto));
    if (lang === _idiomaDaLegenda) return;
    _idiomaDaLegenda = lang;
    atualizarAutoMinerBadge();
}

function autoMinerAtivoNaPagina(legenda = '') {
    if (!_autoMinerState?.settings) return false;
    const video = obterVideoAtivo();
    if (!video || video.paused || video.ended) return false;
    if (!legenda) return false;
    const lang = codigoDoIdioma(detectarIdioma(legenda));
    return MineracaoDoDia.podeMinerarAgora(_autoMinerState, lang);
}

/**
 * A legenda na tela e os elementos de onde ela foi lida (`{ texto, elementos }`),
 * ou null. Os elementos dão o lugar da marca: a linha e o grifo vão sobre eles.
 */
function lerLegenda() {
    // Sem vídeo, “caption” e “subtitle” são legendas de imagem, não de fala.
    if (!obterVideoAtivo()) return null;
    const host = window.location.hostname;
    if (host.includes('primevideo') || host.includes('amazon')) return minerarAmazon();
    if (host.includes('youtube.com')) {
        const segs = Array.from(document.querySelectorAll('.ytp-caption-segment'));
        if (segs.length) return legendaDe(segs.map(s => s.innerText).join(' '), segs);
    }
    if (host.includes('netflix.com')) {
        const container = document.querySelector('.player-timedtext-text-container');
        return legendaDe(container?.innerText || '', [container]);
    }
    if (host.includes('kinopoisk')) {
        const root = document.querySelector('[data-tid="Subtitles"]');
        if (root) return legendaDe(root.innerText.replace(/\s*\n\s*/g, ' ').trim(), [root]);
    }
    if (host.includes('hbomax.com') || host.includes('max.com') || host.includes('hbo.com')) {
        // Na Max, a leitura para aqui: o fallback genérico casaria o nome do episódio.
        return lerLegendaDaMax()
            || minerarLegendaPorSeletores([
                '[data-testid*="caption" i]',
                '[data-testid*="subtitle" i]',
                '[data-testid*="timed" i]',
                '[data-testid*="cue" i]',
                '[class*="caption" i]',
                '[class*="subtitle" i]',
                '[class*="timedtext" i]',
                '[class*="texttrack" i]',
            ], ehContextoDoPlayerDaMax)
            || minerarLegendaVisual(ehContextoDoPlayerDaMax);
    }
    const generic = minerarLegendaPorSeletores([
        '[data-testid="caption_renderer_overlay"]',
        '[data-testid*="caption" i]',
        '[data-testid*="subtitle" i]',
        '[class*="caption" i]',
        '[class*="subtitle" i]',
        '.jw-text-track-cue',
        '.vjs-text-track-cue',
        '.caption-text',
    ]);
    if (generic) return generic;
    const kp = document.querySelector('[data-tid="Subtitles"]');
    if (kp) return legendaDe(kp.innerText.replace(/\s*\n\s*/g, ' ').trim(), [kp]);
    return minerarLegendaVisual();
}

/** Uma legenda lida: o texto e os elementos dele, ou null sem texto. */
function legendaDe(texto, elementos) {
    return texto ? { texto, elementos } : null;
}

/**
 * Onde a legenda capturada está agora: uma faixa sobre os elementos dela, só
 * enquanto eles ainda dizem o mesmo texto. Trocou (ou saiu da tela), null — e o
 * feedback vai para a pílula. Isso também cobre o fallback heurístico: um
 * elemento cujo texto não bate com o salvo nunca ganha a linha.
 */
function lugarDaLegenda({ texto, elementos }) {
    const capturado = normalizarTextoAutoMiner(texto);
    return () => {
        if (!elementos.every(el => el?.isConnected)) return null;
        const agora = normalizarTextoAutoMiner(elementos.map(el => el.innerText).join(' '));
        if (agora !== capturado) return null;
        const faixa = document.createRange();
        faixa.setStartBefore(elementos[0]);
        faixa.setEndAfter(elementos[elementos.length - 1]);
        return faixa;
    };
}

/**
 * Onde a seleção capturada está: a faixa dela, enquanto ela ainda cobre o texto
 * minerado. Uma seleção num `<input>`/`<textarea>` não tem faixa no texto da
 * página (o texto está dentro do campo), então vai para a pílula.
 */
function lugarDaSelecao(texto) {
    const selecao = window.getSelection();
    if (!selecao?.rangeCount) return null;
    const faixa = selecao.getRangeAt(0).cloneRange();
    const capturado = normalizarTextoAutoMiner(texto);
    return () => (normalizarTextoAutoMiner(faixa.toString()) === capturado ? faixa : null);
}

function normalizarTextoAutoMiner(texto) {
    return String(texto || '').replace(/\s+/g, ' ').trim();
}

// O contador no canto do botão: o do idioma da captura (`n/limite`), não a soma
// do badge da toolbar. No limite, contorno; com a mineração automática
// desligada para esse idioma, some. O leitor de tela o ouve como MIN-11.
function atualizarAutoMinerBadge() {
    const lang = idiomaDoContador();
    const settings = lang && _autoMinerState?.settings?.[lang];
    if (!settings?.enabled) {
        Overlay.mostrarContador(null);
        return;
    }
    const n = MineracaoDoDia.contagemDeHoje(_autoMinerState, lang);
    const limite = settings.dailyLimit || 0;
    const noLimite = MineracaoDoDia.noLimiteDeHoje(_autoMinerState, lang);
    const idioma = idiomaDoCodigo(lang);
    Overlay.mostrarContador({
        texto: `${n}/${limite}`,
        noLimite,
        descricao: noLimite
            ? textoDaVoz('MIN-11.noLimite', { idioma })
            : textoDaVoz('MIN-11.contador', { idioma, n, limite }),
        etiqueta: noLimite
            ? textoDaVoz('MIN-11.etiquetaNoLimite')
            : textoDaVoz('MIN-11.etiqueta', { n, limite }),
    });
}

/**
 * O idioma do contador: o da legenda na tela (ou da última captura). Antes de
 * haver legenda, o único idioma ligado; com os dois ligados, nenhum ainda.
 */
function idiomaDoContador() {
    if (_idiomaDaLegenda) return _idiomaDaLegenda;
    const ligados = MineracaoDoDia.idiomasLigados(_autoMinerState);
    return ligados.length === 1 ? ligados[0] : null;
}

function registrarAutoMinerEvento(response, texto, idioma) {
    if (!response?.action) return;
    _autoMinerLastEvent = {
        action: response.action,
        reason: response.reason || response.evaluation?.reason || '',
        texto,
        idioma,
        at: Date.now(),
    };
    if (response.action === 'saved') _autoMinerLastEvent.reason = 'saved';
    chrome.storage.local.set({ [AUTO_MINER_LAST_EVENT_KEY]: _autoMinerLastEvent });
    if (response.action === 'skip') {
        atualizarAutoMinerBadge();
        console.debug('[PerpetualMiner Auto]', _autoMinerLastEvent.reason, texto);
    }
}

// MIN-06: a mesma marca, mais apagada, ou a pílula se a legenda já trocou. A
// mineração automática não tira da tela uma falha que acabou de aparecer.
function mostrarNotificacaoAutoMiner(texto, idioma, response, lugar) {
    if (!Overlay.temBotao() || Overlay.mostrandoFalha()) return;
    const lang = codigoDoIdioma(idioma);
    const state = response.state;
    const n = MineracaoDoDia.contagemDeHoje(state, lang);
    const limite = state?.settings?.[lang]?.dailyLimit || 0;
    Overlay.mostrar({
        tipo: 'sucesso',
        icone: 'automatica',
        titulo: textoDaVoz('MIN-06'),
        // A meta, como no protótipo: o idioma e o contador do dia (`RU 5/20`).
        meta: `${siglaDoIdioma(idioma)} ${n}/${limite}`,
        frase: texto,
        // A Palavra gravada com a frase; o russo é gravado sem ela, e então vale o
        // item novo (i+1) que fez a mineração automática aceitar a frase.
        ...palavraDe(response.frase?.keywords?.length ? response.frase : { keywords: response.evaluation?.keywords }),
        lugar,
        apagada: true,
    });
}

// Como em _ativarCaptura: só um evento da pessoa minera a legenda. Sem vídeo na
// página não há legenda (MIN-10), por mais que um texto pareça uma.
function minerarLegenda(evento) {
    if (!evento?.isTrusted) return;
    if (!obterVideoAtivo()) {
        dizerSeNaoHaVideo();
        return;
    }
    const legenda = lerLegenda();
    const texto = legenda?.texto;
    if (!texto || texto.length <= 2) {
        mostrarFalha('MIN-04');
        return;
    }
    const idioma = detectarIdioma(texto);
    _idiomaDaLegenda = codigoDoIdioma(idioma);
    minerarCaptura({
        texto,
        origem:   origemDaPagina(),
        contexto: extrairContexto(),
        idioma,
        lugar:    lugarDaLegenda(legenda),
    }, { copia: true });
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

/** Um vídeo do tamanho de um player, dentro da janela (não um de anúncio escondido ou de 1 px). */
function videoVisivel(video) {
    const rect = video.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 80 && rect.bottom > 0 && rect.right > 0
        && rect.top < window.innerHeight && rect.left < window.innerWidth;
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

// O player da Max escreve o título, a temporada/episódio e o nome do episódio em
// `Title-`, `SeasonEpisode-` e `Subtitle-Fuse-Web-Play…`: o “Subtitle” ali é o
// subtítulo do título, não a legenda do vídeo. O rótulo oculto repete a fala
// só para leitor de tela. O prefixo fica e o hash de styled-components muda, então
// a classe casa no começo de um token (`EpisodeTitle-Fuse-…` não é `Title-Fuse-…`).
const CONTEXTO_DO_PLAYER_DA_MAX = ['Title', 'SeasonEpisode', 'Subtitle', 'StyledVisiblyHiddenLabel']
    .flatMap(nome => [`[class^="${nome}-Fuse-"]`, `[class*=" ${nome}-Fuse-"]`])
    .join(',');
const CUE_DA_MAX = '[class^="TextCue-Fuse-Web-Play"],[class*=" TextCue-Fuse-Web-Play"]';

/** Um elemento do bloco de contexto do player da Max, ou que carrega um. */
function ehContextoDoPlayerDaMax(el) {
    return Boolean(el.closest(CONTEXTO_DO_PLAYER_DA_MAX) || el.querySelector(CONTEXTO_DO_PLAYER_DA_MAX));
}

/**
 * A fala que a Max mostra agora: os `TextCue-Fuse-Web-Play…` na tela, ou null.
 * Um cue sob um ancestral escondido (faixa antiga, legenda desligada) não conta;
 * um cue que embrulha outro cue fica de fora, para a fala não vir duas vezes, e
 * as linhas irmãs de uma fala de duas linhas se juntam.
 */
function lerLegendaDaMax() {
    const cues = Array.from(document.querySelectorAll(CUE_DA_MAX)).filter(el =>
        !el.querySelector(CUE_DA_MAX)
        && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        && el.getClientRects().length > 0);
    const texto = normalizarTextoAutoMiner(cues.map(el => el.innerText).join(' '));
    return textoPareceLegenda(texto) ? legendaDe(texto, cues) : null;
}

function minerarLegendaVisual(ignorar = () => false) {
    const video = obterVideoAtivo();
    if (!video) return null;
    const rectVideo = video.getBoundingClientRect();
    const candidatos = [];

    for (const el of document.querySelectorAll('span, div, p')) {
        if (elementoIgnoradoParaLegenda(el) || ignorar(el)) continue;
        const texto = textoLegendaDeElemento(el);
        if (!texto) continue;

        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.bottom < rectVideo.top || rect.top > rectVideo.bottom) continue;
        if (rect.right < rectVideo.left || rect.left > rectVideo.right) continue;
        if (rect.top < rectVideo.top + rectVideo.height * 0.42) continue;

        const area = rect.width * rect.height;
        const verticalScore = Math.max(0, rect.top - rectVideo.top);
        const compactScore = texto.length <= 90 ? 30 : 0;
        candidatos.push({ texto, el, score: verticalScore + compactScore + Math.min(80, area / 900) });
    }

    candidatos.sort((a, b) => b.score - a.score);
    return candidatos[0] ? legendaDe(candidatos[0].texto, [candidatos[0].el]) : null;
}

function textoLegendaDeElemento(el) {
    const texto = normalizarTextoAutoMiner(el?.innerText || el?.textContent || '');
    if (!textoPareceLegenda(texto)) return '';
    const childSameText = Array.from(el.children || []).some(child =>
        normalizarTextoAutoMiner(child.innerText || child.textContent || '') === texto
    );
    return childSameText ? '' : texto;
}

function textoPareceLegenda(texto) {
    const clean = normalizarTextoAutoMiner(texto);
    if (!clean || clean.length < 2 || clean.length > 220) return false;
    if (/^[\d\s:.,!?()[\]{}'"-]+$/.test(clean)) return false;
    if ((clean.match(/[A-Za-z\u0400-\u04FF]/g) || []).length < 2) return false;
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(clean)) return false;
    const lower = clean.toLowerCase();
    if (SUBTITLE_UI_TEXT.some(part => lower === part)) return false;
    if (/\b(skip intro|skip recap|next episode|pr[oó]ximo epis[oó]dio)\b/i.test(clean)) return false;
    return true;
}

function elementoIgnoradoParaLegenda(el) {
    if (!el || Overlay.ehOHost(el)) return true;
    if (el.closest('button,a,input,textarea,select,[role="button"],[contenteditable="true"]')) return true;
    const style = window.getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0;
}

function minerarAmazon() {
    const alvosDiretos = ['.atvwebplayersdk-captions-text span', '.atvwebplayersdk-subtitle-text-container'];
    for (const seletor of alvosDiretos) {
        const elementos = Array.from(document.querySelectorAll(seletor));
        if (elementos.length > 0) {
            const txt = elementos.map(s => s.innerText).join(' ').trim();
            if (txt && txt.length < 250 && !/^[ \d\s:/]+$/.test(txt)) return legendaDe(txt, elementos);
        }
    }

    const video = document.querySelector('video');
    if (!video) return null;
    const rectVideo         = video.getBoundingClientRect();
    const meioDaTela        = rectVideo.top + rectVideo.height * 0.5;
    const limiteEsquerdoXray = rectVideo.left + rectVideo.width * 0.25;
    const lixoInterface     = ['temporada','ep.','season','pular','skip','next','próximo',
        'prime video','termos','política','privacidade','cookies','mais','saiba','info',
        'detalhes','português','english','idioma','legenda','configurações','audio',
        'coreano','korean'];

    let melhorCandidato = null;
    for (const el of document.querySelectorAll('span, div')) {
        const txt = el.innerText?.trim();
        if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(txt)) continue;
        if (!txt || txt.length < 4 || txt.length > 200) continue;
        if (/^[ \d\s:/]+$/.test(txt)) continue;
        const rectEl = el.getBoundingClientRect();
        if (rectEl.top < meioDaTela)       continue;
        if (rectEl.left < limiteEsquerdoXray) continue;
        const baixo = txt.toLowerCase();
        if (lixoInterface.some(p => baixo === p || baixo.includes(p))) continue;
        if (el.closest('.dv-ui-web-player-container')) continue;
        melhorCandidato = legendaDe(txt, [el]);
    }
    return melhorCandidato;
}

function extrairContexto() {
    const host = window.location.hostname;

    if (host.includes('youtube.com')) {
        const titulo = (
            document.querySelector('.ytp-title-link')?.textContent ||
            document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent ||
            document.title.replace(/\s*[-–|]?\s*YouTube\s*$/i, '')
        ).trim();

        const canal = (
            document.querySelector('#channel-name yt-formatted-string a')?.textContent ||
            document.querySelector('.ytd-video-owner-renderer #channel-name a')?.textContent ||
            document.querySelector('ytd-channel-name yt-formatted-string a')?.textContent ||
            ''
        ).trim();

        return { fonte: 'youtube', titulo, detalhe: canal };
    }

    if (host.includes('netflix.com')) {
        const titulo = (
            document.querySelector('.video-title h4')?.innerText ||
            document.querySelector('[data-uia="video-title"]')?.innerText ||
            document.title.replace(/\s*[-–|]?\s*Netflix\s*$/i, '')
        ).trim();

        const epRaw = (
            document.querySelector('.video-title span:not(.logo)')?.innerText ||
            document.querySelector('[data-uia="controls-episode-title"]')?.innerText ||
            ''
        ).trim();

        return { fonte: 'netflix', titulo, detalhe: formatarEpisodio(epRaw) };
    }

    if (host.includes('primevideo') || host.includes('amazon')) {
        const titulo = (
            document.querySelector('.atvwebplayersdk-title-text')?.innerText ||
            document.title.replace(/\s*[-–|]?\s*(Prime Video|Amazon)\s*$/i, '')
        ).trim();

        const epRaw = (
            document.querySelector('.atvwebplayersdk-subtitle-text')?.innerText || ''
        ).trim();

        return { fonte: 'primevideo', titulo, detalhe: formatarEpisodio(epRaw) };
    }

    if (host.includes('hbomax.com') || host.includes('max.com') || host.includes('hbo.com')) {
        const titulo = (
            document.querySelector('[class*="TitleName"],[class*="titleName"],[data-testid="player-ux-asset-title"]')?.innerText ||
            document.title.replace(/\s*[-–|]?\s*(HBO|Max|HBO Max)\s*$/i, '')
        ).trim();

        const epRaw = (
            document.querySelector('[class*="EpisodeTitle"],[class*="episodeTitle"],[data-testid="player-ux-asset-sub-title"]')?.innerText ||
            ''
        ).trim();

        return { fonte: 'max', titulo, detalhe: formatarEpisodio(epRaw) };
    }

    if (host.includes('disneyplus.com') || host.includes('starplus.com')) {
        const titulo = (
            document.querySelector('[class*="title-field"],[data-testid="title"]')?.innerText ||
            document.title.replace(/\s*[-–|]?\s*(Disney\+|Star\+)\s*$/i, '')
        ).trim();

        const epRaw = (
            document.querySelector('[class*="subtitle-field"],[data-testid="subtitle"]')?.innerText || ''
        ).trim();

        const fonte = host.includes('star') ? 'starplus' : 'disneyplus';
        return { fonte, titulo, detalhe: formatarEpisodio(epRaw) };
    }

    if (host.includes('kinopoisk')) {
        const titulo = (
            document.querySelector('[data-tid="title"], [class*="title"] [class*="text"]')?.innerText ||
            document.title.replace(/\s*[-–|]?\s*(Кинопоиск|Kinopoisk|КиноПоиск)\s*$/i, '')
        ).trim();

        const epRaw = (
            document.querySelector('[data-tid="episodeTitle"], [class*="episode"]')?.innerText || ''
        ).trim();

        return { fonte: 'kinopoisk', titulo, detalhe: formatarEpisodio(epRaw) };
    }

    return { fonte: 'web', titulo: document.title.trim(), detalhe: '' };
}

// Converte texto de episódio para S##E## ou retorna o texto curto como está
function formatarEpisodio(texto) {
    if (!texto) return '';
    const m = texto.match(
        /(?:S|Season|Temporada|T)\s*(\d{1,2})\s*[:\-,\s]\s*(?:E|Ep\.?\s*|Epis[oó]dio\s*)(\d{1,2})/i
    ) || texto.match(/(\d{1,2})[xX](\d{1,2})/);
    if (m) return `S${String(m[1]).padStart(2, '0')}E${String(m[2]).padStart(2, '0')}`;
    // Já está no formato correto?
    if (/^S\d{2}E\d{2}$/i.test(texto)) return texto.toUpperCase();
    return texto.length <= 25 ? texto : '';
}
