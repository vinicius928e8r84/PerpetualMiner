'use strict';

(function (raiz) {
  const LIGADA = 'ligada';
  const DESLIGADA = 'desligada';
  const CONECTANDO = 'conectando';

  const FASE = Object.freeze({ CONFERINDO: 'conferindo', INSTALANDO: 'instalando', PASSO4: 'passo4', PRONTO: 'pronto', ABAS: 'abas' });
  const EVENTO = Object.freeze({ LEU: 'leu', CONEXAO: 'conexao', RESOLVEU: 'resolveu', PRONTO_PASSOU: 'prontoPassou' });

  const fase = (nome, pendente = false) => ({ fase: nome, pendente });
  const inicial = () => fase(FASE.CONFERINDO);
  const COBREM = [FASE.INSTALANDO, FASE.PASSO4, FASE.PRONTO];
  const cobreAsAbas = estado => COBREM.includes(estado.fase);

  function aoMudarAConexao(estado, { situacao, respondeu, jaConectou, naArea, resolvido }) {
    const de = estado.fase;
    if (de === FASE.PRONTO) return estado;
    if (de === FASE.CONFERINDO && situacao === CONECTANDO && !respondeu) return estado;
    const perguntar = estado.pendente && !resolvido;
    if (situacao === LIGADA) {
      if (de === FASE.PASSO4) return !resolvido ? estado : fase(naArea ? FASE.PRONTO : FASE.ABAS);
      if (de === FASE.INSTALANDO && naArea) return resolvido ? fase(FASE.PRONTO) : fase(FASE.PASSO4, true);
      return perguntar ? fase(FASE.PASSO4, true) : fase(FASE.ABAS);
    }
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

  const PASSO = Object.freeze({
    ANTES: 'antes', LENDO: 'lendo', PEDIR: 'pedir', PEDINDO: 'pedindo', PROCURANDO: 'procurando',
    ACHOU: 'achou', NAO_ACHOU: 'nao_achou', SEM_ABRIDOR: 'sem_abridor',
  });
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
        return { fase: DO_RESULTADO[evento.resultado] ?? PASSO.SEM_ABRIDOR, detalhe: evento.detalhe || '', agoraNao: false, recusada: false };
      default: return estado;
    }
  }

  const resolvido = estado => estado.fase === PASSO.ACHOU || estado.agoraNao;

  function acoes(estado) {
    const pedir = estado.fase === PASSO.PEDIR || estado.fase === PASSO.PEDINDO;
    const tentar = COM_PROBLEMA.includes(estado.fase);
    return { permitir: pedir, ocupado: estado.fase === PASSO.PEDINDO, tentar, agoraNao: !estado.agoraNao && (pedir || tentar) };
  }

  raiz.ConversaComOAbridor = Object.freeze({ FASE: PASSO, EVENTO: PEDIDO, inicial: conversaInicial, proxima: proximaConversa, resolvido, acoes });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
