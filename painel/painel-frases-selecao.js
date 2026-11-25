'use strict';

(function (raiz) {
  const { textoDaVoz, FrasesCartao, FrasesAcoes } = raiz;
  const { refletirSelecao } = raiz.Veio;

  let painel = null;
  let selecionadas = null;

  function iniciar(ligacao) {
    painel = ligacao;
    selecionadas = ligacao.selecionadas;
    document.getElementById('btn-bulk-edit').addEventListener('click', () => FrasesAcoes.abrirEditarContexto(idsSelecionados()));
    document.getElementById('btn-delete-selected').addEventListener('click', () => FrasesAcoes.pedirParaApagar(idsSelecionados()));
    document.getElementById('sel-pagina').addEventListener('change', selecionarPagina);
    document.getElementById('btn-sel-todas').addEventListener('click', selecionarTodasVisiveis);
    document.getElementById('btn-desmarcar-todas').addEventListener('click', desmarcarTodas);
    document.getElementById('frases-lista').addEventListener('change', aoMarcarUmaFrase);
  }

  function atualizarContador() {
    const linha = document.getElementById('frases-selecao');
    const idsPag = painel.idsDaPagina();
    const n = selecionadas.size;
    const naPagina = idsPag.filter(id => selecionadas.has(id)).length;

    linha.hidden = !painel.listaCarregada() || (idsPag.length === 0 && n === 0);
    refletirSelecao(document.getElementById('sel-pagina'), naPagina, idsPag.length);
    linha.classList.toggle('frases-selecao--barra', n > 0);
    document.getElementById('sel-pagina-rotulo').classList.toggle('veio-so-leitor', n > 0);
    document.getElementById('frases-barra').hidden = n === 0;
    if (n === 0) return;

    document.getElementById('selection-count').textContent = textoDaVoz('PAI-06', { n });
    const todas = document.getElementById('btn-sel-todas');
    const paginaInteira = idsPag.length > 0 && naPagina === idsPag.length;
    todas.hidden = !paginaInteira || painel.frasesVisiveis().every(f => selecionadas.has(f.id));
    if (!todas.hidden) todas.textContent = textoDaVoz('PAI-32.selecionarTodas', { n: painel.frasesVisiveis().length });
  }

  function selecionarPagina() {
    const ids = painel.idsDaPagina();
    const todasMarcadas = ids.every(id => selecionadas.has(id));
    if (todasMarcadas) ids.forEach(id => selecionadas.delete(id));
    else               ids.forEach(id => selecionadas.add(id));
    ids.forEach(FrasesCartao.refletirSelecao);
    atualizarContador();
  }

  function selecionarTodasVisiveis() {
    painel.frasesVisiveis().forEach(f => selecionadas.add(f.id));
    painel.idsDaPagina().forEach(FrasesCartao.refletirSelecao);
    atualizarContador();
  }

  function desmarcarTodas() {
    const ids = [...selecionadas];
    selecionadas.clear();
    ids.forEach(FrasesCartao.refletirSelecao);
    atualizarContador();
    document.getElementById('sel-pagina').focus();
  }

  function idsSelecionados() {
    return painel.frases().filter(f => selecionadas.has(f.id)).map(f => f.id);
  }

  function aoMarcarUmaFrase(e) {
    const chk = e.target.closest('.frase-check');
    if (!chk) return;
    const id = Number(chk.dataset.id);
    if (chk.checked) selecionadas.add(id);
    else             selecionadas.delete(id);
    FrasesCartao.refletirSelecao(id);
    atualizarContador();
  }

  raiz.FrasesSelecao = { iniciar, atualizarContador };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
