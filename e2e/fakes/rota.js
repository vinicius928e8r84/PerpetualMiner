'use strict';

const PASSA = Symbol('passa');

const responderOuPassar = (tratar, pedido) => {
  const feito = tratar(pedido);
  return feito === PASSA ? undefined : { feito };
};

function rota(metodo, caminho, tratar) {
  return pedido => ((metodo === '*' || pedido.req.method() === metodo) && pedido.url.pathname === caminho ? responderOuPassar(tratar, pedido) : undefined);
}

function rotaSe(casa, tratar) {
  return pedido => (casa(pedido) ? responderOuPassar(tratar, pedido) : undefined);
}

module.exports = { rota, rotaSe, PASSA };
