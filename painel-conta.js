'use strict';

(function (raiz) {
  /** “Sincronizado há N min” avança sozinho. */
  const INTERVALO_DO_RELOGIO = 30000;

  // Os nomes das situações. O painel.js usa estes, e não uma string solta.
  const SITUACOES = Object.freeze({
    SINCRONIZANDO: 'sincronizando',
    PRIMEIRA_SUBIDA: 'primeiraSubida',
    PRIMEIRA_SUBIDA_FALHOU: 'primeiraSubidaFalhou',
    SINCRONIZADO: 'sincronizado',
    SEM_SINCRONIZAR: 'semSincronizar',
    CHAVE_PENDENTE: 'chavePendente',
    PARCIAL: 'parcial',
    RECUSADO: 'recusado',
    EXPIROU: 'expirou',
  });

  const { textoDaVoz, Contexto } = raiz;
  const { iconeVeio, montarAviso, montarDetalhes } = raiz.Veio;
  const porId = id => document.getElementById(id);

  /**
   * O que cada situação mostra. `chip` é o estado curto (chip e resumo);
   * `status`, a linha sob o nome no card; `aviso`, o erro com a ação ao lado;
   * `sair`, como aparece o Sair da conta ('fantasma', 'secundario' ou nenhum).
   */
  const COMO_APARECE = {
    [SITUACOES.SINCRONIZANDO]: {
      ponto: 'sincronizando',
      chip: () => textoDaVoz('CFG-01'),
      sair: 'fantasma',
    },
    [SITUACOES.PRIMEIRA_SUBIDA]: {
      ponto: 'sincronizando',
      chip: ({ n }) => textoDaVoz('CFG-09.andamento', { n }),
      sair: 'fantasma',
    },
    // A primeira subida não chegou à nuvem: nenhuma frase subiu.
    [SITUACOES.PRIMEIRA_SUBIDA_FALHOU]: {
      erro: true,
      chip: () => textoDaVoz('SHL-05.semSincronizar'),
      aviso: { texto: 'CFG-09.falha', acao: 'CFG-03.tentarDeNovo' },
      sair: 'fantasma',
    },
    [SITUACOES.SINCRONIZADO]: {
      ponto: 'ok',
      chip: ({ sincronizadoEm }) => textoDaVoz('CFG-02', { quando: Contexto.haQuanto(sincronizadoEm) }),
      sair: 'fantasma',
    },
    [SITUACOES.SEM_SINCRONIZAR]: {
      erro: true,
      chip: () => textoDaVoz('SHL-05.semSincronizar'),
      status: () => textoDaVoz('CFG-03.aviso'),
      aviso: { texto: 'CFG-03.pendente', acao: 'CFG-03.tentarDeNovo' },
      sair: 'fantasma',
    },
    [SITUACOES.CHAVE_PENDENTE]: {
      erro: true,
      chip: () => textoDaVoz('SHL-05.semSincronizar'),
      status: () => textoDaVoz('CFG-41.status'),
      aviso: { texto: 'CFG-41.aviso', acao: 'CFG-03.tentarDeNovo' },
      sair: 'fantasma',
    },
    [SITUACOES.PARCIAL]: {
      erro: true,
      chip: ({ n, total }) => textoDaVoz('SHL-05.parcial', { n, total }),
      status: ({ n, total }) => textoDaVoz('CFG-05.aviso', { n, total, faltando: total - n }),
      aviso: { texto: 'CFG-05.pendente', acao: 'CFG-05.tentarDeNovo' },
      sair: 'fantasma',
    },
    [SITUACOES.RECUSADO]: {
      erro: true,
      chip: () => textoDaVoz('SHL-05.semSincronizar'),
      status: () => textoDaVoz('CFG-04'),
      // A saída é o que resolve: o Sair da conta deixa de ser fantasma.
      sair: 'secundario',
    },
    [SITUACOES.EXPIROU]: {
      erro: true,
      chip: () => textoDaVoz('SHL-05.sessaoExpirou'),
      status: () => textoDaVoz('CFG-08.aviso'),
      entrar: true,
    },
  };

  const estado = {
    conta: null,          // { displayName, email, photoURL } | null
    sincronizacao: null,  // { situacao, n, total, detalhes, sincronizadoEm } | null
    falhaNoLogin: null,   // a causa técnica, para o Detalhes | null
  };
  const pedidos = { entrar() {}, sair() {}, tentarDeNovo() {} };
  // Onde o corpo do card é desenhado, além de Configurações.
  const outrosLugares = [];

  function mostrarConta(usuario) {
    estado.conta = usuario ? { ...usuario } : null;
    estado.sincronizacao = null;
    if (usuario) estado.falhaNoLogin = null;
    desenhar();
  }

  function mostrarSincronizacao(situacao, dados = {}) {
    if (!COMO_APARECE[situacao]) throw new Error(`Situação de sincronização desconhecida: ${situacao}`);
    estado.sincronizacao = { ...dados, situacao };
    if (situacao === SITUACOES.SINCRONIZADO) estado.sincronizacao.sincronizadoEm = Date.now();
    desenhar();
  }

  /** O login que falhou (CFG-07); `null` apaga o erro. Cancelar não é falha. */
  function mostrarFalhaNoLogin(detalhes) {
    estado.falhaNoLogin = detalhes || null;
    desenhar();
  }

  function aoPedir(novos) {
    Object.assign(pedidos, novos);
  }

  /**
   * Desenha o corpo do card Conta & sync também em `lugar`, e o mantém igual
   * ao de Configurações dali em diante: o mesmo Entrar com Google, o mesmo
   * estado da sincronização.
   */
  function montarCartao(lugar) {
    outrosLugares.push(lugar);
    desenharCorpo(lugar);
  }

  function desenhar() {
    desenharChip();
    desenharResumo();
    desenharCard();
  }

  function nomeVisivel() {
    const { conta } = estado;
    // Sem nome no perfil, a conta é “Conta Google” (CFG-10), nunca o e-mail.
    return conta.displayName || textoDaVoz('CFG-10');
  }

  function situacaoAtual() {
    const sincronizacao = estado.sincronizacao;
    if (!sincronizacao) return null;
    const vista = { ...COMO_APARECE[sincronizacao.situacao], dados: sincronizacao };
    if (sincronizacao.situacao === SITUACOES.CHAVE_PENDENTE) {
      if (sincronizacao.codigo === 'outdated_connection') {
        vista.aviso = { texto: 'CFG-35.erroConexaoAntiga', acao: 'CFG-35.erroAtualizar',
          aoUsar: () => raiz.CartaoDaIA.baixarConexao() };
      } else if (sincronizacao.codigo === 'other_account_unsent') {
        vista.status = () => textoDaVoz('CFG-42.status');
        vista.aviso = { texto: 'CFG-42.aviso', acao: 'CFG-03.tentarDeNovo' };
      } else if (sincronizacao.codigo === 'legacy_key_unbound') {
        vista.aviso = { texto: 'CFG-42.legado', acao: 'CFG-35.erroTrocar',
          aoUsar: () => raiz.CartaoDaIA.trocarChave() };
      }
    }
    return vista;
  }

  function textoDoChip() {
    const situacao = situacaoAtual();
    return situacao ? situacao.chip(situacao.dados) : '';
  }

  function desenharChip() {
    const chip = porId('shell-chip');
    const nome = porId('shell-chip-nome');
    const situacao = porId('shell-chip-estado');
    desenharAvatar(porId('shell-avatar'));
    situacao.classList.remove('shell-chip__estado--erro');

    // Sem conta, as duas linhas de quem tem conta: “Sem conta” no lugar do nome e
    // “Só neste computador” no do estado. A frase inteira fica no tooltip.
    if (!estado.conta) {
      nome.textContent = textoDaVoz('SHL-05.semContaNome');
      situacao.textContent = textoDaVoz('SHL-05.semContaEstado');
      situacao.hidden = false;
      chip.title = textoDaVoz('SHL-05.semConta');
      return;
    }

    nome.textContent = nomeVisivel();
    chip.title = nome.textContent;
    situacao.textContent = textoDoChip();
    situacao.hidden = !situacao.textContent;
    situacao.classList.toggle('shell-chip__estado--erro', Boolean(situacaoAtual()?.erro));
  }

  /** A linha fechada: ponto + “Nome · estado do chip”; sem conta, só neste computador. */
  function desenharResumo() {
    const resumo = porId('cfg-conta-resumo');
    if (!estado.conta) {
      resumo.replaceChildren(textoDaVoz('SHL-05.semConta'));
      return;
    }
    const doChip = textoDoChip();
    const texto = doChip ? textoDaVoz('CFG-27', { nome: nomeVisivel(), estado: doChip }) : nomeVisivel();
    resumo.replaceChildren(linhaDeStatus(texto));
  }

  function desenharCard() {
    for (const corpo of [porId('cfg-conta-corpo'), ...outrosLugares]) desenharCorpo(corpo);
  }

  /**
   * Refaz o corpo do card. O botão que tinha o foco (o Entrar com Google que
   * acabou de entrar) sai com o corpo velho: o foco vai para o primeiro botão
   * do novo, em vez de cair no fim da página.
   */
  function desenharCorpo(corpo) {
    const tinhaOFoco = corpo.contains(document.activeElement);
    corpo.replaceChildren(...(estado.conta ? cardComConta() : cardSemConta()));
    if (tinhaOFoco) corpo.querySelector('button')?.focus();
  }

  /** Sem conta (CFG-06) e, se o login falhou, o erro dele (CFG-07). */
  function cardSemConta() {
    const avatar = elemento('span', 'shell-avatar cfg-avatar');
    desenharAvatar(avatar);
    const entrar = botao('primario', textoDaVoz('CFG-06.botao'), () => pedidos.entrar());
    entrar.prepend(iconeVeio('entrar'));

    const partes = [linha(
      elemento('div', 'cfg-conta', avatar, elemento('div', 'cfg-quem',
        elemento('b', 'cfg-convite', textoDaVoz('CFG-06.ajuda')),
        elemento('span', 'cfg-nota', textoDaVoz('CFG-06.semConta')))),
      elemento('div', 'cfg-acoes', entrar),
    )];

    if (estado.falhaNoLogin) {
      partes.push(montarAviso({
        texto: textoDaVoz('CFG-07.aviso'),
        acao: { rotulo: textoDaVoz('CFG-07.tentarDeNovo'), aoUsar: () => pedidos.entrar() },
        detalhes: estado.falhaNoLogin,
        fechavel: false,
      }));
    }
    return partes;
  }

  function cardComConta() {
    const situacao = situacaoAtual();
    const avatar = elemento('span', 'shell-avatar cfg-avatar');
    desenharAvatar(avatar);

    const status = situacao ? linhaDeStatus((situacao.status || situacao.chip)(situacao.dados)) : null;
    const acoes = elemento('div', 'cfg-acoes');
    if (situacao?.entrar) acoes.append(botao('primario', textoDaVoz('CFG-08.entrar'), () => pedidos.entrar()));
    const estiloDoSair = situacao ? situacao.sair : 'fantasma';
    if (estiloDoSair) acoes.append(botao(estiloDoSair, textoDaVoz('CFG-23'), () => pedidos.sair()));

    const principal = linha(
      elemento('div', 'cfg-conta', avatar, elemento('div', 'cfg-quem',
        elemento('b', 'cfg-nome', nomeVisivel()), status)),
      acoes,
    );
    // A nota só acompanha o Sair da conta quando o sync está em dia.
    if (!situacao?.erro) principal.append(elemento('p', 'cfg-nota cfg-nota--linha', textoDaVoz('CFG-26')));

    const partes = [principal];
    const detalhes = situacao?.dados.detalhes;
    if (situacao?.aviso) {
      partes.push(montarAviso({
        texto: textoDaVoz(situacao.aviso.texto),
        acao: { rotulo: textoDaVoz(situacao.aviso.acao), aoUsar: situacao.aviso.aoUsar || (() => pedidos.tentarDeNovo()) },
        detalhes,
        fechavel: false,
      }));
    } else if (situacao?.erro && detalhes) {
      partes.push(montarDetalhes(detalhes));
    }
    return partes;
  }

  /** O ponto do estado e o texto; em `danger` quando é problema. */
  function linhaDeStatus(texto) {
    const situacao = situacaoAtual();
    const status = elemento('span', 'cfg-status');
    if (situacao) {
      const ponto = elemento('span', 'cfg-ponto');
      ponto.dataset.estado = situacao.erro ? 'erro' : situacao.ponto;
      ponto.setAttribute('aria-hidden', 'true');
      status.append(ponto);
      status.classList.toggle('cfg-status--erro', Boolean(situacao.erro));
    }
    status.append(texto);
    return status;
  }

  /**
   * A foto, a inicial do nome ou, sem conta, o círculo tracejado com “?”. O
   * avatar é desenho (aria-hidden), então o “?” não é cópia: quem diz que não há
   * conta é o texto ao lado.
   */
  function desenharAvatar(avatar) {
    avatar.replaceChildren();
    avatar.classList.toggle('shell-avatar--vazio', !estado.conta);
    avatar.setAttribute('aria-hidden', 'true');
    if (!estado.conta) {
      avatar.textContent = '?';
      return;
    }
    if (estado.conta.photoURL) {
      const foto = document.createElement('img');
      foto.src = estado.conta.photoURL;
      foto.alt = '';
      avatar.append(foto);
    } else {
      avatar.textContent = nomeVisivel().charAt(0).toUpperCase();
    }
  }

  function linha(...filhos) {
    return elemento('div', 'cfg-linha', ...filhos);
  }

  function botao(variante, rotulo, aoUsar) {
    const b = elemento('button', `veio-botao veio-botao--${variante}`, rotulo);
    b.type = 'button';
    b.addEventListener('click', aoUsar);
    return b;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    no.className = classe;
    no.append(...filhos.filter(filho => filho !== null && filho !== undefined));
    return no;
  }

  document.addEventListener('DOMContentLoaded', () => {
    desenhar();
    setInterval(() => {
      if (estado.sincronizacao?.situacao === SITUACOES.SINCRONIZADO) desenhar();
    }, INTERVALO_DO_RELOGIO);
  });

  raiz.Conta = {
    SITUACOES,
    mostrarConta,
    mostrarSincronizacao,
    mostrarFalhaNoLogin,
    aoPedir,
    montarCartao,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
