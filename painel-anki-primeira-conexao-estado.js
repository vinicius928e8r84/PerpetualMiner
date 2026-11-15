'use strict';

// A primeira conexão como duas máquinas de estados, sem tela e sem rede (`node test_primeira_conexao.js`):
//
//   FaseDaPrimeiraConexao   o que fica no lugar das abas da área Conexão com o Anki (o card ONB-16);
//                           quem desenha é `painel-anki-primeira-conexao.js`.
//   ConversaComOAbridor     o passo 4, Abrir o Anki sozinho (ONB-17): a permissão do Chrome e o que o abridor
//                           respondeu; quem conversa e desenha é `painel-conexao-passos.js`.
//
// As duas são `proxima(estado, evento)`: o estado não é mudado no lugar, e um evento que a fase não espera devolve o mesmo estado.

(function (raiz) {
  const LIGADA = 'ligada';
  const DESLIGADA = 'desligada';
  const CONECTANDO = 'conectando';

  // ─── A fase do card ───
  //
  //   conferindo ──▶ instalando ──▶ passo4 ──▶ pronto ──▶ abas
  //        │             │            │ ▲                  ▲
  //        └─────────────┴────────────┼─┴── abas (pendente)┘
  //
  //   conferindo  ninguém respondeu ainda nesta página: nem card, nem abas (o esqueleto);
  //   instalando  a Conexão nunca respondeu ligada neste computador: o card, nos passos 1 a 3;
  //   passo4      ela ligou com o card à vista (ou a pergunta estava guardada): o card, em Abrir o Anki sozinho;
  //   pronto      o momento Pronto, que o relógio de quem desenha encerra;
  //   abas        as abas. Com `pendente`, o passo 4 ficou sem resposta e a Conexão caiu: a pergunta volta quando ela responder.
  //
  // `pendente` é o que fica guardado em `pm_anki_abridor_pendente`.
  const FASE = Object.freeze({ CONFERINDO: 'conferindo', INSTALANDO: 'instalando', PASSO4: 'passo4', PRONTO: 'pronto', ABAS: 'abas' });
  // leu: { pendente } o que estava guardado. conexao: { situacao, respondeu, jaConectou, naArea, resolvido } o que `ConexaoAnki`
  // avisou, se já houve uma resposta antes, o fato gravado como estava antes deste aviso, se a pessoa está na área e se o
  // passo 4 já está resolvido. resolveu: o abridor achou o Anki, ou a pessoa disse Agora não. prontoPassou: o instante acabou.
  const EVENTO = Object.freeze({ LEU: 'leu', CONEXAO: 'conexao', RESOLVEU: 'resolveu', PRONTO_PASSOU: 'prontoPassou' });

  const fase = (nome, pendente = false) => ({ fase: nome, pendente });
  const inicial = () => fase(FASE.CONFERINDO);
  const COBREM = [FASE.INSTALANDO, FASE.PASSO4, FASE.PRONTO];
  /** O card está no lugar das abas. */
  const cobreAsAbas = estado => COBREM.includes(estado.fase);

  function aoMudarAConexao(estado, { situacao, respondeu, jaConectou, naArea, resolvido }) {
    const de = estado.fase;
    if (de === FASE.PRONTO) return estado;
    if (de === FASE.CONFERINDO && situacao === CONECTANDO && !respondeu) return estado;
    const perguntar = estado.pendente && !resolvido;
    if (situacao === LIGADA) {
      if (de === FASE.PASSO4) return !resolvido ? estado : fase(naArea ? FASE.PRONTO : FASE.ABAS);
      // A primeira resposta com o card à vista. Em outra área ninguém olha o card: as abas estarão lá, sem Pronto.
      if (de === FASE.INSTALANDO && naArea) return resolvido ? fase(FASE.PRONTO) : fase(FASE.PASSO4, true);
      return perguntar ? fase(FASE.PASSO4, true) : fase(FASE.ABAS);
    }
    // Sem a Conexão o passo 4 não tem o que perguntar: as abas voltam, e a pergunta fica guardada. Uma conferência no ar não o tira da tela.
    if (de === FASE.PASSO4) return situacao === DESLIGADA ? fase(FASE.ABAS, true) : estado;
    if (de === FASE.INSTALANDO) return jaConectou ? fase(FASE.ABAS, estado.pendente) : estado;
    return jaConectou ? (de === FASE.ABAS ? estado : fase(FASE.ABAS, estado.pendente)) : fase(FASE.INSTALANDO, estado.pendente);
  }

  function proximaFase(estado, evento) {
    switch (evento.tipo) {
      case EVENTO.LEU: return fase(estado.fase, evento.pendente === true);
      case EVENTO.CONEXAO: return aoMudarAConexao(estado, evento);
      case EVENTO.RESOLVEU: return estado.fase === FASE.PASSO4 ? fase(FASE.PRONTO) : fase(estado.fase);
      case EVENTO.PRONTO_PASSOU: return estado.fase === FASE.PRONTO ? fase(FASE.ABAS) : estado;
      default: return estado;
    }
  }

  raiz.FaseDaPrimeiraConexao = Object.freeze({ FASE, EVENTO, inicial, proxima: proximaFase, cobreAsAbas });

  // ─── A conversa com o abridor ───
  //
  //   antes ─ligou▶ lendo ─permissao▶ pedir ─permitir▶ pedindo ─respondeu▶ procurando ─conferiu▶ achou | nao_achou | sem_abridor
  //                   └──────(com a permissão)──────────────────────────────▲   ▲──tentar── nao_achou | sem_abridor
  //
  //   antes        a Conexão ainda não respondeu: ninguém perguntou nada;
  //   lendo        ela ligou, e a extensão pergunta ao Chrome se tem a permissão (o bloco espera, C8);
  //   pedir        sem permissão: Permitir e Agora não; `recusada`: o Chrome não a deu no último pedido;
  //   pedindo      o aviso do Chrome está aberto;
  //   procurando   a pergunta ao abridor está no ar (ele tem 10 s);
  //   achou · nao_achou · sem_abridor   o que ele disse (`detalhe`: o que o Chrome disse, quando ele não respondeu).
  //
  // `agoraNao` é `pm_abridor.agoraNao`, como está guardado: vale em qualquer fase.
  const PASSO = Object.freeze({
    ANTES: 'antes', LENDO: 'lendo', PEDIR: 'pedir', PEDINDO: 'pedindo', PROCURANDO: 'procurando',
    ACHOU: 'achou', NAO_ACHOU: 'nao_achou', SEM_ABRIDOR: 'sem_abridor',
  });
  // permissao: { tem }. respondeu: { dada } o que o Chrome disse ao pedido. conferiu: { resultado, detalhe } o que o abridor
  // disse (`achou`, `nao_achou`, `sem_permissao`; outro: não respondeu). agoraNao: { valor } o que ficou guardado.
  const PEDIDO = Object.freeze({
    LIGOU: 'ligou', PERMISSAO: 'permissao', PERMITIR: 'permitir', RESPONDEU: 'respondeu',
    TENTAR: 'tentar', CONFERIU: 'conferiu', AGORA_NAO: 'agoraNao',
  });
  const COM_PROBLEMA = [PASSO.NAO_ACHOU, PASSO.SEM_ABRIDOR];
  const DO_RESULTADO = { achou: PASSO.ACHOU, nao_achou: PASSO.NAO_ACHOU };

  const conversaInicial = () => ({ fase: PASSO.ANTES, detalhe: '', agoraNao: false, recusada: false });
  const procurando = estado => ({ ...estado, fase: PASSO.PROCURANDO, detalhe: '' });

  function proximaConversa(estado, evento) {
    const em = (...fases) => fases.includes(estado.fase);
    switch (evento.tipo) {
      case PEDIDO.AGORA_NAO: return { ...estado, agoraNao: evento.valor === true };
      case PEDIDO.LIGOU: return em(PASSO.ANTES) ? { ...estado, fase: PASSO.LENDO } : estado;
      case PEDIDO.PERMISSAO: return !em(PASSO.LENDO) ? estado : evento.tem ? procurando(estado) : { ...estado, fase: PASSO.PEDIR };
      case PEDIDO.PERMITIR: return em(PASSO.PEDIR) ? { ...estado, fase: PASSO.PEDINDO } : estado;
      case PEDIDO.RESPONDEU: return !em(PASSO.PEDINDO) ? estado : evento.dada ? procurando(estado) : { ...estado, fase: PASSO.PEDIR, recusada: true };
      case PEDIDO.TENTAR: return em(...COM_PROBLEMA) ? procurando(estado) : estado;
      case PEDIDO.CONFERIU:
        if (!em(PASSO.PROCURANDO)) return estado;
        if (evento.resultado === 'sem_permissao') return { ...estado, fase: PASSO.PEDIR };
        // Com a permissão dada, um “Agora não” e uma recusa antigos deixam de valer.
        return { fase: DO_RESULTADO[evento.resultado] ?? PASSO.SEM_ABRIDOR, detalhe: evento.detalhe || '', agoraNao: false, recusada: false };
      default: return estado;
    }
  }

  /** O passo 4 está resolvido: o abridor achou o Anki, ou a pessoa disse “Agora não”. */
  const resolvido = estado => estado.fase === PASSO.ACHOU || estado.agoraNao;

  /** Os botões da fase: Permitir (`ocupado` com o aviso do Chrome aberto), Tentar de novo e Agora não. */
  function acoes(estado) {
    const pedir = estado.fase === PASSO.PEDIR || estado.fase === PASSO.PEDINDO;
    const tentar = COM_PROBLEMA.includes(estado.fase);
    return { permitir: pedir, ocupado: estado.fase === PASSO.PEDINDO, tentar, agoraNao: !estado.agoraNao && (pedir || tentar) };
  }

  raiz.ConversaComOAbridor = Object.freeze({ FASE: PASSO, EVENTO: PEDIDO, inicial: conversaInicial, proxima: proximaConversa, resolvido, acoes });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
