'use strict';

// Frases · o lembrete “Configuração pela metade” (ONB-15; item 9 da lista
// fechada, docs/design/painel/boas-vindas/, variante C). Enquanto a Boas-vindas
// não chegou a Tudo pronto e o lembrete não foi ocultado, a faixa ouro fica no
// topo de Frases com o anel de progresso e “N de 6 passos”, a mesma conta do
// popup e da Boas-vindas (lib/configuracao.js).
//
// Continuar configuração abre #boas-vindas no primeiro passo que falta (ou em
// Tudo pronto); Ocultar esconde o lembrete de vez, aqui e no popup.

(function (raiz) {
  const { textoDaVoz, Veio, Configuracao } = raiz;

  const porId = id => document.getElementById(id);

  let retrato = null;           // o retrato da configuração, depois da primeira leitura
  let conexaoConhecida = false; // o primeiro /health já voltou: ele conta um dos passos

  function iniciarLembrete() {
    porId('frases-lembrete-continuar').addEventListener('click', () => {
      location.hash = retrato.enderecoParaContinuar;
    });
    porId('frases-lembrete-ocultar').addEventListener('click', () => {
      Configuracao.ocultarLembrete();
      // A faixa some com o botão focado: o foco vai para o cabeçalho da área.
      porId('btn-minerar-frases').focus();
    });

    const { CONEXAO } = raiz.Shell;
    raiz.Shell.aoMudarAConexao(situacao => {
      conexaoConhecida = situacao !== CONEXAO.CONECTANDO;
      Configuracao.mostrarConexao(situacao === CONEXAO.LIGADA);
      desenhar();
    });
    Configuracao.acompanhar(novo => {
      retrato = novo;
      desenhar();
    });
  }

  /** A faixa espera o /health, como o popup: sem ele o número pularia na tela. */
  function desenhar() {
    const faixa = porId('frases-lembrete');
    const aparece = Boolean(retrato?.lembrete) && conexaoConhecida;
    faixa.hidden = !aparece;
    if (!aparece) return;
    const { resolvidos: n, total } = retrato;
    porId('frases-lembrete-anel').replaceChildren(Veio.montarAnelDeProgresso(n, total));
    porId('frases-lembrete-texto').textContent = textoDaVoz('ONB-15.texto', { n, total });
  }

  document.addEventListener('DOMContentLoaded', iniciarLembrete);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
