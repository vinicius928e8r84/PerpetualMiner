'use strict';

// A Boas-vindas (docs/design/painel/boas-vindas/, variante C; item 8 da lista
// fechada): uma página do Painel sem a sidebar, em #boas-vindas, que a
// instalação abre sozinha (background.js, onInstalled com `install`).
//
//   #boas-vindas                 a abertura: o que é o produto e os 6 passos
//   #boas-vindas/<passo>         minerar · atalho · conta · anki · automatica · chave
//   #boas-vindas/pronto          Tudo pronto: o resumo de cada passo e Abrir painel
//
// À esquerda, a lista dos 8 itens (dá para clicar em qualquer um), com a marca
// de cada passo: o número, o ✓ ouro quando feito, o tracejado quando “agora
// não”. À direita, o card do passo atual, com Voltar · Agora não (só nos
// opcionais) · Continuar.
//
// Um passo está feito pelo estado real, lido do que já está gravado: a frase
// no histórico, o atalho de Minerar seleção, a conta, a Conexão com o Anki
// respondendo, um idioma da mineração automática ligado, a chave do Gemini. O
// que a pessoa fez fora da página já aparece feito. Só o “agora não” (e se ela
// chegou a Abrir painel) é desta página, gravado neste computador em
// `pm_boas_vindas`. Quem lê e grava tudo isso é `lib/configuracao.js`, o mesmo
// que desenha o lembrete “Configuração pela metade” no popup e em Frases.
// “Continuar” num passo obrigatório segue sem marcar nada: ele fica “falta” no
// resumo.
//
// O passo 1 tem a mineração rápida do popup (SALVAR_HISTORICO com a Fonte
// `manual`) e o passo 2 o gravador de Configurações › Atalhos
// (painel-atalhos.js), o mesmo, com o mesmo storage. Os controles dos passos 3
// a 6 entram no #43; aqui eles já aparecem na lista com o estado real. Toda
// cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, Atalhos, Veio, IDIOMAS, minerarFraseManual, Configuracao } = raiz;

  const ABERTURA = 'abertura';
  const PRONTO = 'pronto';

  /**
   * O que cada passo tem nesta página: o valor que o resumo mostra quando ele
   * está feito e o que a tela dele monta. A ordem, o “opcional” e quando ele
   * está feito são de `Configuracao.PASSOS`.
   */
  const DESTA_PAGINA = {
    minerar: {
      valor: e => textoDaVoz('PAI-05', { n: e.totalDeFrases }),
      montar: montarPasso1,
    },
    atalho: {
      valor: e => Atalhos.rotuloDoAtalho(e.atalhoDeSelecao),
      montar: montarPasso2,
    },
    conta: {
      valor: e => e.conta.displayName || textoDaVoz('CFG-10'),
      montar: () => montarPassoSoTexto('ONB-07'),
    },
    anki: {
      valor: () => textoDaVoz('ONB-13.ligada'),
      montar: () => montarPassoSoTexto('ONB-08.corpo'),
    },
    automatica: {
      // Os idiomas ligados, separados pelo “·” da Voz (V5).
      valor: e => [e.automatica.en && IDIOMAS.INGLES, e.automatica.ru && IDIOMAS.RUSSO]
        .filter(Boolean).join(' · '),
      montar: () => montarPassoSoTexto('ONB-09.corpo'),
    },
    chave: {
      valor: () => textoDaVoz('ONB-13.salva'),
      montar: () => montarPassoSoTexto('ONB-11.corpo'),
    },
  };
  const PASSOS = Configuracao.PASSOS.map(passo => ({ ...passo, ...DESTA_PAGINA[passo.id] }));
  const TELAS = [ABERTURA, ...PASSOS.map(p => p.id), PRONTO];
  const passoDa = tela => PASSOS.find(p => p.id === tela);

  /** A situação de um passo e a palavra dela no catálogo (ONB-13). */
  const { SITUACAO } = Configuracao;
  const TEXTO_DA_SITUACAO = {
    [SITUACAO.FEITO]: 'ONB-13.feito',
    [SITUACAO.AGORA_NAO]: 'ONB-13.agoraNao',
    [SITUACAO.FALTA]: 'ONB-13.falta',
  };

  const estado = {
    tela: ABERTURA,
    atalhos: { ...Atalhos.ATALHOS_PADRAO },
    configuracao: null,    // o retrato de Configuracao, depois da primeira leitura
    minerando: false,
  };

  const porId = id => document.getElementById(id);
  const itensDaLista = new Map();   // tela → { botao, marca, situacao }
  const telas = new Map();          // tela → o corpo dela no card
  let paragrafoDoVideo = null;      // o ONB-05.video do passo 1, com o atalho de legenda
  let atalhoDoPasso1Desenhado;      // o rótulo que está nele, para não refazê-lo à toa
  let rodapeDesenhadoPara = null;   // a tela (e o Agora não) do rodapé na tela agora

  // ─── Início ────────────────────────────────────────────────────────────────

  function iniciarBoasVindas() {
    montarLista();
    montarTelas();
    // A Conexão chega pela mesma Configuracao: quem a informa é painel-lembrete.js.
    Configuracao.acompanhar(retrato => {
      estado.configuracao = retrato;
      desenhar();
    });
    // O atalho de legenda do passo 1 (o de seleção vem no retrato).
    Atalhos.acompanharAtalhos(atalhos => {
      estado.atalhos = atalhos;
      desenhar();
    });
    window.addEventListener('hashchange', () => mostrarTelaDoEndereco({ focar: true }));
    mostrarTelaDoEndereco({ focar: false });
  }

  /** A tela que o endereço pede; fora de #boas-vindas, nada muda. */
  function mostrarTelaDoEndereco({ focar }) {
    const [area, parte] = location.hash.replace(/^#/, '').split('/');
    if (area !== 'boas-vindas') return;
    estado.tela = TELAS.includes(parte) ? parte : ABERTURA;
    desenhar();
    window.scrollTo(0, 0);
    if (focar) porId('bv-titulo').focus();
  }

  function irPara(tela) {
    location.hash = tela === ABERTURA ? '#boas-vindas' : `#boas-vindas/${tela}`;
  }

  // ─── Os passos ─────────────────────────────────────────────────────────────

  /** Até a primeira leitura do que está gravado, todo passo falta. */
  const situacaoDo = passo => (estado.configuracao ? estado.configuracao.situacaoDo(passo.id) : SITUACAO.FALTA);

  const tituloDaTela = tela => (tela === PRONTO ? textoDaVoz('ONB-12.titulo') : textoDaVoz(`ONB-03.${tela}`));

  // ─── A lista ───────────────────────────────────────────────────────────────

  function montarLista() {
    const nav = porId('bv-lista');
    nav.setAttribute('aria-label', textoDaVoz('ONB-03.lista'));
    const ol = elemento('ol', 'bv-lista__itens');
    TELAS.forEach((tela, i) => {
      const marca = montarMarca(tela === ABERTURA ? '·' : tela === PRONTO ? '✓' : String(i));
      const situacao = elemento('span', 'veio-so-leitor');
      const botao = elemento('button', 'bv-lista__item', marca,
        elemento('span', 'bv-lista__rotulo', tela === ABERTURA ? textoDaVoz('ONB-03.abertura') : tituloDaTela(tela)),
        situacao);
      botao.type = 'button';
      botao.addEventListener('click', () => irPara(tela));
      itensDaLista.set(tela, { botao, marca, situacao });
      ol.append(elemento('li', null, botao));
    });
    nav.append(ol);
  }

  function desenharLista() {
    for (const [tela, { botao, marca, situacao }] of itensDaLista) {
      const atual = tela === estado.tela;
      if (atual) botao.setAttribute('aria-current', 'step');
      else botao.removeAttribute('aria-current');

      const passo = passoDa(tela);
      const agora = passo ? situacaoDo(passo) : null;
      desenharMarca(marca, agora, atual);
      // O nome do item diz a situação ao leitor de tela: “…, feito”.
      situacao.textContent = agora && agora !== SITUACAO.FALTA ? `, ${textoDaVoz(TEXTO_DA_SITUACAO[agora])}` : '';
    }
  }

  /**
   * A marca de um passo. O número (ou o tracejado) sai do CSS, pelo
   * `data-numero`: a marca é só desenho, e o texto do item continua sendo o
   * título do passo.
   */
  function montarMarca(numero) {
    const marca = elemento('span', 'bv-marca');
    marca.setAttribute('aria-hidden', 'true');
    marca.dataset.numero = numero;
    return marca;
  }

  function desenharMarca(marca, situacao, atual) {
    marca.dataset.situacao = situacao || '';
    marca.classList.toggle('bv-marca--atual', atual);
    marca.replaceChildren(...(situacao === SITUACAO.FEITO ? [Veio.iconeVeio('certo')] : []));
  }

  // ─── O card ────────────────────────────────────────────────────────────────

  function montarTelas() {
    const lugar = porId('bv-telas');
    const montarPronto = () => elemento('div', null,
      elemento('p', 'bv-texto', textoDaVoz('ONB-12.corpo')),
      elemento('ul', 'bv-resumo'));
    for (const tela of TELAS) {
      const corpo = tela === ABERTURA ? montarAbertura() : tela === PRONTO ? montarPronto() : passoDa(tela).montar();
      corpo.hidden = true;
      telas.set(tela, corpo);
      lugar.append(corpo);
    }
  }

  function montarAbertura() {
    const lista = elemento('ul', 'bv-resumo', ...PASSOS.map(({ id, opcional }, i) => {
      const item = elemento('li', 'bv-resumo__item', montarMarca(String(i + 1)), elemento('span', null, tituloDaTela(id)));
      if (opcional) item.append(elemento('span', 'veio-selo bv-resumo__lado', textoDaVoz('ONB-03.opcional')));
      return item;
    }));
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-01.corpo')), lista);
  }

  /** Os passos 3 a 6 ainda só com o texto: os controles deles são o #43. */
  function montarPassoSoTexto(idDoTexto) {
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz(idDoTexto)));
  }

  // ─── Passo 1: minerar a primeira frase ─────────────────────────────────────

  function montarPasso1() {
    paragrafoDoVideo = elemento('p', 'bv-texto');
    const selecao = elemento('p', 'bv-texto', textoDaVoz('ONB-05.selecao'));

    // A legenda marcada, parada: a linha ouro, a Palavra grifada e o chip.
    const legenda = elemento('span', 'bv-ilustracao__legenda');
    Veio.escreverFrase(legenda, textoDaVoz('ONB-05.exemplo'), textoDaVoz('ONB-05.exemploPalavra'));
    const ilustracao = elemento('div', 'bv-ilustracao', legenda,
      Veio.montarChipDaPalavra(textoDaVoz('ONB-05.exemploPalavra')));
    ilustracao.setAttribute('aria-hidden', 'true');
    // Uma tela de vídeo: escura nos dois temas, como o overlay.
    ilustracao.dataset.tema = 'escuro';

    const campo = elemento('input', 'veio-campo');
    campo.type = 'text';
    campo.id = 'bv-frase-rapida';
    campo.autocomplete = 'off';
    campo.placeholder = textoDaVoz('POP-03');
    campo.setAttribute('aria-label', textoDaVoz('POP-03'));
    campo.setAttribute('aria-describedby', 'bv-erro-rapida');
    const botao = elemento('button', 'veio-botao veio-botao--secundario', textoDaVoz('POP-04'));
    botao.type = 'submit';
    const erro = elemento('div', 'bv-rapida__erro');
    erro.id = 'bv-erro-rapida';
    erro.setAttribute('role', 'alert');

    const formulario = elemento('form', 'bv-rapida', elemento('div', 'bv-rapida__campo', campo, botao), erro);
    formulario.noValidate = true;
    formulario.addEventListener('submit', evento => {
      evento.preventDefault();
      minerarFraseRapida(campo, erro);
    });
    campo.addEventListener('input', () => limparErro(campo, erro));

    const controle = elemento('div', 'bv-controle',
      elemento('p', 'bv-nota', textoDaVoz('ONB-05.colar')), formulario);
    return elemento('div', null, paragrafoDoVideo, selecao, ilustracao, controle);
  }

  /**
   * “Num vídeo com legenda, aperte [Alt+S]. …”, com o atalho de legenda
   * gravado num `kbd`. Sem atalho, o `kbd` tracejado “Sem atalho” e Definir
   * atalho, que aqui leva ao passo 2 (fora da Boas-vindas, a Configurações).
   */
  function desenharAtalhoDoPasso1() {
    const rotulo = Atalhos.rotuloDoAtalho(estado.atalhos[Atalhos.ACOES.LEGENDA]);
    // Refazer o parágrafo tiraria o foco de quem está no Definir atalho; só
    // refaz quando o atalho muda, não a cada gravação no storage.
    if (rotulo === atalhoDoPasso1Desenhado) return;
    atalhoDoPasso1Desenhado = rotulo;
    const marcador = '\u0000';
    const [antes, depois] = textoDaVoz('ONB-05.video', { atalho: marcador }).split(marcador);
    const partes = [antes, Veio.montarTecla(rotulo, { seVazia: textoDaVoz('GLB-02.semAtalho') }), depois];
    if (!rotulo) {
      const definir = elemento('button', 'veio-botao veio-botao--link', textoDaVoz('GLB-02.definir'));
      definir.type = 'button';
      definir.addEventListener('click', () => irPara('atalho'));
      partes.push(' ', definir);
    }
    paragrafoDoVideo.replaceChildren(...partes);
  }

  function minerarFraseRapida(campo, erro) {
    const texto = campo.value.trim();
    if (!texto || estado.minerando) return;
    estado.minerando = true;
    minerarFraseManual(texto).then(() => {
      // POP-05: sem texto. O campo limpa e o passo fica feito pelo histórico.
      estado.minerando = false;
      campo.value = '';
      limparErro(campo, erro);
    }, () => {
      // POP-06: o texto fica no campo, para tentar de novo.
      estado.minerando = false;
      erro.replaceChildren(elemento('p', 'bv-falha', Veio.iconeVeio('alerta'), textoDaVoz('POP-06')));
      campo.setAttribute('aria-invalid', 'true');
    });
  }

  function limparErro(campo, erro) {
    erro.replaceChildren();
    campo.removeAttribute('aria-invalid');
  }

  // ─── Passo 2: o atalho de Minerar seleção ──────────────────────────────────

  function montarPasso2() {
    const controle = elemento('div', 'bv-controle bv-controle--atalhos');
    const tela = elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-06')), controle);
    // Sair do passo (a tela some) cancela a gravação, como fechar o card em Configurações.
    raiz.GravadorDeAtalhos.montar(controle, { prefixo: 'bv', lugar: tela });
    return tela;
  }

  // ─── Tudo pronto ───────────────────────────────────────────────────────────

  function desenharResumo() {
    const lista = telas.get(PRONTO).querySelector('.bv-resumo');
    lista.replaceChildren(...PASSOS.map((passo, i) => {
      const situacao = situacaoDo(passo);
      const marca = montarMarca(String(i + 1));
      desenharMarca(marca, situacao, false);
      // Feito mostra o valor (“Alt+Q”); o leitor de tela ouve “feito: Alt+Q”.
      const lado = situacao === SITUACAO.FEITO
        ? elemento('span', 'bv-resumo__lado', elemento('span', 'veio-so-leitor', `${textoDaVoz(TEXTO_DA_SITUACAO[situacao])}: `), passo.valor(estado.configuracao.estado))
        : elemento('span', 'bv-resumo__lado', textoDaVoz(TEXTO_DA_SITUACAO[situacao]));
      return elemento('li', 'bv-resumo__item', marca, elemento('span', null, tituloDaTela(passo.id)), lado);
    }));
  }

  // ─── Desenho ───────────────────────────────────────────────────────────────

  function desenhar() {
    const { tela } = estado;
    const passo = passoDa(tela);

    porId('bv-sobretitulo').textContent = sobretituloDa(tela, passo);
    porId('bv-titulo').textContent = tela === ABERTURA ? textoDaVoz('ONB-01.titulo') : tituloDaTela(tela);
    for (const [nome, corpo] of telas) corpo.hidden = nome !== tela;

    desenharLista();
    desenharAtalhoDoPasso1();
    desenharResumo();
    desenharRodape(tela, passo);
  }

  function sobretituloDa(tela, passo) {
    if (tela === ABERTURA) return textoDaVoz('ONB-03.abertura');
    if (tela === PRONTO) return textoDaVoz('ONB-12.sobretitulo');
    const n = PASSOS.indexOf(passo) + 1;
    return textoDaVoz(passo.opcional ? 'ONB-03.passoOpcional' : 'ONB-03.passo', { n, total: PASSOS.length });
  }

  function desenharRodape(tela, passo) {
    // Refeito só quando muda o que ele mostra: um redesenho pelo storage não
    // tira o foco do botão em que a pessoa está.
    const comAgoraNao = Boolean(passo?.opcional && situacaoDo(passo) !== SITUACAO.FEITO);
    const desenhoDoRodape = `${tela}|${comAgoraNao}`;
    if (desenhoDoRodape === rodapeDesenhadoPara) return;
    rodapeDesenhadoPara = desenhoDoRodape;
    const rodape = porId('bv-rodape');
    const espaco = elemento('span', 'bv-rodape__espaco');
    const anterior = TELAS[TELAS.indexOf(tela) - 1];
    const seguinte = TELAS[TELAS.indexOf(tela) + 1];

    if (tela === ABERTURA) {
      rodape.replaceChildren(
        botaoDoRodape('ONB-02.pular', 'fantasma', () => { location.hash = '#frases'; }),
        espaco,
        botaoDoRodape('ONB-02.comecar', 'primario', () => irPara(seguinte)));
      return;
    }

    const voltar = botaoDoRodape('ONB-04.voltar', 'secundario', () => irPara(anterior));
    if (tela === PRONTO) {
      rodape.replaceChildren(voltar, espaco, botaoDoRodape('ONB-12.abrirPainel', 'primario', () => {
        Configuracao.concluir();
        location.hash = '#frases';
      }));
      return;
    }

    const botoes = [voltar, espaco];
    if (comAgoraNao) {
      botoes.push(botaoDoRodape('ONB-04.agoraNao', 'fantasma', () => {
        Configuracao.marcarAgoraNao(passo.id);
        irPara(seguinte);
      }));
    }
    botoes.push(botaoDoRodape('ONB-04.continuar', 'primario', () => irPara(seguinte)));
    rodape.replaceChildren(...botoes);
  }

  function botaoDoRodape(id, variante, aoClicar) {
    const botao = elemento('button', `veio-botao veio-botao--${variante}`, textoDaVoz(id));
    botao.type = 'button';
    botao.addEventListener('click', aoClicar);
    return botao;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciarBoasVindas);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
