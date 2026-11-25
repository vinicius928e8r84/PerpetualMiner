'use strict';

(function (raiz) {
  const INTERVALO_DO_RELOGIO = 30000;

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

  const chipSemSincronizar = () => textoDaVoz('SHL-05.semSincronizar');

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
    [SITUACOES.PRIMEIRA_SUBIDA_FALHOU]: {
      erro: true,
      chip: chipSemSincronizar,
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
      chip: chipSemSincronizar,
      status: () => textoDaVoz('CFG-03.aviso'),
      aviso: { texto: 'CFG-03.pendente', acao: 'CFG-03.tentarDeNovo' },
      sair: 'fantasma',
    },
    [SITUACOES.CHAVE_PENDENTE]: {
      erro: true,
      chip: chipSemSincronizar,
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
      chip: chipSemSincronizar,
      status: () => textoDaVoz('CFG-04'),
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
    conta: null,
    sincronizacao: null,
    falhaNoLogin: null,
  };
  const pedidos = { entrar() {}, sair() {}, tentarDeNovo() {} };
  const outrosLugares = [];
  const fazer = pedido => () => pedidos[pedido]();

  function mostrarConta(usuario) {
    estado.conta = usuario ? { ...usuario } : null;
    estado.sincronizacao = null;
    if (usuario) estado.falhaNoLogin = null;
    desenhar();
  }

  function mostrarSincronizacao(situacao, dados = {}) {
    if (!COMO_APARECE[situacao]) throw new Error(`Situação de sincronização desconhecida: ${situacao}`);
    const jaEmDiaDesde = estado.sincronizacao?.situacao === SITUACOES.SINCRONIZADO ? estado.sincronizacao.sincronizadoEm : null;
    estado.sincronizacao = { ...dados, situacao };
    if (situacao === SITUACOES.SINCRONIZADO) estado.sincronizacao.sincronizadoEm = jaEmDiaDesde ?? Date.now();
    desenhar();
  }

  function mostrarFalhaNoLogin(detalhes) {
    estado.falhaNoLogin = detalhes || null;
    desenhar();
  }

  function aoPedir(novos) {
    Object.assign(pedidos, novos);
  }

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
    return conta.displayName || textoDaVoz('CFG-10');
  }

  const AVISO_DA_CHAVE_PENDENTE = {
    outdated_connection: {
      aviso: { texto: 'CFG-35.erroConexaoAntiga', acao: 'CFG-35.erroAtualizar', aoUsar: () => raiz.CartaoDaIA.baixarConexao() },
    },
    other_account_unsent: {
      status: () => textoDaVoz('CFG-42.status'),
      aviso: { texto: 'CFG-42.aviso', acao: 'CFG-03.tentarDeNovo' },
    },
    legacy_key_unbound: {
      aviso: { texto: 'CFG-42.legado', acao: 'CFG-35.erroTrocar', aoUsar: () => raiz.CartaoDaIA.trocarChave() },
    },
  };

  function situacaoAtual() {
    const sincronizacao = estado.sincronizacao;
    if (!sincronizacao) return null;
    const vista = { ...COMO_APARECE[sincronizacao.situacao], dados: sincronizacao };
    if (sincronizacao.situacao !== SITUACOES.CHAVE_PENDENTE) return vista;
    const doCodigo = Object.hasOwn(AVISO_DA_CHAVE_PENDENTE, sincronizacao.codigo) ? AVISO_DA_CHAVE_PENDENTE[sincronizacao.codigo] : null;
    return { ...vista, ...doCodigo };
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

  function desenharCorpo(corpo) {
    const tinhaOFoco = corpo.contains(document.activeElement);
    corpo.replaceChildren(...(estado.conta ? cardComConta() : cardSemConta()));
    if (tinhaOFoco) corpo.querySelector('button')?.focus();
  }

  function avatarDoCard() {
    const avatar = elemento('span', 'shell-avatar cfg-avatar');
    desenharAvatar(avatar);
    return avatar;
  }

  function blocoDaConta(...quem) {
    return elemento('div', 'cfg-conta', avatarDoCard(), elemento('div', 'cfg-quem', ...quem));
  }

  function cardSemConta() {
    const entrar = botao('primario', textoDaVoz('CFG-06.botao'), fazer('entrar'));
    entrar.prepend(iconeVeio('entrar'));

    const principal = linha(
      blocoDaConta(elemento('b', 'cfg-convite', textoDaVoz('CFG-06.ajuda')), elemento('span', 'cfg-nota', textoDaVoz('CFG-06.semConta'))),
      elemento('div', 'cfg-acoes', entrar),
    );
    const aviso = estado.falhaNoLogin && avisoDoCard('CFG-07.aviso', 'CFG-07.tentarDeNovo', fazer('entrar'), estado.falhaNoLogin);
    return cardCom(principal, aviso);
  }

  function cardCom(principal, aviso) {
    return aviso ? [principal, aviso] : [principal];
  }

  function cardComConta() {
    const situacao = situacaoAtual();
    const status = situacao ? linhaDeStatus((situacao.status || situacao.chip)(situacao.dados)) : null;
    const principal = linha(blocoDaConta(elemento('b', 'cfg-nome', nomeVisivel()), status), acoesDaConta(situacao));
    if (!situacao?.erro) principal.append(elemento('p', 'cfg-nota cfg-nota--linha', textoDaVoz('CFG-26')));

    return cardCom(principal, avisoDaSituacao(situacao));
  }

  function acoesDaConta(situacao) {
    const acoes = elemento('div', 'cfg-acoes');
    if (situacao?.entrar) acoes.append(botao('primario', textoDaVoz('CFG-08.entrar'), fazer('entrar')));
    const estiloDoSair = situacao ? situacao.sair : 'fantasma';
    if (estiloDoSair) acoes.append(botao(estiloDoSair, textoDaVoz('CFG-23'), fazer('sair')));
    return acoes;
  }

  function avisoDaSituacao(situacao) {
    const detalhes = situacao?.dados.detalhes;
    if (situacao?.aviso) {
      const { texto, acao, aoUsar } = situacao.aviso;
      return avisoDoCard(texto, acao, aoUsar || fazer('tentarDeNovo'), detalhes);
    }
    if (situacao?.erro && detalhes) return montarDetalhes(detalhes);
    return null;
  }

  function avisoDoCard(vozDoTexto, vozDaAcao, aoUsar, detalhes) {
    return montarAviso({
      texto: textoDaVoz(vozDoTexto),
      acao: { rotulo: textoDaVoz(vozDaAcao), aoUsar },
      detalhes,
      fechavel: false,
    });
  }

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
