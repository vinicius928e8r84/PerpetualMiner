'use strict';

(function (raiz) {
  const veioDaPropriaExtensaoComAba = (remetente, idDaExtensao) => remetente.id === idDaExtensao && remetente.tab?.id != null;

  const deveResponder = (mensagem, request, remetente, idDaExtensao) => {
    if (mensagem.soDaExtensaoComAba && !veioDaPropriaExtensaoComAba(remetente, idDaExtensao)) return false;
    return !mensagem.aceita || mensagem.aceita(request);
  };

  function criar({ idDaExtensao, mensagens }) {
    const porTipo = new Map(Object.entries(mensagens));

    return function ouvir(request, remetente, responder) {
      const mensagem = porTipo.get(request.type);
      if (!mensagem || !deveResponder(mensagem, request, remetente, idDaExtensao)) return undefined;
      mensagem.responder(request, remetente)
        .then(responder)
        .catch(erro => responder(mensagem.quandoFalhar(erro)));
      return true;
    };
  }

  raiz.OuvinteDeMensagens = Object.freeze({ criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
