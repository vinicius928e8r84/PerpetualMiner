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
// Se a Conexão cai no passo 4, as abas voltam e a pergunta fica guardada para quando ela responder.
//
// Em que fase o card está é a máquina `FaseDaPrimeiraConexao` (painel-anki-primeira-conexao-estado.js):
// aqui só se mandam os eventos (o que a Conexão avisou, o passo 4 resolvido, o fim do Pronto) e se desenha a fase.
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

  const { textoDaVoz, Veio, Shell, ConexaoAnki, ConexaoNaTela, PassosDaConexao, FaseDaPrimeiraConexao } = raiz;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const { FASE, EVENTO, cobreAsAbas } = FaseDaPrimeiraConexao;
  const porId = id => document.getElementById(id);

  let maquina = FaseDaPrimeiraConexao.inicial();   // { fase, pendente }
  const estado = {
    prontoDesenhado: false, // o Pronto que o último desenho já mostrou (para o foco)
    conferindo: false,      // uma conferência está no ar
    conferiuEm: null,       // quando a última voltou
  };
  let passos = null;        // o componente dos passos (painel-conexao-passos.js)

  /** Manda um evento à máquina e faz o que a fase nova pede: guardar a pergunta pendente e marcar o fim do Pronto. */
  function despachar(tipo, dados = {}) {
    const antes = maquina;
    maquina = FaseDaPrimeiraConexao.proxima(maquina, { tipo, ...dados });
    if (maquina.pendente !== antes.pendente && tipo !== EVENTO.LEU) chrome.storage.local.set({ [CHAVE_ABRIDOR_PENDENTE]: maquina.pendente });
    if (maquina.fase === FASE.PRONTO && antes.fase !== FASE.PRONTO) {
      // O Pronto por um instante, e então as abas voltam, com o toast.
      setTimeout(() => {
        despachar(EVENTO.PRONTO_PASSOU);
        desenhar();
        if (Shell.areaAtual() === 'anki') Veio.mostrarToastDeSucesso(ConexaoNaTela.texto(CONEXAO.LIGADA));
      }, MOMENTO_PRONTO_MS);
    }
  }

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
      despachar(EVENTO.LEU, { pendente: gravado[CHAVE_ABRIDOR_PENDENTE] === true });
      // Os 2 minutos do componente contam da primeira vez que a área está à vista: quem chega depois
      // (de outra área) precisa de um desenho na entrada, que é quando o card passa a ser visto.
      Shell.aoEntrarNaArea('anki', desenhar);
      return ConexaoAnki.acompanhar(aoMudarAConexao);
    });
  }

  function aoMudarAConexao(situacao) {
    if (situacao !== CONEXAO.CONECTANDO) estado.conferiuEm = Date.now();
    // Uma resposta recebida antes da assinatura conta (`respondeu`); `jaConectou()` ainda é o de antes deste aviso.
    despachar(EVENTO.CONEXAO, {
      situacao,
      respondeu: ConexaoAnki.ultimaResposta() !== null,
      jaConectou: ConexaoAnki.jaConectou(),
      naArea: Shell.areaAtual() === 'anki',
      resolvido: passos.abridorResolvido(),
    });
    desenhar();
  }

  /** O passo 4 se resolveu: se o card o esperava, é a hora do Pronto. */
  function aoResolverOAbridor() {
    despachar(EVENTO.RESOLVEU);
    desenhar();
  }

  function desenharConferencia() {
    if (porId('anki-primeira-vez').hidden) return;
    const agora = estado.conferindo || ConexaoAnki.situacao() === CONEXAO.CONECTANDO;
    const segundos = Math.max(0, Math.floor((Date.now() - (estado.conferiuEm ?? Date.now())) / 1000));
    porId('apv-confere').textContent = agora
      ? textoDaVoz('ONB-16.conferindoAgora')
      : textoDaVoz('ONB-16.conferindo', { segundos });
  }

  function desenhar() {
    const cobre = cobreAsAbas(maquina);
    const pronto = maquina.fase === FASE.PRONTO;
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
    const entrouNoPronto = pronto && !estado.prontoDesenhado;
    estado.prontoDesenhado = pronto;

    porId('anki-primeira-vez-titulo').textContent = pronto ? ConexaoNaTela.texto(CONEXAO.LIGADA)
      : textoDaVoz(maquina.fase === FASE.PASSO4 ? 'ONB-17.titulo' : 'ONB-16.titulo');
    porId('apv-apoio').hidden = pronto;
    porId('apv-rodape').hidden = pronto;
    passos.desenhar({ pronto });

    desenharConferencia();
    if (entrouNoPronto && focoSaindo) passos.focarTitulo();
  }

  raiz.PrimeiraConexao = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
