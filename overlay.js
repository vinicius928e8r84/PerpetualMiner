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
// Uma instância por vez: o feedback novo substitui o anterior. Sucesso some em
// ~3,5 s; falha fica até o ×, o Esc ou o próximo feedback.

(function (raiz) {
  const TAG_DO_HOST = 'perpetualminer-overlay';
  const SUCESSO_SOME_EM_MS = 3500;
  const ESTILOS = ['veio/tokens.css', 'veio/componentes.css', 'overlay.css'];
  /** A pílula nunca corta a Palavra: frases maiores que isto começam perto dela. */
  const PREVIA_CURTA = 48;

  let host = null;
  let partes = null;
  let temporizador = null;
  let aoClicarNoBotao = () => {};
  let rotuloDoBotao = { nome: '', comAtalho: '' };
  let teclaDoBotao = '';

  /** O host, com a sombra montada uma vez só. */
  function montar() {
    if (host) return;
    const { Veio } = raiz;

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
    // O rótulo visível repete o aria-label do botão: fica fora da árvore de acessibilidade.
    const rotulo = elemento('span', 'pm-rotulo');
    rotulo.setAttribute('aria-hidden', 'true');
    const nomeDoRotulo = elemento('span', 'pm-rotulo__nome');
    rotulo.append(nomeDoRotulo);
    botao.append(azulejo, contador, rotulo);
    botao.addEventListener('click', evento => aoClicarNoBotao(evento));

    const corpo = elemento('div', 'pm-corpo');
    const estado = elemento('div', 'pm-estado');
    estado.setAttribute('role', 'status');
    estado.setAttribute('aria-live', 'polite');
    const acoes = elemento('div', 'pm-acoes');
    corpo.append(estado, acoes);

    pilula.append(botao, corpo);
    pm.append(pilula);
    sombra.append(pm);

    // Clicar no overlay não é clicar no site (um player pausaria o vídeo).
    for (const tipo of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) {
      pm.addEventListener(tipo, evento => evento.stopPropagation());
    }

    partes = { pm, pilula, botao, contador, rotulo, nomeDoRotulo, estado, acoes, Veio };
    desenharRotulo();
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
      right: livre ? '24px' : '30px',
      bottom: livre ? '24px' : '95px',
      'z-index': '2147483647',
      display: 'block',
    };
    host.removeAttribute('style');
    for (const [propriedade, valor] of Object.entries(estilo)) host.style.setProperty(propriedade, valor, 'important');
    partes.pilula.classList.toggle('pm-pilula--livre', livre);
  }

  /** O botão flutuante no container do player (fica lá também em tela cheia). */
  function mostrarBotao(container) {
    if (host && host.parentNode === container) return;
    posicionar(container);
  }

  /**
   * O rótulo do botão (MIN-07): `comAtalho` é o aria-label (“Minerar legenda (Alt+S)”),
   * `nome` o rótulo visível ao passar o mouse, com `tecla` num kbd ao lado.
   */
  function definirRotulo({ nome, comAtalho }, tecla) {
    const rotulo = { nome, comAtalho };
    rotuloDoBotao = rotulo;
    teclaDoBotao = tecla;
    if (partes) desenharRotulo();
  }

  function desenharRotulo() {
    const { botao, rotulo, nomeDoRotulo, Veio } = partes;
    botao.setAttribute('aria-label', rotuloDoBotao.comAtalho);
    nomeDoRotulo.textContent = rotuloDoBotao.nome;
    rotulo.querySelector('kbd')?.remove();
    if (teclaDoBotao) rotulo.append(Veio.montarTecla(teclaDoBotao));
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

  /** O botão existe na página (há um player). */
  function temBotao() {
    return Boolean(host?.isConnected && !partes.pilula.classList.contains('pm-pilula--livre'));
  }

  /** Uma falha está na tela, esperando o ×, o Esc ou o próximo feedback. */
  function mostrandoFalha() {
    return Boolean(partes?.pilula.classList.contains('pm-pilula--aberta')
      && partes.pilula.classList.contains('pm-pilula--erro'));
  }

  /**
   * Abre a pílula com um feedback, no lugar do anterior.
   *
   * @param {object}   feedback
   * @param {'sucesso'|'erro'} feedback.tipo  Sucesso some sozinho; erro fica até ser fechado.
   * @param {string}   feedback.icone         Um ícone da Base Veio (legenda, selecao, automatica, alerta).
   * @param {string}   feedback.titulo        A frase do catálogo.
   * @param {string}   [feedback.frase]       A frase minerada, numa linha.
   * @param {string}   [feedback.palavra]     A Palavra a grifar na frase.
   * @param {string}   [feedback.fechar]      O rótulo do × (obrigatório num erro).
   * @param {{rotulo: string, fazer: Function}} [feedback.acao] O botão ao lado (Tentar de novo).
   */
  function mostrar({ tipo, icone, titulo, frase = '', palavra = '', fechar, acao }) {
    if (!temBotao()) posicionar(null);
    const { pilula, estado, acoes, Veio } = partes;
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
    }
    estado.replaceChildren(circulo, texto);

    acoes.replaceChildren();
    if (acao) {
      const botao = elemento('button', 'veio-botao veio-botao--secundario veio-botao--compacto');
      botao.type = 'button';
      botao.textContent = acao.rotulo;
      botao.addEventListener('click', () => acao.fazer());
      acoes.append(botao);
    }
    if (tipo === 'erro') {
      if (!fechar) throw new Error('Uma falha do overlay precisa do rótulo do ×.');
      const x = elemento('button', 'veio-botao-icone');
      x.type = 'button';
      x.setAttribute('aria-label', fechar);
      x.title = fechar;
      x.append(Veio.iconeVeio('fechar'));
      x.addEventListener('click', fecharPilula);
      acoes.append(x);
    }

    pilula.classList.toggle('pm-pilula--erro', tipo === 'erro');
    pilula.classList.add('pm-pilula--aberta');
    if (tipo !== 'erro') temporizador = setTimeout(fecharPilula, SUCESSO_SOME_EM_MS);
  }

  function fecharPilula() {
    if (!partes) return;
    clearTimeout(temporizador);
    const { pilula, estado, acoes } = partes;
    pilula.classList.remove('pm-pilula--aberta');
    // O conteúdo sai com a pílula: nada fica escondido na região de status.
    estado.replaceChildren();
    acoes.replaceChildren();
  }

  /** “…saying it’s your responsibility.”: numa frase longa, a prévia começa perto da Palavra. */
  function previaEmVoltaDa(frase, palavra) {
    if (!palavra || frase.length <= PREVIA_CURTA) return frase;
    const posicao = frase.toLowerCase().indexOf(palavra.toLowerCase());
    if (posicao < 28) return frase;
    const corte = frase.lastIndexOf(' ', posicao - 18);
    return '…' + frase.slice(corte > 0 ? corte + 1 : posicao - 18);
  }

  // Esc fecha uma falha aberta. Sem falha, o Esc é todo do site.
  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape' && mostrandoFalha()) fecharPilula();
  }, true);

  raiz.Overlay = {
    aoClicar,
    definirRotulo,
    mostrar,
    mostrarBotao,
    mostrarContador,
    mostrandoFalha,
    temBotao,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
