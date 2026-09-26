'use strict';

// O overlay na página: um componente Veio só, em Shadow DOM.
//
// Carregado pelo manifest antes de content.js, que o usa por
// `PerpetualMiner.Overlay`. O overlay vive sobre sites de terceiros, então:
//
// - O único nó que ele põe no DOM do site é o host (`<perpetualminer-overlay>`).
//   Tudo o mais — botão, pílula, estilos — mora na sombra dele, e nem o site
//   enxerga os estilos do overlay nem o contrário.
// - Os tokens são sempre os escuros (`data-tema="escuro"`), qualquer que seja o
//   tema escolhido para as páginas da extensão.
// - A cópia vem de quem chama, já buscada no catálogo da Voz.
//
// Uma instância por vez: o feedback novo substitui o anterior. Todo feedback,
// sucesso ou falha, some em ~3,5 s, como no protótipo; o Esc fecha uma falha antes.

(function (raiz) {
  const TAG_DO_HOST = 'perpetualminer-overlay';
  const FEEDBACK_SOME_EM_MS = 3500;
  const ESTILOS = ['veio/tokens.css', 'veio/componentes.css', 'overlay.css'];
  /** A pílula nunca corta a Palavra: frases maiores que isto começam perto dela. */
  const PREVIA_CURTA = 48;
  /** A Palavra até este caractere já cabe na prévia: a frase começa do começo. */
  const PALAVRA_PERTO_DO_COMECO = 28;
  /** Quantos caracteres antes da Palavra a prévia guarda, para ela vir com contexto. */
  const CONTEXTO_ANTES_DA_PALAVRA = 18;

  let host = null;
  let partes = null;
  let temporizador = null;
  let aoClicarNoBotao = () => {};
  let rotuloDoBotao = '';

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
    botao.append(azulejo, contador);
    botao.addEventListener('click', evento => aoClicarNoBotao(evento));

    const corpo = elemento('div', 'pm-corpo');
    const estado = elemento('div', 'pm-estado');
    estado.setAttribute('role', 'status');
    estado.setAttribute('aria-live', 'polite');
    corpo.append(estado);

    pilula.append(botao, corpo);
    pm.append(pilula);
    sombra.append(pm);

    // Clicar no overlay não é clicar no site (um player pausaria o vídeo).
    for (const tipo of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) {
      pm.addEventListener(tipo, evento => evento.stopPropagation());
    }

    partes = { pm, pilula, botao, contador, estado };
    botao.setAttribute('aria-label', rotuloDoBotao);
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
      bottom: '16px',
      'z-index': '2147483647',
      display: 'block',
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

  /** O nome do botão para o leitor de tela (MIN-07, com o atalho gravado: “Minerar legenda (Alt+S)”). */
  function definirRotulo(rotulo) {
    rotuloDoBotao = rotulo;
    partes?.botao.setAttribute('aria-label', rotulo);
  }

  function aoClicar(fn) {
    aoClicarNoBotao = fn;
  }

  /** O contador da mineração automática no canto do botão; `null` o esconde. */
  function mostrarContador(contagem) {
    if (!partes) return;
    const { contador } = partes;
    contador.hidden = !contagem;
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

  /** Uma falha está na tela. */
  function mostrandoFalha() {
    return Boolean(partes?.pilula.classList.contains('pm-pilula--aberta')
      && partes.pilula.classList.contains('pm-pilula--erro'));
  }

  /**
   * Abre a pílula com um feedback, no lugar do anterior. Some sozinha em ~3,5 s.
   *
   * @param {object}   feedback
   * @param {'sucesso'|'erro'} feedback.tipo
   * @param {string}   feedback.icone         Um ícone da Base Veio (legenda, selecao, automatica, alerta).
   * @param {string}   feedback.titulo        O título do catálogo.
   * @param {string}   [feedback.dica]        Numa falha, a 2ª linha do catálogo: o que fazer.
   * @param {string}   [feedback.frase]       Num sucesso, a frase minerada, numa linha.
   * @param {string}   [feedback.palavra]     A Palavra a grifar na frase.
   * @param {string}   [feedback.meta]        A meta no fim da pílula, em mono (`EN`, `Web`, `RU 5/20`).
   */
  function mostrar({ tipo, icone, titulo, dica = '', frase = '', palavra = '', meta = '' }) {
    if (!temBotao()) posicionar(null);
    const { pilula, estado } = partes;
    const { Veio } = raiz;
    clearTimeout(temporizador);

    const circulo = elemento('span', 'pm-icone');
    circulo.append(Veio.iconeVeio(icone));
    const texto = elemento('span', 'pm-texto');
    const negrito = elemento('b', 'pm-titulo');
    negrito.textContent = titulo;
    texto.append(negrito);
    if (frase) {
      const linha = elemento('span', 'pm-frase');
      Veio.escreverFrase(linha, previaEmVoltaDa(frase, palavra), palavra);
      texto.append(linha);
    } else if (dica) {
      const linha = elemento('span', 'pm-frase');
      linha.textContent = dica;
      texto.append(linha);
    }
    estado.replaceChildren(circulo, texto);
    if (meta) {
      const sigla = elemento('span', 'pm-meta');
      sigla.textContent = meta;
      estado.append(sigla);
    }

    pilula.classList.toggle('pm-pilula--erro', tipo === 'erro');
    pilula.classList.add('pm-pilula--aberta');
    temporizador = setTimeout(fecharPilula, FEEDBACK_SOME_EM_MS);
  }

  function fecharPilula() {
    if (!partes) return;
    clearTimeout(temporizador);
    const { pilula, estado } = partes;
    pilula.classList.remove('pm-pilula--aberta');
    // O conteúdo sai com a pílula: nada fica escondido na região de status.
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
    fecharPilula();
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
