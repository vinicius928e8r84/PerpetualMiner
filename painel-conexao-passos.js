'use strict';

// Os passos de pôr a Conexão com o Anki no Anki, num componente só (#99, #145): a
// lista de passos e o card do passo, do desenho B de
// docs/design/painel/anki/prototipo-primeira-conexao.html. O passo 4 da Boas-vindas
// (`painel-boas-vindas.js`) e o card ONB-16 da área Conexão com o Anki
// (`painel-anki-primeira-conexao.js`) montam este mesmo componente, sem comando de
// terminal nenhum:
//
//   1  Pôr a Conexão no Anki: baixar › abrir › Sim › reiniciar. O arquivo vai dentro do
//      pacote da extensão (`conexao/perpetualminer.ankiaddon`) e sai por um link de
//      download, sem permissão nova. O Detalhes “O arquivo não abriu?” leva o código do
//      AnkiWeb (para colar em Ferramentas › Complementos › Obter complementos) ou, até o
//      primeiro upload (#176), diz que ele vem em breve: nunca um número inventado.
//   2  Reiniciar o Anki: este passo sempre existe. A extensão confere sozinha e a linha de
//      status mostra Conectando enquanto a conferência está no ar (a de 15 s também, sem
//      ninguém apertar nada) e, quando a Conexão responde, “Achei o Anki · perfil · versão”.
//      Uma conferência no ar não apaga o último resultado: ligada continua ligada até uma
//      resposta dizer o contrário, e a falha volta a “desligada”.
//   3  Abrir o Anki sozinho (#147, ONB-17): logo depois de a Conexão responder, o card passa
//      sozinho a este passo. “Permitir abrir o Anki” pede ao Chrome a permissão opcional
//      `nativeMessaging` e a extensão confere o abridor que a Conexão deixou no computador
//      (`PerpetualMiner.Abridor`: só “achou o Anki?”, nada abre nem fecha). Com a permissão já
//      dada, ela confere sem clique. “Agora não” fica guardado (`pm_abridor`) e o passo fica
//      “agora não”; não achou, ou o abridor não respondeu, o passo diz o que fazer, com
//      Tentar de novo e o que o Chrome disse no Detalhes. Antes de a Conexão responder, este
//      passo não tem o que fazer: o abridor é ela que escreve.
//
// A lista é dado (`PASSOS`): o passo “Ter o Anki” (#146) entra nela sem mexer no resto. O
// número do passo na tela é a posição na lista.
//
// Os passos se marcam pelo estado real, e a única coisa que a extensão enxerga antes
// da Conexão é ela mesma: os dois primeiros viram ✓ juntos quando ela responde ligada; o
// terceiro, quando o abridor acha o Anki (ou “agora não”, quando a pessoa disse isso).
//
// O abridor é um só por página: os dois lugares que montam o componente (a Boas-vindas e o
// card ONB-16 moram no mesmo painel) leem o mesmo estado, e a conferência sai uma vez.
//
// Sem resposta em 2 minutos, o card mostra o checklist de 3 itens e “Baixar de novo”,
// e a conferência segue sozinha (ela é do `ConexaoAnki`; aqui não se pergunta nada à
// rede). Os 2 minutos contam desde que a pessoa vê os passos pela primeira vez ou baixa
// o arquivo, o que vier primeiro; o checklist, uma vez na tela, fica até a Conexão responder.
//
// Um destaque (`--primario`) só por tela (veio/README.md): com a navegação do card, o
// destaque é a ação do passo (Baixar, Tentar de novo) e Voltar · Continuar são contorno;
// sem ela, o destaque é o Continuar do anfitrião e o card só tem contornos.
//
//   montar(lugar, { prefixo, navegacao, aoSairOBotao, aoResolverOAbridor })
//     `prefixo`        dá os ids (`<prefixo>-passo-titulo`, `-status`, `-tentar`, `-abridor-status`…)
//     `navegacao`      Voltar · Continuar no card (padrão true; a Boas-vindas tem os seus)
//     `empilhado`      a lista acima do card, para quando o componente mora dentro de outro card
//     `aoSairOBotao`   o elemento que acolhe o foco quando o Tentar de novo sai com ele
//     `aoResolverOAbridor`  chamado quando o passo 3 se resolve (achou o Anki, ou “Agora não”)
//   devolve { desenhar({ pronto }), mostrar(visivel), focarTitulo(), abridorResolvido() }
//     `desenhar`  redesenha pelo estado da Conexão. O anfitrião chama com `pronto` quando
//                 mostra o momento Pronto (todos os passos resolvidos, sem botões);
//     `mostrar`   o anfitrião diz se o componente está à vista de verdade (a área ou a tela
//                 aberta, não só montada em um lugar escondido): é daí que contam os 2 minutos;
//     `abridorResolvido`  o passo 3 já está resolvido (o card ONB-16 só vai ao Pronto depois dele).
//
// O código do AnkiWeb vem de `PerpetualMiner.CODIGO_DO_ANKIWEB` (nenhum até o primeiro
// upload); quem o publicar define esse valor em `lib/` e nada mais muda aqui.

(function (raiz) {
  const PASSOS = [
    { id: 'colocar', titulo: 'ONB-16.passo1Titulo', texto: 'ONB-16.passo1Texto' },
    { id: 'reiniciar', titulo: 'ONB-16.passo2Titulo', texto: 'ONB-16.passo2Texto' },
    { id: 'abridor', titulo: 'ONB-17.titulo', texto: 'ONB-17.texto' },
  ];
  const PASSO_DO_ARQUIVO = 'colocar';
  const PASSO_DO_TENTAR = 'reiniciar';
  const PASSO_DO_ABRIDOR = 'abridor';
  const ARQUIVO_DA_CONEXAO = 'conexao/perpetualminer.ankiaddon';
  const NOME_DO_ARQUIVO = 'perpetualminer.ankiaddon';
  /** Sem resposta depois disto, o checklist e “Baixar de novo”. */
  const SEM_RESPOSTA_MS = 2 * 60 * 1000;
  const INTERVALO_DO_TIQUE = 1000;
  const ITENS_DO_CHECKLIST = ['ONB-16.confira1', 'ONB-16.confira2', 'ONB-16.confira3'];

  const { textoDaVoz, Veio, ConexaoAnki, ConexaoNaTela, Configuracao, Abridor } = raiz;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const { SITUACAO } = Configuracao;

  // ─── O abridor (passo 3), um por página ─────────────────────────────────────
  //
  // Em que fase está a conversa com o abridor. `PEDIR` é “sem permissão”: os botões
  // Permitir e Agora não; `PEDINDO` é o aviso do Chrome aberto.
  const FASE = Object.freeze({
    ANTES: 'antes',             // a Conexão ainda não respondeu: ninguém perguntou nada
    PEDIR: 'pedir',
    PEDINDO: 'pedindo',
    PROCURANDO: 'procurando',
    ACHOU: 'achou',
    NAO_ACHOU: 'nao_achou',
    SEM_ABRIDOR: 'sem_abridor',
  });
  const abridor = {
    fase: FASE.ANTES,
    detalhe: '',          // o que o Chrome disse, quando o abridor não respondeu
    agoraNao: false,      // `pm_abridor.agoraNao`, como está guardado
    recusada: false,      // o Chrome não deu a permissão no último pedido
    iniciado: false,
    lendoAPermissao: false, // a Conexão ligou e a extensão ainda pergunta ao Chrome se tem a permissão
    ouvintes: new Set(),
  };

  function mudarOAbridor(mudanca) {
    Object.assign(abridor, mudanca);
    abridor.ouvintes.forEach(ouvinte => ouvinte());
  }

  /** O passo 3 está resolvido: o abridor achou o Anki, ou a pessoa disse “Agora não”. */
  const abridorResolvido = () => abridor.fase === FASE.ACHOU || abridor.agoraNao;

  /** Lê o “Agora não” guardado e o acompanha (outra aba, ou o outro lugar desta página, pode mudá-lo). */
  function iniciarOAbridor() {
    if (abridor.iniciado) return;
    abridor.iniciado = true;
    // Sem a leitura, o passo fica como se nada tivesse sido dito: a pessoa ainda pode responder.
    Abridor.lerAgoraNao().then(agoraNao => mudarOAbridor({ agoraNao }), () => {});
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area === 'local' && 'pm_abridor' in mudancas) mudarOAbridor({ agoraNao: mudancas.pm_abridor.newValue?.agoraNao === true });
    });
  }

  /** A Conexão respondeu: com a permissão já dada, confere sem clique; sem ela, o passo pede. Uma vez por página. */
  async function aoLigarAConexao() {
    if (abridor.fase !== FASE.ANTES || abridor.lendoAPermissao) return;
    // C8: “Procurando o Anki…” só quando a conversa sai de verdade; até o Chrome dizer da permissão, o bloco espera.
    abridor.lendoAPermissao = true;
    const temPermissao = await Abridor.temPermissao().catch(() => false);
    abridor.lendoAPermissao = false;
    if (temPermissao) conferirOAbridor();
    else mudarOAbridor({ fase: FASE.PEDIR });
  }

  async function conferirOAbridor() {
    mudarOAbridor({ fase: FASE.PROCURANDO, detalhe: '' });
    const { resultado, detalhe } = await Abridor.conferirOAnki();
    const { RESULTADO } = Abridor;
    if (resultado === RESULTADO.SEM_PERMISSAO) {
      mudarOAbridor({ fase: FASE.PEDIR });
      return;
    }
    // Com a permissão dada, um “Agora não” antigo deixa de valer.
    if (abridor.agoraNao) await Abridor.guardarAgoraNao(false);
    const fase = resultado === RESULTADO.ACHOU ? FASE.ACHOU
      : resultado === RESULTADO.NAO_ACHOU ? FASE.NAO_ACHOU : FASE.SEM_ABRIDOR;
    mudarOAbridor({ fase, detalhe, agoraNao: false, recusada: false });
  }

  /** Permitir abrir o Anki: o aviso do Chrome sai já no clique (o pedido precisa do gesto da pessoa). */
  function pedirAPermissao() {
    if (abridor.fase === FASE.PEDINDO) return;
    const pedido = Abridor.pedirPermissao();
    mudarOAbridor({ fase: FASE.PEDINDO });
    pedido.then(dada => {
      if (dada) conferirOAbridor();
      else mudarOAbridor({ fase: FASE.PEDIR, recusada: true });
    });
  }

  function dizerAgoraNao() {
    mudarOAbridor({ agoraNao: true });
    Abridor.guardarAgoraNao(true);
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  /** “Achei o Anki · Usuário 1 · versão 0.1.0”: cada parte só entra se a Conexão a disse. */
  function textoDeAchei() {
    const { perfil, versao } = ConexaoAnki.saude() ?? {};
    return [
      textoDaVoz('ONB-16.achei'),
      perfil,
      versao && textoDaVoz('ONB-16.acheiVersao', { versao }),
    ].filter(Boolean).join(' · ');
  }

  // O ponto da linha do abridor, por fase: verde achou, vermelho não achou, piscando enquanto espera.
  const PONTO_DA_FASE = Object.freeze({
    [FASE.PEDINDO]: CONEXAO.CONECTANDO,
    [FASE.PROCURANDO]: CONEXAO.CONECTANDO,
    [FASE.ACHOU]: CONEXAO.LIGADA,
    [FASE.NAO_ACHOU]: CONEXAO.DESLIGADA,
    [FASE.SEM_ABRIDOR]: CONEXAO.DESLIGADA,
  });
  const TEXTO_DA_FASE = Object.freeze({
    [FASE.PEDINDO]: 'ONB-17.pedindo',
    [FASE.PROCURANDO]: 'ONB-17.procurando',
    [FASE.ACHOU]: 'ONB-17.achou',
    [FASE.NAO_ACHOU]: 'ONB-17.naoAchou',
    [FASE.SEM_ABRIDOR]: 'ONB-17.semAbridor',
  });

  function montar(lugar, { prefixo, navegacao = true, empilhado = false, aoSairOBotao = null, aoResolverOAbridor = null }) {
    iniciarOAbridor();
    const id = parte => `${prefixo}-${parte}`;
    const estado = {
      ultimaSituacao: null, // a situação da Conexão no último desenho (o passo 3 abre quando ela liga)
      resolvido: abridorResolvido(),
      escolha: null,        // o passo que a pessoa abriu; sem ele, o primeiro que falta
      pronto: false,        // o anfitrião mostra o momento Pronto
      visivel: false,
      conferindo: ConexaoAnki.conferindo(),   // uma conferência do /health está no ar
      esperandoDesde: null, // quando a espera da Conexão começou (ms); null: ainda não
      semResposta: false,   // o checklist está na tela (fica até a Conexão responder)
    };
    const marcas = [];

    // ─── A lista ────────────────────────────────────────────────────────────
    const itens = elemento('ol', 'bv-lista__itens');
    PASSOS.forEach((passo, i) => {
      const marca = elemento('span', 'bv-marca');
      marca.setAttribute('aria-hidden', 'true');
      marca.dataset.numero = String(i + 1);
      const leitor = elemento('span', 'veio-so-leitor');
      const botao = elemento('button', 'bv-lista__item', marca, elemento('span', null, textoDaVoz(passo.titulo)), leitor);
      botao.type = 'button';
      botao.addEventListener('click', () => abrirPasso(passo.id));
      marcas.push({ botao, marca, leitor });
      itens.append(elemento('li', null, botao));
    });
    const lista = elemento('nav', 'pc-lista', itens);
    lista.setAttribute('aria-label', textoDaVoz('ONB-16.passos'));

    // ─── O card do passo ────────────────────────────────────────────────────
    const sobretitulo = elemento('p', 'bv-sobretitulo');
    const titulo = elemento('h3', 'bv-titulo');
    titulo.id = id('passo-titulo');
    titulo.tabIndex = -1;
    const texto = elemento('p', 'bv-texto');

    // O arquivo: um link de download do próprio pacote da extensão (o Chrome não pede permissão).
    const linkDoArquivo = (classe, rotulo) => {
      const link = elemento('a', classe, rotulo);
      link.href = chrome.runtime.getURL(ARQUIVO_DA_CONEXAO);
      link.download = NOME_DO_ARQUIVO;
      return link;
    };
    const destaque = navegacao ? 'veio-botao--primario' : 'veio-botao--contorno';
    const baixar = linkDoArquivo(`veio-botao ${destaque}`, textoDaVoz('ONB-16.baixar'));
    baixar.addEventListener('click', () => { if (estado.esperandoDesde === null) estado.esperandoDesde = Date.now(); });

    const codigo = raiz.CODIGO_DO_ANKIWEB ?? null;
    const detalhes = Veio.montarDetalhes(
      codigo === null ? textoDaVoz('ONB-16.codigoEmBreve') : textoDaVoz('ONB-16.codigoDoAnkiWeb', { codigo }),
      document, textoDaVoz('ONB-16.arquivoNaoAbriu'));
    const doArquivo = elemento('div', 'pc-arquivo', baixar, detalhes);

    const ponto = elemento('span', 'bv-ponto');
    ponto.id = id('ponto');
    ponto.setAttribute('aria-hidden', 'true');
    const textoDoStatus = elemento('span');
    textoDoStatus.id = id('status-texto');
    const status = elemento('p', 'bv-status', ponto, textoDoStatus);
    status.id = id('status');
    status.setAttribute('role', 'status');
    const tentar = elemento('button', `veio-botao ${destaque} veio-botao--compacto`, textoDaVoz('ENV-01.tentarDeNovo'));
    tentar.id = id('tentar');
    tentar.type = 'button';
    ConexaoNaTela.ligarTentarDeNovo(tentar, () => {
      // Só o botão do passo fixa o passo 2: o Tentar de novo da F1 não é escolha da pessoa.
      estado.escolha = PASSO_DO_TENTAR;
      ConexaoAnki.tentarDeNovo();
    });
    const conexao = elemento('div', 'bv-conexao', status, tentar);

    // O abridor (passo 3): a linha do que ele disse, as ações e, quando ele não respondeu, o Detalhes.
    const pontoDoAbridor = elemento('span', 'bv-ponto');
    pontoDoAbridor.setAttribute('aria-hidden', 'true');
    const textoDoAbridor = elemento('span');
    const statusDoAbridor = elemento('p', 'bv-status', pontoDoAbridor, textoDoAbridor);
    statusDoAbridor.id = id('abridor-status');
    statusDoAbridor.setAttribute('aria-live', 'polite');
    const botaoDoAbridor = (parte, classe, rotulo, aoApertar) => {
      const botao = elemento('button', `veio-botao ${classe} veio-botao--compacto`, rotulo);
      botao.id = id(parte);
      botao.type = 'button';
      botao.addEventListener('click', () => { if (botao.getAttribute('aria-disabled') !== 'true') aoApertar(); });
      return botao;
    };
    const permitir = botaoDoAbridor('permitir', destaque, textoDaVoz('ONB-17.permitir'), pedirAPermissao);
    let tentarOAbridor = null; // A ação vive no aviso da Base, só enquanto houver erro.
    const agoraNao = botaoDoAbridor('agora-nao', 'veio-botao--contorno', textoDaVoz('ONB-04.agoraNao'), dizerAgoraNao);
    const acoesDoAbridor = elemento('div', 'pc-abridor__acoes', permitir, agoraNao);
    let avisoDoAbridor = null;
    const blocoDoAbridor = elemento('div', 'pc-abridor', statusDoAbridor, acoesDoAbridor);

    const baixarDeNovo = linkDoArquivo('veio-botao veio-botao--contorno veio-botao--compacto', textoDaVoz('ONB-16.baixarDeNovo'));
    const checklist = elemento('ul', 'pc-checklist', ...ITENS_DO_CHECKLIST.map(item => elemento('li', null, textoDaVoz(item))));
    const semResposta = elemento('div', 'pc-sem-resposta',
      elemento('p', 'pc-sem-resposta__texto', textoDaVoz('ONB-16.semResposta')), checklist, baixarDeNovo);
    semResposta.hidden = true;

    const controle = elemento('div', 'pc-controle', doArquivo, conexao, blocoDoAbridor, semResposta);

    const voltar = elemento('button', 'veio-botao veio-botao--contorno', textoDaVoz('ONB-04.voltar'));
    voltar.id = id('voltar');
    voltar.type = 'button';
    voltar.addEventListener('click', () => abrirPasso(PASSOS[indiceAberto() - 1].id));
    const continuar = elemento('button', 'veio-botao veio-botao--contorno', textoDaVoz('ONB-04.continuar'));
    continuar.id = id('continuar');
    continuar.type = 'button';
    continuar.addEventListener('click', () => abrirPasso(PASSOS[indiceAberto() + 1].id));
    const rodape = elemento('div', 'pc-navegacao', voltar, continuar);
    rodape.hidden = !navegacao;

    const card = elemento('div', 'pc-card', sobretitulo, titulo, texto, controle, rodape);
    lugar.append(elemento('div', empilhado ? 'pc pc--empilhado' : 'pc', lista, card));

    // ─── O passo aberto ─────────────────────────────────────────────────────
    const indice = passoId => PASSOS.findIndex(p => p.id === passoId);

    /**
     * O passo aberto: o que a pessoa escolheu ou, sem escolha, o primeiro que falta: o de reiniciar
     * enquanto confere, e o do abridor com a Conexão ligada.
     */
    function passoAberto() {
      if (estado.pronto) return PASSOS[PASSOS.length - 1].id;
      if (estado.escolha !== null) return estado.escolha;
      const situacao = ConexaoAnki.situacao();
      if (situacao === CONEXAO.LIGADA) return PASSO_DO_ABRIDOR;
      return situacao === CONEXAO.CONECTANDO ? PASSO_DO_TENTAR : PASSOS[0].id;
    }
    const indiceAberto = () => indice(passoAberto());

    function abrirPasso(passoId) {
      estado.escolha = passoId;
      desenhar();
      // O foco vai ao título, para o leitor de tela ler o passo novo; o botão apertado pode
      // ter saído (Voltar no primeiro, Continuar no último).
      titulo.focus();
    }

    // ─── A espera ───────────────────────────────────────────────────────────
    /** Conta os 2 minutos e diz se o checklist está na tela (ele sai quando a Conexão responde). */
    function desenharAEspera() {
      const ligada = ConexaoAnki.situacao() === CONEXAO.LIGADA;
      if (ligada) {
        estado.esperandoDesde = null;
        estado.semResposta = false;
      } else {
        if (estado.visivel && estado.esperandoDesde === null) estado.esperandoDesde = Date.now();
        if (estado.esperandoDesde !== null && Date.now() - estado.esperandoDesde >= SEM_RESPOSTA_MS) estado.semResposta = true;
      }
      semResposta.hidden = !estado.semResposta || estado.pronto || ligada;
    }

    // ─── O desenho ──────────────────────────────────────────────────────────
    function desenhar({ pronto = estado.pronto } = {}) {
      estado.pronto = pronto;
      const aberto = pronto ? -1 : indiceAberto();
      const passoDoCard = PASSOS[pronto ? indice(PASSO_DO_ABRIDOR) : aberto];
      const situacao = ConexaoAnki.situacao();
      const conectando = situacao === CONEXAO.CONECTANDO;
      // No passo de reiniciar, uma conferência no ar sobre uma Conexão desligada é “Conectando”, sem
      // clique nenhum; o último resultado só volta quando a resposta chega. Ligada, ela segue ligada.
      const exibida = estado.conferindo && situacao === CONEXAO.DESLIGADA && passoDoCard.id === PASSO_DO_TENTAR
        ? CONEXAO.CONECTANDO : situacao;
      const conectou = pronto || situacao === CONEXAO.LIGADA;
      // Os dois primeiros passos são a Conexão; o terceiro, o abridor (ou o “Agora não” dele).
      const situacaoDoPasso = passo => {
        if (passo.id !== PASSO_DO_ABRIDOR) return conectou ? SITUACAO.FEITO : '';
        if (abridor.fase === FASE.ACHOU) return SITUACAO.FEITO;
        return abridor.agoraNao ? SITUACAO.AGORA_NAO : '';
      };
      const LEITOR = { [SITUACAO.FEITO]: 'ONB-13.feito', [SITUACAO.AGORA_NAO]: 'ONB-13.agoraNao' };

      marcas.forEach(({ botao, marca, leitor }, i) => {
        const doPasso = situacaoDoPasso(PASSOS[i]);
        if (i === aberto) botao.setAttribute('aria-current', 'step');
        else botao.removeAttribute('aria-current');
        marca.dataset.situacao = doPasso;
        marca.classList.toggle('bv-marca--atual', i === aberto);
        marca.replaceChildren(...(doPasso === SITUACAO.FEITO ? [Veio.iconeVeio('certo')] : []));
        // O nome do item diz a situação ao leitor de tela: “…, feito”, “…, agora não”.
        leitor.textContent = doPasso ? `, ${textoDaVoz(LEITOR[doPasso])}` : '';
      });

      // O momento Pronto troca o card inteiro: a Conexão respondeu e as abas voltam em seguida.
      sobretitulo.textContent = pronto ? textoDaVoz('ONB-16.pronto')
        : `${textoDaVoz('ONB-16.passos')} · ${textoDaVoz('ONB-03.passo', { n: aberto + 1, total: PASSOS.length })}`;
      titulo.textContent = pronto ? ConexaoNaTela.texto(CONEXAO.LIGADA) : textoDaVoz(passoDoCard.titulo);
      texto.textContent = pronto ? textoDaVoz('ONB-16.prontoApoio') : textoDaVoz(passoDoCard.texto);
      doArquivo.hidden = pronto || passoDoCard.id !== PASSO_DO_ARQUIVO;

      // O status é uma região que anuncia a mudança: o ponto e o texto trocam, ela fica. No passo do
      // arquivo, enquanto a Conexão não respondeu, ele espera (o Anki não é lido antes dela: nunca
      // diz “não encontrado”).
      const esperando = !pronto && passoDoCard.id === PASSO_DO_ARQUIVO && situacao === CONEXAO.DESLIGADA;
      status.classList.toggle('pc-status--espera', esperando);
      const mostrada = pronto && !conectando ? CONEXAO.LIGADA : exibida;
      ConexaoNaTela.pintarPonto(ponto, esperando ? '' : mostrada);
      textoDoStatus.textContent = esperando ? textoDaVoz('ONB-16.esperando')
        : mostrada === CONEXAO.LIGADA ? textoDeAchei() : ConexaoNaTela.texto(mostrada);

      ConexaoNaTela.pintarTentarDeNovo(tentar, exibida, {
        sai: pronto || situacao === CONEXAO.LIGADA || passoDoCard.id !== PASSO_DO_TENTAR,
        focoPara: () => aoSairOBotao?.() ?? titulo,
      });

      desenharOAbridor(passoDoCard, pronto, situacao);

      rodape.hidden = !navegacao || pronto;
      voltar.hidden = aberto <= 0;
      continuar.hidden = aberto >= PASSOS.length - 1;
      desenharAEspera();
    }

    /** O bloco do abridor: só no passo 3, com a Conexão ligada (é ela que deixa o abridor no computador). */
    function desenharOAbridor(passoDoCard, pronto, situacao) {
      const { fase } = abridor;
      blocoDoAbridor.hidden = passoDoCard.id !== PASSO_DO_ABRIDOR || fase === FASE.ANTES
        || (!pronto && situacao !== CONEXAO.LIGADA);

      // C8: sem a permissão (por “Agora não” ou porque o Chrome não a deu), a linha diz o que acontece sem ela.
      const semPermissao = fase === FASE.PEDIR && (abridor.agoraNao || abridor.recusada);
      const textoAgora = TEXTO_DA_FASE[fase] ?? (semPermissao ? 'ONB-17.semPermissao' : null);
      textoDoAbridor.textContent = textoAgora ? textoDaVoz(textoAgora) : '';
      const problema = fase === FASE.NAO_ACHOU || fase === FASE.SEM_ABRIDOR;
      statusDoAbridor.hidden = !textoAgora || problema;
      pontoDoAbridor.dataset.estado = PONTO_DA_FASE[fase] ?? '';

      const pedir = fase === FASE.PEDIR || fase === FASE.PEDINDO;
      const comFoco = [permitir, tentarOAbridor, agoraNao].find(botao => botao === document.activeElement);
      permitir.hidden = pronto || !pedir;
      permitir.setAttribute('aria-disabled', String(fase === FASE.PEDINDO));
      if (tentarOAbridor) tentarOAbridor.hidden = pronto || !problema;
      agoraNao.hidden = pronto || abridor.agoraNao || !(pedir || problema);
      acoesDoAbridor.hidden = permitir.hidden && agoraNao.hidden;
      // O botão apertado saiu (Agora não, Permitir que achou o Anki): o foco não cai no fim da página.
      if (comFoco?.hidden && !blocoDoAbridor.hidden) (aoSairOBotao?.() ?? titulo).focus();

      // O erro é um aviso persistente da Base; desenhos iguais preservam o foco e o Detalhes aberto.
      const causa = problema && !pronto
        ? (fase === FASE.NAO_ACHOU ? '{"achou":false}' : abridor.detalhe) : '';
      if (avisoDoAbridor?.dataset.causa !== causa) {
        avisoDoAbridor?.remove();
        avisoDoAbridor = null;
        tentarOAbridor = null;
        if (causa) {
          avisoDoAbridor = Veio.montarAviso({
            texto: textoDaVoz(textoAgora), detalhes: causa, fechavel: false,
            acao: { rotulo: textoDaVoz('ENV-01.tentarDeNovo'), aoUsar: conferirOAbridor },
          });
          avisoDoAbridor.dataset.causa = causa;
          tentarOAbridor = avisoDoAbridor.querySelector('button');
          tentarOAbridor.id = id('abridor-tentar');
          blocoDoAbridor.insertBefore(avisoDoAbridor, acoesDoAbridor);
        }
      }
    }

    ConexaoAnki.acompanhar(situacao => {
      // A Conexão acabou de ligar: o card vai ao passo do abridor, a menos que ele já esteja resolvido.
      if (situacao === CONEXAO.LIGADA && estado.ultimaSituacao !== CONEXAO.LIGADA) {
        if (!abridorResolvido()) estado.escolha = null;
        aoLigarAConexao();
      }
      estado.ultimaSituacao = situacao;
      desenhar();
    });
    abridor.ouvintes.add(() => {
      desenhar();
      const resolvido = abridorResolvido();
      if (resolvido && !estado.resolvido) aoResolverOAbridor?.();
      estado.resolvido = resolvido;
    });
    // A conferência que sai se vê na hora; a que volta chega logo em seguida pela situação.
    ConexaoAnki.aoConferir(conferindo => {
      estado.conferindo = conferindo;
      if (conferindo) desenhar();
    });
    // O relógio só reescreve o que muda com o tempo (o checklist): o status é uma região viva e não se refaz à toa.
    setInterval(() => { if (estado.visivel) desenharAEspera(); }, INTERVALO_DO_TIQUE);

    return {
      desenhar,
      mostrar(visivel) {
        estado.visivel = visivel;
        if (visivel) desenharAEspera();
      },
      focarTitulo: () => titulo.focus(),
      abridorResolvido,
    };
  }

  raiz.PassosDaConexao = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
