'use strict';

// O card ONB-16 da Conexão com o Anki, quando ela nunca respondeu ligada
// neste computador (docs/design/painel/anki/prototipo-primeira-conexao.html,
// variante B “Igual às Boas-vindas”): a lista dos passos ao lado do card do passo
// (o componente de `painel-conexao-passos.js`, o mesmo do passo 4 da Boas-vindas)
// e, embaixo, a conferência sozinha e os dois quadros. O markup fixo é do
// painel.html; aqui se desenha o que muda.
//
// Os passos se marcam pelo estado real, e o único que a extensão enxerga antes da
// Conexão é ela mesma (o AnkiConnect não é lido: sem permissão nova). Por isso
// os três primeiros esperam a Conexão e viram ✓ juntos quando ela responde ligada.
// Logo depois vem o passo 4, Abrir o Anki sozinho (#147): o card fica no lugar das
// abas até ele se resolver (o abridor achou o Anki, ou a pessoa disse “Agora não”),
// e só então vem o momento Pronto, que o card segura antes de devolver as abas.
//
// A linha “Confere sozinho a cada 15 s” segue a conferência de /health que o
// shell inicia em `ConexaoAnki` (`acompanhar`, `aoConferir`): este arquivo não
// pergunta nada à rede. Os relógios são o de 1 s que reescreve “há N s” e o
// de 1,8 s do Pronto.
//
// O fluxo é todo daqui: quando o card cobre as abas e o momento Pronto (o toast
// e o foco que o acompanham); o passo aberto é do componente. O painel-anki.js não
// pergunta nada: o card põe e tira `anki--primeira-vez` na área, e o CSS troca
// as abas pelo card. A assinatura de situação em `montar` é a única do fluxo
// ONB-16, que não depende da ordem em que outros ouvintes entram.

(function (raiz) {
  const INTERVALO_DO_TIQUE = 1000;
  // Quanto o momento Pronto fica na tela antes de as abas voltarem.
  const MOMENTO_PRONTO_MS = 1800;
  // A saúde HTTP não conclui o pedido de permissão: esta espera sobrevive à recarga.
  const CHAVE_ABRIDOR_PENDENTE = 'pm_anki_abridor_pendente';

  const { textoDaVoz, Veio, Shell, ConexaoAnki, ConexaoNaTela, PassosDaConexao } = raiz;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);

  const estado = {
    pronto: false,          // o momento Pronto está na tela
    esperandoOAbridor: false, // a Conexão ligou com o card na tela; o passo 4 ainda não se resolveu
    prontoDesenhado: false, // o Pronto que o último desenho já mostrou (para o foco)
    conferindo: false,      // uma conferência está no ar
    conferiuEm: null,       // quando a última voltou
    visto: { situacao: CONEXAO.CONECTANDO, respondeu: false },  // o que a última notificação disse
  };
  let passos = null;        // o componente dos passos (painel-conexao-passos.js)

  // ─── Montagem ──────────────────────────────────────────────────────────────

  /**
   * Monta o card e espera `ConexaoAnki.pronta` antes de acompanhar a situação,
   * para conhecer o fato “já respondeu ligada neste computador”. Uma resposta
   * recebida antes da assinatura continua contando durante uma tentativa.
   * Devolve uma promessa que resolve com a função que retira só esse ouvinte
   * de situação; não desmonta o card nem encerra a Conferência.
   */
  function montar() {
    passos = PassosDaConexao.montar(porId('apv-passos'), { prefixo: 'apv', aoResolverOAbridor });
    ConexaoAnki.aoConferir(conferindo => {
      estado.conferindo = conferindo;
      desenharConferencia();
    });
    setInterval(desenharConferencia, INTERVALO_DO_TIQUE);
    return Promise.all([ConexaoAnki.pronta, chrome.storage.local.get({ [CHAVE_ABRIDOR_PENDENTE]: false })]).then(([, gravado]) => {
      estado.esperandoOAbridor = gravado[CHAVE_ABRIDOR_PENDENTE] === true;
      estado.visto.respondeu = ConexaoAnki.ultimaResposta() !== null;
      // Os 2 minutos do componente contam da primeira vez que a área está à vista: quem chega depois
      // (de outra área) precisa de um desenho na entrada, que é quando o card passa a ser visto.
      Shell.aoEntrarNaArea('anki', desenhar);
      return ConexaoAnki.acompanhar(aoMudarAConexao);
    });
  }

  // ─── A Conexão ─────────────────────────────────────────────────────────────

  /** O card está no lugar das abas (inclusive no passo 4 logo depois de ligar, e no momento Pronto). */
  function cobreAsAbas({ situacao, respondeu } = estado.visto) {
    return respondeu && (estado.pronto || estado.esperandoOAbridor
      || (!ConexaoAnki.jaConectou() && situacao !== CONEXAO.LIGADA));
  }

  function aoMudarAConexao(situacao) {
    const { situacao: antes, respondeu } = estado.visto;
    const eraPrimeiraVez = cobreAsAbas({ situacao: antes, respondeu });
    estado.visto = { situacao, respondeu: respondeu || situacao !== CONEXAO.CONECTANDO };
    if (situacao !== CONEXAO.CONECTANDO) estado.conferiuEm = Date.now();
    // Em outra área (ou nas Boas-vindas) ninguém olha o card: as abas só estarão
    // lá quando a pessoa chegar, sem Pronto nem toast.
    if (situacao === CONEXAO.LIGADA && eraPrimeiraVez && !estado.pronto && Shell.areaAtual() === 'anki') {
      // O passo 4 vem antes do Pronto, a menos que ele já esteja resolvido (um “Agora não” guardado).
      if (passos.abridorResolvido()) {
        estado.esperandoOAbridor = false;
        chrome.storage.local.set({ [CHAVE_ABRIDOR_PENDENTE]: false });
        comecarOPronto();
      } else {
        estado.esperandoOAbridor = true;
        chrome.storage.local.set({ [CHAVE_ABRIDOR_PENDENTE]: true });
      }
    }
    // Mesmo se a saúde cair no meio do passo 4, a escolha continua pendente.
    desenhar();
  }

  /** O passo 4 se resolveu: se o card o esperava, é a hora do Pronto. */
  function aoResolverOAbridor() {
    if (!estado.esperandoOAbridor) return;
    estado.esperandoOAbridor = false;
    chrome.storage.local.set({ [CHAVE_ABRIDOR_PENDENTE]: false });
    comecarOPronto();
    desenhar();
  }

  /** A primeira resposta com o card na tela: o Pronto por um instante, e então as abas voltam, com o toast. */
  function comecarOPronto() {
    estado.pronto = true;
    setTimeout(() => {
      estado.pronto = false;
      desenhar();
      if (Shell.areaAtual() === 'anki') Veio.mostrarToastDeSucesso(ConexaoNaTela.texto(CONEXAO.LIGADA));
    }, MOMENTO_PRONTO_MS);
  }

  // ─── A conferência de 15 s do ConexaoAnki ───────────────────────────────────

  function desenharConferencia() {
    if (porId('anki-primeira-vez').hidden) return;
    const agora = estado.conferindo || ConexaoAnki.situacao() === CONEXAO.CONECTANDO;
    const segundos = Math.max(0, Math.floor((Date.now() - (estado.conferiuEm ?? Date.now())) / 1000));
    porId('apv-confere').textContent = agora
      ? textoDaVoz('ONB-16.conferindoAgora')
      : textoDaVoz('ONB-16.conferindo', { segundos });
  }

  // ─── O card ────────────────────────────────────────────────────────────────

  function desenhar() {
    const cobre = cobreAsAbas();
    const secao = porId('anki-primeira-vez');
    // As abas voltam à tela antes de o card sair: é onde o foco dele vai pousar.
    document.querySelector('.shell-area[data-area="anki"]').classList.toggle('anki--primeira-vez', cobre);
    // O card sai com o foco dentro: ele vai para a aba, em vez de cair no fim da página.
    if (!cobre && !secao.hidden && secao.contains(document.activeElement)) {
      document.querySelector('input[name="aba-anki"]:checked')?.focus();
    }
    secao.hidden = !cobre;
    estado.prontoDesenhado = estado.prontoDesenhado && cobre;
    passos.mostrar(cobre && Shell.areaAtual() === 'anki');
    if (!cobre) return;
    // Entrar em Pronto tira os controles do card. A F1 também pode ter saído
    // com as abas ainda ocultas: nestes casos, o título acolhe o foco.
    const ativo = document.activeElement;
    const focoSaindo = secao.contains(ativo) || ativo === document.body || ativo === null;
    const entrouNoPronto = estado.pronto && !estado.prontoDesenhado;
    estado.prontoDesenhado = estado.pronto;

    porId('anki-primeira-vez-titulo').textContent = estado.pronto ? ConexaoNaTela.texto(CONEXAO.LIGADA)
      : textoDaVoz(estado.esperandoOAbridor || ConexaoAnki.jaConectou() || estado.visto.situacao === CONEXAO.LIGADA
        ? 'ONB-17.titulo' : 'ONB-16.titulo');
    porId('apv-apoio').hidden = estado.pronto;
    porId('apv-rodape').hidden = estado.pronto;
    passos.desenhar({ pronto: estado.pronto });

    desenharConferencia();
    if (entrouNoPronto && focoSaindo) passos.focarTitulo();
  }

  raiz.PrimeiraConexao = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
