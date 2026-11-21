'use strict';

(function (raiz) {
  const { SITUACAO: CONEXAO } = raiz.ConexaoAnki;
  const { SITUACAO } = raiz.Configuracao;
  const { FASE, acoes } = raiz.ConversaComOAbridor;

  const PASSO = Object.freeze({ ANKI: 'anki', ARQUIVO: 'colocar', TENTAR: 'reiniciar', ABRIDOR: 'abridor' });
  const PASSOS = Object.freeze([
    { id: PASSO.ANKI, titulo: 'ONB-18.titulo', texto: 'ONB-18.texto' },
    { id: PASSO.ARQUIVO, titulo: 'ONB-16.passo1Titulo', texto: 'ONB-16.passo1Texto' },
    { id: PASSO.TENTAR, titulo: 'ONB-16.passo2Titulo', texto: 'ONB-16.passo2Texto' },
    { id: PASSO.ABRIDOR, titulo: 'ONB-17.titulo', texto: 'ONB-17.texto' },
  ]);
  const SEM_RESPOSTA_MS = 2 * 60 * 1000;
  const LEITOR_DA_MARCA = Object.freeze({ [SITUACAO.FEITO]: 'ONB-13.feito', [SITUACAO.AGORA_NAO]: 'ONB-13.agoraNao' });
  const PONTO_DA_FASE = Object.freeze({
    [FASE.PEDINDO]: CONEXAO.CONECTANDO,
    [FASE.PROCURANDO]: CONEXAO.CONECTANDO,
    [FASE.ACHOU]: CONEXAO.LIGADA,
    [FASE.NAO_ACHOU]: CONEXAO.DESLIGADA,
    [FASE.SEM_ABRIDOR]: CONEXAO.DESLIGADA,
  });
  const TEXTO_DA_FASE = Object.freeze({
    [FASE.PEDINDO]: 'ONB-17.pedindo',
    [FASE.PROCURANDO]: 'ONB-17.procurando',
    [FASE.ACHOU]: 'ONB-17.achou',
    [FASE.NAO_ACHOU]: 'ONB-17.naoAchou',
    [FASE.SEM_ABRIDOR]: 'ONB-17.semAbridor',
  });
  const CAUSA_DE_NAO_ACHAR = '{"achou":false}';
  const ANTES_DE_LER_A_PERMISSAO = Object.freeze([FASE.ANTES, FASE.LENDO]);
  const COM_PROBLEMA = Object.freeze([FASE.NAO_ACHOU, FASE.SEM_ABRIDOR]);

  const indice = passoId => PASSOS.findIndex(passo => passo.id === passoId);

  function passoDaConexao({ situacao, ligou, jaConectou }) {
    if (situacao === CONEXAO.LIGADA) return PASSO.ABRIDOR;
    if (situacao === CONEXAO.CONECTANDO) return PASSO.TENTAR;
    return ligou || jaConectou ? PASSO.TENTAR : PASSOS[0].id;
  }

  function passoAberto(conexao) {
    if (conexao.pronto) return PASSOS[PASSOS.length - 1].id;
    return conexao.escolha !== null ? conexao.escolha : passoDaConexao(conexao);
  }

  function cartaoAberto(conexao) {
    if (conexao.pronto) return { aberto: -1, passo: PASSOS[indice(PASSO.ABRIDOR)] };
    const aberto = indice(passoAberto(conexao));
    return { aberto, passo: PASSOS[aberto] };
  }

  function marcaDoPasso(passo, { conectou, conversa }) {
    if (passo.id !== PASSO.ABRIDOR) return conectou ? SITUACAO.FEITO : '';
    if (conversa.fase === FASE.ACHOU) return SITUACAO.FEITO;
    return conversa.agoraNao ? SITUACAO.AGORA_NAO : '';
  }

  function marcasDosPassos({ aberto, pronto, situacao, conversa }) {
    const conectou = pronto || situacao === CONEXAO.LIGADA;
    return PASSOS.map((passo, i) => {
      const situacaoDaMarca = marcaDoPasso(passo, { conectou, conversa });
      return { situacao: situacaoDaMarca, atual: i === aberto, leitor: LEITOR_DA_MARCA[situacaoDaMarca] ?? null };
    });
  }

  function situacaoExibida({ conferindo, situacao, passo }) {
    if (!conferindo || passo.id !== PASSO.TENTAR) return situacao;
    return situacao === CONEXAO.DESLIGADA ? CONEXAO.CONECTANDO : situacao;
  }

  function situacaoMostrada({ pronto, situacao }, exibida) {
    return pronto && situacao !== CONEXAO.CONECTANDO ? CONEXAO.LIGADA : exibida;
  }

  function esperandoOArquivo({ pronto, passo, situacao }) {
    return !pronto && passo.id === PASSO.ARQUIVO && situacao === CONEXAO.DESLIGADA;
  }

  function tentarDeNovoSai({ pronto, passo, situacao }) {
    return pronto || situacao === CONEXAO.LIGADA || passo.id !== PASSO.TENTAR;
  }

  function statusDaConexao(retrato) {
    const exibida = situacaoExibida(retrato);
    return {
      esperando: esperandoOArquivo(retrato),
      exibida,
      mostrada: situacaoMostrada(retrato, exibida),
      tentarSai: tentarDeNovoSai(retrato),
    };
  }

  function abridorEscondido({ fase }, { passo, pronto, situacao }) {
    if (passo.id !== PASSO.ABRIDOR || ANTES_DE_LER_A_PERMISSAO.includes(fase)) return true;
    return !pronto && situacao !== CONEXAO.LIGADA;
  }

  function textoDoAbridor({ fase, agoraNao, recusada }) {
    const semPermissao = fase === FASE.PEDIR && (agoraNao || recusada);
    return TEXTO_DA_FASE[fase] ?? (semPermissao ? 'ONB-17.semPermissao' : null);
  }

  const comProblema = ({ fase }) => COM_PROBLEMA.includes(fase);

  function causaDoProblema(conversa, pronto) {
    if (!comProblema(conversa) || pronto) return '';
    return conversa.fase === FASE.NAO_ACHOU ? CAUSA_DE_NAO_ACHAR : conversa.detalhe;
  }

  function botoesDoAbridor(conversa, pronto) {
    const { permitir, ocupado, tentar, agoraNao } = acoes(conversa);
    return { permitir: !pronto && permitir, ocupado, tentar: !pronto && tentar, agoraNao: !pronto && agoraNao };
  }

  function abridorNoCard(conversa, { passo, pronto, situacao }) {
    const texto = textoDoAbridor(conversa);
    return {
      escondido: abridorEscondido(conversa, { passo, pronto, situacao }),
      texto,
      falado: comProblema(conversa) ? null : texto,
      ponto: PONTO_DA_FASE[conversa.fase] ?? '',
      causa: causaDoProblema(conversa, pronto),
      botoes: botoesDoAbridor(conversa, pronto),
    };
  }

  function inicioDaEspera({ visivel, esperandoDesde }, agora) {
    return visivel && esperandoDesde === null ? agora : esperandoDesde;
  }

  function esperouDemais(esperandoDesde, agora) {
    return esperandoDesde !== null && agora - esperandoDesde >= SEM_RESPOSTA_MS;
  }

  function espera(estado, { ligada, agora }) {
    if (ligada) return { esperandoDesde: null, semResposta: false, escondida: true };
    const esperandoDesde = inicioDaEspera(estado, agora);
    const semResposta = estado.semResposta || esperouDemais(esperandoDesde, agora);
    return { esperandoDesde, semResposta, escondida: !semResposta || estado.pronto };
  }

  raiz.RetratoDosPassos = Object.freeze({
    PASSO, PASSOS, SEM_RESPOSTA_MS, cartaoAberto, marcasDosPassos, statusDaConexao, abridorNoCard, espera,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
