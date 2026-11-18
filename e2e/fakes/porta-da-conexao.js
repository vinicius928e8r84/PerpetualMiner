'use strict';

const http = require('http');

const PORTA_DO_COMPUTADOR = 8766;

async function subirPortaDaConexaoDeTeste() {
  let responder = null;
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORTA_DO_COMPUTADOR}`);
    if (!responder || !responder(url, req, res)) req.socket.destroy();
  });
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  return {
    porta: servidor.address().port,
    atender(fn) { responder = fn; },
    fechar: () => new Promise(resolve => {
      servidor.close(resolve);
      servidor.closeAllConnections();
    }),
  };
}

function regrasQueTiramAPortaDoComputador(portaDeTeste) {
  return ['127.0.0.1', 'localhost'].map(nome => `MAP ${nome}:${PORTA_DO_COMPUTADOR} 127.0.0.1:${portaDeTeste}`).join(', ');
}

module.exports = { PORTA_DO_COMPUTADOR, subirPortaDaConexaoDeTeste, regrasQueTiramAPortaDoComputador };
