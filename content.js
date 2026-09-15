// content.js

const ATALHO_TECLA = 'KeyS';
const COR_ICONE    = '#00ff88';
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

// ─── Custom Shortcut Engine ───────────────────────────────────────────────────
// Captura texto selecionado via atalho configurado pelo usuário (mouse ou teclado).

let _atalhoConfig = null;
let _autoMinerState = null;
let _autoMinerLastText = '';
let _autoMinerLastSentText = '';
let _autoMinerStableSince = 0;
let _autoMinerLastEvent = null;

// Carrega configuração inicial
chrome.storage.local.get({ pm_atalho: null }, (data) => {
  _atalhoConfig = data.pm_atalho;
});

// Mantém configuração sincronizada em tempo real
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'pm_atalho' in changes) {
    _atalhoConfig = changes.pm_atalho.newValue || null;
  }
});

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

function _correspondeAtalho(cfg, e) {
  if (!cfg) return false;
  if (cfg.altKey   !== e.altKey)   return false;
  if (cfg.ctrlKey  !== e.ctrlKey)  return false;
  if (cfg.shiftKey !== e.shiftKey) return false;
  if (cfg.type === 'mouse')    return e.button === cfg.button;
  if (cfg.type === 'keyboard') return e.code   === cfg.code;
  return false;
}

// Listener de mouse — captura fase capture para interceptar antes do browser navegar
document.addEventListener('mousedown', (e) => {
  if (!_atalhoConfig || _atalhoConfig.type !== 'mouse') return;
  if (!_correspondeAtalho(_atalhoConfig, e)) return;

  const texto = window.getSelection()?.toString().trim();
  if (!texto) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  _ativarCaptura(texto);
}, true);

// Listener de teclado — ignora campos de input/textarea
document.addEventListener('keydown', (e) => {
  if (!_atalhoConfig || _atalhoConfig.type !== 'keyboard') return;
  if (!_correspondeAtalho(_atalhoConfig, e)) return;

  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

  const texto = window.getSelection()?.toString().trim();
  if (!texto) return;

  e.preventDefault();
  _ativarCaptura(texto);
}, true);

function _ativarCaptura(texto) {
  _mostrarOverlayCyan(texto);

  chrome.runtime.sendMessage({
    type:    'SALVAR_HISTORICO',
    texto,
    origem:  'selecao',
    contexto: {
      fonte:   'selecao',
      titulo:  document.title.trim(),
      detalhe: '',
    },
    idioma: /[\u0400-\u04FF]/.test(texto) ? 'Russo' : 'Inglês',
  });
}

function _mostrarOverlayCyan(texto) {
  document.getElementById('pm-capture-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pm-capture-overlay';
  overlay.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'z-index:2147483647',
    'background:rgba(15,15,15,0.95)',
    'border:1px solid rgba(0,255,255,0.3)',
    'border-radius:14px', 'padding:20px 32px',
    'color:#00ffff',
    'font-family:Segoe UI,system-ui,sans-serif',
    'font-size:14px', 'font-weight:600', 'letter-spacing:0.04em',
    'text-align:center',
    'box-shadow:0 0 32px rgba(0,255,255,0.18),0 6px 40px rgba(0,0,0,0.7)',
    'opacity:0', 'transition:opacity 0.25s ease',
    'pointer-events:none', 'user-select:none',
  ].join(';');

  const preview = texto.length > 55 ? texto.slice(0, 55) + '…' : texto;
  overlay.append(
    pmDiv('font-size:22px;margin-bottom:8px;', '⚡'),
    pmDiv('margin-bottom:6px;', 'Frase Capturada!'),
    pmDiv(`font-size:11px;color:rgba(0,255,255,0.55);font-weight:400;
           max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`, preview),
  );

  document.body.appendChild(overlay);
  requestAnimationFrame(() => { requestAnimationFrame(() => { overlay.style.opacity = '1'; }); });
  setTimeout(() => {
    overlay.style.transition = 'opacity 0.3s ease';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.parentNode && overlay.remove(), 350);
  }, 1500);
}

// ─── Ponte de Segurança (Cross-Frame) ────────────────────────────────────────

window.addEventListener('message', function(event) {
    if (!event.data) return;
    const { type, texto, contexto, idioma } = event.data;

    if (type === 'COPIAR_PARA_CLIPBOARD' || type === 'COPIAR_E_SALVAR') {
        navigator.clipboard.writeText(texto).catch(() => {});

        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type:    'SALVAR_HISTORICO',
                texto,
                origem:  window.location.hostname.replace('www.', '').split('.')[0],
                contexto: contexto || null,
                idioma:   idioma   || 'Inglês',
            });
        }
    }
});

// ─── Atalho de Teclado ───────────────────────────────────────────────────────

document.addEventListener('keydown', function(event) {
    if (event.altKey && event.code === ATALHO_TECLA) {
        event.preventDefault();
        minerarLegenda();
    }
});

// ─── Botão Flutuante ─────────────────────────────────────────────────────────

setInterval(() => {
    const video = obterVideoAtivo();
    if (video && !document.getElementById('btn-minerador-pro')) {
        criarBotaoVisual(video);
    }
}, 1000);

setInterval(processarAutoMinerLegenda, AUTO_MINER_POLL_MS);

function criarBotaoVisual(video) {
    const btn = document.createElement('div');
    btn.id = 'btn-minerador-pro';

    btn.style.cssText = `
        position: absolute;
        bottom: 95px; right: 30px;
        width: 48px; height: 48px;
        background: rgba(10, 10, 10, 0.85);
        border: 2px solid ${COR_ICONE};
        border-radius: 12px;
        cursor: pointer; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(8px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;

    btn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="${COR_ICONE}" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7
                     8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8
                     8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5"/>
        </svg>
    `;

    btn.onmouseover = () => { btn.style.transform = 'scale(1.05)'; btn.style.backgroundColor = 'rgba(20,20,20,0.95)'; };
    btn.onmouseout  = () => { btn.style.transform = 'scale(1)';    btn.style.backgroundColor = 'rgba(10,10,10,0.85)'; };
    btn.onclick     = (e) => { e.stopPropagation(); e.preventDefault(); minerarLegenda(); };

    const host      = window.location.hostname;
    const container = host.includes('youtube.com')
        ? (document.querySelector('#movie_player') || document.querySelector('.html5-video-player'))
        : video.parentElement;

    if (container) container.appendChild(btn);
    atualizarAutoMinerBadge();
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
        lang: idioma === 'Russo' ? 'ru' : 'en',
    }, response => {
        if (chrome.runtime.lastError || !response) return;
        if (response.state) {
            _autoMinerState = response.state;
            atualizarAutoMinerBadge();
        }
        registrarAutoMinerEvento(response, normalizado, idioma);
        if (response.action === 'saved') mostrarNotificacaoAutoMiner(normalizado, idioma, response.state);
        if (response.reason === 'daily_limit') atualizarAutoMinerBadge(true);
    });
}

function autoMinerAtivoNaPagina(legenda = '') {
    if (!_autoMinerState?.settings) return false;
    const video = obterVideoAtivo();
    if (!video || video.paused || video.ended) return false;
    if (!legenda) return false;
    const lang = detectarIdioma(legenda) === 'Russo' ? 'ru' : 'en';
    const settings = _autoMinerState.settings[lang];
    const daily = _autoMinerState.daily?.[lang];
    return Boolean(settings?.enabled && (!daily || daily.count < settings.dailyLimit));
}

function obterLegendaAtual() {
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

function atualizarAutoMinerBadge(limitReached = false) {
    const btn = document.getElementById('btn-minerador-pro');
    if (!btn) return;
    let badge = document.getElementById('pm-auto-miner-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'pm-auto-miner-badge';
        badge.style.cssText = [
            'position:absolute', 'right:-6px', 'top:-8px', 'min-width:18px', 'height:18px',
            'border-radius:999px', 'padding:0 5px', 'font:700 9px Segoe UI,system-ui,sans-serif',
            'display:flex', 'align-items:center', 'justify-content:center', 'border:1px solid rgba(255,255,255,0.3)',
            'box-shadow:0 4px 14px rgba(0,0,0,0.45)', 'pointer-events:none',
        ].join(';');
        btn.appendChild(badge);
    }
    const state = _autoMinerState;
    const enabled = Boolean(state?.settings?.en?.enabled || state?.settings?.ru?.enabled);
    if (!enabled) {
        badge.textContent = 'A';
        badge.title = 'Auto Miner desligado';
        badge.style.display = 'none';
        return;
    }
    const en = state.daily?.en?.count || 0;
    const ru = state.daily?.ru?.count || 0;
    const enLimit = state.settings?.en?.dailyLimit || 0;
    const ruLimit = state.settings?.ru?.dailyLimit || 0;
    const count = en + ru;
    const limit = (state.settings?.en?.enabled ? enLimit : 0) + (state.settings?.ru?.enabled ? ruLimit : 0);
    badge.textContent = `${count}/${limit}`;
    const lastReason = _autoMinerLastEvent?.action === 'skip'
        ? ` | último skip: ${rotuloAutoMinerReason(_autoMinerLastEvent.reason)}`
        : '';
    badge.title = `Auto Miner ${count}/${limit}${lastReason}`;
    badge.style.display = 'flex';
    badge.style.background = limitReached || count >= limit ? '#facc15' : '#00ff88';
    badge.style.color = '#06130d';
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

function mostrarNotificacaoAutoMiner(texto, idioma, state) {
    const btn = document.getElementById('btn-minerador-pro');
    if (!btn) return;
    document.getElementById('notificacao-minerador')?.remove();
    const lang = idioma === 'Russo' ? 'ru' : 'en';
    const daily = state?.daily?.[lang];
    const limit = state?.settings?.[lang]?.dailyLimit;
    const aviso = document.createElement('div');
    aviso.id = 'notificacao-minerador';
    aviso.style.cssText = `
        position: absolute; right: 55px; bottom: 0;
        width: 260px; min-height: 48px;
        background: rgba(6,19,13,0.98);
        color: #00ff88;
        padding: 12px 16px;
        border-radius: 12px;
        border: 1px solid #00ff88;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        box-shadow: -10px 5px 30px rgba(0,0,0,0.6);
        z-index: 2147483646;
        display: flex; flex-direction: column; justify-content: center;
        animation: slideIn 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.2);
        pointer-events: none;
        backdrop-filter: blur(15px);
        text-align: left;
    `;
    aviso.append(
        pmDiv(`font-size:9px;text-transform:uppercase;letter-spacing:1.2px;
               margin-bottom:4px;opacity:0.78;font-weight:bold;color:#00ff88;`,
            `Auto Miner - ${idioma} - ${daily?.count || 0}/${limit || 0}`),
        pmDiv(`font-weight:500;line-height:1.4;color:#fff;
               display:-webkit-box;-webkit-line-clamp:3;
               -webkit-box-orient:vertical;overflow:hidden;font-style:normal;`, texto),
    );
    btn.appendChild(aviso);
    setTimeout(() => {
        aviso.style.opacity = '0';
        aviso.style.transform = 'translateX(5px)';
        aviso.style.transition = 'all 0.3s ease';
        setTimeout(() => aviso.remove(), 300);
    }, 2800);
}

// Monta um <div> dos avisos. O texto entra sempre como texto (nunca como HTML),
// porque vem da página: legenda, seleção, título.
function pmDiv(cssText, texto) {
    const div = document.createElement('div');
    div.style.cssText = cssText;
    div.textContent = texto;
    return div;
}

function minerarLegenda() {
    const texto = obterLegendaAtual();

    if (texto && texto.length > 2) {
        const contexto = extrairContexto();
        const idioma   = detectarIdioma(texto);

        navigator.clipboard.writeText(texto).catch(() => {
            window.parent.postMessage({ type: 'COPIAR_PARA_CLIPBOARD', texto, contexto, idioma }, '*');
        });

        mostrarNotificacaoAcoplada(texto, contexto, idioma);
    } else {
        const btn = document.getElementById('btn-minerador-pro');
        if (btn) {
            btn.style.borderColor = 'red';
            setTimeout(() => btn.style.borderColor = COR_ICONE, 800);
        }
    }
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
    if (!el || el.id === 'btn-minerador-pro' || el.id === 'pm-auto-miner-badge') return true;
    if (el.closest('#btn-minerador-pro,#notificacao-minerador,#pm-capture-overlay')) return true;
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

// Detecta cirílico → Russo; caso contrário → Inglês
function detectarIdioma(texto) {
    return /[\u0400-\u04FF]/.test(texto) ? 'Russo' : 'Inglês';
}

// ─── Notificação Visual ───────────────────────────────────────────────────────

function mostrarNotificacaoAcoplada(texto, contexto, idioma) {
    // Dispara a ponte: salva e copia via script principal
    window.postMessage({ type: 'COPIAR_E_SALVAR', texto, contexto, idioma }, '*');

    const btn = document.getElementById('btn-minerador-pro');
    if (!btn) return;

    document.getElementById('notificacao-minerador')?.remove();

    const aviso = document.createElement('div');
    aviso.id = 'notificacao-minerador';

    aviso.style.cssText = `
        position: absolute; right: 55px; bottom: 0;
        width: 260px; min-height: 48px;
        background: rgba(10,10,10,0.98);
        color: ${COR_ICONE};
        padding: 12px 16px;
        border-radius: 12px;
        border: 1px solid ${COR_ICONE};
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        box-shadow: -10px 5px 30px rgba(0,0,0,0.6);
        z-index: 2147483646;
        display: flex; flex-direction: column; justify-content: center;
        animation: slideIn 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.2);
        pointer-events: none;
        backdrop-filter: blur(15px);
        text-align: left;
    `;

    aviso.appendChild(pmDiv(`font-size:9px;text-transform:uppercase;letter-spacing:1.2px;
                             margin-bottom:4px;opacity:0.7;font-weight:bold;color:${COR_ICONE};`,
        `Minerado & Copiado · ${idioma}`));

    // Linha de contexto para exibir na notificação
    if (contexto?.titulo) {
        aviso.appendChild(pmDiv(`font-size:9px;text-transform:uppercase;letter-spacing:1px;
                                 opacity:0.55;margin-bottom:2px;color:#fff;font-style:normal;`,
            `${contexto.titulo}${contexto.detalhe ? ' · ' + contexto.detalhe : ''}`));
    }

    aviso.appendChild(pmDiv(`font-weight:500;line-height:1.4;color:#fff;
                             display:-webkit-box;-webkit-line-clamp:3;
                             -webkit-box-orient:vertical;overflow:hidden;font-style:normal;`, texto));

    if (!document.getElementById('style-minerador-final')) {
        const style = document.createElement('style');
        style.id    = 'style-minerador-final';
        style.innerHTML = `@keyframes slideIn {
            from { opacity:0; transform:translateX(15px); }
            to   { opacity:1; transform:translateX(0);    }
        }`;
        document.head.appendChild(style);
    }

    btn.appendChild(aviso);

    setTimeout(() => {
        aviso.style.opacity   = '0';
        aviso.style.transform = 'translateX(5px)';
        aviso.style.transition = 'all 0.3s ease';
        setTimeout(() => aviso.remove(), 300);
    }, 3800);
}
