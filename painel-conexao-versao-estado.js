'use strict';

// O aviso da versão da Conexão com o Anki (#177, BRG-50) como máquina de estados: em que estado o aviso está, e para qual cada evento o leva.
// Sem tela e sem pedidos: `painel-conexao-versao.js` manda os eventos (a leitura da saúde, os cliques e o desfecho de cada pedido) e desenha o
// estado. Prova sem navegador: `node test_aviso_da_versao.js`.
//
//   semConexao    a Conexão não está ligada e ninguém pediu nada: o aviso cala (quem fala da Conexão é a faixa do Painel)
//   emDia         nova o bastante: nada a dizer
//   velha         velha demais para esta extensão                          → Atualizar agora
//   atualizando   o Atualizar agora está no ar
//   falhou        a atualização não deu (a do clique, ou a que a Conexão fez sozinha)   → Tentar de novo
//   noDisco       a Conexão velha já tem a versão nova no disco             → Reiniciar o Anki
//   reiniciando   o Reiniciar o Anki está no ar: o Anki fecha de propósito, a Conexão cala e o aviso segue aqui até o desfecho
//   naoReiniciou  o Anki não fechou, ou fechou e não voltou: dito com ou sem a Conexão; com ela ligada, o Reiniciar vale de novo
//   semAbridor    sem a permissão do abridor o Anki não é fechado: a tela diz como fazer à mão
//   atualizada    a Conexão acabou de ser atualizada: discreto, uma vez por versão, até a pessoa fechar
//
// Um pedido no ar (atualizando, reiniciando) é dono do aviso do clique até o desfecho: a leitura da saúde que chega no meio só é guardada.
// Fora deles, o estado de repouso sai da última leitura (`repouso`). Um evento que o estado não aceita devolve a mesma máquina: o clique
// repetido, ou o desfecho de um pedido que já não é o do aviso, não muda nada.

(function (raiz) {
  const ESTADO = Object.freeze({
    SEM_CONEXAO: 'semConexao', EM_DIA: 'emDia', VELHA: 'velha', ATUALIZANDO: 'atualizando', FALHOU: 'falhou',
    NO_DISCO: 'noDisco', REINICIANDO: 'reiniciando', NAO_REINICIOU: 'naoReiniciou', SEM_ABRIDOR: 'semAbridor', ATUALIZADA: 'atualizada',
  });
  const EVENTO = Object.freeze({
    LEITURA: 'leitura',              // { leitura }: o que a saúde disse, `{ versao, atualizacao, antiga }`; `null` sem a Conexão ligada
    ATUALIZAR: 'atualizar',          // o clique de Atualizar agora (ou de Tentar de novo)
    ATUALIZOU: 'atualizou',          // { resultado }: o que o Atualizar agora respondeu, `{ estado, versao }`
    REINICIAR: 'reiniciar',          // o clique de Reiniciar o Anki
    SEM_PERMISSAO: 'semPermissao',   // a permissão do abridor foi recusada: o Anki não foi fechado
    REINICIOU: 'reiniciou',          // o Anki fechou, o abridor o abriu e a Conexão respondeu
    NAO_REINICIOU: 'naoReiniciou',   // o Anki não fechou no prazo, o abridor não o abriu ou a Conexão não voltou
    MOSTROU: 'mostrou',              // “Conexão atualizada” foi à tela (e a versão, gravada como vista)
    FECHOU: 'fechou',                // a pessoa fechou “Conexão atualizada”
  });
  /** A Conexão mais velha que esta extensão aceita: sobe quando uma função passa a precisar do que as versões de antes não têm. */
  const VERSAO_MINIMA = Object.freeze([0, 4, 0]);

  /** A Conexão de `versao` é velha demais para esta extensão? Sem versão (ou sem ser `a.b.c`), sim. */
  function velhaDemais(versao) {
    if (typeof versao !== 'string' || !/^\d+(\.\d+)*$/.test(versao)) return true;
    const numeros = versao.split('.').map(Number);
    for (let i = 0; i < VERSAO_MINIMA.length; i += 1) {
      if ((numeros[i] ?? 0) !== VERSAO_MINIMA[i]) return (numeros[i] ?? 0) < VERSAO_MINIMA[i];
    }
    return false;
  }

  /**
   * A máquina no começo. Além do estado e da versão que ele diz, ela lembra a última `leitura`, o `resultado` do Atualizar agora e, de
   * “Conexão atualizada”, a versão já `vista` em outra vez (storage), a `mostrada` nesta página e a que a pessoa fechou (`fechada`).
   */
  const inicial = ({ vista = null } = {}) => Object.freeze({ estado: ESTADO.SEM_CONEXAO, versao: null, leitura: null, resultado: null, vista, mostrada: null, fechada: null });

  /** O estado de repouso: o que a última leitura diz, com o que a pessoa já fez. */
  function repouso(maquina) {
    const { leitura, resultado } = maquina;
    if (!leitura) return { estado: ESTADO.SEM_CONEXAO, versao: null };
    const atualizacao = leitura.atualizacao;
    // A Conexão que não tem o pareamento (#192) é velha demais seja qual for a versão que diz: nenhum pedido privado sai para ela.
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

  /** A leitura da saúde, em cada estado. */
  function aposALeitura(maquina, leitura) {
    const lida = com(maquina, { leitura });
    const descansada = repouso(lida);
    switch (maquina.estado) {
      case ESTADO.ATUALIZANDO:
      case ESTADO.REINICIANDO:
        return lida;   // o pedido no ar é dono do aviso
      case ESTADO.NAO_REINICIOU:
        // O Anki que fechou e não voltou segue sem responder: o erro fica dito. Ligada e ainda com a versão nova só no disco, também (o Reiniciar vale de novo).
        return !leitura || descansada.estado === ESTADO.NO_DISCO ? com(lida, { versao: descansada.versao }) : com(lida, descansada);
      case ESTADO.SEM_ABRIDOR:
        return descansada.estado === ESTADO.NO_DISCO ? com(lida, { versao: descansada.versao }) : com(lida, descansada);
      default:
        return com(lida, descansada);
    }
  }

  /** O estado de `estado` aceita o evento `tipo`? A tabela das transições: o que não está aqui não muda a máquina. */
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

  /** A máquina depois de `evento` (`{ tipo, … }`). Pura: devolve outra máquina, ou a mesma quando o estado não aceita o evento. */
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
        // Reiniciar é um pedido à Conexão: sem ela ligada (o Anki que não voltou) não há a quem pedir.
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
