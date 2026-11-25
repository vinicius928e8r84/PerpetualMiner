'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, Shell, SituacaoDoEnvio, CartaoDoEnvio, FaseDaRemessa } = raiz;
  const { FASE, EVENTO } = FaseDaRemessa;
  const { AREAS_DO_PAINEL } = Shell;
  const porId = id => document.getElementById(id);

  const MODAIS_DO_ENVIO = ['modal-envio', 'modal-resumo'];
  const RESPOSTA = Object.freeze({ APAGAR: 'apagar', DESCARTAR: 'descartar' });
  const AGORA = Object.freeze({ NADA: 'nada', MOSTRAR_O_PROGRESSO: 'progresso', ABRIR_O_RESUMO: 'resumo' });

  const semLugarParaOResumo = ({ naAreaDoPainel, outroModalAberto }) => !naAreaDoPainel || outroModalAberto;
  const terminouComAlgoForaDoResumo = ({ algumForaDoResumo, todosTerminaram }) => algumForaDoResumo && todosTerminaram;
  const ninguemVeOProgresso = ({ progressoAberto, desistiuDasPendencias }) => !progressoAberto && !desistiuDasPendencias;
  const pararamSemNinguemVer = fatos => terminouComAlgoForaDoResumo(fatos) && ninguemVeOProgresso(fatos);
  const pendenciaPorMostrar = ({ algumPendente, desistiuDasPendencias }) => algumPendente && !desistiuDasPendencias;

  function oQueFazerComOResumo(fatos) {
    if (semLugarParaOResumo(fatos)) return AGORA.NADA;
    if (!fatos.pronto) return pararamSemNinguemVer(fatos) ? AGORA.MOSTRAR_O_PROGRESSO : AGORA.NADA;
    if (pendenciaPorMostrar(fatos)) return fatos.progressoAberto ? AGORA.NADA : AGORA.MOSTRAR_O_PROGRESSO;
    return AGORA.ABRIR_O_RESUMO;
  }

  function perguntaDoResumo(aTirar) {
    if (aTirar === 0) return textoDaVoz('ENV-10.nadaParaTirar');
    return aTirar === 1 ? textoDaVoz('ENV-10.perguntaUma') : textoDaVoz('ENV-10.pergunta', { n: aTirar });
  }

  function ajudaDoResumo(aTirar, jaApagadas) {
    return [
      aTirar === 0 ? '' : textoDaVoz(aTirar === 1 ? 'ENV-10.ajudaUma' : 'ENV-10.ajuda'),
      jaApagadas ? textoDaVoz('ENV-10.jaApagadas', { n: jaApagadas }) : '',
    ].filter(Boolean).join(' ');
  }

  function outroModalAberto() {
    return [...document.querySelectorAll('.veio-scrim:not([hidden])')].some(scrim => !MODAIS_DO_ENVIO.includes(scrim.id));
  }

  function escreverOsBlocos(idiomas, aoTentar) {
    const falhas = idiomas.reduce((soma, i) => soma + i.falhas, 0);
    const total = idiomas.reduce((soma, i) => soma + i.total, 0);
    porId('modal-resumo-titulo').textContent = textoDaVoz(falhas ? 'ENV-10.tituloEmParte' : 'ENV-10.titulo');
    porId('modal-resumo-detalhe').textContent = textoDaVoz('ENV-10.detalhe', { n: total, baralhos: idiomas.length });
    porId('modal-resumo-baralhos').replaceChildren(...idiomas.map(idioma => CartaoDoEnvio.montarBlocoDoResumo(idioma, aoTentar)));
  }

  function escreverAPergunta(aTirar, jaApagadas) {
    const ajuda = ajudaDoResumo(aTirar, jaApagadas);
    porId('modal-resumo-pergunta').textContent = perguntaDoResumo(aTirar);
    porId('modal-resumo-ajuda').textContent = ajuda;
    porId('modal-resumo-ajuda').hidden = !ajuda;

    const tirar = porId('btn-resumo-apagar');
    const manter = porId('btn-resumo-manter');
    tirar.hidden = aTirar === 0;
    manter.textContent = textoDaVoz(aTirar === 0 ? 'ENV-10.pronto' : 'ENV-10.manter');
    tirar.toggleAttribute('data-foco-seguro', aTirar > 0);
    manter.toggleAttribute('data-foco-seguro', aTirar === 0);
  }

  function criar({ estado, leitura, acoes }) {
    let aberto = null;
    let resposta = null;

    function prontoParaResumo() {
      const remessa = estado.remessa();
      if (!remessa || estado.fase() !== FASE.ACOMPANHANDO) return false;
      return remessa.envios.some(e => e.jobId && !leitura.foraDoResumo(e)) && remessa.envios.every(leitura.terminou);
    }

    function fatosDoResumo() {
      const envios = estado.remessa()?.envios || [];
      return {
        naAreaDoPainel: AREAS_DO_PAINEL.includes(Shell.areaAtual()),
        outroModalAberto: outroModalAberto(),
        pronto: prontoParaResumo(),
        algumForaDoResumo: envios.some(leitura.foraDoResumo),
        todosTerminaram: envios.every(leitura.terminou),
        algumPendente: envios.some(leitura.pendente),
        progressoAberto: Boolean(estado.progresso()),
        desistiuDasPendencias: estado.desistiuDasPendencias(),
      };
    }

    function tentarAbrir() {
      const agora = oQueFazerComOResumo(fatosDoResumo());
      if (agora === AGORA.MOSTRAR_O_PROGRESSO) return acoes.abrirProgresso();
      if (agora === AGORA.ABRIR_O_RESUMO) abrirOResumo();
    }

    function abrirOResumo() {
      estado.progresso()?.fechar();
      const idiomas = SituacaoDoEnvio.contagemPorIdioma(estado.remessa().envios, leitura.situacaoDe, leitura.estadoDoJob);
      const enviadas = idiomas.flatMap(i => i.enviadas);
      const duplicadas = idiomas.flatMap(i => i.duplicadas);
      const aTirar = estado.doPainel().frasesPorId(enviadas).length;
      escreverOsBlocos(idiomas, lang => responder({ tentar: lang }));
      escreverAPergunta(aTirar, enviadas.length - aTirar);

      resposta = null;
      acoes.despachar(EVENTO.RESUMIR);
      aberto = Veio.abrirModal(porId('modal-resumo'), { aoFechar: () => aoFechar({ enviadas, duplicadas }) });
    }

    function responder(dada) {
      resposta = dada;
      aberto?.fechar();
    }

    function fechar() {
      aberto?.fechar();
    }

    function descartarSeAberto() {
      if (aberto) responder(RESPOSTA.DESCARTAR);
    }

    async function aoFechar({ enviadas, duplicadas }) {
      aberto = null;
      const dada = resposta;
      resposta = null;

      if (dada === RESPOSTA.DESCARTAR) return;
      acoes.despachar(EVENTO.RESPONDER, { tentar: Boolean(dada?.tentar) });
      if (dada?.tentar) {
        await tentarDeNovoOIdioma(dada.tentar);
        return;
      }
      await acoes.esquecer();
      if (dada === RESPOSTA.APAGAR) {
        const doPainel = estado.doPainel();
        const aindaAqui = doPainel.frasesPorId(enviadas).map(f => f.id);
        await doPainel.marcarComoEnviadas(duplicadas);
        await doPainel.apagar(aindaAqui);
        if (aindaAqui.length) Veio.mostrarToastDeSucesso(textoDaVoz('ENV-11', { n: aindaAqui.length }));
      } else {
        await estado.doPainel().marcarComoEnviadas([...enviadas, ...duplicadas]);
      }
    }

    const terminouSemRetomada = envio => leitura.terminou(envio) && !SituacaoDoEnvio.retomavel(leitura.situacaoDe(envio));

    async function refazerOEnvio(envio) {
      if (!envio.jobId) await acoes.criarEnvio(envio);
      else if (SituacaoDoEnvio.retomavel(leitura.situacaoDe(envio))) await acoes.retomar(envio);
      const estadoDoJob = leitura.estadoDoJob(envio);
      if (estadoDoJob && terminouSemRetomada(envio)) await CartaoDoEnvio.recriar(estado.remessa(), envio, estadoDoJob, acoes.criarEnvio);
    }

    function tentarDeNovoOIdioma(lang) {
      acoes.abrirProgresso();
      return acoes.recomecar(async () => {
        for (const envio of [...estado.remessa().envios]) {
          if (envio.lang === lang && !leitura.foraDoResumo(envio)) await refazerOEnvio(envio);
        }
      });
    }

    return { tentarAbrir, responder, fechar, descartarSeAberto };
  }

  raiz.ResumoDoEnvio = Object.freeze({ RESPOSTA, AGORA, oQueFazerComOResumo, criar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
