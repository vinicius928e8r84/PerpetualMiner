'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, Configuracao } = raiz;

  const porId = id => document.getElementById(id);

  let retrato = null;

  function iniciarLembrete() {
    porId('frases-lembrete-continuar').addEventListener('click', () => {
      location.hash = retrato.enderecoParaContinuar;
    });
    porId('frases-lembrete-ocultar').addEventListener('click', () => {
      Configuracao.ocultarLembrete();
      porId('btn-minerar-frases').focus();
    });

    Configuracao.acompanhar(novo => {
      retrato = novo;
      desenhar();
    });
  }

  function desenhar() {
    const faixa = porId('frases-lembrete');
    faixa.hidden = !retrato.lembrete;
    if (!retrato.lembrete) return;
    const { resolvidos: n, total } = retrato;
    porId('frases-lembrete-anel').replaceChildren(Veio.montarAnelDeProgresso(n, total));
    porId('frases-lembrete-texto').textContent = textoDaVoz('ONB-15.texto', { n, total });
  }

  document.addEventListener('DOMContentLoaded', iniciarLembrete);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
