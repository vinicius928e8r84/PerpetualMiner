'use strict';

const { ehRussa, detectarIdioma, IDIOMAS, textoDaVoz, Atalhos, AjustesDeEnvio, Mineracao, TxtDeFrases } = PerpetualMiner;
const { fonteDaFrase, nomeDaFonte, rotuloDoDia } = PerpetualMiner.Contexto;
const {
  iconeVeio, montarChipDaPalavra, escreverFraseClicavel, andarEntrePalavras, focarPalavra, refletirSelecao, montarTecla,
} = PerpetualMiner.Veio;
const Shell = PerpetualMiner.Shell;
const Conta = PerpetualMiner.Conta;
const Perigo = PerpetualMiner.Perigo;
const Envio = PerpetualMiner.Envio;
const MinerarFrases = PerpetualMiner.MinerarFrases;
const { SITUACOES } = Conta;
const { Sincronizacao, ChaveDaOpenAI, Historico } = PerpetualMiner;
const { mostrarToastDeSucesso, abrirModal, montarAviso, criar } = PerpetualMiner.Veio;
const { filtrarFrases, foiEnviadaAoAnki, STATUS_ENVIADA_AO_ANKI } = PerpetualMiner.FiltroDasFrases;

const POR_PAGINA = 10;

let atalhoDeLegenda = Atalhos.ATALHOS_PADRAO.legenda;

const ICONE_DE_VIDEO = 'netflix';

const ICONES_DE_FONTE = {
  netflix: ICONE_DE_VIDEO, primevideo: ICONE_DE_VIDEO, max: ICONE_DE_VIDEO, disneyplus: ICONE_DE_VIDEO,
  starplus: ICONE_DE_VIDEO, kinopoisk: ICONE_DE_VIDEO, youtube: 'youtube',
  web: 'web', selecao: 'web', pdf: 'pdf', livro: 'livro', manual: 'manual', importado: 'manual',
};

const GOOGLE_USERINFO   = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
const FIREBASE_API_KEY  = Sincronizacao.CHAVE_DA_API;
const FB_SIGNIN_URL     = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`;

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

let edicaoDeTexto      = null;
const idsAindaNaNuvem  = new Set();
let modalAberto        = null;
let pedidoDeApagar     = null;
let edicaoDeContexto   = null;

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
    const redirectUri = chrome.identity.getRedirectURL();

    const rawNonce    = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    const hashBuf     = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
    const hashedNonce = Array.from(new Uint8Array(hashBuf), b => b.toString(16).padStart(2, '0')).join('');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', '777592854175-o2ha6n3oqv4f9i2mavbdmfoqbh9iauio.apps.googleusercontent.com');
    authUrl.searchParams.set('response_type', 'token id_token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('nonce', hashedNonce);
    authUrl.searchParams.set('prompt', 'select_account');

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        (url) => {
          if (chrome.runtime.lastError || !url) reject(new Error(chrome.runtime.lastError?.message || 'Login cancelado'));
          else resolve(url);
        }
      );
    });

    const params      = new URLSearchParams(new URL(responseUrl).hash.slice(1));
    const idToken     = params.get('id_token');
    const accessToken = params.get('access_token');
    if (!idToken) throw new Error('id_token não encontrado na resposta do Google');

    const resp = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) throw new Error('Falha ao obter dados do usuário Google');
    const info = await resp.json();

    const fbResp = await fetch(FB_SIGNIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody:            `id_token=${idToken}&nonce=${rawNonce}&providerId=google.com`,
        requestUri:          redirectUri,
        returnIdpCredential: true,
        returnSecureToken:   true,
      }),
    });
    if (!fbResp.ok) {
      const fbErr = await fbResp.json().catch(() => ({}));
      throw new Error('Firebase Auth falhou: ' + (fbErr?.error?.message || fbResp.status));
    }
    const fbData = await fbResp.json();

    usuarioLogado = {
      uid:          fbData.localId,
      email:        info.email,
      displayName:  info.name,
      photoURL:     info.picture,
    };
    const credenciais = {
      uid:          usuarioLogado.uid,
      idToken:      fbData.idToken,
      refreshToken: fbData.refreshToken,
      expiresAt:    Date.now() + 55 * 60 * 1000,
    };
    await Sincronizacao.guardarCredenciais(credenciais);
    conectarNuvem(credenciais);
    await chrome.storage.local.set({
      pm_user_info: { uid: usuarioLogado.uid, email: usuarioLogado.email, displayName: usuarioLogado.displayName, photoURL: usuarioLogado.photoURL },
    });

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
    if (loginFoiCancelado(err)) return;
    console.error('[Login] falhou:', err);
    Conta.mostrarFalhaNoLogin(err.message || String(err));
  }
}

function loginFoiCancelado(err) {
  return /did not approve|cancel/i.test(err?.message || '');
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
  ids.forEach(refletirSelecaoNoCartao);
  atualizarContadorSelecao();
}

function selecionarTodasVisiveis() {
  frasesVisiveis.forEach(f => selecionadas.add(f.id));
  idsPaginaAtual().forEach(refletirSelecaoNoCartao);
  atualizarContadorSelecao();
}

function desmarcarTodas() {
  const ids = [...selecionadas];
  selecionadas.clear();
  ids.forEach(refletirSelecaoNoCartao);
  atualizarContadorSelecao();
  document.getElementById('sel-pagina').focus();
}

function idsSelecionados() {
  return todasFrases.filter(f => selecionadas.has(f.id)).map(f => f.id);
}

function setupListeners() {
  Perigo.aoApagarTudo(apagarTudo);
  ChaveDaOpenAI.aoMudar(() => { if (nuvem) carregarFrasesFirestore(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizarAChave();
  });
  document.getElementById('btn-export').addEventListener('click', exportarTxt);
  document.getElementById('btn-bulk-edit').addEventListener('click', () => abrirEditarContexto(idsSelecionados()));
  document.getElementById('btn-delete-selected').addEventListener('click', () => pedirParaApagar(idsSelecionados()));
  document.getElementById('sel-pagina').addEventListener('change', selecionarPagina);
  document.getElementById('btn-sel-todas').addEventListener('click', selecionarTodasVisiveis);
  document.getElementById('btn-desmarcar-todas').addEventListener('click', desmarcarTodas);
  MinerarFrases.iniciar({
    frases: () => todasFrases,
    sincronizacao: () => sincronizacao,
    abrirModal: abrirModalDeFrases,
    avisar: mostrarAvisoNaArea,
    tirarAviso: tirarAvisoDaArea,
    falhaNaNuvem: mostrarFalhaNaNuvem,
    sincronizado: mostrarSincronizado,
  });

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
    if (btnDel)      { pedirParaApagar([Number(btnDel.dataset.id)]);            return; }
    if (btnEdit)     { abrirEditarContexto([Number(btnEdit.dataset.id)]);       return; }
    if (btnTexto)    { terminarEdicaoDeTexto(btnTexto.dataset.action === 'salvar-texto'); return; }
    if (btnEditText) { editarTextoFrase(Number(btnEditText.dataset.id));        return; }
    if (btnClear)    { clearKeywords(Number(btnClear.dataset.id));              return; }
    if (btnAddSep)   { addSeparator(Number(btnAddSep.dataset.id));             return; }
    if (palavraEl)   { escolherPalavra(palavraEl);                              return; }
  });
  lista.addEventListener('keydown', aoTeclarNaFrase);
  lista.addEventListener('keydown', aoTeclarNaEdicaoDeTexto);
  lista.addEventListener('input', (e) => {
    if (edicaoDeTexto && e.target.matches('textarea[data-edicao]')) edicaoDeTexto.rascunho = e.target.value;
  });

  lista.addEventListener('change', (e) => {
    const chk = e.target.closest('.frase-check');
    if (!chk) return;
    const id = Number(chk.dataset.id);
    if (chk.checked) selecionadas.add(id);
    else             selecionadas.delete(id);
    refletirSelecaoNoCartao(id);
    atualizarContadorSelecao();
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

  const foco = chaveDoFoco(document.activeElement);
  const nos = [];
  let diaAnterior = null;
  for (const f of pagina) {
    const dia = rotuloDoDia(f.data);
    if (dia && dia !== diaAnterior) nos.push(criar('div', 'veio-cabecalho-de-data', dia));
    diaAnterior = dia;
    nos.push(montarCartao(f));
  }
  lista.replaceChildren(...nos);
  restaurarFoco(foco);
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

function montarCartao(f) {
  const cartao = criar('article', 'veio-frase veio-frase--na-ilha');
  cartao.dataset.id = f.id;
  cartao.classList.toggle('veio-frase--selecionada', selecionadas.has(f.id));

  const marcar = criar('input', 'veio-checkbox frase-check');
  marcar.type = 'checkbox';
  marcar.dataset.id = f.id;
  marcar.checked = selecionadas.has(f.id);
  marcar.setAttribute('aria-label', textoDaVoz('PAI-28'));

  const texto = criar('div', 'veio-frase__texto');
  texto.lang = ehRussa(f) ? 'ru' : 'en';
  const editando = edicaoDeTexto?.id === f.id;
  if (editando) texto.append(montarEdicaoDeTexto(f));
  else          escreverPalavras(texto, f);

  const corpo = criar('div', 'frase-corpo');
  corpo.append(texto);
  const chip = editando ? null : montarLinhaDoChip(f);
  if (chip) corpo.append(chip);
  corpo.append(montarContexto(f));

  cartao.append(marcar, corpo, montarAcoesDoCartao(f));
  return cartao;
}

function escreverPalavras(no, f) {
  const ativas = new Set((keywords[f.id] || []).filter(w => w !== '|'));
  escreverFraseClicavel(no, Mineracao.tokenizar(f.texto || '').map((tok, idx) => tok.isWord
    ? {
      texto: tok.text,
      palavra: true,
      grifada: ativas.has(`${tok.clean}@${idx}`) || ativas.has(tok.clean),
      dados: { id: f.id, idx, word: tok.clean },
    }
    : { texto: tok.text }));
}

function montarLinhaDoChip(f) {
  const kws = keywords[f.id] || [];
  if (!kws.length) return null;

  const texto = kws.map(w => w === '|' ? '|' : w.replace(/@\d+$/, '')).join(' ');
  const chip = montarChipDaPalavra(texto, { detectada: Boolean(f.autoKeyword) });
  chip.append(botaoIcone('fechar', textoDaVoz('PAI-27.remover'), 'clear-kw', f.id));

  const outroGrupo = criar('button', 'veio-chip-palavra__outro', '+');
  outroGrupo.type = 'button';
  outroGrupo.dataset.action = 'add-sep';
  outroGrupo.dataset.id = f.id;
  outroGrupo.setAttribute('aria-label', textoDaVoz('PAI-27.outroGrupo'));
  outroGrupo.title = textoDaVoz('PAI-27.outroGrupo');

  const linha = criar('div', 'frase-chip');
  linha.append(chip, outroGrupo);
  return linha;
}

function montarContexto(f) {
  const linha = criar('div', 'veio-frase__contexto');
  const fonte = fonteDaFrase(f);
  if (fonte) {
    const selo = criar('span', 'veio-selo');
    selo.append(iconeVeio(ICONES_DE_FONTE[fonte] || 'web'), nomeDaFonte(fonte));
    linha.append(selo);
  }
  const origem = [f.contexto?.titulo, f.contexto?.detalhe].filter(Boolean).join(' · ');
  if (origem) linha.append(criar('span', 'frase-origem', origem));
  if (foiEnviadaAoAnki(f))  linha.append(criar('span', 'veio-selo veio-selo--ok', textoDaVoz('PAI-08.enviada')));
  else if (f.exportadaTxt)  linha.append(criar('span', 'veio-selo veio-selo--info', textoDaVoz('PAI-08.exportada')));
  return linha;
}

function montarAcoesDoCartao(f) {
  const acoes = criar('div', 'veio-frase__acoes');
  acoes.append(
    botaoIcone('texto', textoDaVoz('PAI-30.editarTexto'), 'edit-text', f.id),
    botaoIcone('contexto', textoDaVoz('PAI-30.editarContexto'), 'edit', f.id),
    botaoIcone('copiar', textoDaVoz('PAI-30.copiar'), 'copy', f.id),
    botaoIcone('apagar', textoDaVoz('PAI-30.apagar'), 'delete', f.id, 'veio-botao-icone--perigo'));
  return acoes;
}

function botaoIcone(icone, rotulo, acao, id, variante = '') {
  const botao = criar('button', `veio-botao-icone ${variante}`.trim());
  botao.type = 'button';
  botao.dataset.action = acao;
  botao.dataset.id = id;
  botao.setAttribute('aria-label', rotulo);
  botao.title = rotulo;
  botao.append(iconeVeio(icone));
  return botao;
}

function cartaoNaLista(id) {
  return document.querySelector(`#frases-lista .veio-frase[data-id="${id}"]`);
}

function refletirSelecaoNoCartao(id) {
  const cartao = cartaoNaLista(id);
  if (!cartao) return;
  cartao.classList.toggle('veio-frase--selecionada', selecionadas.has(id));
  cartao.querySelector('.frase-check').checked = selecionadas.has(id);
}

function atualizarCartao(id) {
  const antigo = cartaoNaLista(id);
  const frase = todasFrases.find(f => f.id === id);
  if (!antigo || !frase) return;
  const foco = chaveDoFoco(document.activeElement);
  antigo.replaceWith(montarCartao(frase));
  restaurarFoco(foco);
}

function chaveDoFoco(no) {
  if (!no?.closest?.('#frases-lista')) return null;
  if (no.classList.contains('veio-palavra-clicavel')) return `.veio-palavra-clicavel[data-id="${no.dataset.id}"][data-idx="${no.dataset.idx}"]`;
  if (no.dataset.action) return `[data-action="${no.dataset.action}"][data-id="${no.dataset.id}"]`;
  if (no.classList.contains('frase-check')) return `.frase-check[data-id="${no.dataset.id}"]`;
  if (no.dataset.edicao) return `textarea[data-edicao="${no.dataset.edicao}"]`;
  return null;
}

function restaurarFoco(seletor) {
  if (!seletor) return;
  const no = document.querySelector(`#frases-lista ${seletor}`);
  if (!no) return;
  if (no.classList.contains('veio-palavra-clicavel')) focarPalavra(no);
  else no.focus();
}

function escolherPalavra(palavra) {
  toggleWord(Number(palavra.dataset.id), Number(palavra.dataset.idx), palavra.dataset.word);
}

function aoTeclarNaFrase(e) {
  const palavra = e.target.closest('.veio-palavra-clicavel');
  if (!palavra || andarEntrePalavras(e)) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    escolherPalavra(palavra);
  }
}

function gravarPalavras(id) {
  const idxFrase = todasFrases.findIndex(f => f.id === id);
  if (idxFrase < 0) return;
  editarFrase(idxFrase, { keywords: keywords[id] || [], autoKeyword: false });
  salvarFraseFirestore(todasFrases[idxFrase], ['keywords', 'autoKeyword']);
  atualizarCartao(id);
}

function editarFrase(idx, campos) {
  todasFrases[idx] = { ...todasFrases[idx], ...campos };
  return Historico.editar(todasFrases[idx].id, campos);
}

function toggleWord(id, wordIdx, wordClean) {
  if (wordClean == null) return;
  const key   = `${wordClean}@${wordIdx}`;
  const frase = todasFrases.find(f => f.id === id);
  if (!frase) return;
  const all        = keywords[id] || [];
  const lastSepIdx = all.lastIndexOf('|');
  const prefix     = lastSepIdx >= 0 ? all.slice(0, lastSepIdx + 1) : [];
  const lastSeg    = lastSepIdx >= 0 ? all.slice(lastSepIdx + 1)    : [...all];
  const selected   = new Set(lastSeg);
  if (selected.has(key)) selected.delete(key);
  else                   selected.add(key);
  let newLastSeg;
  if (selected.size === 0) {
    newLastSeg = [];
  } else {
    const tokens = Mineracao.tokenizar(frase.texto);
    newLastSeg = tokens
      .map((t, i) => (t.isWord && selected.has(`${t.clean}@${i}`)) ? `${t.clean}@${i}` : null)
      .filter(Boolean);
  }
  const combined = newLastSeg.length > 0
    ? [...prefix, ...newLastSeg]
    : (prefix.length > 0 ? prefix.slice(0, -1) : []);
  if (combined.length === 0) delete keywords[id];
  else                       keywords[id] = combined;
  gravarPalavras(id);
}

function clearKeywords(id) {
  delete keywords[id];
  gravarPalavras(id);
}

function addSeparator(id) {
  const all = keywords[id];
  if (!all || all.length === 0 || all[all.length - 1] === '|') return;
  keywords[id] = [...all, '|'];
  gravarPalavras(id);
}

function editarTextoFrase(id) {
  const frase = todasFrases.find(f => f.id === id);
  if (!frase) return;
  edicaoDeTexto = { id, rascunho: frase.texto };
  atualizarCartao(id);
  const campo = cartaoNaLista(id)?.querySelector('textarea[data-edicao]');
  if (!campo) return;
  campo.focus();
  campo.setSelectionRange(campo.value.length, campo.value.length);
}

function montarEdicaoDeTexto(f) {
  const edicao = criar('div', 'frase-edicao');
  const campo = criar('textarea', 'veio-campo frase-edicao__campo');
  campo.dataset.edicao = f.id;
  campo.value = edicaoDeTexto.rascunho;
  campo.rows = Math.max(2, Math.ceil(campo.value.length / 55));
  campo.setAttribute('aria-label', textoDaVoz('PAI-33.campo'));

  const dica = criar('span', 'frase-edicao__dica', textoDaVoz('PAI-33.dica'));
  dica.id = `dica-edicao-${f.id}`;
  campo.setAttribute('aria-describedby', dica.id);

  const cancelar = criar('button', 'veio-botao veio-botao--fantasma', textoDaVoz('PAI-33.cancelar'));
  cancelar.type = 'button';
  cancelar.dataset.action = 'cancelar-texto';
  cancelar.dataset.id = f.id;
  const salvar = criar('button', 'veio-botao veio-botao--primario', textoDaVoz('PAI-33.salvar'));
  salvar.type = 'button';
  salvar.dataset.action = 'salvar-texto';
  salvar.dataset.id = f.id;

  const acoes = criar('div', 'frase-edicao__acoes');
  acoes.append(dica, cancelar, salvar);
  edicao.append(campo, acoes);
  return edicao;
}

function aoTeclarNaEdicaoDeTexto(e) {
  if (!edicaoDeTexto || !e.target.matches('textarea[data-edicao]')) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    terminarEdicaoDeTexto(true);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    terminarEdicaoDeTexto(false);
  }
}

function terminarEdicaoDeTexto(salvar) {
  if (!edicaoDeTexto) return;
  const { id, rascunho } = edicaoDeTexto;
  edicaoDeTexto = null;
  const frase = todasFrases.find(f => f.id === id);
  const novoTexto = rascunho.trim();
  if (salvar && frase && novoTexto && novoTexto !== frase.texto) salvarTextoFrase(id, novoTexto);
  else atualizarCartao(id);
  cartaoNaLista(id)?.querySelector('[data-action="edit-text"]')?.focus();
}

function salvarTextoFrase(id, novoTexto) {
  const idx = todasFrases.findIndex(f => f.id === id);
  if (idx < 0) return;
  const palavras = Mineracao.palavrasQueFicam(keywords[id], novoTexto);
  if (palavras.length) keywords[id] = palavras;
  else delete keywords[id];
  editarFrase(idx, { texto: novoTexto, idioma: detectarIdioma(novoTexto), keywords: palavras });
  salvarFraseFirestore(todasFrases[idx]);
  aplicarFiltro();
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

function pedirParaApagar(ids) {
  if (ids.length === 0) return;
  const umaFrase = ids.length === 1;
  const estado = umaFrase ? 'PAI-12' : 'PAI-13';
  const valores = { n: ids.length };
  document.getElementById('modal-apagar-titulo').textContent = textoDaVoz(`${estado}.titulo`, valores);
  document.getElementById('modal-apagar-corpo').textContent =
    textoDaVoz(`${estado}.${usuarioLogado ? 'corpo' : 'corpoSemConta'}`);
  document.getElementById('btn-apagar-cancelar').textContent = textoDaVoz(`${estado}.cancelar`);
  document.getElementById('btn-apagar-confirmar').textContent = textoDaVoz(`${estado}.confirmar`, valores);
  abrirModalDeFrases('modal-apagar', () => { pedidoDeApagar = null; });
  pedidoDeApagar = { ids };
}

function confirmarApagar() {
  if (!pedidoDeApagar) return;
  const { ids } = pedidoDeApagar;
  modalAberto.fechar();
  apagarFrases(ids);
}

async function apagarFrases(ids, { toast = ids.length > 1 } = {}) {
  const apagadas = new Set(ids);
  todasFrases = todasFrases.filter(f => !apagadas.has(f.id));
  ids.forEach(id => { delete keywords[id]; selecionadas.delete(id); });
  if (edicaoDeTexto && apagadas.has(edicaoDeTexto.id)) edicaoDeTexto = null;
  await Historico.apagar(ids);
  atualizarTotal();
  aplicarFiltro();
  if (toast) mostrarToastDeSucesso(textoDaVoz('PAI-14', { n: ids.length }));
  await apagarDaNuvem(ids);
}

async function apagarDaNuvem(ids) {
  const erro = await sincronizacao.apagar(ids);
  if (!erro) return;
  ids.forEach(id => idsAindaNaNuvem.add(id));
  mostrarAvisoAindaNaNuvem(erro);
  mostrarFalhaNaNuvem(erro);
}

function mostrarAvisoAindaNaNuvem(erro) {
  mostrarAvisoNaArea('ainda-na-nuvem', {
    texto: textoDaVoz('PAI-15.aviso'),
    acao: { rotulo: textoDaVoz('PAI-15.tentarDeNovo'), aoUsar: tentarApagarDaNuvemDeNovo },
    erro,
    aoFechar: () => idsAindaNaNuvem.clear(),
  });
}

async function tentarApagarDaNuvemDeNovo() {
  const ids = [...idsAindaNaNuvem];
  const erro = await sincronizacao.apagar(ids);
  if (erro) {
    mostrarAvisoAindaNaNuvem(erro);
    mostrarFalhaNaNuvem(erro);
    return;
  }
  idsAindaNaNuvem.clear();
  tirarAvisoDaArea('ainda-na-nuvem');
  mostrarSincronizado();
}

let avisoDaChaveNoApagarTudo = null;
async function apagarChaveNoApagarTudo() {
  try {
    await ChaveDaOpenAI.apagar();
    await sincronizarAChave();
    avisoDaChaveNoApagarTudo?.remove();
    avisoDaChaveNoApagarTudo = null;
    return !erroDaChave;
  } catch (erro) {
    avisoDaChaveNoApagarTudo?.remove();
    const antiga = erro?.codigo === 'outdated_connection';
    const outraConta = erro?.codigo === 'other_account_owner';
    avisoDaChaveNoApagarTudo = montarAviso({
      texto: textoDaVoz(antiga ? 'CFG-35.erroConexaoAntiga' : outraConta ? 'CFG-35.erroOutraConta' : 'CFG-17.chaveNaoApagada'),
      acao: antiga ? { rotulo: textoDaVoz('CFG-35.erroAtualizar'), aoUsar: () => PerpetualMiner.CartaoDaIA.baixarConexao() }
        : outraConta ? { rotulo: textoDaVoz('CFG-35.erroTrocar'), aoUsar: () => PerpetualMiner.CartaoDaIA.trocarChave() }
          : { rotulo: textoDaVoz('CFG-35.erroTentarDeNovo'), aoUsar: apagarChaveNoApagarTudo },
      detalhes: erro?.codigo || erro?.name || 'storage_error', fechavel: false,
    });
    document.getElementById('cfg-perigo-corpo').append(avisoDaChaveNoApagarTudo);
    return false;
  }
}

function apagarTudo({ ids, em }) {
  todasFrases = todasFrases.filter(f => !ids.includes(f.id));
  ids.forEach(id => delete keywords[id]);
  selecionadas.clear();
  atualizarContadorSelecao();
  const chaveApagada = apagarChaveNoApagarTudo();
  Envio.apagarTudo();
  const naNuvem = sincronizacao.apagarTudo(ids, em).then(({ ok, erro }) => {
    if (!ok) {
      console.error('[Firestore] apagar tudo falhou:', erro);
      mostrarFalhaNaNuvem(erro);
    }
    return ok;
  });
  Historico.apagar(ids).then(async () => {
    atualizarTotal();
    paginaAtual = 1;
    aplicarFiltro();
    const [frasesApagadas, apagouChave] = await Promise.all([naNuvem, chaveApagada]);
    if (frasesApagadas && apagouChave) mostrarToastDeSucesso(textoDaVoz('CFG-18'));
  });
}

function exportarTxt() {
  if (selecionadas.size === 0) return;
  const linhas = todasFrases
    .filter(f => selecionadas.has(f.id))
    .map(linhaDoTxt)
    .filter(l => l.trim());

  const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'perpetualminer-export.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const exportadas = [];
  todasFrases = todasFrases.map(f => {
    if (!selecionadas.has(f.id)) return f;
    const u = { ...f, exportadaTxt: true };
    exportadas.push(u);
    return u;
  });
  selecionadas.clear();
  atualizarContadorSelecao();
  Historico.marcarExportadas(exportadas.map(f => f.id)).then(() => {
    atualizarTotal();
    aplicarFiltro();
  });
  if (nuvem && exportadas.length > 0) {
    Promise.allSettled(exportadas.map(f => nuvem.gravarFrase(f, ['exportadaTxt']))).then(resultados => {
      const falha = resultados.find(r => r.status === 'rejected');
      if (falha) mostrarFalhaNaNuvem(falha.reason);
    });
  }
  mostrarToastDeSucesso(textoDaVoz('PAI-19', { n: linhas.length }));
}

function comecarEnvio() {
  Envio.usar({
    selecionadas: () => todasFrases.filter(f => selecionadas.has(f.id)),
    frasesPorId: ids => {
      const pedidas = new Set(ids.map(Number));
      return todasFrases.filter(f => pedidas.has(Number(f.id)));
    },
    linha: linhaParaOAnki,
    apagar: ids => apagarFrases(ids, { toast: false }),
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
  document.getElementById('btn-apagar-confirmar').addEventListener('click', confirmarApagar);
  document.getElementById('form-contexto').addEventListener('submit', (e) => {
    e.preventDefault();
    salvarContexto();
  });
}

function abrirEditarContexto(ids) {
  if (ids.length === 0) return;
  const umaFrase = ids.length === 1 ? todasFrases.find(f => f.id === ids[0]) : null;
  document.getElementById('modal-contexto-titulo').textContent = umaFrase
    ? textoDaVoz('PAI-20.umaFrase')
    : textoDaVoz('PAI-20.variasFrases', { n: ids.length });
  document.getElementById('modal-contexto-subtitulo').textContent = umaFrase
    ? umaFrase.texto
    : textoDaVoz('PAI-20.ajuda');
  document.getElementById('modal-fonte').value   = umaFrase ? (umaFrase.contexto?.fonte || umaFrase.streaming || '') : '';
  document.getElementById('modal-titulo').value  = umaFrase?.contexto?.titulo  || '';
  document.getElementById('modal-detalhe').value = umaFrase?.contexto?.detalhe || '';

  abrirModalDeFrases('modal-contexto', () => { edicaoDeContexto = null; });
  edicaoDeContexto = { ids };
  document.getElementById('modal-fonte').focus();
}

function abrirModalDeFrases(id, aoFechar) {
  modalAberto = abrirModal(document.getElementById(id), {
    aoFechar: () => { modalAberto = null; aoFechar(); },
  });
  return modalAberto;
}

function salvarContexto() {
  if (!edicaoDeContexto) return;
  const { ids } = edicaoDeContexto;
  const contexto = {
    fonte:   document.getElementById('modal-fonte').value.trim(),
    titulo:  document.getElementById('modal-titulo').value.trim(),
    detalhe: document.getElementById('modal-detalhe').value.trim(),
  };
  modalAberto.fechar();
  if (ids.length === 1) salvarContextoDeUmaFrase(ids[0], contexto);
  else                  salvarContextoDeVarias(ids, contexto);
}

function salvarContextoDeVarias(ids, { fonte, titulo, detalhe }) {
  const alvo = new Set(ids);
  const preenchidos = Object.fromEntries(Object.entries({ fonte, titulo, detalhe }).filter(([, v]) => v));
  const edicoes = new Map();
  todasFrases = todasFrases.map(f => {
    if (!alvo.has(f.id)) return f;
    const contexto = { ...(f.contexto || { fonte: f.streaming || '', titulo: '', detalhe: '' }), ...preenchidos };
    edicoes.set(f.id, { ...(fonte ? { streaming: fonte } : {}), contexto });
    return { ...f, ...edicoes.get(f.id) };
  });
  const editadas = todasFrases.filter(f => edicoes.has(f.id));
  Historico.editarVarias(edicoes).then(() => {
    construirFiltroDeFonte();
    aplicarFiltro();
    mostrarToastDeSucesso(textoDaVoz('PAI-22', { n: editadas.length }));
  });
  if (nuvem && editadas.length > 0) {
    Promise.allSettled(editadas.map(f => nuvem.gravarFrase(f))).then(resultados => {
      const falhas = resultados.filter(r => r.status === 'rejected');
      if (falhas.length > 0) mostrarFalhaNaNuvem(falhas[0].reason);
    });
  }
}

function salvarContextoDeUmaFrase(id, { fonte, titulo, detalhe }) {
  const idx = todasFrases.findIndex(f => f.id === id);
  if (idx < 0) return;
  const f = todasFrases[idx];
  const novaFonte = fonte || f.contexto?.fonte || f.streaming || '';
  editarFrase(idx, { streaming: novaFonte, contexto: { fonte: novaFonte, titulo, detalhe } }).then(() => {
    construirFiltroDeFonte();
    aplicarFiltro();
  });
  salvarFraseFirestore(todasFrases[idx]);
}

const linhaDoTxt = frase => TxtDeFrases.escrever(frase, keywords[frase.id]);

function linhaParaOAnki(frase) {
  return TxtDeFrases.escreverParaOAnki(frase, keywords[frase.id]);
}

function chromeGet(defaults) {
  return new Promise(resolve => chrome.storage.local.get(defaults, resolve));
}
