'use strict';

// O card ONB-16 da Conexão com o Anki, quando ela nunca respondeu neste computador
// (docs/design/painel/anki/prototipo-primeira-conexao.html, variante B “Igual às
// Boas-vindas”): a lista dos 3 passos ao lado do card do passo e, embaixo, a
// conferência sozinha e os dois quadros. O markup fixo é do painel.html; aqui se
// desenha o que muda.
//
// Os passos se marcam pelo estado real, e o único que a extensão enxerga antes da
// Conexão é ela mesma (o AnkiConnect não é lido: sem permissão nova). Por isso
// os três esperam a Conexão e viram ✓ juntos, quando ela responde: é o momento
// Pronto, que o painel-anki.js segura por um instante antes de devolver as abas.
//
// A linha “Confere sozinho a cada 15 s” segue a conferência de /health que o
// shell já faz (`aoMudarAConexao`, `aoConferirAConexao`): este arquivo não
// pergunta nada à rede. O único relógio é o de 1 s que reescreve “há N s”.

(function (raiz) {
  const PASSOS = [
    { titulo: 'ONB-16.passo1Titulo', texto: 'ONB-08.passo1' },
    { titulo: 'ONB-16.passo2Titulo', texto: 'ONB-08.passo2' },
    { titulo: 'ONB-16.passo3Titulo', texto: 'ONB-08.passo3' },
  ];
  const PASSO_DOS_COMANDOS = 1;
  const PASSO_DO_TENTAR = 2;
  const TAMANHO_DO_TIQUE = 1000;

  const { textoDaVoz, Veio, Shell } = raiz;
  const { CONEXAO } = Shell;
  const porId = id => document.getElementById(id);

  const estado = {
    conexao: CONEXAO.CONECTANDO,
    pronto: false,
    escolha: null,          // o passo que a pessoa abriu; sem ele, o primeiro que falta
    respondeu: false,       // a conferência já voltou alguma vez nesta página
    conferindo: false,      // uma conferência está no ar
    conferiuEm: null,       // quando a última voltou
  };
  const marcas = [];        // por passo: { botao, marca, situacao }
  let ultimaSituacao = null; // o que o painel-anki.js pediu por último, para redesenhar ao trocar de passo

  // ─── Montagem ──────────────────────────────────────────────────────────────

  function montar() {
    montarLista();
    montarComoLigar();
    porId('apv-voltar').addEventListener('click', () => abrirPasso(passoAtual() - 1));
    porId('apv-continuar').addEventListener('click', () => abrirPasso(passoAtual() + 1));
    porId('apv-tentar').addEventListener('click', () => {
      // Conectando, o botão fica indisponível sem sair do foco.
      if (porId('apv-tentar').getAttribute('aria-disabled') === 'true') return;
      Shell.tentarAConexaoDeNovo();
    });

    Shell.aoMudarAConexao(aoMudarAConexao);
    Shell.aoConferirAConexao(conferindo => {
      estado.conferindo = conferindo;
      desenharConferencia();
    });
    setInterval(desenharConferencia, TAMANHO_DO_TIQUE);
  }

  function montarLista() {
    const lista = porId('apv-lista');
    PASSOS.forEach((passo, i) => {
      const marca = elemento('span', 'bv-marca');
      marca.setAttribute('aria-hidden', 'true');
      marca.dataset.numero = String(i + 1);
      const situacao = elemento('span', 'veio-so-leitor');
      const botao = elemento('button', 'bv-lista__item', marca, elemento('span', null, textoDaVoz(passo.titulo)), situacao);
      botao.type = 'button';
      botao.addEventListener('click', () => abrirPasso(i));
      marcas.push({ botao, marca, situacao });
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

  // ─── A conferência de 15 s do shell ────────────────────────────────────────

  function aoMudarAConexao(situacao) {
    estado.conexao = situacao;
    if (situacao === CONEXAO.CONECTANDO) {
      // O Tentar de novo (o da F1 ou o do card): quem tenta olha o passo 3.
      if (estado.respondeu) estado.escolha = PASSO_DO_TENTAR;
    } else {
      estado.respondeu = true;
      estado.conferiuEm = Date.now();
    }
  }

  function desenharConferencia() {
    if (porId('anki-primeira-vez').hidden) return;
    const agora = estado.conferindo || estado.conexao === CONEXAO.CONECTANDO;
    const segundos = Math.max(0, Math.floor((Date.now() - (estado.conferiuEm ?? Date.now())) / 1000));
    porId('apv-confere').textContent = agora
      ? textoDaVoz('ONB-16.conferindoAgora')
      : textoDaVoz('ONB-16.conferindo', { segundos });
  }

  // ─── O card ────────────────────────────────────────────────────────────────

  const ligada = () => estado.pronto || estado.conexao === CONEXAO.LIGADA;

  /** O passo aberto: o que a pessoa escolheu ou, sem escolha, o primeiro que falta. */
  function passoAtual() {
    if (estado.pronto) return PASSOS.length;
    if (estado.escolha !== null) return estado.escolha;
    if (estado.conexao === CONEXAO.CONECTANDO) return PASSO_DO_TENTAR;
    return ligada() ? PASSOS.length : 0;
  }

  function abrirPasso(i) {
    estado.escolha = Math.min(Math.max(i, 0), PASSOS.length - 1);
    desenhar(ultimaSituacao);
    // O foco vai ao título, para o leitor de tela ler o passo novo; o botão
    // apertado pode ter saído (Voltar no 1, Continuar no 3).
    porId('apv-passo-titulo').focus();
  }

  /**
   * `visivel`: o painel-anki.js diz se o card está no lugar das abas.
   * `pronto`: o momento Pronto, entre a primeira resposta e a volta das abas.
   */
  function desenhar(situacao) {
    ultimaSituacao = situacao;
    const { visivel, pronto, conexao } = situacao;
    const secao = porId('anki-primeira-vez');
    // O card sai com o foco dentro: ele vai para a aba, em vez de cair no fim da página.
    if (!visivel && !secao.hidden && secao.contains(document.activeElement)) {
      document.querySelector('input[name="aba-anki"]:checked')?.focus();
    }
    secao.hidden = !visivel;
    if (!visivel) return;
    estado.pronto = pronto;
    estado.conexao = conexao;

    const k = passoAtual();
    const feito = ligada();
    const conectando = conexao === CONEXAO.CONECTANDO;

    porId('anki-primeira-vez-titulo').textContent = textoDaVoz(pronto ? 'BRG-01.ligada' : 'ONB-16.titulo');
    porId('apv-apoio').hidden = pronto;
    porId('apv-rodape').hidden = pronto;

    marcas.forEach(({ botao, marca, situacao }, i) => {
      if (i === k) botao.setAttribute('aria-current', 'step');
      else botao.removeAttribute('aria-current');
      marca.dataset.situacao = feito ? 'feito' : '';
      marca.classList.toggle('bv-marca--atual', i === k);
      marca.replaceChildren(...(feito ? [Veio.iconeVeio('certo')] : []));
      // O nome do item diz a situação ao leitor de tela: “…, feito”.
      situacao.textContent = feito ? `, ${textoDaVoz('ONB-13.feito')}` : '';
    });

    const passo = PASSOS[k];
    porId('apv-sobretitulo').textContent = pronto
      ? textoDaVoz('ONB-16.pronto')
      : `${textoDaVoz('ONB-16.passos')} · ${textoDaVoz('ONB-03.passo', { n: k + 1, total: PASSOS.length })}`;
    porId('apv-passo-titulo').textContent = pronto ? textoDaVoz('BRG-01.ligada') : textoDaVoz(passo.titulo);
    porId('apv-texto').textContent = pronto ? textoDaVoz('ONB-16.prontoApoio') : textoDaVoz(passo.texto);

    // O status é uma região que anuncia a mudança: o ponto e o texto trocam, ela fica.
    const esperando = k === 0 && !feito && !conectando;
    porId('apv-status').classList.toggle('apv-status--espera', esperando);
    porId('apv-ponto').dataset.estado = esperando ? '' : feito ? CONEXAO.LIGADA : conexao;
    porId('apv-status-texto').textContent = esperando
      ? textoDaVoz('ONB-16.esperando')
      : conectando ? textoDaVoz('BRG-02') : textoDaVoz(`BRG-01.${feito ? CONEXAO.LIGADA : conexao}`);

    const tentar = porId('apv-tentar');
    tentar.hidden = pronto || k !== PASSO_DO_TENTAR;
    tentar.setAttribute('aria-disabled', String(conectando));
    porId('anki-primeira-vez-detalhes').hidden = pronto || k !== PASSO_DOS_COMANDOS;

    porId('apv-navegacao').hidden = pronto;
    porId('apv-voltar').hidden = k === 0;
    porId('apv-continuar').hidden = k >= PASSOS.length - 1;

    desenharConferencia();
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  raiz.PrimeiraConexao = { montar, desenhar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
