'use strict';

function trocarALeituraDe({ chave, mensagemDoErro }) {
  const ler = chrome.storage.local.get.bind(chrome.storage.local);
  const ehObjeto = valor => Boolean(valor) && typeof valor === 'object';
  const pedeAChave = chaves => ehObjeto(chaves) && chave in chaves;
  const semResposta = () => new Promise(() => {});
  const recusada = () => Promise.reject(new Error(mensagemDoErro));
  chrome.storage.local.get = (...args) => {
    if (!pedeAChave(args[0])) return ler(...args);
    return mensagemDoErro ? recusada() : semResposta();
  };
}

const deixarALeituraSemResposta = (page, chave) => page.addInitScript(trocarALeituraDe, { chave });

const recusarALeitura = (page, chave, mensagemDoErro) => page.addInitScript(trocarALeituraDe, { chave, mensagemDoErro });

module.exports = { deixarALeituraSemResposta, recusarALeitura };
