// content.js

// A base compartilhada (catálogo da Voz e detecção de idioma) é carregada antes
// deste arquivo, pelo manifest: a busca no catálogo é `PerpetualMiner.textoDaVoz`.
const { detectarIdioma, Atalhos, Overlay, textoDaVoz, IDIOMAS } = PerpetualMiner;

const AUTO_MINER_POLL_MS = 700;
const AUTO_MINER_LAST_EVENT_KEY = 'pm_auto_miner_last_event';
const SUBTITLE_UI_TEXT = [
    'audio', 'áudio', 'caption', 'captions', 'configurações', 'detalhes',
    'episódio', 'episode', 'episodes', 'fullscreen', 'idioma', 'legenda',
    'legendas', 'next episode', 'pause', 'próximo episódio',
    'season', 'seasons', 'skip intro', 'skip recap', 'temporada',
    'temporadas', 'temporadas e episódios', 'subtitles',
    'аудио', 'воспроизвести', 'настройки', 'пауза', 'пропустить',
    'следующая серия', 'сезоны и серии', 'субтитры',
];

// ─── Atalhos gravados ────────────────────────────────────────────────────────
// “Minerar legenda” (padrão Alt+S) e “Minerar seleção” (padrão sem atalho), como
// estão gravados em Configurações › Atalhos (lib/atalhos.js). Um atalho novo vale
// na hora, sem recarregar a página.

let _atalhos = { ...Atalhos.ATALHOS_PADRAO };
let _autoMinerState = null;
let _autoMinerLastText = '';
let _autoMinerLastSentText = '';
let _autoMinerStableSince = 0;
let _autoMinerLastEvent = null;

Atalhos.acompanharAtalhos(atalhos => {
  _atalhos = atalhos;
  const tecla = Atalhos.rotuloDoAtalho(atalhos.legenda);
  Overlay.definirRotulo({
    nome: textoDaVoz('MIN-07.semAtalho'),
    comAtalho: tecla ? textoDaVoz('MIN-07.comAtalho', { atalho: tecla }) : textoDaVoz('MIN-07.semAtalho'),
  }, tecla);
});

Overlay.aoClicar(evento => minerarLegenda(evento));

chrome.runtime.sendMessage({ type: 'AUTO_MINER_GET_STATE' }, response => {
  if (!chrome.runtime.lastError && response?.state) {
    _autoMinerState = response.state;
    atualizarAutoMinerBadge();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'AUTO_MINER_STATE_CHANGED') {
    _autoMinerState = message.state;
    atualizarAutoMinerBadge();
  }
});

// Mouse — fase de captura, para interceptar antes de o navegador navegar (voltar
// e avançar). O botão só é tomado quando há o que minerar: numa página sem
// legenda ou sem seleção, ele continua fazendo o que sempre fez.
document.addEventListener('mousedown', (e) => {
  if (Atalhos.correspondeAoAtalho(_atalhos.legenda, e) && obterLegendaAtual()) {
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
// tecla é da pessoa, não da extensão.
document.addEventListener('keydown', (e) => {
  if (!Atalhos.correspondeAoAtalho(_atalhos.selecao, e)) return;
  if (digitandoNumCampo(e)) return;

  const texto = window.getSelection()?.toString().trim();
  if (!texto) return;

  e.preventDefault();
  _ativarCaptura(texto, e);
}, true);

/** O evento nasceu num campo onde se digita (input de texto, textarea, contenteditable). */
function digitandoNumCampo(evento) {
  const alvo = evento.composedPath?.()[0] || evento.target;
  if (!(alvo instanceof Element)) return false;
  if (alvo.isContentEditable) return true;
  if (alvo.localName === 'textarea' || alvo.localName === 'select') return true;
  if (alvo.localName !== 'input') return false;
  const QUE_NAO_SE_DIGITA = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'];
  return !QUE_NAO_SE_DIGITA.includes(alvo.type);
}

// Só a pessoa minera: quem pede uma captura passa o evento que a disparou, e um
// evento sintético (disparado pela página) não conta.
function _ativarCaptura(texto, evento) {
  if (!evento?.isTrusted) return;
  minerarSelecao({
    texto,
    origem:  'selecao',
    contexto: {
      fonte:   'selecao',
      titulo:  document.title.trim(),
      detalhe: '',
    },
    idioma: detectarIdioma(texto),
  });
}

// ─── Feedback honesto ────────────────────────────────────────────────────────
// A pílula espera o service worker: só diz “minerada” depois que a frase foi
// gravada, e só diz “copiada” depois que o clipboard aceitou.

async function minerarSelecao(captura) {
  const resposta = await salvarNoHistorico(captura);
  if (!resposta?.ok) {
    mostrarFalhaAoSalvar(captura, () => minerarSelecao(captura));
    return;
  }
  Overlay.mostrar({
    tipo: 'sucesso',
    icone: 'selecao',
    titulo: textoDaVoz('MIN-05', { idioma: captura.idioma }),
    frase: captura.texto,
    palavra: palavraDe(resposta.frase),
  });
}

async function minerarECopiarLegenda(captura) {
  const [copiou, resposta] = await Promise.all([copiar(captura.texto), salvarNoHistorico(captura)]);
  if (!resposta?.ok) {
    mostrarFalhaAoSalvar(captura, () => minerarECopiarLegenda(captura));
    return;
  }
  Overlay.mostrar({
    tipo: 'sucesso',
    icone: 'legenda',
    titulo: copiou ? textoDaVoz('MIN-01', { idioma: captura.idioma }) : textoDaVoz('MIN-02'),
    frase: captura.texto,
    palavra: palavraDe(resposta.frase),
  });
}

/** MIN-03 fica até o ×, o Esc ou a próxima captura; Tentar de novo repete com o mesmo texto. */
function mostrarFalhaAoSalvar(captura, tentarDeNovo) {
  mostrarFalha('MIN-03.aviso', {
    frase: captura.texto,
    acao: { rotulo: textoDaVoz('MIN-03.tentarDeNovo'), fazer: tentarDeNovo },
  });
}

/** MIN-04 e MIN-10: não havia o que minerar. */
function mostrarNadaAMinerar(id) {
  mostrarFalha(id);
}

/** Uma falha na pílula: ícone de alerta e o × (PAI-34). */
function mostrarFalha(id, extras = {}) {
  Overlay.mostrar({ tipo: 'erro', icone: 'alerta', titulo: textoDaVoz(id), fechar: textoDaVoz('PAI-34'), ...extras });
}

/** O código de idioma que o service worker usa na mineração automática. */
function codigoDoIdioma(idioma) {
  return idioma === IDIOMAS.RUSSO ? 'ru' : 'en';
}

/** A resposta do service worker, ou `{ ok: false }` se ele não respondeu. */
function salvarNoHistorico({ texto, origem, contexto, idioma }) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'SALVAR_HISTORICO', texto, origem, contexto, idioma }, resposta => {
        resolve(chrome.runtime.lastError ? { ok: false } : resposta);
      });
    } catch {
      // A extensão foi recarregada e este content script ficou órfão.
      resolve({ ok: false });
    }
  });
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

/** A Palavra da frase gravada (`palavra@índice`, grupos separados por `|`): a primeira. */
function palavraDe(frase) {
  const primeira = (frase?.keywords || []).find(k => k && k !== '|');
  return primeira ? String(primeira).split('@')[0] : '';
}

// ─── Ponte de Segurança (Cross-Frame) ────────────────────────────────────────

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

// ─── Atalho de legenda (teclado) ─────────────────────────────────────────────

document.addEventListener('keydown', function(event) {
    if (!Atalhos.correspondeAoAtalho(_atalhos.legenda, event)) return;
    if (digitandoNumCampo(event)) return;
    event.preventDefault();
    minerarLegenda(event);
});

// ─── Botão Flutuante ─────────────────────────────────────────────────────────

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

// ─── Mineração ───────────────────────────────────────────────────────────────

function processarAutoMinerLegenda() {
    const texto = obterLegendaAtual();
    if (!autoMinerAtivoNaPagina(texto)) return;
    if (!texto) return;
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
        origem: contexto?.fonte || window.location.hostname.replace('www.', '').split('.')[0] || 'auto',
        contexto,
        lang: codigoDoIdioma(idioma),
    }, response => {
        if (chrome.runtime.lastError || !response) return;
        if (response.state) {
            _autoMinerState = response.state;
            atualizarAutoMinerBadge();
        }
        registrarAutoMinerEvento(response, normalizado, idioma);
        if (response.action === 'saved') mostrarNotificacaoAutoMiner(normalizado, idioma, response);
        if (response.reason === 'daily_limit') atualizarAutoMinerBadge(true);
    });
}

function autoMinerAtivoNaPagina(legenda = '') {
    if (!_autoMinerState?.settings) return false;
    const video = obterVideoAtivo();
    if (!video || video.paused || video.ended) return false;
    if (!legenda) return false;
    const lang = codigoDoIdioma(detectarIdioma(legenda));
    const settings = _autoMinerState.settings[lang];
    const daily = _autoMinerState.daily?.[lang];
    return Boolean(settings?.enabled && (!daily || daily.count < settings.dailyLimit));
}

function obterLegendaAtual() {
    // Sem vídeo, “caption” e “subtitle” são legendas de imagem, não de fala.
    if (!obterVideoAtivo()) return '';
    const host = window.location.hostname;
    if (host.includes('primevideo') || host.includes('amazon')) return minerarAmazon();
    if (host.includes('youtube.com')) {
        const segs = document.querySelectorAll('.ytp-caption-segment');
        if (segs.length) return Array.from(segs).map(s => s.innerText).join(' ');
    }
    if (host.includes('netflix.com')) return document.querySelector('.player-timedtext-text-container')?.innerText || '';
    if (host.includes('kinopoisk')) {
        const root = document.querySelector('[data-tid="Subtitles"]');
        if (root) return root.innerText.replace(/\s*\n\s*/g, ' ').trim();
    }
    if (host.includes('hbomax.com') || host.includes('max.com') || host.includes('hbo.com')) {
        const maxText = minerarLegendaPorSeletores([
            '[data-testid*="caption" i]',
            '[data-testid*="subtitle" i]',
            '[data-testid*="timed" i]',
            '[data-testid*="cue" i]',
            '[class*="caption" i]',
            '[class*="subtitle" i]',
            '[class*="timedtext" i]',
            '[class*="texttrack" i]',
        ]);
        if (maxText) return maxText;
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
    if (kp) return kp.innerText.replace(/\s*\n\s*/g, ' ').trim();
    const visual = minerarLegendaVisual();
    if (visual) return visual;
    return '';
}

function normalizarTextoAutoMiner(texto) {
    return String(texto || '').replace(/\s+/g, ' ').trim();
}

// O contador no canto do botão. Ainda soma os idiomas ligados, como antes: o
// contador do idioma da captura é de #41.
function atualizarAutoMinerBadge(limitReached = false) {
    const state = _autoMinerState;
    const enabled = Boolean(state?.settings?.en?.enabled || state?.settings?.ru?.enabled);
    if (!enabled) {
        Overlay.mostrarContador(null);
        return;
    }
    const en = state.daily?.en?.count || 0;
    const ru = state.daily?.ru?.count || 0;
    const enLimit = state.settings?.en?.dailyLimit || 0;
    const ruLimit = state.settings?.ru?.dailyLimit || 0;
    const count = en + ru;
    const limit = (state.settings?.en?.enabled ? enLimit : 0) + (state.settings?.ru?.enabled ? ruLimit : 0);
    Overlay.mostrarContador({ texto: `${count}/${limit}`, noLimite: limitReached || count >= limit });
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
        atualizarAutoMinerBadge(response.reason === 'daily_limit');
        console.debug('[PerpetualMiner Auto]', _autoMinerLastEvent.reason, texto);
    }
}

function rotuloAutoMinerReason(reason) {
    return ({
        daily_limit: 'limite diário',
        disabled: 'idioma desligado',
        duplicate: 'duplicada',
        empty: 'vazia',
        low_quality_text: 'texto inválido',
        no_new_item: 'sem item novo',
        not_i_plus_1: 'não é i+1',
        too_long_en: 'inglês longo',
    })[reason] || reason || 'desconhecido';
}

// MIN-06. A mineração automática não tira da tela uma falha que espera a pessoa.
function mostrarNotificacaoAutoMiner(texto, idioma, response) {
    if (!Overlay.temBotao() || Overlay.mostrandoFalha()) return;
    const lang = codigoDoIdioma(idioma);
    const state = response.state;
    Overlay.mostrar({
        tipo: 'sucesso',
        icone: 'automatica',
        titulo: textoDaVoz('MIN-06', {
            idioma,
            n: state?.daily?.[lang]?.count || 0,
            limite: state?.settings?.[lang]?.dailyLimit || 0,
        }),
        frase: texto,
        palavra: palavraDe(response.frase || { keywords: response.evaluation?.keywords }),
    });
}

// Como em _ativarCaptura: só um evento da pessoa minera a legenda. Sem vídeo na
// página não há legenda (MIN-10), por mais que um texto pareça uma.
function minerarLegenda(evento) {
    if (!evento?.isTrusted) return;
    if (!obterVideoAtivo()) {
        mostrarNadaAMinerar('MIN-10');
        return;
    }
    const texto = obterLegendaAtual();
    if (!texto || texto.length <= 2) {
        mostrarNadaAMinerar('MIN-04');
        return;
    }
    minerarECopiarLegenda({
        texto,
        origem:   window.location.hostname.replace('www.', '').split('.')[0],
        contexto: extrairContexto(),
        idioma:   detectarIdioma(texto),
    });
}

function obterVideoAtivo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    const ranked = videos.map(video => {
        const rect = video.getBoundingClientRect();
        const area = Math.max(0, rect.width) * Math.max(0, rect.height);
        const visible = rect.width >= 120 && rect.height >= 80 && rect.bottom > 0 && rect.right > 0
            && rect.top < window.innerHeight && rect.left < window.innerWidth;
        return { video, area, visible, playing: !video.paused && !video.ended };
    });
    ranked.sort((a, b) => Number(b.visible) - Number(a.visible)
        || Number(b.playing) - Number(a.playing)
        || b.area - a.area);
    return ranked[0]?.video || videos[0] || null;
}

function minerarLegendaPorSeletores(selectors) {
    for (const selector of selectors) {
        let elementos = [];
        try {
            elementos = Array.from(document.querySelectorAll(selector));
        } catch {
            continue;
        }
        for (const el of elementos) {
            const texto = textoLegendaDeElemento(el);
            if (texto) return texto;
        }
    }
    return '';
}

function minerarLegendaVisual() {
    const video = obterVideoAtivo();
    if (!video) return '';
    const rectVideo = video.getBoundingClientRect();
    const candidatos = [];

    for (const el of document.querySelectorAll('span, div, p')) {
        if (elementoIgnoradoParaLegenda(el)) continue;
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
        candidatos.push({ texto, score: verticalScore + compactScore + Math.min(80, area / 900) });
    }

    candidatos.sort((a, b) => b.score - a.score);
    return candidatos[0]?.texto || '';
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
    if (!el || el.localName === 'perpetualminer-overlay') return true;
    if (el.closest('button,a,input,textarea,select,[role="button"],[contenteditable="true"]')) return true;
    const style = window.getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0;
}

function minerarAmazon() {
    const alvosDiretos = ['.atvwebplayersdk-captions-text span', '.atvwebplayersdk-subtitle-text-container'];
    for (const seletor of alvosDiretos) {
        const elementos = document.querySelectorAll(seletor);
        if (elementos.length > 0) {
            const txt = Array.from(elementos).map(s => s.innerText).join(' ').trim();
            if (txt && txt.length < 250 && !/^[ \d\s:/]+$/.test(txt)) return txt;
        }
    }

    const video = document.querySelector('video');
    if (!video) return '';
    const rectVideo         = video.getBoundingClientRect();
    const meioDaTela        = rectVideo.top + rectVideo.height * 0.5;
    const limiteEsquerdoXray = rectVideo.left + rectVideo.width * 0.25;
    const lixoInterface     = ['temporada','ep.','season','pular','skip','next','próximo',
        'prime video','termos','política','privacidade','cookies','mais','saiba','info',
        'detalhes','português','english','idioma','legenda','configurações','audio',
        'coreano','korean'];

    let melhorCandidato = '';
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
        melhorCandidato = txt;
    }
    return melhorCandidato;
}

// ─── Extração de Contexto ────────────────────────────────────────────────────

function extrairContexto() {
    const host = window.location.hostname;

    // ── YouTube ──────────────────────────────────────────────────────────────
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

    // ── Netflix ───────────────────────────────────────────────────────────────
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

    // ── Amazon Prime ──────────────────────────────────────────────────────────
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

    // ── HBO Max / Max ─────────────────────────────────────────────────────────
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

    // ── Disney+ / Star+ ───────────────────────────────────────────────────────
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

    // ── Kinopoisk (hd.kinopoisk.ru) ───────────────────────────────────────────
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

    // ── Fallback: Web genérico ────────────────────────────────────────────────
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
