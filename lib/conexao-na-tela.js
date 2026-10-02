'use strict';

// Como a Conexão com o Anki aparece na tela, decidido uma vez. A F1 do shell, o
// card da primeira conexão (ONB-16) e o passo 4 da Boas-vindas desenham a mesma
// situação (lib/conexao-anki.js) com as mesmas peças; nenhum deles escolhe por
// conta própria o texto, o ponto, o que é “indisponível” ou para onde vai o foco.
//
//   texto(situacao)                 BRG-02 (conectando) ou BRG-01.<situacao>
//   pintarPonto(ponto, situacao)    o ponto pega a situação (`data-estado`)
//   ligarTentarDeNovo(botao, fn)    o clique; indisponível, não faz nada
//   pintarTentarDeNovo(botao, situacao, { sai, focoPara })
//                                   indisponível enquanto confere e, se `sai`,
//                                   fora da tela, com o foco indo para `focoPara`
//
// Indisponível é `aria-disabled`, nunca `disabled`: o botão continua focável (o
// foco que estava nele não cai no <body> quando a conferência começa) e o
// clique é recusado por `ligarTentarDeNovo`.

(function (raiz) {
  const { ConexaoAnki, textoDaVoz } = raiz;
  const { SITUACAO } = ConexaoAnki;

  /** BRG-02 enquanto confere; BRG-01 com a situação que a Conexão respondeu. */
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
   * `sai` diz que a situação não deixa mais nada a tentar (ligada). Com o foco
   * no botão que sai, ele vai para o elemento que `focoPara` devolve, em vez de
   * cair no <body>.
   */
  function pintarTentarDeNovo(botao, situacao, { sai = false, focoPara = null } = {}) {
    botao.setAttribute('aria-disabled', String(situacao === SITUACAO.CONECTANDO));
    if (sai && botao.contains(document.activeElement)) focoPara?.()?.focus();
    botao.hidden = sai;
  }

  raiz.ConexaoNaTela = { texto, pintarPonto, ligarTentarDeNovo, pintarTentarDeNovo };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
