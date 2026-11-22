'use strict';

(function (raiz) {
  const { ConversaComOAnki, PedidoAoAnki, EnvioGravado } = raiz;
  const gravado = EnvioGravado.criar(chrome.storage.local);
  let apagando = null;

  async function apagarAsFrasesSeOEnvioPediu() {
    if (!(await gravado.ler())?.apagarFrases) return true;
    if (!(await ConversaComOAnki.pedir(PedidoAoAnki.apagarFrasesDosEnvios())).ok) return false;
    await gravado.mudar(EnvioGravado.EVENTO.CONFIRMOU);
    return true;
  }

  function pedir() {
    if (apagando) return apagando;
    apagando = apagarAsFrasesSeOEnvioPediu().finally(() => { apagando = null; });
    return apagando;
  }

  raiz.EnvioApagarFrases = Object.freeze({ pedir });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
