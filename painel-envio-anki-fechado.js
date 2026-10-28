'use strict';

// Enviar ao Anki com o Anki fechado (#150): a faixa da área de Frases e o que a espera faz. Quem chama é o
// Envio (painel-envio.js), só depois de a Conexão já ter respondido uma vez neste computador: antes disso não há
// abridor, e o Enviar continua indisponível.
//
//   criar({ aoLigar }).pedir(ids)   guarda as Frases que a pessoa pediu para enviar e mostra a faixa (ENV-16):
//     - com a permissão do abridor, chama o abridor (uma vez por pedido) e diz “Abrindo o Anki para enviar…”;
//     - sem ela, ou se o abridor não abre o Anki, diz “Abra o Anki para enviar”, com o botão que pede a permissão.
//   Quando a Conexão responde, a faixa some e `aoLigar(ids)` envia as Frases. A espera dura `PRAZO_DO_ANKI_MS`
//   (lib/abrir-o-anki.js): passado o prazo, o pedido se desfaz e a faixa fica até o Anki responder; a pessoa aperta
//   Enviar de novo. O abridor só é chamado aqui, num Enviar que a pessoa apertou.

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, Abridor, AbrirOAnki } = raiz;
  const { RESULTADO } = Abridor;
  const AVISO = 'envio-anki-fechado';

  function criar({ aoLigar }) {
    let pedido = null; // { ids, abriu }: o Enviar que espera o Anki

    const tirar = () => document.querySelector(`#frases-avisos [data-aviso="${AVISO}"]`)?.remove();

    /** A faixa: `abrindo` enquanto o abridor trabalha; `abra` pede que a pessoa abra o Anki (`botao`: com o pedido da permissão). */
    function mostrar(fase, { causa = '', botao = false } = {}) {
      tirar();
      const aviso = Veio.montarAviso({
        tom: 'info',
        fechavel: false,
        texto: textoDaVoz(fase === 'abrindo' ? 'ENV-16.abrindo' : 'ENV-16.abra'),
        ...(botao ? { acao: { rotulo: textoDaVoz('ENV-16.abrirSozinho'), aoUsar: evento => pedirAPermissao(evento.currentTarget) } } : {}),
        ...(causa ? { detalhes: causa } : {}),
      });
      aviso.dataset.aviso = AVISO;
      document.getElementById('frases-avisos').append(aviso);
    }

    const causaDoAbridor = ({ resultado, detalhe }) => `abridor · ${resultado}${detalhe ? ` · ${detalhe}` : ''}`;

    /** O botão da faixa, no clique: pede a permissão ao Chrome e, dada, abre o Anki. */
    function pedirAPermissao(botao) {
      if (botao.getAttribute('aria-disabled') === 'true' || !pedido) return;
      const este = pedido;
      const aberto = AbrirOAnki.abrirNoClique();
      botao.setAttribute('aria-disabled', 'true');
      aberto.then(resposta => {
        if (pedido !== este) return;
        if (resposta.resultado === RESULTADO.SEM_PERMISSAO) return botao.removeAttribute('aria-disabled');
        este.abriu = resposta.resultado === RESULTADO.ABRIU;
        if (!este.abriu) return mostrar('abra', { causa: causaDoAbridor(resposta) });
        mostrar('abrindo');
        esperar(este); // o Anki abriu agora: o prazo recomeça
      });
    }

    async function pedir(ids) {
      if (pedido?.abriu) {
        pedido.ids = ids;
        return;
      }
      const este = pedido = { ids, abriu: false };
      const vale = () => pedido === este;
      if (!(await Abridor.temPermissao().catch(() => false))) {
        mostrar('abra', { botao: true });
      } else {
        mostrar('abrindo');
        const resposta = await Abridor.abrirOAnki();
        if (!vale()) return;
        este.abriu = resposta.resultado === RESULTADO.ABRIU;
        if (!este.abriu) mostrar('abra', { causa: causaDoAbridor(resposta) });
      }
      await esperar(este);
    }

    /** Espera a Conexão responder; uma espera nova (o botão da faixa) encerra a anterior sem dizer nada. */
    async function esperar(este) {
      const minha = este.espera = {};
      const vale = () => pedido === este && este.espera === minha;
      const respondeu = await AbrirOAnki.esperarOAnki({ continuar: vale });
      if (!vale() || respondeu) return;
      pedido = null;
      mostrar('abra', { causa: 'abridor · sem resposta da Conexão no prazo' });
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
