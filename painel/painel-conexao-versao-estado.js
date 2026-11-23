'use strict';

(function (raiz) {
  const ESTADO = Object.freeze({
    SEM_CONEXAO: 'semConexao', EM_DIA: 'emDia', VELHA: 'velha', ATUALIZANDO: 'atualizando', FALHOU: 'falhou',
    NO_DISCO: 'noDisco', REINICIANDO: 'reiniciando', NAO_REINICIOU: 'naoReiniciou', SEM_ABRIDOR: 'semAbridor', ATUALIZADA: 'atualizada',
  });
  const EVENTO = Object.freeze({
    LEITURA: 'leitura',
    ATUALIZAR: 'atualizar',
    ATUALIZOU: 'atualizou',
    REINICIAR: 'reiniciar',
    SEM_PERMISSAO: 'semPermissao',
    REINICIOU: 'reiniciou',
    NAO_REINICIOU: 'naoReiniciou',
    MOSTROU: 'mostrou',
    FECHOU: 'fechou',
  });
  const VERSAO_MINIMA = Object.freeze([0, 4, 0]);

  function velhaDemais(versao) {
    if (typeof versao !== 'string' || !/^\d+(\.\d+)*$/.test(versao)) return true;
    const numeros = versao.split('.').map(Number);
    for (let i = 0; i < VERSAO_MINIMA.length; i += 1) {
      if ((numeros[i] ?? 0) !== VERSAO_MINIMA[i]) return (numeros[i] ?? 0) < VERSAO_MINIMA[i];
    }
    return false;
  }

  const inicial = ({ vista = null } = {}) => Object.freeze({ estado: ESTADO.SEM_CONEXAO, versao: null, leitura: null, resultado: null, vista, mostrada: null, fechada: null });

  const conexaoEmDia = leitura => !velhaDemais(leitura.versao) && !leitura.antiga;

  function versaoNoDisco({ leitura, resultado }) {
    if (resultado?.estado === 'instalada') return resultado.versao;
    const atualizacao = leitura.atualizacao;
    return atualizacao?.estado === 'instalada' ? atualizacao.versao : null;
  }

  const foiFechada = (maquina, nova) => nova === maquina.fechada;
  const foiVistaSemSerMostrada = (maquina, nova) => nova === maquina.vista && nova !== maquina.mostrada;
  const foiDispensada = (maquina, nova) => foiFechada(maquina, nova) || foiVistaSemSerMostrada(maquina, nova);

  function versaoNovaAMostrar(maquina) {
    const nova = maquina.leitura.atualizacao?.atualizada;
    return nova && !foiDispensada(maquina, nova) ? nova : null;
  }

  function repousoDaConexaoEmDia(maquina) {
    const nova = versaoNovaAMostrar(maquina);
    return nova ? { estado: ESTADO.ATUALIZADA, versao: nova } : { estado: ESTADO.EM_DIA, versao: maquina.leitura.versao };
  }

  function repousoDaConexaoVelha(maquina) {
    const { leitura, resultado } = maquina;
    const noDisco = versaoNoDisco(maquina);
    if (noDisco && !velhaDemais(noDisco)) return { estado: ESTADO.NO_DISCO, versao: noDisco };
    if (resultado || leitura.atualizacao?.estado === 'falhou') return { estado: ESTADO.FALHOU, versao: leitura.versao };
    return { estado: ESTADO.VELHA, versao: leitura.versao };
  }

  function repouso(maquina) {
    if (!maquina.leitura) return { estado: ESTADO.SEM_CONEXAO, versao: null };
    return conexaoEmDia(maquina.leitura) ? repousoDaConexaoEmDia(maquina) : repousoDaConexaoVelha(maquina);
  }

  const com = (maquina, mudanca) => Object.freeze({ ...maquina, ...mudanca });
  const emRepouso = maquina => com(maquina, repouso(maquina));

  function aposALeitura(maquina, leitura) {
    const lida = com(maquina, { leitura });
    const descansada = repouso(lida);
    switch (maquina.estado) {
      case ESTADO.ATUALIZANDO:
      case ESTADO.REINICIANDO:
        return lida;
      case ESTADO.NAO_REINICIOU:
        return !leitura || descansada.estado === ESTADO.NO_DISCO ? com(lida, { versao: descansada.versao }) : com(lida, descansada);
      case ESTADO.SEM_ABRIDOR:
        return descansada.estado === ESTADO.NO_DISCO ? com(lida, { versao: descansada.versao }) : com(lida, descansada);
      default:
        return com(lida, descansada);
    }
  }

  const ACEITA = Object.freeze({
    [ESTADO.SEM_CONEXAO]: [EVENTO.LEITURA],
    [ESTADO.EM_DIA]: [EVENTO.LEITURA],
    [ESTADO.VELHA]: [EVENTO.LEITURA, EVENTO.ATUALIZAR],
    [ESTADO.FALHOU]: [EVENTO.LEITURA, EVENTO.ATUALIZAR],
    [ESTADO.ATUALIZANDO]: [EVENTO.LEITURA, EVENTO.ATUALIZOU],
    [ESTADO.NO_DISCO]: [EVENTO.LEITURA, EVENTO.REINICIAR],
    [ESTADO.REINICIANDO]: [EVENTO.LEITURA, EVENTO.SEM_PERMISSAO, EVENTO.REINICIOU, EVENTO.NAO_REINICIOU],
    [ESTADO.NAO_REINICIOU]: [EVENTO.LEITURA, EVENTO.REINICIAR],
    [ESTADO.SEM_ABRIDOR]: [EVENTO.LEITURA],
    [ESTADO.ATUALIZADA]: [EVENTO.LEITURA, EVENTO.MOSTROU, EVENTO.FECHOU],
  });

  const AO_RECEBER = Object.freeze({
    [EVENTO.LEITURA]: (maquina, evento) => aposALeitura(maquina, evento.leitura ?? null),
    [EVENTO.ATUALIZAR]: maquina => com(maquina, { estado: ESTADO.ATUALIZANDO }),
    [EVENTO.ATUALIZOU]: (maquina, evento) => emRepouso(com(maquina, { resultado: evento.resultado })),
    [EVENTO.REINICIAR]: maquina => (maquina.leitura ? com(maquina, { estado: ESTADO.REINICIANDO }) : maquina),
    [EVENTO.SEM_PERMISSAO]: maquina => com(maquina, { estado: ESTADO.SEM_ABRIDOR }),
    [EVENTO.REINICIOU]: maquina => emRepouso(com(maquina, { resultado: null })),
    [EVENTO.NAO_REINICIOU]: maquina => com(maquina, { estado: ESTADO.NAO_REINICIOU }),
    [EVENTO.MOSTROU]: maquina => com(maquina, { mostrada: maquina.versao, vista: maquina.versao }),
    [EVENTO.FECHOU]: maquina => emRepouso(com(maquina, { fechada: maquina.versao })),
  });

  function proxima(maquina, evento) {
    if (!ACEITA[maquina.estado].includes(evento.tipo)) return maquina;
    return AO_RECEBER[evento.tipo](maquina, evento);
  }

  raiz.AvisoDaVersao = { ESTADO, EVENTO, VERSAO_MINIMA, velhaDemais, inicial, proxima };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
