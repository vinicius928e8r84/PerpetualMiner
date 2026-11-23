'use strict';

function falharAPrimeiraLeituraDe({ chave, mensagem }) {
  const ler = chrome.storage.local.get.bind(chrome.storage.local);
  const ehObjeto = valor => Boolean(valor) && typeof valor === 'object';
  const pedeAChave = chaves => ehObjeto(chaves) && chave in chaves;
  let falhou = false;
  chrome.storage.local.get = (chaves, callback) => {
    if (falhou || !pedeAChave(chaves)) return ler(chaves, callback);
    falhou = true;
    Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: { message: mensagem } });
    try { callback(undefined); } finally { delete chrome.runtime.lastError; }
    return undefined;
  };
}

const falharAPrimeiraLeitura = (page, chave, mensagem) => page.evaluate(falharAPrimeiraLeituraDe, { chave, mensagem });

module.exports = { falharAPrimeiraLeitura };
