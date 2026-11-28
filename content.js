const { detectarIdioma, Atalhos, Overlay, textoDaVoz, IDIOMAS, Mineracao, ContextoDoSite, LegendaDaPagina, LegendaDaAmazon, MineracaoAutomaticaNaPagina } = PerpetualMiner;
const { lugarDaLegenda, normalizarTexto, obterVideoAtivo, videoVisivel } = LegendaDaPagina;

let _atalhos = { ...Atalhos.ATALHOS_PADRAO };

Atalhos.acompanharAtalhos(atalhos => {
  _atalhos = atalhos;
  const tecla = Atalhos.rotuloDoAtalho(atalhos.legenda);
  Overlay.definirRotulo(tecla ? textoDaVoz('MIN-07.comAtalho', { atalho: tecla }) : textoDaVoz('MIN-07.semAtalho'),
    { nome: textoDaVoz('MIN-07.semAtalho'), tecla });
});

Overlay.aoClicar(evento => minerarLegenda(evento));

const mineracaoAutomatica = MineracaoAutomaticaNaPagina.criar({
  lerLegenda, lugarDaLegenda, normalizar: normalizarTexto, codigoDoIdioma, siglaDoIdioma,
  videoAtivo: obterVideoAtivo, contexto: extrairContexto, origem: origemDaPagina, palavraDe,
});
mineracaoAutomatica.ligar();

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
  const [copiou, resposta] = await Promise.all([copia && copiar(captura.texto), Mineracao.minerar(captura)]);
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
    mineracaoAutomatica.atualizarSelo();
}, 1000);

function containerDoPlayer(video) {
    if (window.location.hostname.includes('youtube.com')) {
        return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    }
    return video.parentElement;
}

function lerLegenda() {
    return LegendaDaPagina.lerLegenda({ amazon: LegendaDaAmazon.ler });
}

function lugarDaSelecao(texto) {
    const selecao = window.getSelection();
    if (!selecao?.rangeCount) return null;
    const faixa = selecao.getRangeAt(0).cloneRange();
    const capturado = normalizarTexto(texto);
    return () => (normalizarTexto(faixa.toString()) === capturado ? faixa : null);
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
    mineracaoAutomatica.lembrarIdiomaDaLegenda(codigoDoIdioma(idioma));
    minerarCaptura({
        texto,
        origem:   origemDaPagina(),
        contexto: extrairContexto(),
        idioma,
        lugar:    lugarDaLegenda(legenda),
    }, { copia: true });
}

let esperaDoContexto = null;
function lembrarDoContextoDepoisDoMouse() {
    if (esperaDoContexto) return;
    esperaDoContexto = setTimeout(() => {
        esperaDoContexto = null;
        extrairContexto();
    }, 500);
}
if (ContextoDoSite.lembraOUltimo(window.location.hostname)) {
    document.addEventListener('mousemove', lembrarDoContextoDepoisDoMouse, { capture: true, passive: true });
}

function extrairContexto() {
    return ContextoDoSite.ler(window.location.hostname, document);
}
