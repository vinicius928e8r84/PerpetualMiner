const { detectarIdioma, Atalhos, Overlay, textoDaVoz, IDIOMAS, Mineracao, ContextoDoSite, LegendaDaPagina, MineracaoAutomaticaNaPagina } = PerpetualMiner;
const { legendaDe, lugarDaLegenda, normalizarTexto, obterVideoAtivo, videoVisivel } = LegendaDaPagina;

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
    mineracaoAutomatica.atualizarSelo();
}, 1000);

// O botão vive no container do player, como antes: em tela cheia, só o que está
// dentro do elemento em tela cheia aparece.
function containerDoPlayer(video) {
    if (window.location.hostname.includes('youtube.com')) {
        return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    }
    return video.parentElement;
}

function lerLegenda() {
    return LegendaDaPagina.lerLegenda({ amazon: minerarAmazon });
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
    return ContextoDoSite.ler(window.location.hostname, document);
}
