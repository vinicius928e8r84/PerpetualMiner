const { detectarIdioma, contarLetras, Atalhos, Overlay, textoDaVoz, IDIOMAS, MineracaoDoDia, Mineracao, ContextoDoSite, LegendaDaAmazon } = PerpetualMiner;

const AUTO_MINER_POLL_MS = 700;
const SUBTITLE_UI_TEXT = [
    'audio', 'áudio', 'caption', 'captions', 'configurações', 'detalhes',
    'episódio', 'episode', 'episodes', 'fullscreen', 'idioma', 'legenda',
    'legendas', 'next episode', 'pause', 'próximo episódio',
    'season', 'seasons', 'skip intro', 'skip recap', 'temporada',
    'temporadas', 'temporadas e episódios', 'subtitles',
    'аудио', 'воспроизвести', 'настройки', 'пауза', 'пропустить',
    'следующая серия', 'сезоны и серии', 'субтитры',
];

let _atalhos = { ...Atalhos.ATALHOS_PADRAO };
let _autoMinerState = null;
let _autoMinerLastText = '';
let _autoMinerLastSentText = '';
let _autoMinerStableSince = 0;
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
    meta: copia ? siglaDoIdioma(captura.idioma) : textoDaVoz('PAI-29.web'),
    lugar: captura.lugar,
  });
}

function siglaDoIdioma(idioma) {
  return codigoDoIdioma(idioma).toUpperCase();
}

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

function origemDaPagina() {
  return window.location.hostname.replace('www.', '').split('.')[0];
}

function codigoDoIdioma(idioma) {
  return idioma === IDIOMAS.RUSSO ? 'ru' : 'en';
}

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
        registrarAutoMinerEvento(response, normalizado);
        if (response.action === 'saved') mostrarNotificacaoAutoMiner(normalizado, idioma, response, lugarDaLegenda(legenda));
    });
}

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

function lerLegenda() {
    if (!obterVideoAtivo()) return null;
    const host = window.location.hostname;
    if (host.includes('primevideo') || host.includes('amazon')) return LegendaDaAmazon.ler();
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

function legendaDe(texto, elementos) {
    return texto ? { texto, elementos } : null;
}

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

function idiomaDoContador() {
    if (_idiomaDaLegenda) return _idiomaDaLegenda;
    const ligados = MineracaoDoDia.idiomasLigados(_autoMinerState);
    return ligados.length === 1 ? ligados[0] : null;
}

function registrarAutoMinerEvento(response, texto) {
    if (response?.action !== 'skip') return;
    atualizarAutoMinerBadge();
    console.debug('[PerpetualMiner Auto]', response.reason || response.evaluation?.reason || '', texto);
}

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
        meta: `${siglaDoIdioma(idioma)} ${n}/${limite}`,
        frase: texto,
        ...palavraDe(response.frase?.keywords?.length ? response.frase : { keywords: response.evaluation?.keywords }),
        lugar,
        apagada: true,
    });
}

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
    if (contarLetras(clean) < 2) return false;
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

function extrairContexto() {
    return ContextoDoSite.ler(window.location.hostname, document);
}
