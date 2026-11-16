'use strict';

const { rota } = require('./rota');

function criarRotasDaSaude({ atualizacao, perfis, respostaDoContrato }) {
  return [
    rota('*', '/health', ({ req, responder }) => {
      const { status, json } = atualizacao.saudeCom(perfis.saudeCom(respostaDoContrato(req.method(), '/health')));
      return responder(status, json);
    }),
    rota('POST', '/atualizacao/agora', ({ responder }) => {
      const { status, json } = atualizacao.agoraCom(respostaDoContrato('POST', '/atualizacao/agora', {}));
      return responder(status, json);
    }),
    rota('POST', '/atualizacao/reiniciar', ({ responder }) => {
      const { status, json } = respostaDoContrato('POST', '/atualizacao/reiniciar', {});
      if (status === 200) atualizacao.reiniciar();
      return responder(status, json);
    }),
  ];
}

module.exports = { criarRotasDaSaude };
