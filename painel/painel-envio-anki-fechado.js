'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, Abridor, AbrirOAnki } = raiz;
  const { DESFECHO } = AbrirOAnki;
  const AVISO = 'envio-anki-fechado';

  const CAUSA_SEM_RESPOSTA = 'abridor · sem resposta da Conexão no prazo';

  const FAIXA_DO_DESFECHO = {
    [DESFECHO.SEM_PERMISSAO]: () => ({ opcoes: { botao: true }, espera: true }),
    [DESFECHO.NAO_ABRIU]: resultado => ({ opcoes: { causa: AbrirOAnki.causaDoAbridor(resultado) }, espera: true }),
    [DESFECHO.SEM_RESPOSTA]: () => ({ opcoes: { causa: CAUSA_SEM_RESPOSTA }, espera: false }),
    [DESFECHO.FECHOU]: () => ({ opcoes: { causa: 'abridor · a pessoa fechou o Anki durante a espera' }, espera: false }),
  };

  const faixaDoDesfecho = resultado => FAIXA_DO_DESFECHO[resultado.desfecho]?.(resultado) ?? null;

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

    const vigente = (este, minha) => pedido === este && este.espera === minha;

    async function esperar(este) {
      const minha = este.espera = {};
      const respondeu = await AbrirOAnki.esperarOAnki({ continuar: () => vigente(este, minha) });
      if (respondeu || !vigente(este, minha)) return;
      pedido = null;
      mostrar('abra', { causa: CAUSA_SEM_RESPOSTA });
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
      if (fala) return substituirPorFala(fala);
      await encerrar(este, resultado);
    }

    function substituirPorFala(fala) {
      pedido = null;
      tirar();
      colocar(Veio.montarAviso({ texto: fala.texto, acao: fala.acao, detalhes: fala.detalhes, fechavel: false }));
    }

    async function encerrar(este, resultado) {
      const faixa = faixaDoDesfecho(resultado);
      if (!faixa) {
        if (resultado.desfecho === DESFECHO.RESPONDEU) ConexaoAnki.conferir();
        return;
      }
      if (!faixa.espera) pedido = null;
      mostrar('abra', faixa.opcoes);
      if (faixa.espera) await esperar(este);
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

  raiz.EnvioComOAnkiFechado = { criar, faixaDoDesfecho };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
