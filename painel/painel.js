'use strict';

const { textoDaVoz, Atalhos, AjustesDeEnvio, TxtDeFrases } = PerpetualMiner;
const { rotuloDoDia } = PerpetualMiner.Contexto;
const { montarTecla } = PerpetualMiner.Veio;
const Shell = PerpetualMiner.Shell;
const Conta = PerpetualMiner.Conta;
const Perigo = PerpetualMiner.Perigo;
const Envio = PerpetualMiner.Envio;
const MinerarFrases = PerpetualMiner.MinerarFrases;
const FrasesCartao = PerpetualMiner.FrasesCartao;
const FrasesAcoes = PerpetualMiner.FrasesAcoes;
const FrasesNuvem = PerpetualMiner.FrasesNuvem;
const FrasesSelecao = PerpetualMiner.FrasesSelecao;
const FrasesFiltros = PerpetualMiner.FrasesFiltros;
const { Sincronizacao, EntradaComGoogle, Historico } = PerpetualMiner;
const { mostrarToastDeSucesso, abrirModal, montarAviso, criar } = PerpetualMiner.Veio;
const { filtrarFrases, foiEnviadaAoAnki, STATUS_ENVIADA_AO_ANKI } = PerpetualMiner.FiltroDasFrases;

const POR_PAGINA = 10;

let atalhoDeLegenda = Atalhos.ATALHOS_PADRAO.legenda;

let todasFrases        = [];
let frasesVisiveis     = [];
let paginaAtual        = 1;
let listaCarregada     = false;

let usuarioLogado = null;

const keywords    = {};
const selecionadas = new Set();

let modalAberto        = null;

const ACOES_DA_LISTA = [
  { seletor: '[data-action="copy"]', fazer: alvo => copiarFrase(alvo.dataset.id) },
  { seletor: '[data-action="delete"]', fazer: alvo => FrasesAcoes.pedirParaApagar([Number(alvo.dataset.id)]) },
  { seletor: '[data-action="edit"]', fazer: alvo => FrasesAcoes.abrirEditarContexto([Number(alvo.dataset.id)]) },
  { seletor: '[data-action="salvar-texto"], [data-action="cancelar-texto"]', fazer: alvo => FrasesCartao.terminarEdicaoDeTexto(alvo.dataset.action === 'salvar-texto') },
  { seletor: '[data-action="edit-text"]', fazer: alvo => FrasesCartao.editarTextoFrase(Number(alvo.dataset.id)) },
  { seletor: '[data-action="clear-kw"]', fazer: alvo => FrasesCartao.clearKeywords(Number(alvo.dataset.id)) },
  { seletor: '[data-action="add-sep"]', fazer: alvo => FrasesCartao.addSeparator(Number(alvo.dataset.id)) },
  { seletor: '.veio-palavra-clicavel', fazer: alvo => FrasesCartao.escolherPalavra(alvo) },
];

document.addEventListener('DOMContentLoaded', () => {
  setupListeners();
  AjustesDeEnvio.acompanhar(ajustes => {
    PerpetualMiner.Baralhos.usarBaralhos({ en: ajustes.en.deckName, ru: ajustes.ru.deckName });
  });
  Conta.aoPedir({ entrar: loginGoogle, sair: logout, tentarDeNovo: FrasesNuvem.carregarDaNuvem });
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
    FrasesNuvem.conectar(credenciais);
    atualizarUIAuth(usuarioLogado);
    FrasesNuvem.sincronizarAChave();
    await FrasesNuvem.carregarDaNuvem();
  } else {
    if (data.pm_user_info) await chrome.storage.local.remove('pm_user_info');
    FrasesNuvem.carregarLocal();
  }
}

async function loginGoogle() {
  Conta.mostrarFalhaNoLogin(null);
  try {
    const { usuario, credenciais } = await EntradaComGoogle.entrar();
    usuarioLogado = usuario;
    await Sincronizacao.guardarCredenciais(credenciais);
    FrasesNuvem.conectar(credenciais);
    await chrome.storage.local.set({ pm_user_info: { ...usuario } });

    atualizarUIAuth(usuarioLogado);
    FrasesNuvem.sincronizarAChave();

    const { pm_migrated = '' } = await chromeGet({ pm_migrated: '' });
    if (pm_migrated !== usuarioLogado.uid) {
      await FrasesNuvem.migrar();
      chrome.storage.local.set({ pm_migrated: usuarioLogado.uid });
    } else {
      await FrasesNuvem.carregarDaNuvem();
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
  FrasesNuvem.desconectar();
  await Sincronizacao.apagarCredenciais();
  await chrome.storage.local.remove(['pm_firebase_auth', 'pm_user_info']);
  atualizarUIAuth(null);
  FrasesNuvem.carregarLocal();
}

function atualizarUIAuth(user) {
  Conta.mostrarConta(user);
  Perigo.mostrarConta(Boolean(user));
}

function finalizarCarregamento() {
  Object.keys(keywords).forEach(k => delete keywords[k]);
  todasFrases.forEach(f => { if (f.keywords?.length) keywords[f.id] = f.keywords; });
  atualizarTotal();
  FrasesFiltros.construirFiltroDeFonte();
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

function idsPaginaAtual() {
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  return frasesVisiveis.slice(inicio, inicio + POR_PAGINA).map(f => f.id);
}

function setupListeners() {
  Perigo.aoApagarTudo(FrasesAcoes.apagarTudo);
  document.getElementById('btn-export').addEventListener('click', FrasesAcoes.exportarTxt);
  ligarOsModulosDeFrases();
  configurarModaisDeFrases();
  document.getElementById('btn-first').addEventListener('click', () => irPagina(1));
  document.getElementById('btn-prev').addEventListener('click',  () => irPagina(paginaAtual - 1));
  document.getElementById('btn-next').addEventListener('click',  () => irPagina(paginaAtual + 1));
  document.getElementById('btn-last').addEventListener('click',  () => irPagina(totalPaginas()));

  const lista = document.getElementById('frases-lista');
  lista.addEventListener('click', aoClicarNaLista);
  lista.addEventListener('keydown', FrasesCartao.aoTeclarNaFrase);
  lista.addEventListener('keydown', FrasesCartao.aoTeclarNaEdicaoDeTexto);
  lista.addEventListener('input', FrasesCartao.aoDigitarNaEdicao);
}

function aoClicarNaLista(e) {
  for (const { seletor, fazer } of ACOES_DA_LISTA) {
    const alvo = e.target.closest(seletor);
    if (alvo) {
      fazer(alvo);
      return;
    }
  }
}

function ligarOsModulosDeFrases() {
  FrasesNuvem.iniciar({
    frases: () => todasFrases,
    trocarFrases: novas => { todasFrases = novas; },
    carregou: finalizarCarregamento,
  });
  FrasesCartao.iniciar({
    frases: () => todasFrases,
    keywords,
    selecionadas,
    editarFrase,
    salvarNaNuvem: FrasesNuvem.salvarFrase,
    aplicarFiltro,
  });
  FrasesAcoes.iniciar({
    frases: () => todasFrases,
    trocarFrases: novas => { todasFrases = novas; },
    keywords,
    selecionadas,
    usuarioLogado: () => usuarioLogado,
    nuvem: FrasesNuvem.nuvem,
    sincronizacao: FrasesNuvem.sincronizacao,
    erroDaChave: FrasesNuvem.erroDaChave,
    abrirModal: abrirModalDeFrases,
    fecharModal: () => modalAberto.fechar(),
    avisar: mostrarAvisoNaArea,
    tirarAviso: tirarAvisoDaArea,
    falhaNaNuvem: FrasesNuvem.mostrarFalha,
    sincronizado: FrasesNuvem.mostrarSincronizado,
    sincronizarAChave: FrasesNuvem.sincronizarAChave,
    atualizarTotal,
    aplicarFiltro,
    atualizarContadorSelecao: FrasesSelecao.atualizarContador,
    construirFiltroDeFonte: FrasesFiltros.construirFiltroDeFonte,
    voltarAPrimeiraPagina,
    editarFrase,
    salvarNaNuvem: FrasesNuvem.salvarFrase,
  });
  MinerarFrases.iniciar({
    frases: () => todasFrases,
    sincronizacao: FrasesNuvem.sincronizacao,
    abrirModal: abrirModalDeFrases,
    avisar: mostrarAvisoNaArea,
    tirarAviso: tirarAvisoDaArea,
    falhaNaNuvem: FrasesNuvem.mostrarFalha,
    sincronizado: FrasesNuvem.mostrarSincronizado,
  });
  FrasesSelecao.iniciar({
    frases: () => todasFrases,
    frasesVisiveis: () => frasesVisiveis,
    idsDaPagina: idsPaginaAtual,
    listaCarregada: () => listaCarregada,
    selecionadas,
  });
  FrasesFiltros.iniciar({
    frases: () => todasFrases,
    selecionadas,
    voltarAPrimeiraPagina,
  });
}

function voltarAPrimeiraPagina() {
  paginaAtual = 1;
  aplicarFiltro();
}

function aplicarFiltro() {
  frasesVisiveis = filtrarFrases(todasFrases, FrasesFiltros.criterio);
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
    FrasesSelecao.atualizarContador();
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
  FrasesSelecao.atualizarContador();
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
  } else if (FrasesFiltros.criterio.busca.trim()) {
    vazio.append(criar('p', 'veio-vazio__titulo', textoDaVoz('PAI-04.texto', { termo: FrasesFiltros.criterio.busca.trim() })));
    acoes.append(botaoDoVazio(textoDaVoz('PAI-04.acao'), FrasesFiltros.limparBusca));
    if (FrasesFiltros.ligados()) acoes.append(botaoDoVazio(textoDaVoz('PAI-03.acao'), FrasesFiltros.limpar));
  } else {
    vazio.append(criar('p', 'veio-vazio__titulo', textoDaVoz('PAI-03.texto')));
    acoes.append(botaoDoVazio(textoDaVoz('PAI-03.acao'), FrasesFiltros.limpar));
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
  FrasesNuvem.nuvem()?.gravarFrases(marcadas).catch(err => FrasesNuvem.mostrarFalha(err));
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
