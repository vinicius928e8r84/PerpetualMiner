'use strict';

(function (raiz) {
  const TRANCA = 'pm-historico';
  const ENVIADA_AO_ANKI = 'exported';

  function proximoId(frases) {
    const maiorId = frases.reduce((maior, frase) => Math.max(maior, Number(frase.id) || 0), 0);
    return Math.max(Date.now(), maiorId + 1);
  }

  const OPERACOES = {
    acrescentar(frases, { frase }) {
      const nova = { ...frase, id: proximoId(frases) };
      return { frases: [nova, ...frases], resultado: nova };
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
      editar: async (id, campos) => (await editarVarias([[id, campos]]))[0] || null,
      editarVarias,
      marcarEnviadas: marcar({ status: ENVIADA_AO_ANKI }),
      marcarExportadas: marcar({ exportadaTxt: true }),
      apagar: ids => mudar({ tipo: 'apagar', ids }),
    });
  }

  const CHAVE_PARA_DELETAR = 'pm_deleted_ids';
  const CHAVE_TOMBSTONE = 'pm_tombstone_pendente';
  const TRANCA_DAS_LISTAS = 'pm-listas-pendentes';

  function criarListas({ local, reforco, nuvem, agora, aviso }) {
    const alterar = (chave, mudar) => globalThis.navigator.locks.request(TRANCA_DAS_LISTAS, async () => {
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

  const storageDoChrome = {
    get: pedido => globalThis.chrome.storage.local.get(pedido),
    set: valores => globalThis.chrome.storage.local.set(valores),
  };

  raiz.Historico = Object.freeze({ TRANCA, criar, ...criar({ armazenamento: storageDoChrome }) });
  raiz.ListasPendentes = Object.freeze({ criar: criarListas });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
