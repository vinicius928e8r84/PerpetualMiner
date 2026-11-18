'use strict';

(function (raiz) {
  const TRANCA = 'pm-historico';

  const mesmoId = id => frase => String(frase.id) === String(id);

  function proximoId(frases) {
    const maiorId = frases.reduce((maior, frase) => Math.max(maior, Number(frase.id) || 0), 0);
    return Math.max(Date.now(), maiorId + 1);
  }

  const OPERACOES = {
    acrescentar(frases, { frase }) {
      const nova = { ...frase, id: proximoId(frases) };
      return { frases: [nova, ...frases], resultado: nova };
    },
    editar(frases, { id, campos }) {
      const idx = frases.findIndex(mesmoId(id));
      if (idx < 0) return { frases, resultado: null };
      const editada = { ...frases[idx], ...campos };
      return { frases: frases.with(idx, editada), resultado: editada };
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

    return Object.freeze({
      acrescentar: frase => mudar({ tipo: 'acrescentar', frase }),
      editar: (id, campos) => mudar({ tipo: 'editar', id, campos }),
      apagar: ids => mudar({ tipo: 'apagar', ids }),
    });
  }

  const storageDoChrome = {
    get: pedido => globalThis.chrome.storage.local.get(pedido),
    set: valores => globalThis.chrome.storage.local.set(valores),
  };

  raiz.Historico = Object.freeze({ TRANCA, criar, ...criar({ armazenamento: storageDoChrome }) });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
