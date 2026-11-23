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

  const faltaPerguntar = (estado, resolvido) => estado.pendente && !resolvido;
  const aindaNaoRespondeu = ({ situacao, respondeu }) => situacao === CONECTANDO && !respondeu;
  const aindaConferindo = (estado, conexao) => estado.fase === FASE.CONFERINDO && aindaNaoRespondeu(conexao);

  function quandoALigacaoSobe(estado, { naArea, resolvido }) {
    const de = estado.fase;
    if (de === FASE.PASSO4) return resolvido ? fase(naArea ? FASE.PRONTO : FASE.ABAS) : estado;
    if (de === FASE.INSTALANDO && naArea) return resolvido ? fase(FASE.PRONTO) : fase(FASE.PASSO4, true);
    return faltaPerguntar(estado, resolvido) ? fase(FASE.PASSO4, true) : fase(FASE.ABAS);
  }

  function quandoALigacaoNaoSobe(estado, { situacao, jaConectou }) {
    const de = estado.fase;
    if (de === FASE.PASSO4) return situacao === DESLIGADA ? fase(FASE.ABAS, true) : estado;
    if (de === FASE.INSTALANDO) return jaConectou ? fase(FASE.ABAS, estado.pendente) : estado;
    if (!jaConectou) return fase(FASE.INSTALANDO, estado.pendente);
    return de === FASE.ABAS ? estado : fase(FASE.ABAS, estado.pendente);
  }

  function aoMudarAConexao(estado, conexao) {
    if (estado.fase === FASE.PRONTO || aindaConferindo(estado, conexao)) return estado;
    return conexao.situacao === LIGADA ? quandoALigacaoSobe(estado, conexao) : quandoALigacaoNaoSobe(estado, conexao);
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

  const estaEm = (estado, ...fases) => fases.includes(estado.fase);
  const naFase = (estado, fases, novoEstado) => (estaEm(estado, ...fases) ? novoEstado : estado);

  function aoLerAPermissao(estado, evento) {
    if (!estaEm(estado, PASSO.LENDO)) return estado;
    return evento.tem ? procurando(estado) : { ...estado, fase: PASSO.PEDIR };
  }

  function aoResponderAPermissao(estado, evento) {
    if (!estaEm(estado, PASSO.PEDINDO)) return estado;
    return evento.dada ? procurando(estado) : { ...estado, fase: PASSO.PEDIR, recusada: true };
  }

  function aoConferirOAbridor(estado, evento) {
    if (!estaEm(estado, PASSO.PROCURANDO)) return estado;
    if (evento.resultado === 'sem_permissao') return { ...estado, fase: PASSO.PEDIR };
    return { fase: DO_RESULTADO[evento.resultado] ?? PASSO.SEM_ABRIDOR, detalhe: evento.detalhe || '', agoraNao: false, recusada: false };
  }

  const DEPOIS_DO_PEDIDO = new Map([
    [PEDIDO.AGORA_NAO, (estado, evento) => ({ ...estado, agoraNao: evento.valor === true })],
    [PEDIDO.LIGOU, estado => naFase(estado, [PASSO.ANTES], { ...estado, fase: PASSO.LENDO })],
    [PEDIDO.PERMISSAO, aoLerAPermissao],
    [PEDIDO.PERMITIR, estado => naFase(estado, [PASSO.PEDIR], { ...estado, fase: PASSO.PEDINDO })],
    [PEDIDO.RESPONDEU, aoResponderAPermissao],
    [PEDIDO.TENTAR, estado => naFase(estado, COM_PROBLEMA, procurando(estado))],
    [PEDIDO.CONFERIU, aoConferirOAbridor],
  ]);

  function proximaConversa(estado, evento) {
    const depois = DEPOIS_DO_PEDIDO.get(evento.tipo);
    return depois ? depois(estado, evento) : estado;
  }

  const resolvido = estado => estado.fase === PASSO.ACHOU || estado.agoraNao;

  function acoes(estado) {
    const pedir = estado.fase === PASSO.PEDIR || estado.fase === PASSO.PEDINDO;
    const tentar = COM_PROBLEMA.includes(estado.fase);
    return { permitir: pedir, ocupado: estado.fase === PASSO.PEDINDO, tentar, agoraNao: !estado.agoraNao && (pedir || tentar) };
  }

  raiz.ConversaComOAbridor = Object.freeze({ FASE: PASSO, EVENTO: PEDIDO, inicial: conversaInicial, proxima: proximaConversa, resolvido, acoes });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
