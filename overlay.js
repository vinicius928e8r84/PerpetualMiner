'use strict';

(function (raiz) {
  const TAG_DO_HOST = 'perpetualminer-overlay';
  const FEEDBACK_SOME_EM_MS = 3500;
  const ESTILOS = ['veio/tokens.css', 'veio/componentes.css', 'overlay.css'];
  /** A pílula nunca corta a Palavra: frases maiores que isto começam perto dela. */
  const PREVIA_CURTA = 32;
  /** A Palavra até este caractere já cabe na prévia: a frase começa do começo. */
  const PALAVRA_PERTO_DO_COMECO = 16;
  /** Quantos caracteres antes da Palavra a prévia guarda, para ela vir com contexto. */
  const CONTEXTO_ANTES_DA_PALAVRA = 14;
  /** A linha fica esta distância abaixo do texto, como no protótipo. */
  const LINHA_ABAIXO_DO_TEXTO = 3;
  /** O chip fica esta distância acima do texto (ou abaixo da linha, sem lugar acima). */
  const CHIP_LONGE_DO_TEXTO = 8;
  /** O chip nunca encosta na borda da janela. */
  const MARGEM_DA_JANELA = 8;
  /** Uma letra de palavra, em qualquer alfabeto (a mesma regra de `posicaoDaPalavra`). */
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
  /** A etiqueta que aparece com o mouse ou o foco: o nome e a tecla do atalho gravado (ou nenhuma). */
  let etiquetaDoBotao = { nome: '', tecla: null };
  /** A 2ª linha da etiqueta: o contador do dia sem o idioma (a meta e o leitor de tela já o dizem). */
  let etiquetaDoContador = '';
  /** A marca na tela: `{ lugar, palavras, chave, quadro }`, ou null. */
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
        // Sem a fonte, o overlay desenha na de reserva dos tokens.
        .catch(() => {});
    }
  }

  /** O host, com a sombra montada uma vez só. */
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
    // Até os estilos chegarem, nada aparece sem estilo por cima do site.
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
    // A etiqueta do protótipo, à esquerda do botão, com o mouse ou o foco do
    // teclado. O leitor de tela já ouve o mesmo pelo nome e pela descrição do botão.
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
    // A linha e o grifo: desenho sobre o texto do site, fora da árvore de acessibilidade.
    const camada = elemento('div', 'pm-marca');
    camada.setAttribute('aria-hidden', 'true');
    // O contador em palavras (MIN-11): a descrição do botão para o leitor de tela.
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

  /** Põe o host no lugar. Sem player, a pílula é livre: canto inferior direito da janela. */
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
      // O mouse é do site: só a pílula (overlay.css) o pega.
      'pointer-events': 'none',
    };
    host.removeAttribute('style');
    for (const [propriedade, valor] of Object.entries(estilo)) host.style.setProperty(propriedade, valor, 'important');
    partes.pilula.classList.toggle('pm-pilula--livre', livre);
    // Sem player, o azulejo é só a marca na ponta da pílula: não é um botão.
    const { botao } = partes;
    botao.tabIndex = livre ? -1 : 0;
    if (livre) botao.setAttribute('aria-hidden', 'true');
    else botao.removeAttribute('aria-hidden');
  }

  /** O botão flutuante no container do player (fica lá também em tela cheia). */
  function mostrarBotao(container) {
    if (host && host.parentNode === container) return;
    posicionar(container);
  }

  /**
   * O nome do botão para o leitor de tela (MIN-07, com o atalho gravado:
   * “Minerar legenda (Alt+S)”) e a etiqueta visível: `nome` e a `tecla` num kbd
   * (sem atalho, `tecla` é `null` e a etiqueta traz só o nome).
   */
  function definirRotulo(rotulo, { nome, tecla = null } = {}) {
    rotuloDoBotao = rotulo;
    etiquetaDoBotao = { nome: nome || rotulo, tecla };
    partes?.botao.setAttribute('aria-label', rotulo);
    desenharEtiqueta();
  }

  /** A etiqueta: o nome e o atalho; embaixo, com a mineração automática ligada, o contador do dia (MIN-11). */
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

  /**
   * O contador da mineração automática no canto do botão; `null` o esconde.
   *
   * @param {{texto: string, noLimite: boolean, descricao: string, etiqueta: string}|null} contagem
   *   `texto` é o que a pílula ouro mostra (`9/15`); `descricao`, o que o leitor
   *   de tela ouve junto com o nome do botão (MIN-11); `etiqueta`, a 2ª linha da
   *   etiqueta visível, sem o idioma.
   */
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

  /** O nó é o host do overlay: o único que ele põe no DOM do site. */
  function ehOHost(no) {
    return no?.localName === TAG_DO_HOST;
  }

  /** O botão existe na página (há um player). */
  function temBotao() {
    return Boolean(host?.isConnected && !partes.pilula.classList.contains('pm-pilula--livre'));
  }

  function mostrandoFalha() {
    return Boolean(partes?.pilula.classList.contains('pm-pilula--aberta')
      && partes.pilula.classList.contains('pm-pilula--erro'));
  }

  /**
   * Mostra um feedback, no lugar do anterior: a marca sobre o texto quando ele
   * ainda está na tela, senão a pílula. Some sozinho em ~3,5 s.
   *
   * @param {object}   feedback
   * @param {'sucesso'|'erro'} feedback.tipo
   * @param {string}   feedback.icone         Um ícone da Base Veio (legenda, selecao, automatica, alerta).
   * @param {string}   feedback.titulo        O título do catálogo.
   * @param {string}   [feedback.dica]        Numa falha, a 2ª linha do catálogo: o que fazer.
   * @param {string}   [feedback.frase]       Num sucesso, a frase minerada.
   * @param {string[]} [feedback.palavras]    A Palavra a grifar: as palavras do primeiro grupo.
   * @param {boolean}  [feedback.palavraDetectada] O chip diz `auto:` (detectada) ou `palavra:` (escolhida).
   * @param {string}   [feedback.meta]        A meta em mono (`EN`, `Web`, `RU 5/20`).
   * @param {Function} [feedback.lugar]       Onde o texto capturado está agora: um `Range` sobre ele,
   *                                          ou null quando ele já não está na tela (a legenda trocou).
   * @param {boolean}  [feedback.apagada]     A marca da mineração automática, mais apagada.
   */
  function mostrar(feedback) {
    const { tipo, lugar } = feedback;
    if (!temBotao()) posicionar(null);
    fecharTudo();

    const geometria = tipo === 'sucesso' && lugar ? medir(lugar(), feedback.palavras) : null;
    if (geometria) marcar(feedback, geometria);
    else abrirPilula(feedback);
    temporizador = setTimeout(fecharTudo, FEEDBACK_SOME_EM_MS);
  }

  /** A reserva C: o botão estica para a esquerda com o feedback. */
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

  /**
   * A marca (D): a linha ouro sob cada linha do texto, a faixa de marca-texto
   * sobre a Palavra e o chip acima do texto. O chip mora na região de status (é
   * ele que o leitor de tela ouve, com a frase); a linha e o grifo, na camada de
   * desenho. Enquanto está na tela, a marca acompanha o texto a cada quadro e
   * sai na hora se ele muda.
   */
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
    // A frase é do leitor de tela: na tela, ela é o próprio texto do site.
    const fala = elemento('span', 'veio-so-leitor');
    fala.textContent = frase;
    estado.replaceChildren(chip, fala);

    pm.classList.toggle('pm--apagada', apagada);
    marca = { lugar, palavras, chave: '', quadro: 0 };
    desenhar(geometria);
    acompanhar();
  }

  /** A cada quadro: o texto ainda é o mesmo? Então a marca vai atrás dele; senão, sai. */
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

  /**
   * Onde o texto está na tela, em linhas, e onde está a Palavra; null se não dá
   * para marcar (sem retângulo, ou fora do player em que o overlay mora).
   */
  function medir(faixa, palavras = []) {
    if (!faixa || !host?.isConnected) return null;
    const pedacos = pedacosDeTexto(faixa);
    const linhasDoTexto = juntarPorLinha(pedacos.flatMap(({ no, inicio, fim }) => retangulos(no, inicio, fim)));
    if (!linhasDoTexto.length) return null;

    // Com player, o overlay mora no container dele: um texto fora dali ficaria cortado.
    if (host.parentNode !== document.documentElement) {
      const caixa = host.parentNode.getBoundingClientRect();
      const dentro = linhasDoTexto.every(r => r.left >= caixa.left - 1 && r.right <= caixa.right + 1
        && r.top >= caixa.top - 1 && r.bottom <= caixa.bottom + 1);
      if (!dentro) return null;
    }
    return { linhas: linhasDoTexto, grifos: grifosDasPalavras(pedacos, palavras) };
  }

  /** Os nós de texto dentro da faixa, cada um com o trecho dele que está nela. */
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

  /** Os retângulos de uma mesma linha visual viram um só, da primeira à última letra. */
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

  /**
   * Os retângulos de cada palavra da Palavra no texto do site. Cada uma é
   * procurada depois da anterior, como palavra inteira (`posicaoDaPalavra`).
   */
  function grifosDasPalavras(pedacos, palavras) {
    const texto = pedacos.map(({ no, inicio, fim }) => no.data.slice(inicio, fim)).join('');
    const caixas = [];
    let cursor = 0;
    for (const palavra of palavras) {
      const achada = raiz.Veio.posicaoDaPalavra(texto.slice(cursor), palavra);
      if (achada < 0) continue;
      const inicio = cursor + achada;
      const fim = inicio + palavra.length;
      // Achada só no meio de outra (“it” em “with”): não é a Palavra.
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

  /** Põe a linha, o grifo e o chip onde o texto está agora, relativos ao host. */
  function desenhar(geometria) {
    const { camada, estado } = partes;
    const origem = host.getBoundingClientRect();
    const chave = JSON.stringify([geometria, origem.left, origem.top, window.innerWidth]);
    if (chave === marca.chave) return;
    // Só a primeira aparição anima: a marca que acompanha o texto não pisca.
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
      // A faixa de marca-texto da identidade: de 50% a 94% da altura da linha.
      posicionarEm(grifo, r.left - origem.left - 1, r.top - origem.top + r.height * 0.5, r.width + 2, r.height * 0.44);
      desenhos.push(grifo);
    }
    camada.replaceChildren(...desenhos);

    // O chip: centrado sobre a primeira linha, dentro da janela; sem lugar acima
    // do texto, vai para baixo da última linha.
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

  /** Tira da tela o feedback que estiver nela: a pílula ou a marca. */
  function fecharTudo() {
    if (!partes) return;
    clearTimeout(temporizador);
    if (marca) cancelAnimationFrame(marca.quadro);
    marca = null;
    const { pilula, estado, camada, pm } = partes;
    pilula.classList.remove('pm-pilula--aberta');
    camada.replaceChildren();
    pm.classList.remove('pm--apagada');
    // O conteúdo sai junto: nada fica escondido na região de status.
    estado.replaceChildren();
  }

  /** “…saying it’s your responsibility.”: numa frase longa, a prévia começa perto da Palavra. */
  function previaEmVoltaDa(frase, palavra) {
    if (!palavra || frase.length <= PREVIA_CURTA) return frase;
    const posicao = raiz.Veio.posicaoDaPalavra(frase, palavra);
    if (posicao < PALAVRA_PERTO_DO_COMECO) return frase;
    const inicio = posicao - CONTEXTO_ANTES_DA_PALAVRA;
    const corte = frase.lastIndexOf(' ', inicio);
    return '…' + frase.slice(corte > 0 ? corte + 1 : inicio);
  }

  // Esc fecha uma falha aberta, e esse Esc é do overlay: o site não o recebe.
  // Sem falha, ou digitado num campo do site, o Esc é todo do site.
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
