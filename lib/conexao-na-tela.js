'use strict';

(function (raiz) {
  const { ConexaoAnki, textoDaVoz } = raiz;
  const { SITUACAO, APRESENTADA } = ConexaoAnki;

  function texto(situacao) {
    if (situacao === SITUACAO.CONECTANDO) return textoDaVoz('BRG-02');
    if (situacao === APRESENTADA.A_PAREAR) return textoDaVoz('BRG-52.conectar');
    if (situacao === APRESENTADA.NAO_CONFIRMADA) return textoDaVoz('BRG-52.naoConfirmou');
    return textoDaVoz(`BRG-01.${situacao}`);
  }

  function pintarPonto(ponto, situacao) {
    ponto.dataset.estado = situacao;
  }

  function ligarTentarDeNovo(botao, aoUsar = () => ConexaoAnki.tentarDeNovo()) {
    botao.addEventListener('click', () => {
      if (botao.getAttribute('aria-disabled') === 'true') return;
      aoUsar();
    });
  }

  function pintarTentarDeNovo(botao, situacao, { sai = false, focoPara = null } = {}) {
    botao.setAttribute('aria-disabled', String(situacao === SITUACAO.CONECTANDO));
    if (sai && botao.contains(document.activeElement)) focoPara?.()?.focus();
    botao.hidden = sai;
  }

  raiz.ConexaoNaTela = { texto, pintarPonto, ligarTentarDeNovo, pintarTentarDeNovo };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
