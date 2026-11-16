'use strict';

function legadoRecusado(estado, { chave, conta, versao }) {
  const guardada = estado.contaDaChave;
  if ((estado.chaveDaOpenAI || '') !== chave) return true;
  if (guardada ? guardada !== conta : guardada === '' && estado.chaveDaOpenAI && conta !== '') return true;
  return versao !== estado.versaoDaChave && !(versao === estado.versaoDaChave - 1 && guardada === conta);
}

module.exports = { legadoRecusado };
