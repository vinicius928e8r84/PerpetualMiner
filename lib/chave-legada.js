'use strict';

(function (raiz) {
  const BANCO = 'pm-segredos';
  const LOJA = 'chaves';

  const abrirOBanco = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  function lerOQueHa(banco) {
    return new Promise((resolve, reject) => {
      const tx = banco.transaction(LOJA, 'readonly'), loja = tx.objectStore(LOJA);
      const chave = loja.get('openai'), conta = loja.get('openai-conta'), em = loja.get('openai-em');
      tx.oncomplete = () => resolve({ chave: chave.result || '', conta: conta.result || '', em: Number(em.result) || 0 });
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }

  function apagarTudo(banco) {
    return new Promise((resolve, reject) => {
      const tx = banco.transaction(LOJA, 'readwrite');
      tx.objectStore(LOJA).clear();
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }

  const temAlgo = antigo => Boolean(antigo.chave || antigo.em || antigo.conta);

  const contaParaVincular = antigo => (antigo.conta === 'local' ? '' : antigo.conta);
  const emParaVincular = antigo => antigo.em || (antigo.chave ? 1 : 0);
  const paraVincular = antigo => ({ chave: antigo.chave, conta: contaParaVincular(antigo), em: emParaVincular(antigo) });

  async function abrir() {
    const banco = await abrirOBanco();
    return { ler: () => lerOQueHa(banco), apagar: () => apagarTudo(banco), fechar: () => banco.close() };
  }

  async function limparAsMarcas(marca) {
    const dados = await chrome.storage.local.get(marca);
    if (dados[marca] && typeof dados[marca].naoEnviada !== 'boolean') await chrome.storage.local.remove(marca);
    await chrome.storage.local.remove('pm_chave_openai_versao');
  }

  raiz.ChaveLegada = Object.freeze({ abrir, temAlgo, paraVincular, limparAsMarcas });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
