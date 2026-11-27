'use strict';

(function (raiz) {
  const { textoDaVoz, Envio, Historico, ChaveDaOpenAI } = raiz;
  const { mostrarToastDeSucesso, montarAviso } = raiz.Veio;

  const ERROS_DA_CHAVE = new Map([
    ['outdated_connection', { texto: 'CFG-35.erroConexaoAntiga', rotulo: 'CFG-35.erroAtualizar', usar: () => raiz.CartaoDaIA.baixarConexao() }],
    ['other_account_owner', { texto: 'CFG-35.erroOutraConta', rotulo: 'CFG-35.erroTrocar', usar: () => raiz.CartaoDaIA.trocarChave() }],
  ]);
  const ERRO_DA_CHAVE_SEM_CODIGO = { texto: 'CFG-17.chaveNaoApagada', rotulo: 'CFG-35.erroTentarDeNovo', usar: () => apagarChaveNoApagarTudo() };

  let painel = null;
  let keywords = null;
  let selecionadas = null;
  let pedidoDeApagar = null;
  let edicaoDeContexto = null;
  let avisoDaChaveNoApagarTudo = null;
  const idsAindaNaNuvem = new Set();

  function iniciar(ligacao) {
    painel = ligacao;
    keywords = ligacao.keywords;
    selecionadas = ligacao.selecionadas;
    document.getElementById('btn-apagar-confirmar').addEventListener('click', confirmarApagar);
    document.getElementById('form-contexto').addEventListener('submit', (e) => {
      e.preventDefault();
      salvarContexto();
    });
  }

  function pedirParaApagar(ids) {
    if (ids.length === 0) return;
    const umaFrase = ids.length === 1;
    const estado = umaFrase ? 'PAI-12' : 'PAI-13';
    const valores = { n: ids.length };
    document.getElementById('modal-apagar-titulo').textContent = textoDaVoz(`${estado}.titulo`, valores);
    document.getElementById('modal-apagar-corpo').textContent =
      textoDaVoz(`${estado}.${painel.usuarioLogado() ? 'corpo' : 'corpoSemConta'}`);
    document.getElementById('btn-apagar-cancelar').textContent = textoDaVoz(`${estado}.cancelar`);
    document.getElementById('btn-apagar-confirmar').textContent = textoDaVoz(`${estado}.confirmar`, valores);
    painel.abrirModal('modal-apagar', () => { pedidoDeApagar = null; });
    pedidoDeApagar = { ids };
  }

  function confirmarApagar() {
    if (!pedidoDeApagar) return;
    const { ids } = pedidoDeApagar;
    painel.fecharModal();
    apagarFrases(ids);
  }

  async function apagarFrases(ids, { toast = ids.length > 1 } = {}) {
    const apagadas = new Set(ids);
    painel.trocarFrases(painel.frases().filter(f => !apagadas.has(f.id)));
    ids.forEach(id => { delete keywords[id]; selecionadas.delete(id); });
    raiz.FrasesCartao.esquecerEdicaoDe(apagadas);
    await Historico.apagar(ids);
    painel.atualizarTotal();
    painel.aplicarFiltro();
    if (toast) mostrarToastDeSucesso(textoDaVoz('PAI-14', { n: ids.length }));
    await apagarDaNuvem(ids);
  }

  async function apagarDaNuvem(ids) {
    const erro = await painel.sincronizacao().apagar(ids);
    if (!erro) return;
    ids.forEach(id => idsAindaNaNuvem.add(id));
    mostrarAvisoAindaNaNuvem(erro);
    painel.falhaNaNuvem(erro);
  }

  function mostrarAvisoAindaNaNuvem(erro) {
    painel.avisar('ainda-na-nuvem', {
      texto: textoDaVoz('PAI-15.aviso'),
      acao: { rotulo: textoDaVoz('PAI-15.tentarDeNovo'), aoUsar: tentarApagarDaNuvemDeNovo },
      erro,
      aoFechar: () => idsAindaNaNuvem.clear(),
    });
  }

  async function tentarApagarDaNuvemDeNovo() {
    const ids = [...idsAindaNaNuvem];
    const erro = await painel.sincronizacao().apagar(ids);
    if (erro) {
      mostrarAvisoAindaNaNuvem(erro);
      painel.falhaNaNuvem(erro);
      return;
    }
    idsAindaNaNuvem.clear();
    painel.tirarAviso('ainda-na-nuvem');
    painel.sincronizado();
  }

  function avisoDoErroDaChave(erro) {
    const { texto, rotulo, usar } = ERROS_DA_CHAVE.get(erro?.codigo) || ERRO_DA_CHAVE_SEM_CODIGO;
    return montarAviso({
      texto: textoDaVoz(texto),
      acao: { rotulo: textoDaVoz(rotulo), aoUsar: usar },
      detalhes: erro?.codigo || erro?.name || 'storage_error', fechavel: false,
    });
  }

  async function apagarChaveNoApagarTudo() {
    try {
      await ChaveDaOpenAI.apagar();
      await painel.sincronizarAChave();
      avisoDaChaveNoApagarTudo?.remove();
      avisoDaChaveNoApagarTudo = null;
      return !painel.erroDaChave();
    } catch (erro) {
      avisoDaChaveNoApagarTudo?.remove();
      avisoDaChaveNoApagarTudo = avisoDoErroDaChave(erro);
      document.getElementById('cfg-perigo-corpo').append(avisoDaChaveNoApagarTudo);
      return false;
    }
  }

  function apagarTudo({ ids, em }) {
    painel.trocarFrases(painel.frases().filter(f => !ids.includes(f.id)));
    ids.forEach(id => delete keywords[id]);
    selecionadas.clear();
    painel.atualizarContadorSelecao();
    const chaveApagada = apagarChaveNoApagarTudo();
    Envio.apagarTudo();
    const naNuvem = painel.sincronizacao().apagarTudo(ids, em).then(({ ok, erro }) => {
      if (!ok) {
        console.error('[Firestore] apagar tudo falhou:', erro);
        painel.falhaNaNuvem(erro);
      }
      return ok;
    });
    Historico.apagar(ids).then(async () => {
      painel.atualizarTotal();
      painel.voltarAPrimeiraPagina();
      const [frasesApagadas, apagouChave] = await Promise.all([naNuvem, chaveApagada]);
      if (frasesApagadas && apagouChave) mostrarToastDeSucesso(textoDaVoz('CFG-18'));
    });
  }

  function textosDoModalDeContexto(ids, umaFrase) {
    if (!umaFrase) return { titulo: textoDaVoz('PAI-20.variasFrases', { n: ids.length }), subtitulo: textoDaVoz('PAI-20.ajuda') };
    return { titulo: textoDaVoz('PAI-20.umaFrase'), subtitulo: umaFrase.texto };
  }

  const fonteGravada = frase => frase.contexto?.fonte || frase.streaming || '';

  function camposDoContextoDe(umaFrase) {
    if (!umaFrase) return { fonte: '', titulo: '', detalhe: '' };
    return { fonte: fonteGravada(umaFrase), titulo: umaFrase.contexto?.titulo || '', detalhe: umaFrase.contexto?.detalhe || '' };
  }

  function preencherOModalDeContexto(ids, umaFrase) {
    const { titulo, subtitulo } = textosDoModalDeContexto(ids, umaFrase);
    document.getElementById('modal-contexto-titulo').textContent = titulo;
    document.getElementById('modal-contexto-subtitulo').textContent = subtitulo;
    const campos = camposDoContextoDe(umaFrase);
    document.getElementById('modal-fonte').value   = campos.fonte;
    document.getElementById('modal-titulo').value  = campos.titulo;
    document.getElementById('modal-detalhe').value = campos.detalhe;
  }

  function abrirEditarContexto(ids) {
    if (ids.length === 0) return;
    preencherOModalDeContexto(ids, ids.length === 1 ? painel.frases().find(f => f.id === ids[0]) : null);
    painel.abrirModal('modal-contexto', () => { edicaoDeContexto = null; });
    edicaoDeContexto = { ids };
    document.getElementById('modal-fonte').focus();
  }

  function salvarContexto() {
    if (!edicaoDeContexto) return;
    const { ids } = edicaoDeContexto;
    const contexto = {
      fonte:   document.getElementById('modal-fonte').value.trim(),
      titulo:  document.getElementById('modal-titulo').value.trim(),
      detalhe: document.getElementById('modal-detalhe').value.trim(),
    };
    painel.fecharModal();
    if (ids.length === 1) salvarContextoDeUmaFrase(ids[0], contexto);
    else                  salvarContextoDeVarias(ids, contexto);
  }

  function salvarContextoDeVarias(ids, { fonte, titulo, detalhe }) {
    const alvo = new Set(ids);
    const preenchidos = Object.fromEntries(Object.entries({ fonte, titulo, detalhe }).filter(([, v]) => v));
    const edicoes = new Map();
    painel.trocarFrases(painel.frases().map(f => {
      if (!alvo.has(f.id)) return f;
      const contexto = { ...(f.contexto || { fonte: f.streaming || '', titulo: '', detalhe: '' }), ...preenchidos };
      edicoes.set(f.id, { ...(fonte ? { streaming: fonte } : {}), contexto });
      return { ...f, ...edicoes.get(f.id) };
    }));
    const editadas = painel.frases().filter(f => edicoes.has(f.id));
    Historico.editarVarias(edicoes).then(() => {
      painel.construirFiltroDeFonte();
      painel.aplicarFiltro();
      mostrarToastDeSucesso(textoDaVoz('PAI-22', { n: editadas.length }));
    });
    subirContextoParaANuvem(editadas);
  }

  function subirContextoParaANuvem(editadas) {
    if (!painel.nuvem() || editadas.length === 0) return;
    Promise.allSettled(editadas.map(f => painel.nuvem().gravarFrase(f))).then(resultados => {
      const falhas = resultados.filter(r => r.status === 'rejected');
      if (falhas.length > 0) painel.falhaNaNuvem(falhas[0].reason);
    });
  }

  function salvarContextoDeUmaFrase(id, { fonte, titulo, detalhe }) {
    const idx = painel.frases().findIndex(f => f.id === id);
    if (idx < 0) return;
    const f = painel.frases()[idx];
    const novaFonte = fonte || fonteGravada(f);
    painel.editarFrase(idx, { streaming: novaFonte, contexto: { fonte: novaFonte, titulo, detalhe } }).then(() => {
      painel.construirFiltroDeFonte();
      painel.aplicarFiltro();
    });
    painel.salvarNaNuvem(painel.frases()[idx]);
  }

  raiz.FrasesAcoes = { iniciar, pedirParaApagar, apagarFrases, apagarTudo, abrirEditarContexto };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
