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
//   const { aplicarTemaGravado, gravarTema, TEMAS } = PerpetualMiner.Tema;
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

  /** A chave em `chrome.storage.local`. */
  const CHAVE = 'pm_tema';

  /**
   * A mesma escolha repetida em `localStorage`, só para a primeira pintura.
   *
   * `chrome.storage` só responde depois de um ida e volta assíncrono, e até lá
   * a página já pintou: quem escolheu o claro veria um piscar escuro a cada
   * abertura. `localStorage` responde na hora, na mesma origem da extensão, e é
   * lido antes do <body> existir. A verdade continua sendo o `chrome.storage`:
   * este espelho é corrigido assim que ele responde.
   */
  const CHAVE_DE_PINTURA = 'pm_tema';

  function temaValido(valor) {
    return valor === TEMAS.ESCURO || valor === TEMAS.CLARO;
  }

  /** O tema aplicado agora nesta página. */
  function temaAplicado() {
    const atual = document.documentElement.getAttribute('data-tema');
    return temaValido(atual) ? atual : TEMA_PADRAO;
  }

  /** Aplica o tema no <html> e guarda o espelho da próxima pintura. */
  function aplicarTema(tema) {
    const escolhido = temaValido(tema) ? tema : TEMA_PADRAO;
    document.documentElement.setAttribute('data-tema', escolhido);
    try {
      localStorage.setItem(CHAVE_DE_PINTURA, escolhido);
    } catch {
      // Sem localStorage (modo restrito), a página abre no padrão e corrige
      // quando o chrome.storage responder. Não é motivo para parar.
    }
    return escolhido;
  }

  /** O tema gravado, ou o padrão quando não há escolha. */
  async function lerTemaGravado() {
    const guardado = await chrome.storage.local.get(CHAVE);
    return temaValido(guardado?.[CHAVE]) ? guardado[CHAVE] : TEMA_PADRAO;
  }

  /** Grava a escolha. A tela troca pelo mesmo caminho de qualquer outra página. */
  async function gravarTema(tema) {
    const escolhido = temaValido(tema) ? tema : TEMA_PADRAO;
    aplicarTema(escolhido);
    await chrome.storage.local.set({ [CHAVE]: escolhido });
    return escolhido;
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
      const espelho = localStorage.getItem(CHAVE_DE_PINTURA);
      if (temaValido(espelho)) aplicarTema(espelho);
      else aplicarTema(TEMA_PADRAO);
    } catch {
      aplicarTema(TEMA_PADRAO);
    }

    lerTemaGravado().then(aplicarTema).catch(() => {});

    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local' || !(CHAVE in mudancas)) return;
      aplicarTema(mudancas[CHAVE].newValue);
    });
  }

  // A página não chama nada: carregar o arquivo no <head> já a abre no tema
  // gravado. A política de segurança da extensão (MV3) não deixa um <script>
  // inline fazer essa chamada, e o tema precisa valer antes da primeira
  // pintura. Fora da extensão (a vitrine, servida por HTTP) não há
  // `chrome.storage`, e aí a página fica no padrão do CSS.
  if (globalThis.chrome?.storage?.local) aplicarTemaGravado();

  raiz.Tema = {
    TEMAS,
    TEMA_PADRAO,
    CHAVE,
    aplicarTema,
    aplicarTemaGravado,
    gravarTema,
    lerTemaGravado,
    temaAplicado,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
