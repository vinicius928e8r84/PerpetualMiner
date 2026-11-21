'use strict';

const chaveTrocada = (estado, { chave }) => (estado.chaveDaOpenAI || '') !== chave;

const chaveGuardadaSemConta = estado => estado.contaDaChave === '' && Boolean(estado.chaveDaOpenAI);

function contaTrocada(estado, { conta }) {
  if (estado.contaDaChave) return estado.contaDaChave !== conta;
  return chaveGuardadaSemConta(estado) && conta !== '';
}

const versaoAnteriorDaMesmaConta = (estado, { conta, versao }) => versao === estado.versaoDaChave - 1 && estado.contaDaChave === conta;

const versaoRecusada = (estado, pedido) => pedido.versao !== estado.versaoDaChave && !versaoAnteriorDaMesmaConta(estado, pedido);

const MOTIVOS_DA_RECUSA = [chaveTrocada, contaTrocada, versaoRecusada];

function legadoRecusado(estado, pedido) {
  return MOTIVOS_DA_RECUSA.some(recusa => recusa(estado, pedido));
}

module.exports = { legadoRecusado };
