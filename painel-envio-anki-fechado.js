'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, Abridor, AbrirOAnki } = raiz;
  const { DESFECHO } = AbrirOAnki;
  const AVISO = 'envio-anki-fechado';

  function criar({ aoLigar }) {
    let pedido = null;

    const tirar = () => document.querySelector(`#frases-avisos [data-aviso="${AVISO}"]`)?.remove();

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

    async function esperar(este) {
      const minha = este.espera = {};
      const respondeu = await AbrirOAnki.esperarOAnki({ continuar: () => pedido === este && este.espera === minha });
      if (pedido !== este || este.espera !== minha || respondeu) return;
      pedido = null;
      mostrar('abra', { causa: 'abridor · sem resposta da Conexão no prazo' });
    }

    async function executar(este) {
      const vale = () => pedido === este;
      este.rodando = true;
      este.espera = {};
      mostrar('abrindo');
      const resultado = await AbrirOAnki.abrirOuConsertar({ aoMudar: fase => vale() && mostrar(fase), continuar: vale });
      este.rodando = false;
      const fala = AbrirOAnki.falaDoDesfecho(resultado);
      if (fala?.sucesso) return Veio.mostrarToastDeSucesso(fala.texto);
      if (!vale()) return;
      if (fala) {
        pedido = null;
        tirar();
        colocar(Veio.montarAviso({ texto: fala.texto, acao: fala.acao, detalhes: fala.detalhes, fechavel: false }));
      } else if (resultado.desfecho === DESFECHO.SEM_PERMISSAO || resultado.desfecho === DESFECHO.NAO_ABRIU) {
        mostrar('abra', resultado.desfecho === DESFECHO.SEM_PERMISSAO ? { botao: true } : { causa: AbrirOAnki.causaDoAbridor(resultado) });
        await esperar(este);
      } else if (resultado.desfecho === DESFECHO.SEM_RESPOSTA) {
        pedido = null;
        mostrar('abra', { causa: 'abridor · sem resposta da Conexão no prazo' });
      } else if (resultado.desfecho === DESFECHO.FECHOU) {
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
