'use strict';

// Os passos de pôr a Conexão com o Anki no Anki, num componente só (#99, #145): a
// lista de passos e o card do passo, do desenho B de
// docs/design/painel/anki/prototipo-primeira-conexao.html. O passo 4 da Boas-vindas
// (`painel-boas-vindas.js`) e o card ONB-16 da área Conexão com o Anki
// (`painel-anki-primeira-conexao.js`) montam este mesmo componente, sem comando de
// terminal nenhum:
//
//   1  Você já tem o Anki? (#146): a pergunta que vem antes de pôr a Conexão, porque nada
//      dela funciona sem o Anki. “Já tenho o Anki” segue para o passo de baixar; “Ainda não
//      tenho o Anki” traz o aviso do Anki, com o site dele numa aba nova. O que a pessoa
//      respondeu fica só na memória da página: o estado real que a extensão conhece não muda
//      até a Conexão responder.
//   2  Pôr a Conexão no Anki: baixar › abrir › Sim › reiniciar. O arquivo vai dentro do
//      pacote da extensão (`conexao/perpetualminer.ankiaddon`) e sai por um link de
//      download, sem permissão nova. O Detalhes “O arquivo não abriu?” leva o código do
//      AnkiWeb (para colar em Ferramentas › Complementos › Obter complementos) ou, até o
//      primeiro upload (#176), diz que ele vem em breve: nunca um número inventado.
//   3  Reiniciar o Anki: este passo sempre existe. A extensão confere sozinha e a linha de
//      status mostra Conectando enquanto a conferência está no ar (a de 15 s também, sem
//      ninguém apertar nada) e, quando a Conexão responde, “Achei o Anki · perfil · versão”.
//      Uma conferência no ar não apaga o último resultado: ligada continua ligada até uma
//      resposta dizer o contrário, e a falha volta a “desligada”.
//
// A lista é dado (`PASSOS`): o passo “Abrir o Anki sozinho” (#147) entra nela sem mexer no
// resto. O número do passo na tela é a posição na lista.
//
// Os passos se marcam pelo estado real, e a única coisa que a extensão enxerga antes
// da Conexão é ela mesma: os três viram ✓ juntos quando ela responde ligada.
//
// Sem resposta em 2 minutos, o card mostra o checklist de 3 itens e “Baixar de novo”,
// e a conferência segue sozinha (ela é do `ConexaoAnki`; aqui não se pergunta nada à
// rede). Os 2 minutos contam desde que a pessoa vê os passos pela primeira vez ou baixa
// o arquivo, o que vier primeiro; o checklist, uma vez na tela, fica até a Conexão responder.
//
// Um destaque (`--primario`) só por tela (veio/README.md): com a navegação do card, o
// destaque é a ação do passo (Já tenho o Anki, Baixar, Tentar de novo) e Voltar · Continuar
// são contorno; sem ela, o destaque é o Continuar do anfitrião e o card só tem contornos.
//
//   montar(lugar, { prefixo, navegacao, aoSairOBotao })
//     `prefixo`        dá os ids (`<prefixo>-passo-titulo`, `-status`, `-tentar`…)
//     `navegacao`      Voltar · Continuar no card (padrão true; a Boas-vindas tem os seus)
//     `empilhado`      a lista acima do card, para quando o componente mora dentro de outro card
//     `aoSairOBotao`   o elemento que acolhe o foco quando o Tentar de novo sai com ele
//   devolve { desenhar({ pronto }), mostrar(visivel), focarTitulo() }
//     `desenhar`  redesenha pelo estado da Conexão. O anfitrião chama com `pronto` quando
//                 mostra o momento Pronto (todos os passos feitos, sem botões);
//     `mostrar`   o anfitrião diz se o componente está à vista de verdade (a área ou a tela
//                 aberta, não só montada em um lugar escondido): é daí que contam os 2 minutos.
//
// O código do AnkiWeb vem de `PerpetualMiner.CODIGO_DO_ANKIWEB` (nenhum até o primeiro
// upload); quem o publicar define esse valor em `lib/` e nada mais muda aqui.

(function (raiz) {
  // `esperaAConexao`: o passo não enxerga nada antes da Conexão responder, então o status dele
  // espera em vez de dizer “desligada” (o Anki não é lido antes dela: nunca diz “não encontrado”).
  // Um passo novo diz isso de si mesmo, em vez de a regra listar quem está de fora.
  const PASSOS = [
    { id: 'ter', titulo: 'ONB-16.passo1Titulo', texto: 'ONB-16.passo1Texto', esperaAConexao: true },
    { id: 'colocar', titulo: 'ONB-16.passo2Titulo', texto: 'ONB-16.passo2Texto', esperaAConexao: true },
    { id: 'reiniciar', titulo: 'ONB-16.passo3Titulo', texto: 'ONB-16.passo3Texto', esperaAConexao: false },
  ];
  const PASSO_DA_PERGUNTA = 'ter';
  const PASSO_DO_ARQUIVO = 'colocar';
  const PASSO_DO_TENTAR = 'reiniciar';
  const ARQUIVO_DA_CONEXAO = 'conexao/perpetualminer.ankiaddon';
  const NOME_DO_ARQUIVO = 'perpetualminer.ankiaddon';
  const SITE_DO_ANKI = 'https://apps.ankiweb.net/';
  /** Sem resposta depois disto, o checklist e “Baixar de novo”. */
  const SEM_RESPOSTA_MS = 2 * 60 * 1000;
  const INTERVALO_DO_TIQUE = 1000;
  const ITENS_DO_CHECKLIST = ['ONB-16.confira1', 'ONB-16.confira2', 'ONB-16.confira3'];

  const { textoDaVoz, Veio, ConexaoAnki, ConexaoNaTela, Configuracao } = raiz;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const { SITUACAO } = Configuracao;

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

  function montar(lugar, { prefixo, navegacao = true, empilhado = false, aoSairOBotao = null }) {
    const id = parte => `${prefixo}-${parte}`;
    const estado = {
      escolha: null,        // o passo que a pessoa abriu; sem ele, o primeiro que falta
      pronto: false,        // o anfitrião mostra o momento Pronto
      visivel: false,
      conferindo: ConexaoAnki.conferindo(),   // uma conferência do /health está no ar
      esperandoDesde: null, // quando a espera da Conexão começou (ms); null: ainda não
      semResposta: false,   // o checklist está na tela (fica até a Conexão responder)
      semOAnki: false,      // a pessoa disse que ainda não tem o Anki (o aviso do Anki fica)
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

    // O passo da pergunta: as duas respostas e, para quem ainda não tem o Anki, o aviso
    // do Anki — ele entra com a animação do componente e sai quando a pessoa diz que tem.
    const tenho = elemento('button', `veio-botao ${destaque}`, textoDaVoz('ONB-16.tenhoOAnki'));
    tenho.type = 'button';
    tenho.id = id('tenho');
    tenho.addEventListener('click', () => {
      estado.semOAnki = false;
      abrirPasso(PASSO_DO_ARQUIVO);
    });
    const naoTenho = elemento('button', 'veio-botao veio-botao--contorno', textoDaVoz('ONB-16.naoTenhoOAnki'));
    naoTenho.type = 'button';
    naoTenho.id = id('nao-tenho');
    naoTenho.addEventListener('click', () => {
      estado.semOAnki = true;
      desenhar();
    });
    const avisoDoAnki = Veio.montarAviso({
      texto: textoDaVoz('ONB-16.avisoDoAnki'),
      tom: 'info',
      fechavel: false,
      acao: {
        rotulo: textoDaVoz('ONB-16.baixarOAnki'),
        aoUsar: () => chrome.tabs.create({ url: SITE_DO_ANKI }),
      },
    });
    const respostas = elemento('div', 'pc-pergunta__respostas', tenho, naoTenho);
    const aPergunta = elemento('div', 'pc-pergunta', respostas, avisoDoAnki);

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
      // Só o botão do passo fixa o passo de reiniciar: o Tentar de novo da F1 não é escolha da pessoa.
      estado.escolha = PASSO_DO_TENTAR;
      ConexaoAnki.tentarDeNovo();
    });
    const conexao = elemento('div', 'bv-conexao', status, tentar);

    const baixarDeNovo = linkDoArquivo('veio-botao veio-botao--contorno veio-botao--compacto', textoDaVoz('ONB-16.baixarDeNovo'));
    const checklist = elemento('ul', 'pc-checklist', ...ITENS_DO_CHECKLIST.map(item => elemento('li', null, textoDaVoz(item))));
    const semResposta = elemento('div', 'pc-sem-resposta',
      elemento('p', 'pc-sem-resposta__texto', textoDaVoz('ONB-16.semResposta')), checklist, baixarDeNovo);
    semResposta.hidden = true;

    const controle = elemento('div', 'pc-controle', aPergunta, doArquivo, conexao, semResposta);

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

    /** O passo aberto: o que a pessoa escolheu ou, sem escolha, o primeiro que falta (o último, enquanto confere). */
    function passoAberto() {
      if (estado.pronto) return PASSOS[PASSOS.length - 1].id;
      if (estado.escolha !== null) return estado.escolha;
      return ConexaoAnki.situacao() === CONEXAO.CONECTANDO ? PASSO_DO_TENTAR : PASSOS[0].id;
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
      const passoDoCard = PASSOS[Math.max(aberto, 0)];
      const situacao = ConexaoAnki.situacao();
      const conectando = situacao === CONEXAO.CONECTANDO;
      // No passo de reiniciar, uma conferência no ar sobre uma Conexão desligada é “Conectando”, sem
      // clique nenhum; o último resultado só volta quando a resposta chega. Ligada, ela segue ligada.
      const exibida = estado.conferindo && situacao === CONEXAO.DESLIGADA && passoDoCard.id === PASSO_DO_TENTAR
        ? CONEXAO.CONECTANDO : situacao;
      const feito = pronto || situacao === CONEXAO.LIGADA;

      marcas.forEach(({ botao, marca, leitor }, i) => {
        if (i === aberto) botao.setAttribute('aria-current', 'step');
        else botao.removeAttribute('aria-current');
        marca.dataset.situacao = feito ? SITUACAO.FEITO : '';
        marca.classList.toggle('bv-marca--atual', i === aberto);
        marca.replaceChildren(...(feito ? [Veio.iconeVeio('certo')] : []));
        // O nome do item diz a situação ao leitor de tela: “…, feito”.
        leitor.textContent = feito ? `, ${textoDaVoz('ONB-13.feito')}` : '';
      });

      // O momento Pronto troca o card inteiro: a Conexão respondeu e as abas voltam em seguida.
      sobretitulo.textContent = pronto ? textoDaVoz('ONB-16.pronto')
        : `${textoDaVoz('ONB-16.passos')} · ${textoDaVoz('ONB-03.passo', { n: aberto + 1, total: PASSOS.length })}`;
      titulo.textContent = pronto ? ConexaoNaTela.texto(CONEXAO.LIGADA) : textoDaVoz(passoDoCard.titulo);
      texto.textContent = pronto ? textoDaVoz('ONB-16.prontoApoio') : textoDaVoz(passoDoCard.texto);
      aPergunta.hidden = pronto || passoDoCard.id !== PASSO_DA_PERGUNTA;
      // Dentro da pergunta, o aviso do Anki fica enquanto a pessoa disse que ainda não o tem.
      avisoDoAnki.hidden = !estado.semOAnki;
      doArquivo.hidden = pronto || passoDoCard.id !== PASSO_DO_ARQUIVO;

      // O status é uma região que anuncia a mudança: o ponto e o texto trocam, ela fica. Nos passos
      // que não enxergam nada antes da Conexão (`esperaAConexao`), enquanto ela não respondeu, ele
      // espera (o Anki não é lido antes dela: nunca diz “não encontrado”).
      const esperando = !pronto && passoDoCard.esperaAConexao && situacao === CONEXAO.DESLIGADA;
      status.classList.toggle('pc-status--espera', esperando);
      const mostrada = pronto && !conectando ? CONEXAO.LIGADA : exibida;
      ConexaoNaTela.pintarPonto(ponto, esperando ? '' : mostrada);
      textoDoStatus.textContent = esperando ? textoDaVoz('ONB-16.esperando')
        : mostrada === CONEXAO.LIGADA ? textoDeAchei() : ConexaoNaTela.texto(mostrada);

      ConexaoNaTela.pintarTentarDeNovo(tentar, exibida, {
        sai: pronto || situacao === CONEXAO.LIGADA || passoDoCard.id !== PASSO_DO_TENTAR,
        focoPara: () => aoSairOBotao?.() ?? titulo,
      });

      rodape.hidden = !navegacao || pronto;
      voltar.hidden = aberto <= 0;
      continuar.hidden = aberto >= PASSOS.length - 1;
      desenharAEspera();
    }

    ConexaoAnki.acompanhar(() => desenhar());
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
    };
  }

  raiz.PassosDaConexao = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
