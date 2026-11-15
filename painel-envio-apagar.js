'use strict';

// O pedido do Apagar tudo (CFG-17) à Conexão: `pm_envio` guarda a marca `apagarFrases` até ela confirmar, e só então a marca sai.
//
//   pedir()  pede à Conexão o apagamento das Frases dela, se marcado; devolve se ela confirmou (ou nada havia a pedir)
//
// Carregado depois de lib/conexao-anki.js e lib/envio-gravado.js (quem grava `pm_envio`) e antes de painel-envio.js.

(function (raiz) {
  const { ConexaoAnki, PedidoAoAnki, EnvioGravado } = raiz;
  const gravado = EnvioGravado.criar(chrome.storage.local);
  let apagando = null;

  function pedir() {
    if (apagando) return apagando;
    apagando = (async () => {
      if (!(await gravado.ler())?.apagarFrases) return true;
      try {
        const resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, PedidoAoAnki.apagarFrasesDosEnvios());
        if (!resposta.ok) return false;
      } catch {
        return false;
      }
      // O guardado é lido de novo depois da resposta: um Envio criado enquanto o pedido esperava (nesta aba ou em outra) fica.
      await gravado.mudar(EnvioGravado.EVENTO.CONFIRMOU);
      return true;
    })().finally(() => { apagando = null; });
    return apagando;
  }

  raiz.EnvioApagarFrases = Object.freeze({ pedir });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
