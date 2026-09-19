'use strict';

// A conta no Painel (docs/design/painel/configuracoes/, card Conta & sync):
// um estado só, desenhado em três lugares que dizem sempre a mesma coisa —
// o card Conta & sync aberto, o resumo da linha fechada dele e o chip de conta
// no pé da sidebar.
//
// O painel.js conta o que acontece e este arquivo decide o que a pessoa vê:
//
//   Conta.mostrarConta(usuario | null)
//   Conta.mostrarSincronizacao(situacao, { n, total, detalhes })
//   Conta.mostrarFalhaNoLogin(detalhes | null)
//   Conta.aoPedir({ entrar, sair, tentarDeNovo })
//   Conta.SITUACOES   os nomes das situações
//
// As situações são os estados CFG da spec, com os nomes de `Conta.SITUACOES`:
// sincronizando (CFG-01), primeira subida (CFG-09) e a falha dela, sincronizado
// (CFG-02), sem sincronizar (CFG-03), parcial (CFG-05), a nuvem recusou (CFG-04)
// e a sessão expirou (CFG-08).
// Um problema de sync aparece só aqui: no card e no chip, nunca numa faixa ou
// num toast de outra área. Toda cópia vem do catálogo da Voz.

(function (raiz) {
  /** “Sincronizado há N min” avança sozinho. */
  const INTERVALO_DO_RELOGIO = 30000;

  // A forma curta: “há 2 min”, “há 3 h” (CFG-02).
  const QUANTO_TEMPO = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' });

  // Os nomes das situações. O painel.js usa estes, e não uma string solta.
  const SITUACOES = Object.freeze({
    SINCRONIZANDO: 'sincronizando',
    PRIMEIRA_SUBIDA: 'primeiraSubida',
    PRIMEIRA_SUBIDA_FALHOU: 'primeiraSubidaFalhou',
    SINCRONIZADO: 'sincronizado',
    SEM_SINCRONIZAR: 'semSincronizar',
    PARCIAL: 'parcial',
    RECUSADO: 'recusado',
    EXPIROU: 'expirou',
  });

  const { textoDaVoz } = raiz;
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
      chip: ({ sincronizadoEm }) => textoDaVoz('CFG-02', { quando: haQuantoTempo(sincronizadoEm) }),
      sair: 'fantasma',
    },
    [SITUACOES.SEM_SINCRONIZAR]: {
      erro: true,
      chip: () => textoDaVoz('SHL-05.semSincronizar'),
      status: () => textoDaVoz('CFG-03.aviso'),
      aviso: { texto: 'CFG-03.pendente', acao: 'CFG-03.tentarDeNovo' },
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

  // ─── O que o painel.js conta ───────────────────────────────────────────────

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

  // ─── Desenho ───────────────────────────────────────────────────────────────

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
    return sincronizacao ? { ...COMO_APARECE[sincronizacao.situacao], dados: sincronizacao } : null;
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
      nome.textContent = textoDaVoz('SHL-05.semConta');
      situacao.textContent = '';
      situacao.hidden = true;
      chip.title = nome.textContent;
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
    const corpo = porId('cfg-conta-corpo');
    corpo.replaceChildren(...(estado.conta ? cardComConta() : cardSemConta()));
  }

  /** Sem conta (CFG-06) e, se o login falhou, o erro dele (CFG-07). */
  function cardSemConta() {
    const avatar = elemento('span', 'shell-avatar cfg-avatar');
    desenharAvatar(avatar);
    const entrar = botao('primario', textoDaVoz('CFG-06.botao'), () => pedidos.entrar());

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
        acao: { rotulo: textoDaVoz(situacao.aviso.acao), aoUsar: () => pedidos.tentarDeNovo() },
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

  /** A foto, a inicial do nome ou, sem conta, o ícone vazio. */
  function desenharAvatar(avatar) {
    avatar.replaceChildren();
    avatar.classList.toggle('shell-avatar--vazio', !estado.conta);
    avatar.setAttribute('aria-hidden', 'true');
    if (!estado.conta) {
      avatar.append(iconeVeio('conta'));
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

  /** “agora”, “há 2 min”, “há 3 h”, “ontem”: o `{quando}` da CFG-02. */
  function haQuantoTempo(momento) {
    const minutos = Math.floor((Date.now() - momento) / 60000);
    if (minutos < 1) return QUANTO_TEMPO.format(0, 'second');
    // O ICU abrevia com ponto (“há 2 min.”); a cópia é “há 2 min”.
    if (minutos < 60) return QUANTO_TEMPO.format(-minutos, 'minute').replace(/\.$/, '');
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return QUANTO_TEMPO.format(-horas, 'hour');
    return QUANTO_TEMPO.format(-Math.floor(horas / 24), 'day');
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
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
