'use strict';

(function (raiz) {
  const { IDIOMAS, textoDaVoz } = raiz;
  const { fonteDaFrase, nomeDaFonte } = raiz.Contexto;

  const criterio = { fonte: 'all', idioma: 'all', esconderEnviadas: false, busca: '', ordem: 'novas' };

  let painel = null;

  function iniciar(ligacao) {
    painel = ligacao;
    configurar();
  }

  function fontesDoHistorico() {
    return [...new Set(painel.frases().map(fonteDaFrase).filter(Boolean))];
  }

  function construirFiltroDeFonte() {
    const select = document.getElementById('filtro-fonte');
    const fontes = fontesDoHistorico();
    if (criterio.fonte !== 'all' && !fontes.includes(criterio.fonte)) criterio.fonte = 'all';
    select.replaceChildren(
      new Option(textoDaVoz('PAI-10.todasAsFontes'), 'all'),
      ...fontes.map(fonte => new Option(nomeDaFonte(fonte), fonte)));
    select.value = criterio.fonte;
  }

  function configurar() {
    const fonte   = document.getElementById('filtro-fonte');
    const idioma  = document.getElementById('filtro-idioma');
    const ordem   = document.getElementById('filtro-ordem');
    const busca   = document.getElementById('busca-frases');
    const ocultar = document.getElementById('filtro-ocultar');

    idioma.replaceChildren(
      new Option(textoDaVoz('PAI-10.todosOsIdiomas'), 'all'),
      ...Object.values(IDIOMAS).map(i => new Option(textoDaVoz('PAI-10.idioma', { idioma: i }), i)));
    construirFiltroDeFonte();
    busca.placeholder = textoDaVoz('PAI-23');

    const aoMudar = (aplicar, { limpaSelecao = true } = {}) => () => {
      aplicar();
      if (limpaSelecao) painel.selecionadas.clear();
      painel.voltarAPrimeiraPagina();
    };
    fonte.addEventListener('change',   aoMudar(() => { criterio.fonte = fonte.value; }));
    idioma.addEventListener('change',  aoMudar(() => { criterio.idioma = idioma.value; }));
    ordem.addEventListener('change',   aoMudar(() => { criterio.ordem = ordem.value; }, { limpaSelecao: false }));
    ocultar.addEventListener('change', aoMudar(() => { criterio.esconderEnviadas = ocultar.checked; }));
    busca.addEventListener('input',    aoMudar(() => { criterio.busca = busca.value; mostrarLimparBusca(); }));
    document.getElementById('btn-limpar-busca').addEventListener('click', limparBusca);
  }

  function mostrarLimparBusca() {
    document.getElementById('btn-limpar-busca').hidden = !criterio.busca;
  }

  function ligados() {
    return criterio.fonte !== 'all' || criterio.idioma !== 'all' || criterio.esconderEnviadas;
  }

  function limpar() {
    criterio.fonte = 'all';
    criterio.idioma = 'all';
    criterio.esconderEnviadas = false;
    document.getElementById('filtro-fonte').value = 'all';
    document.getElementById('filtro-idioma').value = 'all';
    document.getElementById('filtro-ocultar').checked = false;
    painel.selecionadas.clear();
    painel.voltarAPrimeiraPagina();
  }

  function limparBusca() {
    criterio.busca = '';
    const busca = document.getElementById('busca-frases');
    busca.value = '';
    mostrarLimparBusca();
    painel.selecionadas.clear();
    painel.voltarAPrimeiraPagina();
    busca.focus();
  }

  raiz.FrasesFiltros = { iniciar, criterio, construirFiltroDeFonte, ligados, limpar, limparBusca };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
