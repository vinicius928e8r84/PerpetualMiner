'use strict';

(function (raiz) {
  const TAG_DO_HOST = 'perpetualminer-overlay';
  const FEEDBACK_SOME_EM_MS = 3500;
  const ESTILOS = ['veio/tokens.css', 'veio/componentes.css', 'overlay.css'];
  const PREVIA_CURTA = 32;
  const PALAVRA_PERTO_DO_COMECO = 16;
  const CONTEXTO_ANTES_DA_PALAVRA = 14;
  const LINHA_ABAIXO_DO_TEXTO = 3;
  const CHIP_LONGE_DO_TEXTO = 8;
  const MARGEM_DA_JANELA = 8;
  const LETRA = /[\p{L}\p{M}\p{N}]/u;
  /**
   * As fontes empacotadas, registradas no documento do site. O Chrome ignora o
   * `@font-face` de veio/tokens.css dentro de uma sombra, então elas entram pela
   * API `FontFace`, com nomes só do overlay: o site nunca os pede, e a Manrope
   * que um site tiver não troca de desenho. O overlay.css aponta os tokens para eles.
   */
  const LATIM = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, '
    + 'U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
  const CIRILICO = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
  const FONTES = [
    { familia: 'PerpetualMiner Manrope', arquivo: 'manrope-latin', pesos: '400 800', unicodeRange: LATIM },
    { familia: 'PerpetualMiner Manrope', arquivo: 'manrope-cyrillic', pesos: '400 800', unicodeRange: CIRILICO },
    { familia: 'PerpetualMiner JetBrains Mono', arquivo: 'jetbrains-mono-latin', pesos: '400 700', unicodeRange: LATIM },
    { familia: 'PerpetualMiner JetBrains Mono', arquivo: 'jetbrains-mono-cyrillic', pesos: '400 700', unicodeRange: CIRILICO },
  ];

  let host = null;
  let partes = null;
  let temporizador = null;
  let aoClicarNoBotao = () => {};
  let rotuloDoBotao = '';
  let etiquetaDoBotao = { nome: '', tecla: null };
  let etiquetaDoContador = '';
  let marca = null;

  /**
   * Põe as fontes do overlay no documento. Os arquivos vêm como bytes, lidos
   * pelo content script: uma `url()` passaria pela CSP do site (`font-src`).
   */
  function registrarFontes() {
    for (const { familia, arquivo, pesos, unicodeRange } of FONTES) {
      fetch(chrome.runtime.getURL(`veio/fontes/${arquivo}.woff2`))
        .then(resposta => resposta.arrayBuffer())
        .then(bytes => new FontFace(familia, bytes, { weight: pesos, unicodeRange, display: 'swap' }).load())
        .then(fonte => document.fonts.add(fonte))
        .catch(() => {});
    }
  }

  function montar() {
    if (host) return;
    host = document.createElement(TAG_DO_HOST);
    const sombra = host.attachShadow({ mode: 'open' });

    const carregando = ESTILOS.map(caminho => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(caminho);
      sombra.append(link);
      return new Promise(pronto => { link.onload = link.onerror = pronto; });
    });

    registrarFontes();

    const pm = elemento('div', 'pm');
    pm.dataset.tema = 'escuro';
    pm.hidden = true;
    Promise.all(carregando).then(() => { pm.hidden = false; });

    const pilula = elemento('div', 'pm-pilula');

    const botao = elemento('button', 'pm-botao');
    botao.type = 'button';
    const azulejo = elemento('img', 'pm-azulejo');
    azulejo.src = chrome.runtime.getURL('veio/icones/icone.svg');
    azulejo.alt = '';
    const contador = elemento('span', 'pm-contador');
    contador.hidden = true;
    const dica = elemento('span', 'pm-dica');
    dica.setAttribute('aria-hidden', 'true');
    botao.append(azulejo, contador, dica);
    botao.addEventListener('click', evento => aoClicarNoBotao(evento));

    const corpo = elemento('div', 'pm-corpo');
    const estado = elemento('div', 'pm-estado');
    estado.setAttribute('role', 'status');
    estado.setAttribute('aria-live', 'polite');
    corpo.append(estado);

    pilula.append(botao, corpo);
    const camada = elemento('div', 'pm-marca');
    camada.setAttribute('aria-hidden', 'true');
    const descricaoDoContador = elemento('span', 'veio-so-leitor');
    descricaoDoContador.id = 'pm-descricao-do-contador';
    pm.append(camada, pilula, descricaoDoContador);
    sombra.append(pm);

    // Clicar no overlay não é clicar no site (um player pausaria o vídeo).
    for (const tipo of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) {
      pm.addEventListener(tipo, evento => evento.stopPropagation());
    }

    partes = { pm, pilula, botao, contador, dica, estado, camada, descricaoDoContador };
    botao.setAttribute('aria-label', rotuloDoBotao);
    desenharEtiqueta();
  }

  function elemento(tag, classe) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    return no;
  }

  function posicionar(container) {
    montar();
    const livre = !container;
    const pai = container || document.documentElement;
    if (host.parentNode !== pai) pai.append(host);

    // As regras do host vão inline e com !important: uma folha da página não o esconde nem o move.
    const estilo = {
      all: 'initial',
      position: livre ? 'fixed' : 'absolute',
      right: '16px',
      bottom: livre ? '16px' : '96px',
      'z-index': '2147483647',
      display: 'block',
      'pointer-events': 'none',
    };
    host.removeAttribute('style');
    for (const [propriedade, valor] of Object.entries(estilo)) host.style.setProperty(propriedade, valor, 'important');
    partes.pilula.classList.toggle('pm-pilula--livre', livre);
    const { botao } = partes;
    botao.tabIndex = livre ? -1 : 0;
    if (livre) botao.setAttribute('aria-hidden', 'true');
    else botao.removeAttribute('aria-hidden');
  }

  function mostrarBotao(container) {
    if (host && host.parentNode === container) return;
    posicionar(container);
  }

  function definirRotulo(rotulo, { nome, tecla = null } = {}) {
    rotuloDoBotao = rotulo;
    etiquetaDoBotao = { nome: nome || rotulo, tecla };
    partes?.botao.setAttribute('aria-label', rotulo);
    desenharEtiqueta();
  }

  function desenharEtiqueta() {
    if (!partes) return;
    const { dica } = partes;
    const linha = elemento('span', 'pm-dica-nome');
    linha.append(etiquetaDoBotao.nome);
    if (etiquetaDoBotao.tecla) linha.append(raiz.Veio.montarTecla(etiquetaDoBotao.tecla));
    const conteudo = [linha];
    if (etiquetaDoContador) {
      const contagem = elemento('span', 'pm-dica-contador');
      contagem.textContent = etiquetaDoContador;
      conteudo.push(contagem);
    }
    dica.replaceChildren(...conteudo);
  }

  function aoClicar(fn) {
    aoClicarNoBotao = fn;
  }

  function mostrarContador(contagem) {
    etiquetaDoContador = contagem?.etiqueta || '';
    if (!partes) return;
    const { contador, botao, descricaoDoContador } = partes;
    contador.hidden = !contagem;
    descricaoDoContador.textContent = contagem?.descricao || '';
    if (contagem?.descricao) botao.setAttribute('aria-describedby', descricaoDoContador.id);
    else botao.removeAttribute('aria-describedby');
    desenharEtiqueta();
    if (!contagem) return;
    contador.textContent = contagem.texto;
    contador.classList.toggle('pm-contador--limite', Boolean(contagem.noLimite));
  }

  function ehOHost(no) {
    return no?.localName === TAG_DO_HOST;
  }

  function temBotao() {
    return Boolean(host?.isConnected && !partes.pilula.classList.contains('pm-pilula--livre'));
  }

  function mostrandoFalha() {
    return Boolean(partes?.pilula.classList.contains('pm-pilula--aberta')
      && partes.pilula.classList.contains('pm-pilula--erro'));
  }

  function mostrar(feedback) {
    const { tipo, lugar } = feedback;
    if (!temBotao()) posicionar(null);
    fecharTudo();

    const geometria = tipo === 'sucesso' && lugar ? medir(lugar(), feedback.palavras) : null;
    if (geometria) marcar(feedback, geometria);
    else abrirPilula(feedback);
    temporizador = setTimeout(fecharTudo, FEEDBACK_SOME_EM_MS);
  }

  function abrirPilula({ tipo, icone, titulo, dica = '', frase = '', palavras = [], meta = '' }) {
    const { pilula, estado } = partes;
    const palavra = palavras[0] || '';

    const texto = elemento('span', 'pm-texto');
    const negrito = elemento('b', 'pm-titulo');
    negrito.textContent = titulo;
    texto.append(negrito);
    if (frase) {
      const linha = elemento('span', 'pm-frase');
      raiz.Veio.escreverFrase(linha, previaEmVoltaDa(frase, palavra), palavra);
      texto.append(linha);
    } else if (dica) {
      const linha = elemento('span', 'pm-frase');
      linha.textContent = dica;
      texto.append(linha);
    }
    estado.replaceChildren(montarIcone(icone), texto);
    if (meta) estado.append(montarMeta(meta));

    pilula.classList.toggle('pm-pilula--erro', tipo === 'erro');
    pilula.classList.add('pm-pilula--aberta');
  }

  function marcar({ icone, titulo, frase = '', palavras = [], palavraDetectada = true, meta = '', lugar, apagada = false }, geometria) {
    const { estado, pm } = partes;

    const chip = elemento('span', 'pm-chip');
    const negrito = elemento('b', 'pm-titulo');
    negrito.textContent = titulo;
    chip.append(montarIcone(icone), negrito);
    if (palavras.length) {
      chip.append(raiz.Veio.montarChipDaPalavra(palavras.join(' '), { detectada: palavraDetectada }));
    }
    if (meta) chip.append(montarMeta(meta));
    const fala = elemento('span', 'veio-so-leitor');
    fala.textContent = frase;
    estado.replaceChildren(chip, fala);

    pm.classList.toggle('pm--apagada', apagada);
    marca = { lugar, palavras, chave: '', quadro: 0 };
    desenhar(geometria);
    acompanhar();
  }

  function acompanhar() {
    marca.quadro = requestAnimationFrame(() => {
      if (!marca) return;
      const geometria = medir(marca.lugar(), marca.palavras);
      if (!geometria) {
        fecharTudo();
        return;
      }
      desenhar(geometria);
      acompanhar();
    });
  }

  function medir(faixa, palavras = []) {
    if (!faixa || !host?.isConnected) return null;
    const pedacos = pedacosDeTexto(faixa);
    const linhasDoTexto = juntarPorLinha(pedacos.flatMap(({ no, inicio, fim }) => retangulos(no, inicio, fim)));
    if (!linhasDoTexto.length) return null;

    if (host.parentNode !== document.documentElement) {
      const caixa = host.parentNode.getBoundingClientRect();
      const dentro = linhasDoTexto.every(r => r.left >= caixa.left - 1 && r.right <= caixa.right + 1
        && r.top >= caixa.top - 1 && r.bottom <= caixa.bottom + 1);
      if (!dentro) return null;
    }
    return { linhas: linhasDoTexto, grifos: grifosDasPalavras(pedacos, palavras) };
  }

  function pedacosDeTexto(faixa) {
    const comum = faixa.commonAncestorContainer;
    if (comum.nodeType === Node.TEXT_NODE) {
      return faixa.endOffset > faixa.startOffset ? [{ no: comum, inicio: faixa.startOffset, fim: faixa.endOffset }] : [];
    }
    const pedacos = [];
    const andador = document.createTreeWalker(comum, NodeFilter.SHOW_TEXT);
    for (let no = andador.nextNode(); no; no = andador.nextNode()) {
      if (!faixa.intersectsNode(no)) continue;
      const inicio = no === faixa.startContainer ? faixa.startOffset : 0;
      const fim = no === faixa.endContainer ? faixa.endOffset : no.length;
      if (fim > inicio) pedacos.push({ no, inicio, fim });
    }
    return pedacos;
  }

  function retangulos(no, inicio, fim) {
    const trecho = document.createRange();
    trecho.setStart(no, inicio);
    trecho.setEnd(no, fim);
    return [...trecho.getClientRects()].filter(r => r.width > 0 && r.height > 0);
  }

  function juntarPorLinha(caixas) {
    const linhasDoTexto = [];
    for (const r of caixas) {
      const mesma = linhasDoTexto.find(l => r.top < l.bottom - l.height / 2 && r.bottom > l.top + l.height / 2);
      if (!mesma) {
        linhasDoTexto.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height });
        continue;
      }
      mesma.left = Math.min(mesma.left, r.left);
      mesma.right = Math.max(mesma.right, r.right);
      mesma.top = Math.min(mesma.top, r.top);
      mesma.bottom = Math.max(mesma.bottom, r.bottom);
      mesma.height = mesma.bottom - mesma.top;
    }
    return linhasDoTexto.sort((a, b) => a.top - b.top || a.left - b.left);
  }

  function grifosDasPalavras(pedacos, palavras) {
    const texto = pedacos.map(({ no, inicio, fim }) => no.data.slice(inicio, fim)).join('');
    const caixas = [];
    let cursor = 0;
    for (const palavra of palavras) {
      const achada = raiz.Veio.posicaoDaPalavra(texto.slice(cursor), palavra);
      if (achada < 0) continue;
      const inicio = cursor + achada;
      const fim = inicio + palavra.length;
      if (LETRA.test(texto[inicio - 1] || '') || LETRA.test(texto[fim] || '')) continue;
      cursor = fim;
      let deslocamento = 0;
      for (const { no, inicio: comeco, fim: final } of pedacos) {
        const de = Math.max(inicio, deslocamento);
        const ate = Math.min(fim, deslocamento + final - comeco);
        if (ate > de) caixas.push(...retangulos(no, comeco + de - deslocamento, comeco + ate - deslocamento));
        deslocamento += final - comeco;
      }
    }
    return caixas;
  }

  function desenhar(geometria) {
    const { camada, estado } = partes;
    const origem = host.getBoundingClientRect();
    const chave = JSON.stringify([geometria, origem.left, origem.top, window.innerWidth]);
    if (chave === marca.chave) return;
    camada.classList.toggle('pm-marca--parada', Boolean(marca.chave));
    marca.chave = chave;

    const desenhos = [];
    for (const r of geometria.linhas) {
      const linha = elemento('div', 'pm-linha');
      posicionarEm(linha, r.left - origem.left, r.bottom - origem.top + LINHA_ABAIXO_DO_TEXTO, r.right - r.left);
      desenhos.push(linha);
    }
    for (const r of geometria.grifos) {
      const grifo = elemento('div', 'pm-grifo');
      posicionarEm(grifo, r.left - origem.left - 1, r.top - origem.top + r.height * 0.5, r.width + 2, r.height * 0.44);
      desenhos.push(grifo);
    }
    camada.replaceChildren(...desenhos);

    const chip = estado.querySelector('.pm-chip');
    const { width, height } = chip.getBoundingClientRect();
    const topo = geometria.linhas[0];
    const fundo = geometria.linhas[geometria.linhas.length - 1];
    const centro = (topo.left + topo.right) / 2;
    const esquerda = Math.max(MARGEM_DA_JANELA,
      Math.min(centro - width / 2, window.innerWidth - MARGEM_DA_JANELA - width));
    let cima = topo.top - CHIP_LONGE_DO_TEXTO - height;
    if (cima < MARGEM_DA_JANELA) cima = fundo.bottom + LINHA_ABAIXO_DO_TEXTO + CHIP_LONGE_DO_TEXTO;
    posicionarEm(chip, esquerda - origem.left, cima - origem.top);
  }

  function posicionarEm(no, esquerda, cima, largura, altura) {
    no.style.left = `${esquerda}px`;
    no.style.top = `${cima}px`;
    if (largura !== undefined) no.style.width = `${largura}px`;
    if (altura !== undefined) no.style.height = `${altura}px`;
  }

  function montarIcone(icone) {
    const circulo = elemento('span', 'pm-icone');
    circulo.append(raiz.Veio.iconeVeio(icone));
    return circulo;
  }

  function montarMeta(meta) {
    const sigla = elemento('span', 'pm-meta');
    sigla.textContent = meta;
    return sigla;
  }

  function fecharTudo() {
    if (!partes) return;
    clearTimeout(temporizador);
    if (marca) cancelAnimationFrame(marca.quadro);
    marca = null;
    const { pilula, estado, camada, pm } = partes;
    pilula.classList.remove('pm-pilula--aberta');
    camada.replaceChildren();
    pm.classList.remove('pm--apagada');
    estado.replaceChildren();
  }

  function previaEmVoltaDa(frase, palavra) {
    if (!palavra || frase.length <= PREVIA_CURTA) return frase;
    const posicao = raiz.Veio.posicaoDaPalavra(frase, palavra);
    if (posicao < PALAVRA_PERTO_DO_COMECO) return frase;
    const inicio = posicao - CONTEXTO_ANTES_DA_PALAVRA;
    const corte = frase.lastIndexOf(' ', inicio);
    return '…' + frase.slice(corte > 0 ? corte + 1 : inicio);
  }

  document.addEventListener('keydown', evento => {
    if (evento.key !== 'Escape' || !mostrandoFalha()) return;
    if (raiz.Atalhos.digitandoNumCampo(evento)) return;
    evento.stopImmediatePropagation();
    fecharTudo();
  }, true);

  raiz.Overlay = {
    aoClicar,
    definirRotulo,
    ehOHost,
    mostrar,
    mostrarBotao,
    mostrarContador,
    mostrandoFalha,
    temBotao,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
