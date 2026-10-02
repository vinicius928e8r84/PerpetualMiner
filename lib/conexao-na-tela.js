'use strict';

// As peças da Conexão na tela, compartilhadas pela F1 do shell, pelo card da
// primeira conexão (ONB-16) e pelo passo 4 da Boas-vindas. Cada tela escolhe a
// situação exibida, quando o botão sai e o destino do foco; este módulo aplica
// o tratamento comum. A situação real e a conferência são de ConexaoAnki.
// Carregue depois de lib/voz/texto.js e lib/conexao-anki.js, antes das telas.
//
//   texto(situacao)                 BRG-02 (conectando) ou BRG-01.<situacao>
//   pintarPonto(ponto, situacao)    o ponto pega a situação (`data-estado`)
//   ligarTentarDeNovo(botao, aoUsar) o clique; indisponível, não faz nada
//   pintarTentarDeNovo(botao, situacao, { sai, focoPara })
//                                   indisponível em conectando; a tela fornece
//                                   `sai` e `focoPara` conforme o contrato abaixo
//
// Indisponível é `aria-disabled`, nunca `disabled`: a tela fornece um botão
// sem `disabled`, para que a conferência não tire o foco de um retry visível.
// O clique indisponível é recusado por `ligarTentarDeNovo`.

(function (raiz) {
  const { ConexaoAnki, textoDaVoz } = raiz;
  const { SITUACAO } = ConexaoAnki;

  function texto(situacao) {
    return situacao === SITUACAO.CONECTANDO ? textoDaVoz('BRG-02') : textoDaVoz(`BRG-01.${situacao}`);
  }

  function pintarPonto(ponto, situacao) {
    ponto.dataset.estado = situacao;
  }

  /** O clique do Tentar de novo: a mesma conferência da Conexão, ou `aoUsar` quando a tela tem algo a mais. */
  function ligarTentarDeNovo(botao, aoUsar = () => ConexaoAnki.tentarDeNovo()) {
    botao.addEventListener('click', () => {
      if (botao.getAttribute('aria-disabled') === 'true') return;
      aoUsar();
    });
  }

  /**
   * A tela decide `sai` (padrão false), inclusive ao trocar de passo, não só
   * quando liga. Para um botão que sai com foco dentro, `focoPara` deve
   * devolver um elemento já visível e focável; sem ele, não há transferência.
   */
  function pintarTentarDeNovo(botao, situacao, { sai = false, focoPara = null } = {}) {
    botao.setAttribute('aria-disabled', String(situacao === SITUACAO.CONECTANDO));
    if (sai && botao.contains(document.activeElement)) focoPara?.()?.focus();
    botao.hidden = sai;
  }

  raiz.ConexaoNaTela = { texto, pintarPonto, ligarTentarDeNovo, pintarTentarDeNovo };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
