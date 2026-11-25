'use strict';

const { IDIOMAS, textoDaVoz, Atalhos, AjustesDeEnvio, TxtDeFrases } = PerpetualMiner;
const { fonteDaFrase, nomeDaFonte, rotuloDoDia } = PerpetualMiner.Contexto;
const { refletirSelecao, montarTecla } = PerpetualMiner.Veio;
const Shell = PerpetualMiner.Shell;
const Conta = PerpetualMiner.Conta;
const Perigo = PerpetualMiner.Perigo;
const Envio = PerpetualMiner.Envio;
const MinerarFrases = PerpetualMiner.MinerarFrases;
const FrasesCartao = PerpetualMiner.FrasesCartao;
const FrasesAcoes = PerpetualMiner.FrasesAcoes;
const { SITUACOES } = Conta;
const { Sincronizacao, EntradaComGoogle, ChaveDaOpenAI, Historico } = PerpetualMiner;
const { mostrarToastDeSucesso, abrirModal, montarAviso, criar } = PerpetualMiner.Veio;
const { filtrarFrases, foiEnviadaAoAnki, STATUS_ENVIADA_AO_ANKI } = PerpetualMiner.FiltroDasFrases;

const POR_PAGINA = 10;

let atalhoDeLegenda = Atalhos.ATALHOS_PADRAO.legenda;

let todasFrases        = [];
let frasesVisiveis     = [];
let paginaAtual        = 1;
let filtroFonte         = 'all';
let filtroIdioma       = 'all';
let esconderEnviadasEExportadas = false;
let ordemAtual         = 'novas';
let buscaAtual         = '';
let listaCarregada     = false;

let usuarioLogado = null;
let sessao         = null;
let nuvem          = null;
let sincronizacao  = novaSincronizacao();

const keywords    = {};
const selecionadas = new Set();

let modalAberto        = null;

document.addEventListener('DOMContentLoaded', () => {
  setupListeners();
  AjustesDeEnvio.acompanhar(ajustes => {
    PerpetualMiner.Baralhos.usarBaralhos({ en: ajustes.en.deckName, ru: ajustes.ru.deckName });
  });
  Conta.aoPedir({ entrar: loginGoogle, sair: logout, tentarDeNovo: carregarFrasesFirestore });
  setupStorageSyncListener();
  Atalhos.acompanharAtalhos(({ legenda }) => {
    atalhoDeLegenda = legenda;
    if (todasFrases.length === 0) renderizar();
  });
  inicializarAuth();
});

async function inicializarAuth() {
  const data = await chromeGet({ pm_user_info: null });
  const credenciais = await Sincronizacao.lerCredenciais();
  if (data.pm_user_info && credenciais?.uid === data.pm_user_info.uid) {
    usuarioLogado = { ...data.pm_user_info };
    conectarNuvem(credenciais);
    atualizarUIAuth(usuarioLogado);
    sincronizarAChave();
    await carregarFrasesFirestore();
  } else {
    if (data.pm_user_info) await chrome.storage.local.remove('pm_user_info');
    carregarFrasesLocal();
  }
}

async function loginGoogle() {
  Conta.mostrarFalhaNoLogin(null);
  try {
    const { usuario, credenciais } = await EntradaComGoogle.entrar();
    usuarioLogado = usuario;
    await Sincronizacao.guardarCredenciais(credenciais);
    conectarNuvem(credenciais);
    await chrome.storage.local.set({ pm_user_info: { ...usuario } });

    atualizarUIAuth(usuarioLogado);
    sincronizarAChave();

    const { pm_migrated = '' } = await chromeGet({ pm_migrated: '' });
    if (pm_migrated !== usuarioLogado.uid) {
      await migrarParaFirestore();
      chrome.storage.local.set({ pm_migrated: usuarioLogado.uid });
    } else {
      await carregarFrasesFirestore();
    }
  } catch (err) {
    if (EntradaComGoogle.foiCancelado(err)) return;
    console.error('[Login] falhou:', err);
    Conta.mostrarFalhaNoLogin(err.message || String(err));
  }
}

async function logout() {
  if (!usuarioLogado) return;
  usuarioLogado = null;
  desconectarNuvem();
  await Sincronizacao.apagarCredenciais();
  await chrome.storage.local.remove(['pm_firebase_auth', 'pm_user_info']);
  atualizarUIAuth(null);
  carregarFrasesLocal();
}

function atualizarUIAuth(user) {
  Conta.mostrarConta(user);
  Perigo.mostrarConta(Boolean(user));
}

function novaSincronizacao() {
  return Sincronizacao.criarSincronizacao({
    nuvem,
    armazenamento: Sincronizacao.armazenamentoDoChrome(chrome.storage),
    aviso: (mensagem, erro) => console.warn('[Firestore]', mensagem + ':', erro?.message),
  });
}

function conectarNuvem(credenciais) {
  sessao = Sincronizacao.criarSessao({
    credenciais,
    aoRenovar: Sincronizacao.guardarCredenciais,
  });
  nuvem = Sincronizacao.nuvemHttp({ sessao });
  sincronizacao = novaSincronizacao();
}

let sincronizandoAChave = Promise.resolve();
let erroDaChave = null;
let estadoDasFrases = { situacao: SITUACOES.SINCRONIZADO, dados: {} };

function mostrarEstadoDoSync() {
  const { situacao, dados } = estadoDasFrases;
  const situacaoDaChave = erroDaChave ? situacaoDoErro(erroDaChave, SITUACOES.CHAVE_PENDENTE) : null;
  const exigeConta = s => s === SITUACOES.RECUSADO || s === SITUACOES.EXPIROU;
  if (exigeConta(situacaoDaChave) && !exigeConta(situacao)) {
    Conta.mostrarSincronizacao(situacaoDaChave, { detalhes: erroDaChave.message });
  } else if (situacao !== SITUACOES.SINCRONIZADO) {
    Conta.mostrarSincronizacao(situacao, { ...dados,
      detalhes: [dados.detalhes, erroDaChave?.message].filter(Boolean).join('\n'),
    });
  } else if (erroDaChave) {
    Conta.mostrarSincronizacao(situacaoDaChave, { detalhes: erroDaChave.message, codigo: erroDaChave.codigo });
  } else Conta.mostrarSincronizacao(SITUACOES.SINCRONIZADO);
}

function mostrarEstadoDasFrases(situacao, dados = {}) {
  estadoDasFrases = { situacao, dados };
  mostrarEstadoDoSync();
}

function mostrarSincronizado() {
  mostrarEstadoDasFrases(SITUACOES.SINCRONIZADO);
}

function sincronizarAChave() {
  sincronizandoAChave = sincronizandoAChave.then(async () => {
    const estaNuvem = nuvem;
    const estaSessao = sessao;
    if (!estaNuvem || !estaSessao) return;
    try {
      await ChaveDaOpenAI.sincronizar(estaSessao, estaNuvem.uid);
      if (nuvem === estaNuvem) { erroDaChave = null; mostrarEstadoDoSync(); }
    } catch (err) {
      if (nuvem !== estaNuvem) return;
      erroDaChave = Object.assign(new Error(`OpenAI sync · ${err?.status || err?.motivo || 'sem resposta'}`), { motivo: err?.motivo, codigo: err?.codigo });
      mostrarEstadoDoSync();
    }
  });
  return sincronizandoAChave;
}

function desconectarNuvem() {
  erroDaChave = null;
  estadoDasFrases = { situacao: SITUACOES.SINCRONIZADO, dados: {} };
  sessao?.revogar();
  sessao = null;
  nuvem = null;
  sincronizacao = novaSincronizacao();
}

function situacaoDoErro(err, semSincronizar = SITUACOES.SEM_SINCRONIZAR) {
  if (err?.motivo === Sincronizacao.MOTIVO.EXPIROU) return SITUACOES.EXPIROU;
  if (err?.motivo === Sincronizacao.MOTIVO.RECUSADO) return SITUACOES.RECUSADO;
  return semSincronizar;
}

function mostrarFalhaNaNuvem(err, semSincronizar) {
  mostrarEstadoDasFrases(situacaoDoErro(err, semSincronizar), { detalhes: err?.message || String(err) });
}

async function migrarParaFirestore() {
  const { frases = [] } = await chromeGet({ frases: [] });
  if (frases.length > 0) {
    mostrarEstadoDasFrases(SITUACOES.PRIMEIRA_SUBIDA, { n: frases.length });
    try {
      await nuvem.gravarFrases(frases);
      mostrarToastDeSucesso(textoDaVoz('CFG-09.sucesso', { n: frases.length }));
    } catch (err) {
      console.error('[Firestore] migração falhou:', err);
      await carregarFrasesFirestore({ primeiraSubidaFalhou: true });
      return;
    }
  }
  await carregarFrasesFirestore();
}

function carregarFrasesLocal() {
  chrome.storage.local.get({ frases: [] }, (data) => {
    todasFrases = data.frases || [];
    finalizarCarregamento();
  });
}

async function carregarFrasesFirestore({ primeiraSubidaFalhou = false } = {}) {
  const semSincronizar = primeiraSubidaFalhou ? SITUACOES.PRIMEIRA_SUBIDA_FALHOU : SITUACOES.SEM_SINCRONIZAR;
  mostrarEstadoDasFrases(SITUACOES.SINCRONIZANDO);
  await sincronizarAChave();
  try {
    const { frases, desteComputador, falhaNasOrfas } = await sincronizacao.carregar({ atuais: () => todasFrases });
    todasFrases = frases;
    if (falhaNasOrfas) {
      console.error('[Firestore] orphans com falha:', falhaNasOrfas.quantas, falhaNasOrfas.causas[0]?.message);
      mostrarSyncIncompleto(falhaNasOrfas, desteComputador, semSincronizar);
    } else {
      mostrarSincronizado();
    }
    finalizarCarregamento();
  } catch (err) {
    console.error('[Firestore] carregar:', err);
    mostrarFalhaNaNuvem(err, semSincronizar);
    carregarFrasesLocal();
  }
}

function mostrarSyncIncompleto({ quantas, causas }, desteComputador, semSincronizar) {
  const detalhes = [...new Set(causas.map(c => c?.message || String(c)))].join('\n');
  const situacao = situacaoDoErro(causas[0], semSincronizar);
  const naNuvem = desteComputador - quantas;
  if (situacao !== semSincronizar || naNuvem === 0) {
    mostrarEstadoDasFrases(situacao, { detalhes });
    return;
  }
  mostrarEstadoDasFrases(SITUACOES.PARCIAL, { n: naNuvem, total: desteComputador, detalhes });
}

function finalizarCarregamento() {
  Object.keys(keywords).forEach(k => delete keywords[k]);
  todasFrases.forEach(f => { if (f.keywords?.length) keywords[f.id] = f.keywords; });
  atualizarTotal();
  construirFiltroDeFonte();
  listaCarregada = true;
  aplicarFiltro();
  comecarEnvio();
}

function atualizarTotal() {
  Shell.mostrarTotalDeFrases(todasFrases.length);
  Perigo.mostrarFrases(todasFrases);
}

function setupStorageSyncListener() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.frases) return;
    const novasLocais = changes.frases.newValue || [];
    if (!usuarioLogado) {
      todasFrases = novasLocais;
      finalizarCarregamento();
      return;
    }

    const existentes = new Set(todasFrases.map(f => String(f.id)));
    const adicionadas = novasLocais.filter(f => !existentes.has(String(f.id)));
    if (!adicionadas.length) return;
    todasFrases = [...adicionadas, ...todasFrases];
    finalizarCarregamento();
  });
}

function salvarFraseFirestore(frase, campos = null) {
  if (!nuvem) return;
  nuvem.gravarFrase(frase, campos).catch(err => {
    console.error('[Firestore] patch:', frase.id, err.message);
    mostrarFalhaNaNuvem(err);
  });
}

function atualizarContadorSelecao() {
  const linha = document.getElementById('frases-selecao');
  const idsPag = idsPaginaAtual();
  const n = selecionadas.size;
  const naPagina = idsPag.filter(id => selecionadas.has(id)).length;

  linha.hidden = !listaCarregada || (idsPag.length === 0 && n === 0);
  refletirSelecao(document.getElementById('sel-pagina'), naPagina, idsPag.length);
  linha.classList.toggle('frases-selecao--barra', n > 0);
  document.getElementById('sel-pagina-rotulo').classList.toggle('veio-so-leitor', n > 0);
  document.getElementById('frases-barra').hidden = n === 0;
  if (n === 0) return;

  document.getElementById('selection-count').textContent = textoDaVoz('PAI-06', { n });
  const todas = document.getElementById('btn-sel-todas');
  const paginaInteira = idsPag.length > 0 && naPagina === idsPag.length;
  todas.hidden = !paginaInteira || frasesVisiveis.every(f => selecionadas.has(f.id));
  if (!todas.hidden) todas.textContent = textoDaVoz('PAI-32.selecionarTodas', { n: frasesVisiveis.length });
}

function idsPaginaAtual() {
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  return frasesVisiveis.slice(inicio, inicio + POR_PAGINA).map(f => f.id);
}

function selecionarPagina() {
  const ids = idsPaginaAtual();
  const todasMarcadas = ids.every(id => selecionadas.has(id));
  if (todasMarcadas) ids.forEach(id => selecionadas.delete(id));
  else               ids.forEach(id => selecionadas.add(id));
  ids.forEach(FrasesCartao.refletirSelecao);
  atualizarContadorSelecao();
}

function selecionarTodasVisiveis() {
  frasesVisiveis.forEach(f => selecionadas.add(f.id));
  idsPaginaAtual().forEach(FrasesCartao.refletirSelecao);
  atualizarContadorSelecao();
}

function desmarcarTodas() {
  const ids = [...selecionadas];
  selecionadas.clear();
  ids.forEach(FrasesCartao.refletirSelecao);
  atualizarContadorSelecao();
  document.getElementById('sel-pagina').focus();
}

function idsSelecionados() {
  return todasFrases.filter(f => selecionadas.has(f.id)).map(f => f.id);
}

function setupListeners() {
  Perigo.aoApagarTudo(FrasesAcoes.apagarTudo);
  ChaveDaOpenAI.aoMudar(() => { if (nuvem) carregarFrasesFirestore(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizarAChave();
  });
  document.getElementById('btn-export').addEventListener('click', FrasesAcoes.exportarTxt);
  document.getElementById('btn-bulk-edit').addEventListener('click', () => FrasesAcoes.abrirEditarContexto(idsSelecionados()));
  document.getElementById('btn-delete-selected').addEventListener('click', () => FrasesAcoes.pedirParaApagar(idsSelecionados()));
  document.getElementById('sel-pagina').addEventListener('change', selecionarPagina);
  document.getElementById('btn-sel-todas').addEventListener('click', selecionarTodasVisiveis);
  document.getElementById('btn-desmarcar-todas').addEventListener('click', desmarcarTodas);
  ligarOsModulosDeFrases();

  configurarModaisDeFrases();

  configurarFiltros();

  document.getElementById('btn-first').addEventListener('click', () => irPagina(1));
  document.getElementById('btn-prev').addEventListener('click',  () => irPagina(paginaAtual - 1));
  document.getElementById('btn-next').addEventListener('click',  () => irPagina(paginaAtual + 1));
  document.getElementById('btn-last').addEventListener('click',  () => irPagina(totalPaginas()));

  const lista = document.getElementById('frases-lista');
  lista.addEventListener('click', (e) => {
    const btnCopy     = e.target.closest('[data-action="copy"]');
    const btnDel      = e.target.closest('[data-action="delete"]');
    const btnEdit     = e.target.closest('[data-action="edit"]');
    const btnEditText = e.target.closest('[data-action="edit-text"]');
    const btnTexto    = e.target.closest('[data-action="salvar-texto"], [data-action="cancelar-texto"]');
    const btnClear    = e.target.closest('[data-action="clear-kw"]');
    const btnAddSep   = e.target.closest('[data-action="add-sep"]');
    const palavraEl   = e.target.closest('.veio-palavra-clicavel');
    if (btnCopy)     { copiarFrase(btnCopy.dataset.id);                         return; }
    if (btnDel)      { FrasesAcoes.pedirParaApagar([Number(btnDel.dataset.id)]); return; }
    if (btnEdit)     { FrasesAcoes.abrirEditarContexto([Number(btnEdit.dataset.id)]); return; }
    if (btnTexto)    { FrasesCartao.terminarEdicaoDeTexto(btnTexto.dataset.action === 'salvar-texto'); return; }
    if (btnEditText) { FrasesCartao.editarTextoFrase(Number(btnEditText.dataset.id));        return; }
    if (btnClear)    { FrasesCartao.clearKeywords(Number(btnClear.dataset.id));              return; }
    if (btnAddSep)   { FrasesCartao.addSeparator(Number(btnAddSep.dataset.id));             return; }
    if (palavraEl)   { FrasesCartao.escolherPalavra(palavraEl);                              return; }
  });
  lista.addEventListener('keydown', FrasesCartao.aoTeclarNaFrase);
  lista.addEventListener('keydown', FrasesCartao.aoTeclarNaEdicaoDeTexto);
  lista.addEventListener('input', FrasesCartao.aoDigitarNaEdicao);

  lista.addEventListener('change', (e) => {
    const chk = e.target.closest('.frase-check');
    if (!chk) return;
    const id = Number(chk.dataset.id);
    if (chk.checked) selecionadas.add(id);
    else             selecionadas.delete(id);
    FrasesCartao.refletirSelecao(id);
    atualizarContadorSelecao();
  });

}

function ligarOsModulosDeFrases() {
  FrasesCartao.iniciar({
    frases: () => todasFrases,
    keywords,
    selecionadas,
    editarFrase,
    salvarNaNuvem: salvarFraseFirestore,
    aplicarFiltro,
  });
  FrasesAcoes.iniciar({
    frases: () => todasFrases,
    trocarFrases: novas => { todasFrases = novas; },
    keywords,
    selecionadas,
    usuarioLogado: () => usuarioLogado,
    nuvem: () => nuvem,
    sincronizacao: () => sincronizacao,
    erroDaChave: () => erroDaChave,
    abrirModal: abrirModalDeFrases,
    fecharModal: () => modalAberto.fechar(),
    avisar: mostrarAvisoNaArea,
    tirarAviso: tirarAvisoDaArea,
    falhaNaNuvem: mostrarFalhaNaNuvem,
    sincronizado: mostrarSincronizado,
    sincronizarAChave,
    atualizarTotal,
    aplicarFiltro,
    atualizarContadorSelecao,
    construirFiltroDeFonte,
    voltarAPrimeiraPagina,
    editarFrase,
    salvarNaNuvem: salvarFraseFirestore,
  });
  MinerarFrases.iniciar({
    frases: () => todasFrases,
    sincronizacao: () => sincronizacao,
    abrirModal: abrirModalDeFrases,
    avisar: mostrarAvisoNaArea,
    tirarAviso: tirarAvisoDaArea,
    falhaNaNuvem: mostrarFalhaNaNuvem,
    sincronizado: mostrarSincronizado,
  });
}

function fontesDoHistorico() {
  return [...new Set(todasFrases.map(fonteDaFrase).filter(Boolean))];
}

function construirFiltroDeFonte() {
  const select = document.getElementById('filtro-fonte');
  const fontes = fontesDoHistorico();
  if (filtroFonte !== 'all' && !fontes.includes(filtroFonte)) filtroFonte = 'all';
  select.replaceChildren(
    new Option(textoDaVoz('PAI-10.todasAsFontes'), 'all'),
    ...fontes.map(fonte => new Option(nomeDaFonte(fonte), fonte)));
  select.value = filtroFonte;
}

function configurarFiltros() {
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
    if (limpaSelecao) selecionadas.clear();
    voltarAPrimeiraPagina();
  };
  fonte.addEventListener('change',   aoMudar(() => { filtroFonte = fonte.value; }));
  idioma.addEventListener('change',  aoMudar(() => { filtroIdioma = idioma.value; }));
  ordem.addEventListener('change',   aoMudar(() => { ordemAtual = ordem.value; }, { limpaSelecao: false }));
  ocultar.addEventListener('change', aoMudar(() => { esconderEnviadasEExportadas = ocultar.checked; }));
  busca.addEventListener('input',    aoMudar(() => { buscaAtual = busca.value; mostrarLimparBusca(); }));
  document.getElementById('btn-limpar-busca').addEventListener('click', limparBusca);
}

function mostrarLimparBusca() {
  document.getElementById('btn-limpar-busca').hidden = !buscaAtual;
}

function filtrosLigados() {
  return filtroFonte !== 'all' || filtroIdioma !== 'all' || esconderEnviadasEExportadas;
}

function limparFiltros() {
  filtroFonte = 'all';
  filtroIdioma = 'all';
  esconderEnviadasEExportadas = false;
  document.getElementById('filtro-fonte').value = 'all';
  document.getElementById('filtro-idioma').value = 'all';
  document.getElementById('filtro-ocultar').checked = false;
  selecionadas.clear();
  voltarAPrimeiraPagina();
}

function limparBusca() {
  buscaAtual = '';
  const busca = document.getElementById('busca-frases');
  busca.value = '';
  mostrarLimparBusca();
  selecionadas.clear();
  voltarAPrimeiraPagina();
  busca.focus();
}

function voltarAPrimeiraPagina() {
  paginaAtual = 1;
  aplicarFiltro();
}

function aplicarFiltro() {
  frasesVisiveis = filtrarFrases(todasFrases, {
    fonte: filtroFonte, idioma: filtroIdioma, esconderEnviadasEExportadas, busca: buscaAtual, ordem: ordemAtual,
  });
  renderizar();
}

function totalPaginas() {
  return Math.max(1, Math.ceil(frasesVisiveis.length / POR_PAGINA));
}

function irPagina(p) {
  paginaAtual = Math.max(1, Math.min(p, totalPaginas()));
  renderizar();
}

function renderizar() {
  if (!listaCarregada) return;
  const lista  = document.getElementById('frases-lista');
  const totPag = totalPaginas();
  if (paginaAtual > totPag) paginaAtual = totPag;

  const total  = frasesVisiveis.length;
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const fim    = Math.min(inicio + POR_PAGINA, total);
  const pagina = frasesVisiveis.slice(inicio, fim);

  lista.removeAttribute('aria-busy');
  renderizarPaginacao(inicio, fim, total, totPag);

  if (total === 0) {
    lista.replaceChildren(montarVazio());
    atualizarContadorSelecao();
    return;
  }

  const foco = FrasesCartao.chaveDoFoco(document.activeElement);
  const nos = [];
  let diaAnterior = null;
  for (const f of pagina) {
    const dia = rotuloDoDia(f.data);
    if (dia && dia !== diaAnterior) nos.push(criar('div', 'veio-cabecalho-de-data', dia));
    diaAnterior = dia;
    nos.push(FrasesCartao.montarCartao(f));
  }
  lista.replaceChildren(...nos);
  FrasesCartao.restaurarFoco(foco);
  atualizarContadorSelecao();
}

function renderizarPaginacao(inicio, fim, total, totPag) {
  document.getElementById('frases-paginas').hidden = total === 0;
  if (total === 0) return;
  document.getElementById('paginas-intervalo').textContent =
    textoDaVoz('PAI-07', { inicio: inicio + 1, fim, total });
  document.getElementById('paginas-atual').textContent =
    textoDaVoz('PAI-26.pagina', { atual: paginaAtual, total: totPag });
  document.getElementById('btn-first').disabled = paginaAtual === 1;
  document.getElementById('btn-prev').disabled  = paginaAtual === 1;
  document.getElementById('btn-next').disabled  = paginaAtual >= totPag;
  document.getElementById('btn-last').disabled  = paginaAtual >= totPag;
}

function montarVazio() {
  const vazio = criar('div', 'veio-vazio');
  const acoes = criar('div', 'frases-vazio__acoes');

  if (todasFrases.length === 0) {
    const texto = criar('p', 'veio-vazio__texto');
    const MARCA = '\u0000';
    const [antes, depois] = textoDaVoz('PAI-02.texto', { atalho: MARCA }).split(MARCA);
    texto.append(antes, ...atalhoDoVazio(), depois);
    acoes.append(botaoDoVazio(textoDaVoz('PAI-02.acao'), () => MinerarFrases.abrir('colar'), 'veio-botao--primario'));
    vazio.append(criar('p', 'veio-vazio__titulo', textoDaVoz('PAI-02.titulo')), texto);
  } else if (buscaAtual.trim()) {
    vazio.append(criar('p', 'veio-vazio__titulo', textoDaVoz('PAI-04.texto', { termo: buscaAtual.trim() })));
    acoes.append(botaoDoVazio(textoDaVoz('PAI-04.acao'), limparBusca));
    if (filtrosLigados()) acoes.append(botaoDoVazio(textoDaVoz('PAI-03.acao'), limparFiltros));
  } else {
    vazio.append(criar('p', 'veio-vazio__titulo', textoDaVoz('PAI-03.texto')));
    acoes.append(botaoDoVazio(textoDaVoz('PAI-03.acao'), limparFiltros));
  }

  vazio.append(acoes);
  return vazio;
}

function atalhoDoVazio() {
  const tecla = montarTecla(Atalhos.rotuloDoAtalho(atalhoDeLegenda), { seVazia: textoDaVoz('GLB-02.semAtalho') });
  if (atalhoDeLegenda) return [tecla];
  const definir = criar('a', 'frases-vazio__definir-atalho', textoDaVoz('GLB-02.definir'));
  definir.href = '#configuracoes/atalhos';
  return [tecla, ' ', definir];
}

function botaoDoVazio(rotulo, aoClicar, variante = 'veio-botao--contorno') {
  const botao = criar('button', `veio-botao ${variante}`, rotulo);
  botao.type = 'button';
  botao.addEventListener('click', aoClicar);
  return botao;
}

function editarFrase(idx, campos) {
  todasFrases[idx] = { ...todasFrases[idx], ...campos };
  return Historico.editar(todasFrases[idx].id, campos);
}

async function copiarFrase(id) {
  const frase = todasFrases.find(f => String(f.id) === String(id));
  if (!frase) return;
  try {
    await navigator.clipboard.writeText(frase.texto);
    mostrarToastDeSucesso(textoDaVoz('PAI-17.sucesso'));
  } catch (err) {
    mostrarAvisoNaArea('copiar', { texto: textoDaVoz('PAI-17.falha'), erro: err });
  }
}

function mostrarAvisoNaArea(chave, { erro, ...opcoes }) {
  tirarAvisoDaArea(chave);
  const aviso = montarAviso({
    ...opcoes,
    ...(erro ? { detalhes: String(erro.message || erro) } : {}),
    rotuloDeFechar: textoDaVoz('PAI-34'),
  });
  aviso.dataset.aviso = chave;
  document.getElementById('frases-avisos').append(aviso);
}

function tirarAvisoDaArea(chave) {
  document.querySelector(`#frases-avisos [data-aviso="${chave}"]`)?.remove();
}

function comecarEnvio() {
  Envio.usar({
    selecionadas: () => todasFrases.filter(f => selecionadas.has(f.id)),
    frasesPorId: ids => {
      const pedidas = new Set(ids.map(Number));
      return todasFrases.filter(f => pedidas.has(Number(f.id)));
    },
    linha: linhaParaOAnki,
    apagar: ids => FrasesAcoes.apagarFrases(ids, { toast: false }),
    marcarComoEnviadas,
  });
}

async function marcarComoEnviadas(ids) {
  const marcar = new Set(ids.map(Number));
  const marcadas = [];
  todasFrases = todasFrases.map(frase => {
    if (!marcar.has(Number(frase.id)) || foiEnviadaAoAnki(frase)) return frase;
    const atualizada = { ...frase, status: STATUS_ENVIADA_AO_ANKI };
    marcadas.push(atualizada);
    return atualizada;
  });
  if (marcadas.length === 0) return;
  await Historico.marcarEnviadas(marcadas.map(f => f.id));
  if (nuvem) nuvem.gravarFrases(marcadas).catch(err => mostrarFalhaNaNuvem(err));
  aplicarFiltro();
}

function configurarModaisDeFrases() {
  for (const botao of document.querySelectorAll('[data-fechar-modal]')) {
    botao.addEventListener('click', () => modalAberto?.fechar());
  }
}

function abrirModalDeFrases(id, aoFechar) {
  modalAberto = abrirModal(document.getElementById(id), {
    aoFechar: () => { modalAberto = null; aoFechar(); },
  });
  return modalAberto;
}

function linhaParaOAnki(frase) {
  return TxtDeFrases.escreverParaOAnki(frase, keywords[frase.id]);
}

function chromeGet(defaults) {
  return new Promise(resolve => chrome.storage.local.get(defaults, resolve));
}
