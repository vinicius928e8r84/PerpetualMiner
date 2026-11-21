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

  function repouso(maquina) {
    const { leitura, resultado } = maquina;
    if (!leitura) return { estado: ESTADO.SEM_CONEXAO, versao: null };
    const atualizacao = leitura.atualizacao;
    if (!velhaDemais(leitura.versao) && !leitura.antiga) {
      const nova = atualizacao?.atualizada;
      const aMostrar = nova && nova !== maquina.fechada && (nova !== maquina.vista || nova === maquina.mostrada);
      return aMostrar ? { estado: ESTADO.ATUALIZADA, versao: nova } : { estado: ESTADO.EM_DIA, versao: leitura.versao };
    }
    const noDisco = resultado?.estado === 'instalada' ? resultado.versao : atualizacao?.estado === 'instalada' ? atualizacao.versao : null;
    if (noDisco && !velhaDemais(noDisco)) return { estado: ESTADO.NO_DISCO, versao: noDisco };
    if (resultado || atualizacao?.estado === 'falhou') return { estado: ESTADO.FALHOU, versao: leitura.versao };
    return { estado: ESTADO.VELHA, versao: leitura.versao };
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

  function proxima(maquina, evento) {
    if (!ACEITA[maquina.estado].includes(evento.tipo)) return maquina;
    switch (evento.tipo) {
      case EVENTO.LEITURA:
        return aposALeitura(maquina, evento.leitura ?? null);
      case EVENTO.ATUALIZAR:
        return com(maquina, { estado: ESTADO.ATUALIZANDO });
      case EVENTO.ATUALIZOU:
        return emRepouso(com(maquina, { resultado: evento.resultado }));
      case EVENTO.REINICIAR:
        return maquina.leitura ? com(maquina, { estado: ESTADO.REINICIANDO }) : maquina;
      case EVENTO.SEM_PERMISSAO:
        return com(maquina, { estado: ESTADO.SEM_ABRIDOR });
      case EVENTO.REINICIOU:
        return emRepouso(com(maquina, { resultado: null }));
      case EVENTO.NAO_REINICIOU:
        return com(maquina, { estado: ESTADO.NAO_REINICIOU });
      case EVENTO.MOSTROU:
        return com(maquina, { mostrada: maquina.versao, vista: maquina.versao });
      case EVENTO.FECHOU:
        return emRepouso(com(maquina, { fechada: maquina.versao }));
      default:
        return maquina;
    }
  }

  raiz.AvisoDaVersao = { ESTADO, EVENTO, VERSAO_MINIMA, velhaDemais, inicial, proxima };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
