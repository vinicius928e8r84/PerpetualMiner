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
// momento Pronto, que o painel-anki.js segura antes de devolver as abas.
//
// A linha “Confere sozinho a cada 15 s” segue a conferência de /health que o
// shell inicia em `ConexaoAnki` (`acompanhar`, `aoConferir`): este arquivo não
// pergunta nada à rede. O único relógio é o de 1 s que reescreve “há N s”.

(function (raiz) {
  const PASSOS = [
    { titulo: 'ONB-16.passo1Titulo', texto: 'ONB-08.passo1' },
    { titulo: 'ONB-16.passo2Titulo', texto: 'ONB-08.passo2' },
    { titulo: 'ONB-16.passo3Titulo', texto: 'ONB-08.passo3' },
  ];
  const PASSO_DOS_COMANDOS = 1;
  const PASSO_DO_TENTAR = 2;
  const INTERVALO_DO_TIQUE = 1000;

  const { textoDaVoz, Veio, ConexaoAnki, Configuracao } = raiz;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const { SITUACAO } = Configuracao;
  const porId = id => document.getElementById(id);

  const estado = {
    pronto: false,
    escolha: null,          // o passo que a pessoa abriu; sem ele, o primeiro que falta
    conferindo: false,      // uma conferência está no ar
    conferiuEm: null,       // quando a última voltou
  };
  const marcas = [];        // por passo: { botao, marca, leitor }
  let ultimoPedido = null;  // o que o painel-anki.js pediu por último, para redesenhar ao trocar de passo

  // ─── Montagem ──────────────────────────────────────────────────────────────

  function montar() {
    montarLista();
    montarComoLigar();
    porId('apv-voltar').addEventListener('click', () => abrirPasso(passoAtual() - 1));
    porId('apv-continuar').addEventListener('click', () => abrirPasso(passoAtual() + 1));
    porId('apv-tentar').addEventListener('click', () => {
      // Conectando, o botão fica indisponível sem sair do foco.
      if (porId('apv-tentar').getAttribute('aria-disabled') === 'true') return;
      // Só o botão do card fixa o passo 3: o Tentar de novo da F1 e o da Boas-vindas não são escolha dela.
      estado.escolha = PASSO_DO_TENTAR;
      ConexaoAnki.tentarDeNovo();
    });

    ConexaoAnki.acompanhar(aoMudarAConexao);
    ConexaoAnki.aoConferir(conferindo => {
      estado.conferindo = conferindo;
      desenharConferencia();
    });
    setInterval(desenharConferencia, INTERVALO_DO_TIQUE);
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

  // ─── A conferência de 15 s do ConexaoAnki ───────────────────────────────────

  function aoMudarAConexao(situacao) {
    if (situacao !== CONEXAO.CONECTANDO) estado.conferiuEm = Date.now();
  }

  function desenharConferencia() {
    if (porId('anki-primeira-vez').hidden) return;
    const agora = estado.conferindo || ConexaoAnki.situacao() === CONEXAO.CONECTANDO;
    const segundos = Math.max(0, Math.floor((Date.now() - (estado.conferiuEm ?? Date.now())) / 1000));
    porId('apv-confere').textContent = agora
      ? textoDaVoz('ONB-16.conferindoAgora')
      : textoDaVoz('ONB-16.conferindo', { segundos });
  }

  // ─── O card ────────────────────────────────────────────────────────────────

  const ligada = () => estado.pronto || ConexaoAnki.situacao() === CONEXAO.LIGADA;

  /** O passo aberto: o que a pessoa escolheu ou, sem escolha, o primeiro que falta. */
  function passoAtual() {
    if (estado.pronto) return PASSOS.length;
    if (estado.escolha !== null) return estado.escolha;
    if (ConexaoAnki.situacao() === CONEXAO.CONECTANDO) return PASSO_DO_TENTAR;
    return ligada() ? PASSOS.length : 0;
  }

  function abrirPasso(i) {
    estado.escolha = Math.min(Math.max(i, 0), PASSOS.length - 1);
    desenhar(ultimoPedido);
    // O foco vai ao título, para o leitor de tela ler o passo novo; o botão
    // apertado pode ter saído (Voltar no 1, Continuar no 3).
    porId('apv-passo-titulo').focus();
  }

  /**
   * `visivel`: o painel-anki.js diz se o card está no lugar das abas.
   * `pronto`: o momento Pronto, entre a primeira resposta e a volta das abas.
   */
  function desenhar(pedido) {
    ultimoPedido = pedido;
    const { visivel, pronto } = pedido;
    const conexao = ConexaoAnki.situacao();
    const secao = porId('anki-primeira-vez');
    // O card sai com o foco dentro: ele vai para a aba, em vez de cair no fim da
    // página. O painel-anki.js já devolveu as abas à tela, então o foco pega.
    if (!visivel && !secao.hidden && secao.contains(document.activeElement)) {
      document.querySelector('input[name="aba-anki"]:checked')?.focus();
    }
    secao.hidden = !visivel;
    if (!visivel) return;
    // No Pronto o botão em que a pessoa estava (o do card ou o da F1, que o shell
    // desativa ao tentar) sai da tela e o foco já não está em lugar nenhum: ele
    // fica no título do card, e não cai no <body>.
    const ativo = document.activeElement;
    const focoSaindo = secao.contains(ativo) || ativo === document.body || ativo === null;
    const entrouNoPronto = pronto && !estado.pronto;
    estado.pronto = pronto;

    const passoAberto = passoAtual();
    const feito = ligada();
    const conectando = conexao === CONEXAO.CONECTANDO;

    porId('anki-primeira-vez-titulo').textContent = textoDaVoz(pronto ? 'BRG-01.ligada' : 'ONB-16.titulo');
    porId('apv-apoio').hidden = pronto;
    porId('apv-rodape').hidden = pronto;

    marcas.forEach(({ botao, marca, leitor }, i) => {
      if (i === passoAberto) botao.setAttribute('aria-current', 'step');
      else botao.removeAttribute('aria-current');
      marca.dataset.situacao = feito ? SITUACAO.FEITO : '';
      marca.classList.toggle('bv-marca--atual', i === passoAberto);
      marca.replaceChildren(...(feito ? [Veio.iconeVeio('certo')] : []));
      // O nome do item diz a situação ao leitor de tela: “…, feito”.
      leitor.textContent = feito ? `, ${textoDaVoz('ONB-13.feito')}` : '';
    });

    const passo = PASSOS[passoAberto];
    porId('apv-sobretitulo').textContent = pronto
      ? textoDaVoz('ONB-16.pronto')
      : `${textoDaVoz('ONB-16.passos')} · ${textoDaVoz('ONB-03.passo', { n: passoAberto + 1, total: PASSOS.length })}`;
    porId('apv-passo-titulo').textContent = pronto ? textoDaVoz('BRG-01.ligada') : textoDaVoz(passo.titulo);
    porId('apv-texto').textContent = pronto ? textoDaVoz('ONB-16.prontoApoio') : textoDaVoz(passo.texto);

    // O status é uma região que anuncia a mudança: o ponto e o texto trocam, ela fica.
    const esperando = passoAberto === 0 && !feito && !conectando;
    porId('apv-status').classList.toggle('apv-status--espera', esperando);
    porId('apv-ponto').dataset.estado = esperando ? '' : feito ? CONEXAO.LIGADA : conexao;
    porId('apv-status-texto').textContent = esperando
      ? textoDaVoz('ONB-16.esperando')
      : conectando ? textoDaVoz('BRG-02') : textoDaVoz(`BRG-01.${feito ? CONEXAO.LIGADA : conexao}`);

    const tentar = porId('apv-tentar');
    tentar.hidden = pronto || passoAberto !== PASSO_DO_TENTAR;
    tentar.setAttribute('aria-disabled', String(conectando));
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

  raiz.PrimeiraConexao = { montar, desenhar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
