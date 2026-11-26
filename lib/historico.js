'use strict';

(function (raiz) {
  const TRANCA = 'pm-historico';
  const ENVIADA_AO_ANKI = 'exported';
  const MARCA_APOSENTADA = 'exportadaTxt';

  const temAMarcaAposentada = frase => MARCA_APOSENTADA in frase;
  const semAMarcaAposentada = ({ [MARCA_APOSENTADA]: _, ...resto }) => resto;

  function proximoId(frases) {
    const maiorId = frases.reduce((maior, frase) => Math.max(maior, Number(frase.id) || 0), 0);
    return Math.max(Date.now(), maiorId + 1);
  }

  const OPERACOES = {
    acrescentar(frases, { frase }) {
      const nova = { ...frase, id: proximoId(frases) };
      return { frases: [nova, ...frases], resultado: nova };
    },
    acrescentarSe(frases, { frase, jaTem }) {
      if (frases.some(jaTem)) return { frases, resultado: null };
      return OPERACOES.acrescentar(frases, { frase });
    },
    editar(frases, { edicoes }) {
      const camposPorId = new Map(edicoes.map(([id, campos]) => [String(id), campos]));
      const editadas = [];
      const depois = frases.map(frase => {
        const campos = camposPorId.get(String(frase.id));
        if (!campos) return frase;
        editadas.push({ ...frase, ...campos });
        return editadas.at(-1);
      });
      return { frases: editadas.length ? depois : frases, resultado: editadas };
    },
    esquecerExportadas(frases) {
      const marcadas = frases.filter(temAMarcaAposentada).length;
      return { frases: marcadas ? frases.map(frase => (temAMarcaAposentada(frase) ? semAMarcaAposentada(frase) : frase)) : frases, resultado: marcadas };
    },
    apagar(frases, { ids }) {
      const apagadas = new Set(ids.map(String));
      const ficam = frases.filter(frase => !apagadas.has(String(frase.id)));
      return { frases: ficam.length === frases.length ? frases : ficam, resultado: frases.length - ficam.length };
    },
  };

  function criar({ armazenamento }) {
    function mudar(operacao) {
      return globalThis.navigator.locks.request(TRANCA, async () => {
        const { frases: antes = [] } = await armazenamento.get({ frases: [] });
        const { frases, resultado } = OPERACOES[operacao.tipo](antes, operacao);
        if (frases !== antes) await armazenamento.set({ frases });
        return resultado;
      });
    }

    const editarVarias = edicoes => mudar({ tipo: 'editar', edicoes: [...edicoes] });
    const marcar = campos => ids => editarVarias(ids.map(id => [id, campos]));

    return Object.freeze({
      acrescentar: frase => mudar({ tipo: 'acrescentar', frase }),
      acrescentarSe: (frase, jaTem) => mudar({ tipo: 'acrescentarSe', frase, jaTem }),
      editar: async (id, campos) => (await editarVarias([[id, campos]]))[0] || null,
      editarVarias,
      marcarEnviadas: marcar({ status: ENVIADA_AO_ANKI }),
      esquecerExportadas: () => mudar({ tipo: 'esquecerExportadas' }),
      apagar: ids => mudar({ tipo: 'apagar', ids }),
    });
  }

  const CHAVE_PARA_DELETAR = 'pm_deleted_ids';
  const CHAVE_TOMBSTONE = 'pm_tombstone_pendente';
  const CHAVE_DA_CONTA = 'pm_listas_pendentes_uid';
  const TRANCA_DAS_LISTAS = 'pm-listas-pendentes';

  function criarListas({ local, reforco, nuvem, agora, aviso }) {
    async function descartarSeForemDeOutraConta() {
      const lido = nuvem && await local.get(CHAVE_DA_CONTA).catch(() => null);
      if (!lido || lido[CHAVE_DA_CONTA] === nuvem.uid) return;
      const deOutra = lido[CHAVE_DA_CONTA] ? { [CHAVE_PARA_DELETAR]: [], [CHAVE_TOMBSTONE]: [] } : {};
      await reforco(local).set({ ...deOutra, [CHAVE_DA_CONTA]: nuvem.uid });
    }
    const naTranca = fazer => globalThis.navigator.locks.request(TRANCA_DAS_LISTAS, fazer);
    const alterar = (chave, mudar) => naTranca(async () => {
      await descartarSeForemDeOutraConta();
      const { [chave]: atual } = await local.get({ [chave]: [] }).catch(() => ({}));
      const nova = atual && mudar(atual);
      if (nova) await reforco(local).set({ [chave]: nova });
    });
    const juntar = chave => lista => alterar(chave, atuais => [...new Set([...atuais, ...lista])]);
    const tirar = chave => lista => {
      const saem = new Set(lista);
      return alterar(chave, atuais => atuais.filter(id => !saem.has(id)));
    };
    const limparTombstone = tirar(CHAVE_TOMBSTONE);
    async function regravarTombstones() {
      await naTranca(descartarSeForemDeOutraConta);
      const lista = (await local.get({ [CHAVE_TOMBSTONE]: [] }))[CHAVE_TOMBSTONE];
      if (lista.length === 0) return new Set();
      try {
        await nuvem.gravarTombstones(lista, agora());
        await limparTombstone(lista);
        return new Set();
      } catch (erro) {
        aviso('regravar o tombstone pendente falhou', erro);
        return new Set(lista.map(String));
      }
    }
    return {
      marcarParaDeletar: juntar(CHAVE_PARA_DELETAR),
      limparParaDeletar: tirar(CHAVE_PARA_DELETAR),
      marcarTombstone: juntar(CHAVE_TOMBSTONE),
      limparTombstone,
      regravarTombstones,
    };
  }

  const TTL_DO_TOMBSTONE = 30 * 24 * 60 * 60 * 1000;
  const PREFIXO_DO_TOMBSTONE = 'pm_del_';
  const LIMITE_DO_SYNC = 512;
  const TETO_DO_SYNC = 500;
  const tombstonesSync = (ids, apagadasEm) => Object.fromEntries(ids.map(id => [`${PREFIXO_DO_TOMBSTONE}${id}`, apagadasEm]));

  const ehTombstone = chave => chave.startsWith(PREFIXO_DO_TOMBSTONE);
  const maioresPrimeiro = (a, b) => b - a || 0;
  const apagadosPorUltimoPrimeiro = (a, b) => b[1] - a[1];

  function separarPorIdade(itens, agoraMs) {
    const tombstones = Object.entries(itens || {}).filter(([chave]) => ehTombstone(chave));
    const vivo = ([, apagadaEm]) => agoraMs - Number(apagadaEm) < TTL_DO_TOMBSTONE;
    return {
      idsApagados: new Set(tombstones.filter(vivo).map(([chave]) => chave.slice(PREFIXO_DO_TOMBSTONE.length))),
      expirados: tombstones.filter(tombstone => !vivo(tombstone)).map(([chave]) => chave),
    };
  }

  function planoDoSync(itens, lista, agoraMs) {
    const novos = tombstonesSync(lista.slice().sort(maioresPrimeiro).slice(0, TETO_DO_SYNC), agoraMs);
    const quantosNovos = Object.keys(novos).length;
    const velhos = Object.entries(itens).filter(([chave]) => ehTombstone(chave) && !(chave in novos))
      .sort(apagadosPorUltimoPrimeiro).map(([chave]) => chave);
    return { novos, sobram: velhos.slice(TETO_DO_SYNC - quantosNovos), naoCabe: velhos.length + quantosNovos > LIMITE_DO_SYNC };
  }

  function tombstonesDoSync({ sync, agora }) {
    async function ler() {
      const itens = await sync.get(null);
      const { idsApagados, expirados } = separarPorIdade(itens, agora());
      if (expirados.length > 0) await sync.remove(expirados);
      return idsApagados;
    }

    async function marcar(lista) {
      const agoraMs = agora();
      const { novos, sobram, naoCabe } = planoDoSync(await sync.get(null), lista, agoraMs);
      if (naoCabe) await sync.remove(sobram);
      await sync.set(novos);
      if (!naoCabe) await sync.remove(sobram);
    }
    const limpar = lista => sync.remove(Object.keys(tombstonesSync(lista)));
    return { ler, marcar, limpar };
  }

  const storageDoChrome = {
    get: pedido => globalThis.chrome.storage.local.get(pedido),
    set: valores => globalThis.chrome.storage.local.set(valores),
  };

  raiz.Historico = Object.freeze({ TRANCA, criar, temAMarcaAposentada, semAMarcaAposentada, ...criar({ armazenamento: storageDoChrome }) });
  raiz.ListasPendentes = Object.freeze({ criar: criarListas, tombstonesDoSync, TTL_DO_TOMBSTONE, PREFIXO_DO_TOMBSTONE, tombstonesSync });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
