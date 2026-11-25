'use strict';

const clone = (v) => JSON.parse(JSON.stringify(v));

function pedidasDe(chaves) {
  if (typeof chaves === 'string') return { [chaves]: undefined };
  if (Array.isArray(chaves)) return Object.fromEntries(chaves.map(k => [k, undefined]));
  return chaves;
}

function lerPedidas(dados, pedidas) {
  const resultado = {};
  for (const [k, padrao] of Object.entries(pedidas)) {
    if (k in dados) resultado[k] = clone(dados[k]);
    else if (padrao !== undefined) resultado[k] = padrao;
  }
  return resultado;
}

function areaEmMemoria(dados) {
  return {
    async get(chaves) {
      if (chaves === null) return clone(dados);
      return lerPedidas(dados, pedidasDe(chaves));
    },
    async set(itens) { for (const [k, v] of Object.entries(itens)) dados[k] = clone(v); },
    async remove(chaves) { for (const k of [].concat(chaves)) delete dados[k]; },
  };
}

module.exports = { clone, areaEmMemoria };
