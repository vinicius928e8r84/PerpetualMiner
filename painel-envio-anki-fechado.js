'use strict';

// Enviar ao Anki com o Anki fechado (#150) e o conserto sozinho (#152): a faixa da área de Frases e o que a espera faz. Quem
// chama é o Envio (painel-envio.js), só depois de a Conexão já ter respondido uma vez neste computador: antes disso não há
// abridor, e o Enviar continua indisponível.
//
//   criar({ aoLigar }).pedir(ids)   guarda as Frases que a pessoa pediu para enviar e mostra a faixa (ENV-16):
//     - com a permissão do abridor, chama o abridor (uma vez por pedido: `AbrirOAnki.abrirOuConsertar`, que conserta o Anki
//       que travou ou o complemento desativado e abre o que está fechado) e diz “Abrindo o Anki para enviar…”, ou
//       “Conferindo a Conexão com o Anki…” se o abridor demora;
//     - sem ela, ou se o abridor não abre o Anki, diz “Abra o Anki para enviar”, com o botão que pede a permissão;
//     - se a pessoa fechou o Anki durante a espera do conserto, nada o reabre: a faixa “Abra o Anki para enviar” fica e o pedido se desfaz;
//     - se o abridor consertou, o toast conta o que fez (BRG-39); se a Conexão sumiu do Anki ou o conserto falhou, a faixa
//       (BRG-39) traz o único botão (Instalar de novo, ou Baixar diagnóstico) e o pedido se desfaz.
//   Quando a Conexão responde, a faixa some e `aoLigar(ids)` envia as Frases. A espera dura `PRAZO_DO_ANKI_MS`
//   (lib/abrir-o-anki.js): passado o prazo, o pedido se desfaz e a faixa fica até o Anki responder; a pessoa aperta
//   Enviar de novo. O abridor só é chamado aqui, num Enviar que a pessoa apertou.

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, Abridor, AbrirOAnki } = raiz;
  const { DESFECHO } = AbrirOAnki;
  const AVISO = 'envio-anki-fechado';

  function criar({ aoLigar }) {
    let pedido = null; // { ids, rodando }: o Enviar que espera o Anki

    const tirar = () => document.querySelector(`#frases-avisos [data-aviso="${AVISO}"]`)?.remove();

    /** A faixa: `abrindo` e `consertando` enquanto o abridor trabalha; `abra` pede que a pessoa abra o Anki (`botao`: com o pedido da permissão). */
    function mostrar(fase, { causa = '', botao = false } = {}) {
      tirar();
      const texto = { abrindo: 'ENV-16.abrindo', consertando: 'BRG-39.consertando', abra: 'ENV-16.abra' }[fase];
      colocar(Veio.montarAviso({
        tom: 'info',
        fechavel: false,
        texto: textoDaVoz(texto),
        ...(botao ? { acao: { rotulo: textoDaVoz('ENV-16.abrirSozinho'), aoUsar: evento => pedirAPermissao(evento.currentTarget) } } : {}),
        ...(causa ? { detalhes: causa } : {}),
      }));
    }

    function colocar(aviso) {
      aviso.dataset.aviso = AVISO;
      document.getElementById('frases-avisos').append(aviso);
    }

    const causaDoAbridor = ({ resultado, detalhe }) => `abridor · ${resultado}${detalhe ? ` · ${detalhe}` : ''}`;

    /** O botão da faixa, no clique: pede a permissão ao Chrome (o gesto é daqui) e, dada, abre ou conserta. */
    function pedirAPermissao(botao) {
      if (botao.getAttribute('aria-disabled') === 'true' || !pedido) return;
      const este = pedido;
      botao.setAttribute('aria-disabled', 'true');
      Abridor.pedirPermissao().then(dada => {
        if (pedido !== este) return;
        if (!dada) return botao.removeAttribute('aria-disabled');
        return executar(este);
      });
    }

    async function pedir(ids) {
      if (pedido?.rodando) {
        pedido.ids = ids;
        return;
      }
      const este = pedido = { ids, rodando: false };
      if (!(await Abridor.temPermissao().catch(() => false))) {
        mostrar('abra', { botao: true });
        return esperar(este);
      }
      await executar(este);
    }

    /** A faixa “Abra o Anki” espera que a pessoa o abra: a Conexão que responde manda as Frases. Uma espera nova encerra a anterior sem dizer nada. */
    async function esperar(este) {
      const minha = este.espera = {};
      const respondeu = await AbrirOAnki.esperarOAnki({ continuar: () => pedido === este && este.espera === minha });
      if (pedido !== este || este.espera !== minha || respondeu) return;
      pedido = null;
      mostrar('abra', { causa: 'abridor · sem resposta da Conexão no prazo' });
    }

    /** O abridor abre ou conserta e espera a Conexão responder; o que sobra depois é só dizer o que não deu. */
    async function executar(este) {
      const vale = () => pedido === este;
      este.rodando = true;
      este.espera = {};   // a espera da faixa “Abra o Anki”, se havia, termina: o abridor agora cuida dela
      mostrar('abrindo');
      const resultado = await AbrirOAnki.abrirOuConsertar({ aoMudar: fase => vale() && mostrar(fase), continuar: vale });
      este.rodando = false;
      const fala = AbrirOAnki.falaDoDesfecho(resultado);
      if (fala?.sucesso) return Veio.mostrarToastDeSucesso(fala.texto);   // a Conexão já respondeu: a faixa saiu e as Frases foram
      if (!vale()) return;
      if (fala) {
        pedido = null;
        tirar();
        colocar(Veio.montarAviso({ texto: fala.texto, acao: fala.acao, detalhes: fala.detalhes, fechavel: false }));
      } else if (resultado.desfecho === DESFECHO.SEM_PERMISSAO || resultado.desfecho === DESFECHO.NAO_ABRIU) {
        // O abridor não abriu o Anki: a pessoa o abre, e a faixa espera a Conexão responder.
        mostrar('abra', resultado.desfecho === DESFECHO.SEM_PERMISSAO ? { botao: true } : { causa: causaDoAbridor(resultado) });
        await esperar(este);
      } else if (resultado.desfecho === DESFECHO.SEM_RESPOSTA) {
        pedido = null;
        mostrar('abra', { causa: 'abridor · sem resposta da Conexão no prazo' });
      } else if (resultado.desfecho === DESFECHO.FECHOU) {
        // A pessoa fechou o Anki durante a espera: nada o reabre, o pedido se desfaz e a faixa fica até ela abri-lo.
        pedido = null;
        mostrar('abra', { causa: 'abridor · a pessoa fechou o Anki durante a espera' });
      } else if (resultado.desfecho === DESFECHO.RESPONDEU) ConexaoAnki.conferir();
    }

    ConexaoAnki.acompanhar(situacao => {
      if (situacao !== ConexaoAnki.SITUACAO.LIGADA) return;
      tirar();
      const ids = pedido?.ids;
      pedido = null;
      if (ids) aoLigar(ids);
    });

    return { pedir };
  }

  raiz.EnvioComOAnkiFechado = { criar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
