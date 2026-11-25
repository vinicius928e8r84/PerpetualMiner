'use strict';

(function (raiz) {
  const SILENCIO_DA_LEGENDA_MS = 650;
  const INTERVALO_DA_LEITURA_MS = 700;

  function criarEsperaDaLegenda(silencioMs = SILENCIO_DA_LEGENDA_MS) {
    let ultimoTexto = '';
    let ultimoMandado = '';
    let parouDesde = 0;

    function parou(texto, agora) {
      if (!texto || texto === ultimoMandado) return false;
      if (texto !== ultimoTexto) {
        ultimoTexto = texto;
        parouDesde = agora;
        return false;
      }
      if (agora - parouDesde < silencioMs) return false;
      ultimoMandado = texto;
      return true;
    }

    return { parou };
  }

  function videoTocando(video) {
    if (!video) return false;
    return !video.paused && !video.ended;
  }

  function criar(pagina, relogio = Date.now) {
    const { detectarIdioma, MineracaoDoDia, Overlay, textoDaVoz, idiomaDe } = raiz;
    const espera = criarEsperaDaLegenda();
    let estado = null;
    let idiomaDaLegenda = null;

    function receberEstado(novo) {
      estado = novo;
      atualizarSelo();
    }

    function ligar() {
      chrome.runtime.sendMessage({ type: 'AUTO_MINER_GET_STATE' }, resposta => {
        if (!chrome.runtime.lastError && resposta?.state) receberEstado(resposta.state);
      });
      chrome.runtime.onMessage.addListener(mensagem => {
        if (mensagem?.type === MineracaoDoDia.MENSAGEM_ESTADO_MUDOU) receberEstado(mensagem.state);
      });
      setInterval(olharALegenda, INTERVALO_DA_LEITURA_MS);
    }

    function acompanharIdiomaDaLegenda(texto) {
      if (!texto) return;
      const lang = pagina.codigoDoIdioma(detectarIdioma(texto));
      if (lang === idiomaDaLegenda) return;
      idiomaDaLegenda = lang;
      atualizarSelo();
    }

    function ativaNaPagina(legenda) {
      if (!estado?.settings || !legenda) return false;
      if (!videoTocando(pagina.videoAtivo())) return false;
      return MineracaoDoDia.podeMinerarAgora(estado, pagina.codigoDoIdioma(detectarIdioma(legenda)));
    }

    function olharALegenda() {
      if (!MineracaoDoDia.idiomasLigados(estado).length) return;
      const legenda = pagina.lerLegenda();
      const texto = legenda?.texto || '';
      acompanharIdiomaDaLegenda(texto);
      if (!ativaNaPagina(texto)) return;
      const normalizado = pagina.normalizar(texto);
      if (espera.parou(normalizado, relogio())) mandarCandidata(normalizado, legenda);
    }

    function candidataDe(texto, idioma) {
      const contexto = pagina.contexto();
      return {
        type: 'AUTO_MINER_CANDIDATE',
        texto,
        origem: contexto?.fonte || pagina.origem() || 'auto',
        contexto,
        lang: pagina.codigoDoIdioma(idioma),
      };
    }

    function mandarCandidata(texto, legenda) {
      const idioma = detectarIdioma(texto);
      chrome.runtime.sendMessage(candidataDe(texto, idioma), resposta => {
        if (chrome.runtime.lastError || !resposta) return;
        if (resposta.state) receberEstado(resposta.state);
        registrarEvento(resposta, texto);
        if (resposta.action === 'saved') mostrarAviso(texto, idioma, resposta, pagina.lugarDaLegenda(legenda));
      });
    }

    function idiomaDoContador() {
      if (idiomaDaLegenda) return idiomaDaLegenda;
      const ligados = MineracaoDoDia.idiomasLigados(estado);
      return ligados.length === 1 ? ligados[0] : null;
    }

    function contaDoDia(lang, doEstado = estado) {
      return { n: MineracaoDoDia.contagemDeHoje(doEstado, lang), limite: doEstado?.settings?.[lang]?.dailyLimit || 0 };
    }

    function vozDoContador(lang, { n, limite }) {
      const idioma = idiomaDe(lang);
      return MineracaoDoDia.noLimiteDeHoje(estado, lang)
        ? { descricao: textoDaVoz('MIN-11.noLimite', { idioma }), etiqueta: textoDaVoz('MIN-11.etiquetaNoLimite') }
        : { descricao: textoDaVoz('MIN-11.contador', { idioma, n, limite }), etiqueta: textoDaVoz('MIN-11.etiqueta', { n, limite }) };
    }

    function contadorDe(lang) {
      const conta = contaDoDia(lang);
      return { texto: `${conta.n}/${conta.limite}`, noLimite: MineracaoDoDia.noLimiteDeHoje(estado, lang), ...vozDoContador(lang, conta) };
    }

    function atualizarSelo() {
      const lang = idiomaDoContador();
      const ligado = Boolean(lang && estado?.settings?.[lang]?.enabled);
      Overlay.mostrarContador(ligado ? contadorDe(lang) : null);
    }

    function registrarEvento(resposta, texto) {
      if (resposta?.action !== 'skip') return;
      atualizarSelo();
      console.debug('[PerpetualMiner Auto]', resposta.reason || resposta.evaluation?.reason || '', texto);
    }

    function palavraDoAviso(resposta) {
      const temFrase = resposta.frase?.keywords?.length;
      return pagina.palavraDe(temFrase ? resposta.frase : { keywords: resposta.evaluation?.keywords });
    }

    function mostrarAviso(texto, idioma, resposta, lugar) {
      if (!Overlay.temBotao() || Overlay.mostrandoFalha()) return;
      const lang = pagina.codigoDoIdioma(idioma);
      const { n, limite } = contaDoDia(lang, resposta.state);
      Overlay.mostrar({
        tipo: 'sucesso',
        icone: 'automatica',
        titulo: textoDaVoz('MIN-06'),
        meta: `${pagina.siglaDoIdioma(idioma)} ${n}/${limite}`,
        frase: texto,
        ...palavraDoAviso(resposta),
        lugar,
        apagada: true,
      });
    }

    function lembrarIdiomaDaLegenda(lang) {
      idiomaDaLegenda = lang;
    }

    return { ligar, atualizarSelo, lembrarIdiomaDaLegenda };
  }

  raiz.MineracaoAutomaticaNaPagina = Object.freeze({ criar, criarEsperaDaLegenda, SILENCIO_DA_LEGENDA_MS });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
