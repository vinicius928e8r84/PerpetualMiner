'use strict';

// Base Veio · o tema escolhido, num lugar só.
//
// O escuro é o padrão e o claro é opcional (identidade Veio, "Tema e tokens").
// A escolha é do computador, não da conta: fica em `chrome.storage.local` e
// nunca sobe para a nuvem, então cada computador abre no tema que foi escolhido
// nele.
//
// Carregado no <head> de toda página da extensão, antes do CSS da página, e
// pendurado em `PerpetualMiner.Tema`:
//
//   const { gravarTema, lerTemaGravado, aoMudarTema, TEMAS } = PerpetualMiner.Tema;
//
// Ele aplica o tema no <html>, que é onde veio/tokens.css troca os valores
// (`[data-tema="claro"]`). Quem desenha o seletor é o painel; aqui fica só o
// que toda página precisa: abrir no tema certo e acompanhar a troca na hora.

(function (raiz) {
  /** Os dois temas, como ficam gravados. Quem compara usa estes. */
  const TEMAS = Object.freeze({
    ESCURO: 'escuro',
    CLARO: 'claro',
  });

  /** Sem nada gravado, o app abre no escuro. */
  const TEMA_PADRAO = TEMAS.ESCURO;

  /**
   * A chave da escolha, a mesma nos dois lugares onde ela fica.
   *
   * A verdade é o `chrome.storage.local`. Ele só responde depois de uma ida e
   * volta assíncrona, e até lá a página já pintou: quem escolheu o claro veria
   * um piscar escuro a cada abertura. Por isso a escolha é repetida em
   * `localStorage`, que responde na hora e é lido antes do <body> existir. Esse
   * espelho é só para a primeira pintura, e é corrigido assim que o
   * `chrome.storage` responde.
   */
  const CHAVE = 'pm_tema';

  /** Enquanto o tema troca, as transições dos componentes ficam de fora. */
  const MARCA_DA_TROCA = 'data-trocando-tema';

  /** Um dos dois temas; qualquer outra coisa (nada gravado, lixo) vira o padrão. */
  function normalizarTema(valor) {
    return valor === TEMAS.ESCURO || valor === TEMAS.CLARO ? valor : TEMA_PADRAO;
  }

  /**
   * Aplica o tema no <html> e guarda o espelho da próxima pintura.
   *
   * A troca não anima (spec de Configurações › Aparência): os componentes
   * transicionam fundo, cor e borda, e sem isso a tela inteira faria um
   * cross-fade. A marca sai no quadro seguinte, quando as cores novas já
   * pintaram, e as transições voltam para o que a pessoa fizer depois.
   */
  function aplicarTema(tema) {
    const escolhido = normalizarTema(tema);
    const raizDaPagina = document.documentElement;
    // Só a troca depois da página pronta: na primeira aplicação, ainda no
    // <head>, nada foi pintado e não há o que cross-fadear.
    const trocando = document.readyState !== 'loading'
      && raizDaPagina.getAttribute('data-tema') !== escolhido;
    if (trocando) raizDaPagina.setAttribute(MARCA_DA_TROCA, '');
    raizDaPagina.setAttribute('data-tema', escolhido);
    if (trocando) {
      requestAnimationFrame(() => requestAnimationFrame(() => raizDaPagina.removeAttribute(MARCA_DA_TROCA)));
    }
    try {
      localStorage.setItem(CHAVE, escolhido);
    } catch {
      // Sem localStorage (modo restrito), a página abre no padrão e corrige
      // quando o chrome.storage responder. Não é motivo para parar.
    }
    return escolhido;
  }

  /** O tema gravado, ou o padrão quando não há escolha. */
  async function lerTemaGravado() {
    const guardado = await chrome.storage.local.get(CHAVE);
    return normalizarTema(guardado?.[CHAVE]);
  }

  /** Grava a escolha. A tela troca pelo mesmo caminho de qualquer outra página. */
  async function gravarTema(tema) {
    const escolhido = normalizarTema(tema);
    aplicarTema(escolhido);
    await chrome.storage.local.set({ [CHAVE]: escolhido });
    return escolhido;
  }

  /**
   * Chama `fn` com o tema novo sempre que a escolha muda, nesta página ou em
   * qualquer outra aberta. O valor já chega normalizado.
   */
  function aoMudarTema(fn) {
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area === 'local' && CHAVE in mudancas) fn(normalizarTema(mudancas[CHAVE].newValue));
    });
  }

  /**
   * Abre no tema certo e acompanha as trocas.
   *
   * Roda em duas etapas de propósito: o espelho de `localStorage` pinta a
   * página no tema certo já na primeira pintura, e a leitura do
   * `chrome.storage` corrige se os dois discordarem (outro computador, ou o
   * espelho perdido). Depois disso, `chrome.storage.onChanged` mantém todas as
   * páginas abertas iguais, sem recarregar nenhuma.
   */
  function aplicarTemaGravado() {
    try {
      aplicarTema(localStorage.getItem(CHAVE));
    } catch {
      aplicarTema(TEMA_PADRAO);
    }

    lerTemaGravado().then(aplicarTema).catch(() => {});

    aoMudarTema(aplicarTema);
  }

  // A página não chama nada: carregar o arquivo no <head> já a abre no tema
  // gravado. A política de segurança da extensão (MV3) não deixa um <script>
  // inline fazer essa chamada, e o tema precisa valer antes da primeira
  // pintura. Fora da extensão (a vitrine, servida por HTTP) não há
  // `chrome.storage`, e aí a página fica no padrão do CSS.
  if (globalThis.chrome?.storage?.local) aplicarTemaGravado();

  raiz.Tema = {
    TEMAS,
    CHAVE,
    gravarTema,
    lerTemaGravado,
    aoMudarTema,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
