'use strict';

// O card ONB-16 da Conexão com o Anki, quando ela nunca respondeu ligada
// neste computador (docs/design/painel/anki/prototipo-primeira-conexao.html,
// variante B “Igual às Boas-vindas”): a lista dos 3 passos ao lado do card e,
// embaixo, a conferência sozinha e os dois quadros. O markup fixo é do
// painel.html; aqui se desenha o que muda.
//
// Os passos se marcam pelo estado real, e o único que a extensão enxerga antes da
// Conexão é ela mesma (o AnkiConnect não é lido: sem permissão nova). Por isso
// os três esperam a Conexão e viram ✓ juntos quando ela responde ligada: é o
// momento Pronto, que o card segura antes de devolver as abas.
//
// A linha “Confere sozinho a cada 15 s” segue a conferência de /health que o
// shell inicia em `ConexaoAnki` (`acompanhar`, `aoConferir`): este arquivo não
// pergunta nada à rede. Os relógios são o de 1 s que reescreve “há N s” e o
// de 1,8 s do Pronto.
//
// O fluxo é todo daqui: quando o card cobre as abas, o momento Pronto (o toast
// e o foco que o acompanham) e o passo que a pessoa abriu. O painel-anki.js não
// pergunta nada: o card põe e tira `anki--primeira-vez` na área, e o CSS troca
// as abas pelo card. A assinatura de situação em `montar` é a única do fluxo
// ONB-16, que não depende da ordem em que outros ouvintes entram.

(function (raiz) {
  const PASSOS = [
    { titulo: 'ONB-16.passo1Titulo', texto: 'ONB-08.passo1' },
    { titulo: 'ONB-16.passo2Titulo', texto: 'ONB-08.passo2' },
    { titulo: 'ONB-16.passo3Titulo', texto: 'ONB-08.passo3' },
  ];
  const PASSO_DOS_COMANDOS = 1;
  const PASSO_DO_TENTAR = 2;
  const INTERVALO_DO_TIQUE = 1000;
  // Quanto o momento Pronto fica na tela antes de as abas voltarem.
  const MOMENTO_PRONTO_MS = 1800;

  const { textoDaVoz, Veio, Shell, ConexaoAnki, ConexaoNaTela, Configuracao } = raiz;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const { SITUACAO } = Configuracao;
  const porId = id => document.getElementById(id);

  const estado = {
    pronto: false,          // o momento Pronto está na tela
    prontoDesenhado: false, // o Pronto que o último desenho já mostrou (para o foco)
    escolha: null,          // o passo que a pessoa abriu; sem ele, o primeiro que falta
    conferindo: false,      // uma conferência está no ar
    conferiuEm: null,       // quando a última voltou
    visto: { situacao: CONEXAO.CONECTANDO, respondeu: false },  // o que a última notificação disse
  };
  const marcas = [];        // por passo: { botao, marca, leitor }

  // ─── Montagem ──────────────────────────────────────────────────────────────

  /**
   * Monta o card e espera `ConexaoAnki.pronta` antes de acompanhar a situação,
   * para conhecer o fato “já respondeu ligada neste computador”. Uma resposta
   * recebida antes da assinatura continua contando durante uma tentativa.
   * Devolve uma promessa que resolve com a função que retira só esse ouvinte
   * de situação; não desmonta o card nem encerra a Conferência.
   */
  function montar() {
    montarLista();
    montarComoLigar();
    porId('apv-voltar').addEventListener('click', () => abrirPasso(passoAtual() - 1));
    porId('apv-continuar').addEventListener('click', () => abrirPasso(passoAtual() + 1));
    ConexaoNaTela.ligarTentarDeNovo(porId('apv-tentar'), () => {
      // Só o botão do card fixa o passo 3: o Tentar de novo da F1 e o da Boas-vindas não são escolha dela.
      estado.escolha = PASSO_DO_TENTAR;
      ConexaoAnki.tentarDeNovo();
    });

    ConexaoAnki.aoConferir(conferindo => {
      estado.conferindo = conferindo;
      desenharConferencia();
    });
    setInterval(desenharConferencia, INTERVALO_DO_TIQUE);
    return ConexaoAnki.pronta.then(() => {
      estado.visto.respondeu = ConexaoAnki.ultimaResposta() !== null;
      return ConexaoAnki.acompanhar(aoMudarAConexao);
    });
  }

  function montarLista() {
    const lista = porId('apv-lista');
    PASSOS.forEach((passo, i) => {
      const marca = elemento('span', 'bv-marca');
      marca.setAttribute('aria-hidden', 'true');
      marca.dataset.numero = String(i + 1);
      const leitor = elemento('span', 'veio-so-leitor');
      const botao = elemento('button', 'bv-lista__item', marca, elemento('span', null, textoDaVoz(passo.titulo)), leitor);
      botao.type = 'button';
      botao.addEventListener('click', () => abrirPasso(i));
      marcas.push({ botao, marca, leitor });
      lista.append(elemento('li', null, botao));
    });
  }

  /**
   * O Detalhes do passo 2 (os comandos, a porta, o log), com “Copiar” ao lado.
   * Copiou: o toast. Não copiou: a linha no lugar, até a próxima tentativa.
   */
  function montarComoLigar() {
    const comandos = textoDaVoz('ONB-16.detalhes');
    const falha = elemento('p', 'anki-motivo', textoDaVoz('ONB-16.naoCopiou'));
    falha.setAttribute('role', 'alert');
    falha.hidden = true;
    const copiar = elemento('button', 'veio-botao veio-botao--contorno veio-botao--compacto', textoDaVoz('ONB-16.copiar'));
    copiar.type = 'button';
    copiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(comandos);
        falha.hidden = true;
        Veio.mostrarToastDeSucesso(textoDaVoz('ONB-16.copiado'));
      } catch {
        falha.hidden = false;
      }
    });
    porId('anki-primeira-vez-detalhes').replaceChildren(
      elemento('div', 'anki-como-ligar', Veio.montarDetalhes(comandos), copiar), falha);
  }

  // ─── A Conexão ─────────────────────────────────────────────────────────────

  /** O card está no lugar das abas (inclusive no momento Pronto). */
  function cobreAsAbas({ situacao, respondeu } = estado.visto) {
    return respondeu && (estado.pronto || (!ConexaoAnki.jaConectou() && situacao !== CONEXAO.LIGADA));
  }

  function aoMudarAConexao(situacao) {
    const { situacao: antes, respondeu } = estado.visto;
    const eraPrimeiraVez = cobreAsAbas({ situacao: antes, respondeu });
    estado.visto = { situacao, respondeu: respondeu || situacao !== CONEXAO.CONECTANDO };
    if (situacao !== CONEXAO.CONECTANDO) estado.conferiuEm = Date.now();
    // Em outra área (ou nas Boas-vindas) ninguém olha o card: as abas só estarão
    // lá quando a pessoa chegar, sem Pronto nem toast.
    if (situacao === CONEXAO.LIGADA && eraPrimeiraVez && !estado.pronto && Shell.areaAtual() === 'anki') {
      comecarOPronto();
    }
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

  /** O passo aberto: o que a pessoa escolheu ou, sem escolha, o primeiro que falta. */
  function passoAtual() {
    if (estado.pronto) return PASSOS.length;
    if (estado.escolha !== null) return estado.escolha;
    return ConexaoAnki.situacao() === CONEXAO.CONECTANDO ? PASSO_DO_TENTAR : 0;
  }

  /** Qual vista o card mostra agora. */
  function vistaDoCard() {
    if (estado.pronto) return 'pronto';
    if (ConexaoAnki.situacao() === CONEXAO.CONECTANDO) return 'conectando';
    return passoAtual() === 0 ? 'esperando' : 'desligada';
  }

  function abrirPasso(i) {
    estado.escolha = Math.min(Math.max(i, 0), PASSOS.length - 1);
    desenhar();
    // O foco vai ao título, para o leitor de tela ler o passo novo; o botão
    // apertado pode ter saído (Voltar no 1, Continuar no 3).
    porId('apv-passo-titulo').focus();
  }

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
    if (!cobre) return;
    // No Pronto o botão em que a pessoa estava (o do card ou o da F1, que o shell
    // desativa ao tentar) sai da tela e o foco já não está em lugar nenhum: ele
    // fica no título do card, e não cai no <body>.
    const ativo = document.activeElement;
    const focoSaindo = secao.contains(ativo) || ativo === document.body || ativo === null;
    const entrouNoPronto = estado.pronto && !estado.prontoDesenhado;
    estado.prontoDesenhado = estado.pronto;

    const vista = vistaDoCard();
    const pronto = vista === 'pronto';
    const passoAberto = passoAtual();
    const conexao = ConexaoAnki.situacao();
    const conectando = conexao === CONEXAO.CONECTANDO;

    porId('anki-primeira-vez-titulo').textContent = pronto ? ConexaoNaTela.texto(CONEXAO.LIGADA) : textoDaVoz('ONB-16.titulo');
    porId('apv-apoio').hidden = pronto;
    porId('apv-rodape').hidden = pronto;

    marcas.forEach(({ botao, marca, leitor }, i) => {
      if (i === passoAberto) botao.setAttribute('aria-current', 'step');
      else botao.removeAttribute('aria-current');
      marca.dataset.situacao = pronto ? SITUACAO.FEITO : '';
      marca.classList.toggle('bv-marca--atual', i === passoAberto);
      marca.replaceChildren(...(pronto ? [Veio.iconeVeio('certo')] : []));
      // O nome do item diz a situação ao leitor de tela: “…, feito”.
      leitor.textContent = pronto ? `, ${textoDaVoz('ONB-13.feito')}` : '';
    });

    const passo = PASSOS[passoAberto];
    porId('apv-sobretitulo').textContent = pronto
      ? textoDaVoz('ONB-16.pronto')
      : `${textoDaVoz('ONB-16.passos')} · ${textoDaVoz('ONB-03.passo', { n: passoAberto + 1, total: PASSOS.length })}`;
    porId('apv-passo-titulo').textContent = pronto ? ConexaoNaTela.texto(CONEXAO.LIGADA) : textoDaVoz(passo.titulo);
    porId('apv-texto').textContent = textoDaVoz(pronto ? 'ONB-16.prontoApoio' : passo.texto);

    // O status é uma região que anuncia a mudança: o ponto e o texto trocam, ela fica.
    const esperando = vista === 'esperando';
    porId('apv-status').classList.toggle('apv-status--espera', esperando);
    const mostrada = pronto ? CONEXAO.LIGADA : conexao;
    ConexaoNaTela.pintarPonto(porId('apv-ponto'), esperando ? '' : mostrada);
    porId('apv-status-texto').textContent = esperando ? textoDaVoz('ONB-16.esperando') : ConexaoNaTela.texto(conectando ? conexao : mostrada);

    ConexaoNaTela.pintarTentarDeNovo(porId('apv-tentar'), conexao, {
      sai: pronto || passoAberto !== PASSO_DO_TENTAR,
      focoPara: () => porId('apv-passo-titulo'),
    });
    porId('anki-primeira-vez-detalhes').hidden = pronto || passoAberto !== PASSO_DOS_COMANDOS;

    porId('apv-navegacao').hidden = pronto;
    porId('apv-voltar').hidden = passoAberto === 0;
    porId('apv-continuar').hidden = passoAberto >= PASSOS.length - 1;

    desenharConferencia();
    if (entrouNoPronto && focoSaindo) porId('apv-passo-titulo').focus();
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  raiz.PrimeiraConexao = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
