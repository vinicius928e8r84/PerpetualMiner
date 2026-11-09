'use strict';

// O pedido do Apagar tudo (CFG-17) à Conexão: `pm_envio` guarda a marca `apagarFrases` até ela confirmar, e só então a marca sai.
//
//   pedir()  pede à Conexão o apagamento das Frases dela, se marcado; devolve se ela confirmou (ou nada havia a pedir)
//
// Carregado depois de lib/conexao-anki.js e antes de painel-envio.js.

(function (raiz) {
  const CHAVE_GRAVADA = 'pm_envio';
  const { ConexaoAnki, PedidoAoAnki } = raiz;
  let apagando = null;

  function pedir() {
    if (apagando) return apagando;
    apagando = (async () => {
      const gravado = (await new Promise(r => chrome.storage.local.get({ [CHAVE_GRAVADA]: null }, r)))[CHAVE_GRAVADA];
      if (!gravado?.apagarFrases) return true;
      try {
        const resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, PedidoAoAnki.apagarFrasesDosEnvios());
        if (!resposta.ok) return false;
      } catch {
        return false;
      }
      const envios = gravado.envios || [];
      if (envios.length) await new Promise(r => chrome.storage.local.set({ [CHAVE_GRAVADA]: { envios } }, r));
      else await new Promise(r => chrome.storage.local.remove(CHAVE_GRAVADA, r));
      return true;
    })().finally(() => { apagando = null; });
    return apagando;
  }

  raiz.EnvioApagarFrases = Object.freeze({ pedir });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
