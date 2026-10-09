'use strict';

// A base compartilhada (catálogo da Voz e detecção de idioma) é carregada antes
// deste arquivo, pelo painel.html: a busca no catálogo é `PerpetualMiner.textoDaVoz`.
const { ehRussa, IDIOMAS, textoDaVoz, Atalhos, AjustesDeEnvio, Mineracao } = PerpetualMiner;
// O nome da Fonte e o dia da frase, os mesmos do popup (lib/contexto.js).
const { fonteDaFrase, nomeDaFonte, rotuloDoDia } = PerpetualMiner.Contexto;
// A lista de Frases é montada com os componentes da Base Veio (veio/componentes.js).
const {
  iconeVeio, montarChipDaPalavra, escreverFraseClicavel, andarEntrePalavras, focarPalavra, refletirSelecao, montarTecla,
} = PerpetualMiner.Veio;
// O shell (painel-shell.js) é dono da sidebar: o total e o ponto da Conexão com o
// Anki. A conta (painel-conta.js) desenha o chip e o card Conta & sync, e a Zona
// de perigo (painel-perigo.js), o Apagar tudo. Este arquivo conta aos três o que
// muda.
const Shell = PerpetualMiner.Shell;
const Conta = PerpetualMiner.Conta;
const Perigo = PerpetualMiner.Perigo;
const Envio = PerpetualMiner.Envio;
const { SITUACOES } = Conta;
// A sincronização com a nuvem: o codec, a sessão, o merge e os tombstones (lib/sincronizacao.js).
const { Sincronizacao, ChaveDaOpenAI } = PerpetualMiner;
const { mostrarToastDeSucesso, abrirModal, montarAviso } = PerpetualMiner.Veio;

// ─── Constantes ──────────────────────────────────────────────────────────────

const POR_PAGINA = 10;

// O atalho de legenda gravado em Configurações › Atalhos (lib/atalhos.js), que
// o vazio de Frases (PAI-02) ensina. Começa no padrão até a leitura voltar.
let atalhoDeLegenda = Atalhos.ATALHOS_PADRAO.legenda;

// O desenho de vídeo da Base Veio, que lá se chama `netflix`: todo serviço de
// vídeo usa ele no selo de Fonte.
const ICONE_DE_VIDEO = 'netflix';

// O ícone do selo de cada Fonte. Uma Fonte fora da lista (o nome do site) usa o
// da Web.
const ICONES_DE_FONTE = {
  netflix: ICONE_DE_VIDEO, primevideo: ICONE_DE_VIDEO, max: ICONE_DE_VIDEO, disneyplus: ICONE_DE_VIDEO,
  starplus: ICONE_DE_VIDEO, kinopoisk: ICONE_DE_VIDEO, youtube: 'youtube',
  web: 'web', selecao: 'web', pdf: 'pdf', livro: 'livro', manual: 'manual', importado: 'manual',
};

// O login com o Google. A nuvem (Firestore REST, sem nenhum SDK: evita violações de CSP
// em extensões MV3) é de lib/sincronizacao.js.
const GOOGLE_USERINFO   = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
const FIREBASE_API_KEY  = Sincronizacao.CHAVE_DA_API;
const FB_SIGNIN_URL     = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`;
const BRIDGE_URL        = 'http://127.0.0.1:8766';

// A Fonte de uma frase minerada sem Fonte: colada (Colar) ou vinda de uma
// linha simples de um .txt (Arquivo .txt).
const FONTE_MANUAL    = 'manual';
const FONTE_IMPORTADO = 'importado';

// Enviada ao Anki fica gravada com o nome de antes do glossário (ver foiEnviadaAoAnki).
const STATUS_ENVIADA_AO_ANKI = 'exported';

// ─── Estado global ───────────────────────────────────────────────────────────

let todasFrases        = [];
let frasesVisiveis     = [];
let paginaAtual        = 1;
let filtroFonte         = 'all';
let filtroIdioma       = 'all';
let esconderEnviadasEExportadas = false;
let ordemAtual         = 'novas'; // 'novas' | 'antigas'
let buscaAtual         = '';
// Até a primeira leitura terminar, a lista mostra os cartões-esqueleto (PAI-01).
let listaCarregada     = false;

// usuarioLogado: { uid, email, displayName, photoURL } | null
let usuarioLogado = null;
let sessao         = null;
let nuvem          = null;
let sincronizacao  = novaSincronizacao();

// { [phraseId]: string[] }
const keywords    = {};
// Set<number>
const selecionadas = new Set();

// A frase com o texto aberto para edição no lugar, e o rascunho: o cartão é
// redesenhado sempre que a lista muda, e a edição tem de sobreviver a isso.
let edicaoDeTexto      = null; // { id, rascunho }
// As frases apagadas daqui que continuam na nuvem porque o DELETE falhou (PAI-15).
const idsAindaNaNuvem  = new Set();
// O modal aberto, para o × e o Cancelar fecharem o que está na tela, e o que
// cada um está esperando: os ids a apagar e os ids cujo Contexto está aberto.
let modalAberto        = null;
let pedidoDeApagar     = null; // { ids }
let edicaoDeContexto   = null; // { ids }

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupListeners();
  // Baralhos e termos e o Vocabulário leem os baralhos dos Ajustes de envio (painel-anki-baralhos.js),
  // ao abrir e a cada Salvar ajustes, nesta aba ou em outra.
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

// ─── Auth: chrome.identity + Google userinfo (sem Firebase Auth SDK) ──────────

async function inicializarAuth() {
  // Tenta restaurar sessão anterior salva no storage
  const data = await chromeGet({ pm_user_info: null, pm_firebase_auth: null });
  if (data.pm_user_info && data.pm_firebase_auth) {
    usuarioLogado = { ...data.pm_user_info };
    conectarNuvem(data.pm_firebase_auth);
    atualizarUIAuth(usuarioLogado);
    sincronizarAChave();
    await carregarFrasesFirestore();
  } else {
    carregarFrasesLocal();
  }
}

async function loginGoogle() {
  Conta.mostrarFalhaNoLogin(null);
  try {
    const redirectUri = chrome.identity.getRedirectURL();

    // Nonce: enviamos o hash SHA-256 para o Google; guardamos o valor bruto para o Firebase
    const rawNonce    = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    const hashBuf     = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
    const hashedNonce = Array.from(new Uint8Array(hashBuf), b => b.toString(16).padStart(2, '0')).join('');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', '777592854175-o2ha6n3oqv4f9i2mavbdmfoqbh9iauio.apps.googleusercontent.com');
    authUrl.searchParams.set('response_type', 'token id_token'); // pede ambos
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('nonce', hashedNonce);              // obrigatório para id_token
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

    // Busca nome, email e foto via userinfo (usa o access_token que também chegou)
    const resp = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) throw new Error('Falha ao obter dados do usuário Google');
    const info = await resp.json();

    // Troca o Google id_token por um Firebase ID token + refresh token
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

    // Persiste sessão no storage e na memória
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
    conectarNuvem(credenciais);
    chrome.storage.local.set({
      pm_firebase_auth: credenciais,
      pm_user_info: { uid: usuarioLogado.uid, email: usuarioLogado.email, displayName: usuarioLogado.displayName, photoURL: usuarioLogado.photoURL },
    });

    atualizarUIAuth(usuarioLogado);
    sincronizarAChave();

    // 4. Migração única na primeira vez, depois só carrega
    const { pm_migrated = '' } = await chromeGet({ pm_migrated: '' });
    if (pm_migrated !== usuarioLogado.uid) {
      await migrarParaFirestore();
      chrome.storage.local.set({ pm_migrated: usuarioLogado.uid });
    } else {
      await carregarFrasesFirestore();
    }
  } catch (err) {
    // Fechar a janela do Google é desistir, não erro: nada aparece (CFG-07).
    if (loginFoiCancelado(err)) return;
    console.error('[Login] falhou:', err);
    Conta.mostrarFalhaNoLogin(err.message || String(err));
  }
}

// O Chrome responde assim quando a pessoa fecha a janela de login sem escolher conta.
function loginFoiCancelado(err) {
  return /did not approve|cancel/i.test(err?.message || '');
}

async function logout() {
  if (!usuarioLogado) return;
  usuarioLogado = null;
  desconectarNuvem();
  chrome.storage.local.remove(['pm_firebase_auth', 'pm_user_info']);
  atualizarUIAuth(null);
  carregarFrasesLocal();
}

// Configurações › Conta & sync e o chip da sidebar mostram quem entrou; a Zona
// de perigo, se o Apagar tudo alcança a nuvem.
function atualizarUIAuth(user) {
  Conta.mostrarConta(user);
  Perigo.mostrarConta(Boolean(user));
}

// ─── A nuvem ─────────────────────────────────────────────────────────────────
//
// A sessão, o REST do Firestore e a sincronização são de lib/sincronizacao.js;
// aqui só se liga a conta a elas.

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
    aoRenovar: renovadas => chromeSet({ pm_firebase_auth: renovadas }),
  });
  nuvem = Sincronizacao.nuvemHttp({ sessao });
  sincronizacao = novaSincronizacao();
}

// ─── A chave da OpenAI acompanha a conta (#154) ──────────────────────────────
//
// O cofre deste computador é de lib/chave-da-openai.js; a junção com a nuvem (a mudança mais nova vale, o
// tombstone inclusive) é de lib/sincronizacao.js. Roda ao abrir o painel com conta, ao entrar e a cada
// mudança da chave aqui (colar, trocar, apagar), uma de cada vez. Uma falha só fica para a próxima vez:
// a chave daqui continua valendo, e o log leva só o status ou o motivo, nunca a chave nem a mensagem da
// nuvem (que poderia repetir o corpo do pedido).

let sincronizandoAChave = Promise.resolve();

function sincronizarAChave() {
  sincronizandoAChave = sincronizandoAChave.then(async () => {
    if (!nuvem) return;
    try {
      await Sincronizacao.criarSincronizacaoDaChave({ nuvem, cofre: ChaveDaOpenAI.cofre }).sincronizar();
    } catch (err) {
      console.warn('[Firestore] a chave da OpenAI não sincronizou:', err?.motivo || err?.status || 'sem resposta');
    }
  });
  return sincronizandoAChave;
}

function desconectarNuvem() {
  sessao?.revogar();
  sessao = null;
  nuvem = null;
  sincronizacao = novaSincronizacao();
}

// ─── Falhas na nuvem ─────────────────────────────────────────────────────────
//
// Um problema de sync aparece só no card Conta & sync e no chip (Q4 da spec de
// Configurações), nunca num toast. A classificação é da Sincronizacao; aqui o
// motivo da falha vira a situação que a Conta mostra.

// `semSincronizar` é o que a falha genérica mostra: depois de uma primeira
// subida que não chegou à nuvem, é a falha dela (CFG-09).
function situacaoDoErro(err, semSincronizar = SITUACOES.SEM_SINCRONIZAR) {
  if (err?.motivo === Sincronizacao.MOTIVO.EXPIROU) return SITUACOES.EXPIROU;
  if (err?.motivo === Sincronizacao.MOTIVO.RECUSADO) return SITUACOES.RECUSADO;
  return semSincronizar;
}

function mostrarFalhaNaNuvem(err, semSincronizar) {
  Conta.mostrarSincronizacao(situacaoDoErro(err, semSincronizar), { detalhes: err?.message || String(err) });
}

// ─── Migração e Sync ──────────────────────────────────────────────────────────

async function migrarParaFirestore() {
  const { frases = [] } = await chromeGet({ frases: [] });
  if (frases.length > 0) {
    Conta.mostrarSincronizacao(SITUACOES.PRIMEIRA_SUBIDA, { n: frases.length });
    try {
      await nuvem.gravarFrases(frases);
      mostrarToastDeSucesso(textoDaVoz('CFG-09.sucesso', { n: frases.length }));
    } catch (err) {
      // O carregamento abaixo tenta de novo, frase a frase. Se nenhuma subir, o
      // card e o chip mostram a falha da primeira subida (CFG-09), sem toast.
      console.error('[Firestore] migração falhou:', err);
      await carregarFrasesFirestore({ primeiraSubidaFalhou: true });
      return;
    }
  }
  await carregarFrasesFirestore();
}

function carregarFrases() {
  if (usuarioLogado) carregarFrasesFirestore();
  else               carregarFrasesLocal();
}

function carregarFrasesLocal() {
  chrome.storage.local.get({ frases: [] }, (data) => {
    todasFrases = data.frases || [];
    finalizarCarregamento();
  });
}

async function carregarFrasesFirestore({ primeiraSubidaFalhou = false } = {}) {
  const semSincronizar = primeiraSubidaFalhou ? SITUACOES.PRIMEIRA_SUBIDA_FALHOU : SITUACOES.SEM_SINCRONIZAR;
  Conta.mostrarSincronizacao(SITUACOES.SINCRONIZANDO);
  try {
    // Passa o estado vivo, não um snapshot anterior à rede (ver o contrato de carregar).
    const { frases, desteComputador, falhaNasOrfas } = await sincronizacao.carregar({ atuais: () => todasFrases });
    todasFrases = frases;
    if (falhaNasOrfas) {
      console.error('[Firestore] orphans com falha:', falhaNasOrfas.quantas, falhaNasOrfas.causas[0]?.message);
      mostrarSyncIncompleto(falhaNasOrfas, desteComputador, semSincronizar);
    } else {
      Conta.mostrarSincronizacao(SITUACOES.SINCRONIZADO);
    }
    finalizarCarregamento();
  } catch (err) {
    console.error('[Firestore] carregar:', err);
    mostrarFalhaNaNuvem(err, semSincronizar);
    carregarFrasesLocal();
  }
}

// Frases deste computador que não subiram: “8 de 10 sincronizadas” (CFG-05)
// quando parte chegou, ou a falha inteira quando nada chegou ou a nuvem recusou.
// A conta é das frases deste computador (`desteComputador`), não da coleção
// inteira na nuvem, que também tem as dos outros computadores da conta.
function mostrarSyncIncompleto({ quantas, causas }, desteComputador, semSincronizar) {
  const detalhes = [...new Set(causas.map(c => c?.message || String(c)))].join('\n');
  const situacao = situacaoDoErro(causas[0], semSincronizar);
  const naNuvem = desteComputador - quantas;
  if (situacao !== semSincronizar || naNuvem === 0) {
    Conta.mostrarSincronizacao(situacao, { detalhes });
    return;
  }
  Conta.mostrarSincronizacao(SITUACOES.PARCIAL, { n: naNuvem, total: desteComputador, detalhes });
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

// O total aparece no item Frases da sidebar e na Zona de perigo de
// Configurações, que diz o alcance do Apagar tudo e o deixa indisponível sem frases.
function atualizarTotal() {
  const n = todasFrases.length;
  Shell.mostrarTotalDeFrases(n);
  Perigo.mostrarTotal(n);
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

// Wrappers chamados pelas ações do painel
// campos opcional: ['keywords'], ['texto'], etc. — passa direto para a nuvem.
function salvarFraseFirestore(frase, campos = null) {
  if (!nuvem) return;
  nuvem.gravarFrase(frase, campos).catch(err => {
    console.error('[Firestore] patch:', frase.id, err.message);
    mostrarFalhaNaNuvem(err);
  });
}

// ─── Seleção e barra contextual ──────────────────────────────────────────────
//
// Sem seleção, a linha mostra só “Selecionar página” (PAI-31). Com seleção, ela
// vira a barra contextual (PAI-32): × Desmarcar todas, a contagem (PAI-06), o
// “Selecionar todas as N frases” quando a página inteira está marcada, e as
// ações. A barra gruda no topo da ilha ao rolar (CSS). Trocar filtro ou busca
// limpa a seleção, para nenhuma ação cair em frase que não está à vista.

/** Redesenha a linha de seleção a partir de `selecionadas`. */
function atualizarContadorSelecao() {
  const linha = document.getElementById('frases-selecao');
  const idsPag = idsPaginaAtual();
  const n = selecionadas.size;
  const naPagina = idsPag.filter(id => selecionadas.has(id)).length;

  linha.hidden = !listaCarregada || (idsPag.length === 0 && n === 0);
  refletirSelecao(document.getElementById('sel-pagina'), naPagina, idsPag.length);
  linha.classList.toggle('frases-selecao--barra', n > 0);
  // Na barra, o checkbox perde o rótulo à vista: o nome continua para o leitor de tela.
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

/** “Selecionar página”: marca a página inteira; com ela inteira marcada, desmarca. */
function selecionarPagina() {
  const ids = idsPaginaAtual();
  const todasMarcadas = ids.every(id => selecionadas.has(id));
  if (todasMarcadas) ids.forEach(id => selecionadas.delete(id));
  else               ids.forEach(id => selecionadas.add(id));
  ids.forEach(refletirSelecaoNoCartao);
  atualizarContadorSelecao();
}

/** “Selecionar todas as N frases”: as dos filtros atuais, em todas as páginas. */
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

/** Os ids selecionados, na ordem da lista. */
function idsSelecionados() {
  return todasFrases.filter(f => selecionadas.has(f.id)).map(f => f.id);
}

// ─── Listeners ────────────────────────────────────────────────────────────────

function setupListeners() {
  Perigo.aoApagarTudo(apagarTudo);
  ChaveDaOpenAI.aoMudar(sincronizarAChave);
  document.getElementById('btn-export').addEventListener('click', exportarTxt);
  document.getElementById('btn-bulk-edit').addEventListener('click', () => abrirEditarContexto(idsSelecionados()));
  document.getElementById('btn-delete-selected').addEventListener('click', () => pedirParaApagar(idsSelecionados()));
  document.getElementById('sel-pagina').addEventListener('change', selecionarPagina);
  document.getElementById('btn-sel-todas').addEventListener('click', selecionarTodasVisiveis);
  document.getElementById('btn-desmarcar-todas').addEventListener('click', desmarcarTodas);
  configurarMinerarFrases();

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

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}



// ─── Sidebar & Dropdowns ──────────────────────────────────────────────────────






// ─── Filtros e busca ──────────────────────────────────────────────────────────
//
// Uma linha que quebra: Fonte · idioma · ordem em selects, a busca no texto e
// no Título (lista fechada, item 1) e o toggle “Ocultar enviadas e exportadas”.

/** As Fontes do histórico, cada uma uma vez, na ordem em que aparecem. */
function fontesDoHistorico() {
  return [...new Set(todasFrases.map(fonteDaFrase).filter(Boolean))];
}

/** O select de Fonte, com as Fontes do histórico. O nome entra como texto. */
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

  // Um filtro ou a busca trocam as frases à vista: a seleção é limpa, para
  // nenhuma ação cair numa frase escondida. A ordem só reordena, então fica.
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

/** Fonte, idioma ou o toggle ligados. A ordem não esconde frase, então não conta. */
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

/** Um filtro ou a busca mudou: a lista refaz e volta para a primeira página. */
function voltarAPrimeiraPagina() {
  paginaAtual = 1;
  aplicarFiltro();
}

// ─── Filtro, Ordem & Paginação ────────────────────────────────────────────────

function aplicarFiltro() {
  let resultado = filtroFonte === 'all'
    ? [...todasFrases]
    : todasFrases.filter(f => fonteDaFrase(f) === filtroFonte);
  if (filtroIdioma !== 'all')
    resultado = resultado.filter(f => (f.idioma || IDIOMAS.INGLES) === filtroIdioma);
  if (esconderEnviadasEExportadas)
    resultado = resultado.filter(f => !foiEnviadaAoAnki(f) && !f.exportadaTxt);
  const termo = buscaAtual.trim().toLocaleLowerCase();
  if (termo)
    resultado = resultado.filter(f =>
      String(f.texto || '').toLocaleLowerCase().includes(termo) ||
      String(f.contexto?.titulo || '').toLocaleLowerCase().includes(termo));
  if (ordemAtual === 'antigas')
    resultado.sort((a, b) => (a.id || 0) - (b.id || 0));
  else
    resultado.sort((a, b) => (b.id || 0) - (a.id || 0));
  frasesVisiveis = resultado;
  renderizar();
}

function totalPaginas() {
  return Math.max(1, Math.ceil(frasesVisiveis.length / POR_PAGINA));
}

function irPagina(p) {
  paginaAtual = Math.max(1, Math.min(p, totalPaginas()));
  renderizar();
}

// ─── Render ───────────────────────────────────────────────────────────────────
//
// Um cartão por frase (o `.veio-frase` da Base Veio), sob o cabeçalho do seu
// dia. Todo texto de frase e de Contexto entra como texto, nunca como HTML.

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

  // Redesenhar (um filtro, uma frase nova, a Palavra gravada) não pode tirar o
  // foco de quem está no teclado.
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

/** “1–10 de 1.284” (PAI-07) e « ‹ 1 de 129 › ». Sem frases, a paginação some. */
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

/**
 * O vazio da lista: primeiro uso (PAI-02), busca sem resultado (PAI-04) ou
 * filtros que esconderam tudo (PAI-03).
 */
function montarVazio() {
  const vazio = criar('div', 'veio-vazio');
  const acoes = criar('div', 'frases-vazio__acoes');

  if (todasFrases.length === 0) {
    const texto = criar('p', 'veio-vazio__texto');
    // O atalho entra no meio da frase como tecla (kbd), não como texto solto.
    const MARCA = '\u0000';
    const [antes, depois] = textoDaVoz('PAI-02.texto', { atalho: MARCA }).split(MARCA);
    texto.append(antes, ...atalhoDoVazio(), depois);
    acoes.append(botaoDoVazio(textoDaVoz('PAI-02.acao'), () => abrirMinerarFrases('colar'), 'veio-botao--primario'));
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

/**
 * O atalho de legenda gravado, em `kbd`. Sem atalho gravado (GLB-02), o `kbd`
 * tracejado “Sem atalho” e a ação Definir atalho, que leva a Configurações › Atalhos.
 */
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

/**
 * A frase com cada palavra clicável (`escreverFraseClicavel` da Base Veio):
 * clicar grifa ou desgrifa a Palavra.
 */
function escreverPalavras(no, f) {
  const ativas = new Set((keywords[f.id] || []).filter(w => w !== '|'));
  escreverFraseClicavel(no, tokenizarFrase(f.texto || '').map((tok, idx) => tok.isWord
    ? {
      texto: tok.text,
      palavra: true,
      grifada: ativas.has(`${tok.clean}@${idx}`) || ativas.has(tok.clean),
      dados: { id: f.id, idx, word: tok.clean },
    }
    : { texto: tok.text }));
}

/** O chip `palavra:`/`auto:` com × (remove) e + (outro grupo). */
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

/** A linha de Contexto: selo de Fonte, Título · Detalhe e o estado (PAI-08). */
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
  // Enviada ao Anki vale mais que Exportada: a frase que foi para o Anki e
  // depois para um .txt continua dizendo que está no Anki.
  if (foiEnviadaAoAnki(f))  linha.append(criar('span', 'veio-selo veio-selo--ok', textoDaVoz('PAI-08.enviada')));
  else if (f.exportadaTxt)  linha.append(criar('span', 'veio-selo veio-selo--info', textoDaVoz('PAI-08.exportada')));
  return linha;
}

/**
 * Enviada ao Anki: a frase entrou num Envio concluído. O nome gravado é o
 * `status: 'exported'` de antes do glossário; o Exportar .txt grava só o
 * `exportadaTxt` e nunca este.
 */
function foiEnviadaAoAnki(f) {
  return f.status === STATUS_ENVIADA_AO_ANKI;
}

// As 4 ações só-ícone do cartão (PAI-30), que aparecem no hover e no foco.
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

function criar(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto != null) no.textContent = texto;
  return no;
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

/** Redesenha um cartão só, sem tirar o foco de quem está nele. */
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

// ─── A Palavra ────────────────────────────────────────────────────────────────

function escolherPalavra(palavra) {
  toggleWord(Number(palavra.dataset.id), Number(palavra.dataset.idx), palavra.dataset.word);
}

/** Setas andam entre as palavras da frase; Enter e Espaço escolhem. */
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
  todasFrases[idxFrase] = { ...todasFrases[idxFrase], keywords: keywords[id] || [], autoKeyword: false };
  chrome.storage.local.set({ frases: todasFrases });
  salvarFraseFirestore(todasFrases[idxFrase], ['keywords', 'autoKeyword']);
  atualizarCartao(id);
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
    // Reconstrói em ordem de aparição na frase
    const tokens = tokenizarFrase(frase.texto);
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

// ─── Editar texto no lugar (PAI-33) ──────────────────────────────────────────
//
// O texto do cartão vira um campo: Enter salva, Esc cancela, com os botões
// Cancelar e Salvar texto. Sem toast: a mudança já está na tela (PAI-16).

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

/** Fecha a edição; com `salvar`, grava o rascunho se ele mudou e não está vazio. */
function terminarEdicaoDeTexto(salvar) {
  if (!edicaoDeTexto) return;
  const { id, rascunho } = edicaoDeTexto;
  edicaoDeTexto = null;
  const frase = todasFrases.find(f => f.id === id);
  const novoTexto = rascunho.trim();
  if (salvar && frase && novoTexto && novoTexto !== frase.texto) salvarTextoFrase(id, novoTexto);
  else atualizarCartao(id);
  // O foco volta para a ação que abriu a edição.
  cartaoNaLista(id)?.querySelector('[data-action="edit-text"]')?.focus();
}

function salvarTextoFrase(id, novoTexto) {
  const idx = todasFrases.findIndex(f => f.id === id);
  if (idx < 0) return;
  todasFrases[idx] = { ...todasFrases[idx], texto: novoTexto };
  chrome.storage.local.set({ frases: todasFrases });
  salvarFraseFirestore(todasFrases[idx]);
  aplicarFiltro();
}

// ─── Copiar (PAI-17) ─────────────────────────────────────────────────────────
//
// O sucesso é toast; a falha pede atenção, então vira aviso persistente na
// área, ao lado do PAI-15 do apagar.

async function copiarFrase(id) {
  const frase = todasFrases.find(f => String(f.id) === String(id));
  if (!frase) return;
  try {
    await navigator.clipboard.writeText(frase.texto);
    mostrarToastDeSucesso(textoDaVoz('PAI-17.sucesso'));
  } catch (err) {
    // Falha pede atenção, então não é toast: é o aviso, com a causa em Detalhes.
    mostrarAvisoNaArea('copiar', { texto: textoDaVoz('PAI-17.falha'), erro: err });
  }
}

/** Um aviso persistente por chave na área de Frases, com a causa em Detalhes. */
function mostrarAvisoNaArea(chave, { erro, ...opcoes }) {
  tirarAvisoDaArea(chave);
  const aviso = montarAviso({
    ...opcoes,
    // Sem erro, sem “Detalhes”: a causa técnica fica em outro lugar (ADD-06: o card da conta).
    ...(erro ? { detalhes: String(erro.message || erro) } : {}),
    rotuloDeFechar: textoDaVoz('PAI-34'),
  });
  aviso.dataset.aviso = chave;
  document.getElementById('frases-avisos').append(aviso);
}

function tirarAvisoDaArea(chave) {
  document.querySelector(`#frases-avisos [data-aviso="${chave}"]`)?.remove();
}

// ─── Apagar (PAI-12 · PAI-13 · PAI-14 · PAI-15) ──────────────────────────────
//
// Um só modal para 1 frase (a ação do cartão) e para a seleção (a barra). O
// corpo fala dos outros computadores só com a conta conectada. Para 1 frase
// não há toast (o cartão some); para a seleção, “12 frases apagadas”. Se a
// nuvem falha, fica o aviso persistente PAI-15 com Tentar de novo.

/**
 * O modal do apagar, um só para a frase do cartão e para a seleção. Quem manda
 * no texto é a contagem, não de onde veio: uma frase é “Apagar esta frase?”
 * (PAI-12) e some da tela sem toast; várias são PAI-13, com o toast PAI-14.
 */
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
  await new Promise(resolve => chrome.storage.local.set({ frases: todasFrases }, resolve));
  atualizarTotal();
  aplicarFiltro();
  // Uma frase só não precisa de toast: o cartão sumindo já é a resposta (PAI-16).
  if (toast) mostrarToastDeSucesso(textoDaVoz('PAI-14', { n: ids.length }));
  await apagarDaNuvem(ids);
}

async function apagarDaNuvem(ids) {
  const erro = await sincronizacao.apagar(ids);
  if (!erro) return;
  ids.forEach(id => idsAindaNaNuvem.add(id));
  // O aviso PAI-15 conta o que ficou na nuvem; o card e o chip da conta contam
  // que este computador está sem sincronizar, como em qualquer falha de nuvem.
  mostrarAvisoAindaNaNuvem(erro);
  mostrarFalhaNaNuvem(erro);
}

/** O aviso PAI-15: um só, que junta todas as frases que ficaram na nuvem. */
function mostrarAvisoAindaNaNuvem(erro) {
  mostrarAvisoNaArea('ainda-na-nuvem', {
    texto: textoDaVoz('PAI-15.aviso'),
    acao: { rotulo: textoDaVoz('PAI-15.tentarDeNovo'), aoUsar: tentarApagarDaNuvemDeNovo },
    erro,
    // Fechar só tira o aviso: o tombstone continua, e o próximo carregamento tenta de novo.
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
  // A nuvem respondeu: o card e o chip da conta deixam de dizer “sem sincronizar”.
  Conta.mostrarSincronizacao(SITUACOES.SINCRONIZADO);
}

// Roda depois que a pessoa confirma no modal da Zona de perigo (painel-perigo.js).
function apagarTudo() {
  const ids = todasFrases.map(f => String(f.id));
  todasFrases = [];
  Object.keys(keywords).forEach(k => delete keywords[k]);
  selecionadas.clear();
  atualizarContadorSelecao();
  // A chave da OpenAI também sai (#154): daqui, da Conexão e, com conta, da nuvem, mesmo que ainda não tenha chegado aqui.
  ChaveDaOpenAI.apagar({ mesmoSemChave: Boolean(usuarioLogado) });
  const naNuvem = sincronizacao.apagarTudo(ids).then(({ ok, erro }) => {
    if (!ok) {
      console.error('[Firestore] apagar tudo falhou:', erro);
      mostrarFalhaNaNuvem(erro);
    }
    return ok;
  });
  chrome.storage.local.set({ frases: [] }, async () => {
    atualizarTotal();
    paginaAtual = 1;
    aplicarFiltro();
    // CFG-18 só quando as frases sumiram de todo lugar que a Zona de perigo
    // prometeu. Uma falha na nuvem aparece no card Conta & sync e no chip (Q4).
    if (await naNuvem) mostrarToastDeSucesso(textoDaVoz('CFG-18'));
  });
}

// ─── Exportar .txt (PAI-19) ──────────────────────────────────────────────────
//
// Baixa as selecionadas e as marca Exportada (`exportadaTxt`). Nunca grava o
// `status: 'exported'` do Envio: exportar não põe a frase no Anki (#9).

function exportarTxt() {
  if (selecionadas.size === 0) return;
  const linhas = todasFrases
    .filter(f => selecionadas.has(f.id))
    .map(linhaDoTxt)
    .filter(l => l.trim().length > 0);

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
  chrome.storage.local.set({ frases: todasFrases }, () => {
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

// ─── Envio ao Anki (painel-envio.js) ─────────────────────────────────────────
//
// O Envio mora em painel-envio.js; daqui saem só as frases e o que se faz com
// elas. Ele começa depois da primeira leitura do histórico, porque o resumo de
// um envio que terminou com o painel fechado pode abrir na hora e gravar nelas.

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

/** Enviada ao Anki (ENV-12): sem toast, e a seleção fica como está (#9). */
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
  await chromeSet({ frases: todasFrases });
  if (nuvem) nuvem.gravarFrases(marcadas).catch(err => mostrarFalhaNaNuvem(err));
  aplicarFiltro();
}


// ─── Editar contexto (PAI-20 · PAI-21 · PAI-22) ──────────────────────────────
//
// Um modal para 1 frase (a ação do cartão, ou a seleção de uma só) e para N (a
// barra). Com 1, os campos trazem o Contexto dela e salvar não dá toast. Com N,
// os campos vêm em branco, campo em branco fica como está, e o toast diz
// quantas frases mudaram.

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

/** Abre o modal e guarda como fechá-lo, para o × e o Cancelar acharem o dono. */
function abrirModalDeFrases(id, aoFechar) {
  modalAberto = abrirModal(document.getElementById(id), {
    aoFechar: () => { modalAberto = null; aoFechar(); },
  });
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

// A seleção fica de pé depois de salvar: quem acabou de arrumar o Contexto de
// 12 frases quase sempre vai exportar ou enviar as mesmas 12 em seguida.
function salvarContextoDeVarias(ids, { fonte, titulo, detalhe }) {
  const alvo = new Set(ids);
  const editadas = [];
  todasFrases = todasFrases.map(f => {
    if (!alvo.has(f.id)) return f;
    const ctx = { ...(f.contexto || { fonte: f.streaming || '', titulo: '', detalhe: '' }) };
    if (fonte)   ctx.fonte   = fonte;
    if (titulo)  ctx.titulo  = titulo;
    if (detalhe) ctx.detalhe = detalhe;
    const updated = { ...f, ...(fonte ? { streaming: fonte } : {}), contexto: ctx };
    editadas.push(updated);
    return updated;
  });
  chrome.storage.local.set({ frases: todasFrases }, () => {
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
  todasFrases[idx] = { ...f, streaming: novaFonte, contexto: { fonte: novaFonte, titulo, detalhe } };
  chrome.storage.local.set({ frases: todasFrases }, () => {
    construirFiltroDeFonte();
    aplicarFiltro();
  });
  salvarFraseFirestore(todasFrases[idx]);
}

// ─── Context Render ───────────────────────────────────────────────────────────

// ─── Tokenizer ────────────────────────────────────────────────────────────────

function tokenizarFrase(texto) {
  return (texto.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[^\p{L}\p{N}]/gu) || []).map(tok => {
    const isWord = /[\p{L}\p{N}]/u.test(tok);
    return { text: tok, isWord, clean: isWord ? tok.toLowerCase() : null };
  });
}

// ─── Minerar frases (ADD-01…12) ───────────────────────────────────────────────
//
// [Minerar frases ▾] no cabeçalho abre o menu Colar · Arquivo .txt · Foto.
// Colar e Arquivo .txt abrem o mesmo modal, já na aba certa; Foto abre Minerar
// de uma foto numa aba nova.
//
// Cada frase é gravada pelo service worker (`SALVAR_HISTORICO`), uma por vez,
// na fila de gravação dele: o progresso “Minerando 3 de 12…” anda só quando a
// gravação daquela frase volta confirmada, e a lista a mostra pelo
// `chrome.storage.onChanged`. Com a conta, as frases sobem para a nuvem juntas
// no fim; se a nuvem falha, fica o aviso persistente ADD-06 com Tentar de
// novo, e o card e o chip da conta dizem que o computador está sem sincronizar.

// Uma mineração por vez: o duplo clique em “Minerar N frases” não grava duas vezes (#9).
let mineracaoEmCurso = false;
// O modal de Minerar frases aberto, para o fim da mineração fechar só ele.
let modalDeMinerar = null;
// As frases mineradas aqui que não chegaram à nuvem (ADD-06).
const idsMineradosForaDaNuvem = new Set();

function configurarMinerarFrases() {
  const botao = document.getElementById('btn-minerar-frases');
  const menu  = document.getElementById('menu-minerar');

  botao.addEventListener('click', () => {
    if (menuDeMinerarAberto()) fecharMenuDeMinerar();
    else                       abrirMenuDeMinerar(0);
  });
  botao.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    abrirMenuDeMinerar(e.key === 'ArrowUp' ? -1 : 0);
  });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-minerar]');
    if (!item) return;
    // O foco volta ao botão antes: é para ele que o modal devolve o foco ao fechar.
    fecharMenuDeMinerar();
    escolherModoDeMinerar(item.dataset.minerar);
  });
  menu.addEventListener('keydown', aoTeclarNoMenuDeMinerar);
  menu.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !e.relatedTarget.closest('.minerar-menu')) fecharMenuDeMinerar({ devolverFoco: false });
  });
  document.addEventListener('click', (e) => {
    if (menuDeMinerarAberto() && !e.target.closest('.minerar-menu')) fecharMenuDeMinerar({ devolverFoco: false });
  });

  for (const radio of document.querySelectorAll('input[name="aba-minerar"]')) {
    radio.addEventListener('change', () => mostrarAbaDeMinerar(radio.value));
  }
  document.getElementById('btn-minerar-foto').addEventListener('click', () => {
    modalDeMinerar?.fechar();
    abrirMinerarDeUmaFoto();
  });

  const campo = document.getElementById('minerar-frases');
  campo.placeholder = textoDaVoz('ADD-02');
  document.getElementById('minerar-fonte').placeholder  = textoDaVoz('ADD-12.exemploFonte');
  document.getElementById('minerar-titulo').placeholder = textoDaVoz('ADD-12.exemploTitulo');
  campo.addEventListener('input', () => {
    atualizarContagemDeColar();
    if (linhasColadas().length > 0) mostrarErroDeColar(null);
  });
  document.getElementById('minerar-colar').addEventListener('submit', (e) => {
    e.preventDefault();
    minerarColadas();
  });

  const escolha = document.getElementById('minerar-arquivo-escolha');
  document.getElementById('btn-minerar-escolher').addEventListener('click', () => escolha.click());
  escolha.addEventListener('change', () => {
    const arquivo = escolha.files?.[0];
    escolha.value = '';
    if (arquivo) importarArquivoTxt(arquivo);
  });
}

// ─── O menu ───

function itensDoMenuDeMinerar() {
  return [...document.querySelectorAll('#menu-minerar [role="menuitem"]')];
}

function menuDeMinerarAberto() {
  return !document.getElementById('menu-minerar').hidden;
}

/** Abre o menu com o foco no item `indice` (-1 é o último). */
function abrirMenuDeMinerar(indice) {
  document.getElementById('menu-minerar').hidden = false;
  document.getElementById('btn-minerar-frases').setAttribute('aria-expanded', 'true');
  itensDoMenuDeMinerar().at(indice).focus();
}

function fecharMenuDeMinerar({ devolverFoco = true } = {}) {
  document.getElementById('menu-minerar').hidden = true;
  const botao = document.getElementById('btn-minerar-frases');
  botao.setAttribute('aria-expanded', 'false');
  if (devolverFoco) botao.focus();
}

/** Setas andam pelos modos (e dão a volta), Home/End vão às pontas, Esc e Tab fecham. */
function aoTeclarNoMenuDeMinerar(e) {
  const itens = itensDoMenuDeMinerar();
  const atual = itens.indexOf(document.activeElement);
  const passos = { ArrowDown: 1, ArrowUp: -1 };
  if (e.key in passos) {
    e.preventDefault();
    itens[(atual + passos[e.key] + itens.length) % itens.length].focus();
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    itens.at(e.key === 'Home' ? 0 : -1).focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    fecharMenuDeMinerar();
  } else if (e.key === 'Tab') {
    fecharMenuDeMinerar({ devolverFoco: false });
  }
}

function escolherModoDeMinerar(modo) {
  if (modo === 'foto') abrirMinerarDeUmaFoto();
  else                 abrirMinerarFrases(modo);
}

function abrirMinerarDeUmaFoto() {
  chrome.tabs.create({ url: chrome.runtime.getURL('bookreader.html') });
}

// ─── O modal ───

/** Abre o modal limpo, na aba `colar` ou `arquivo`. */
function abrirMinerarFrases(aba) {
  if (mineracaoEmCurso) return;
  document.getElementById('minerar-frases').value = '';
  document.getElementById('minerar-fonte').value  = '';
  document.getElementById('minerar-titulo').value = '';
  mostrarErroDeColar(null);
  atualizarContagemDeColar();
  mostrarArquivoEscolhido(null);
  document.getElementById('minerar-edicao').hidden    = false;
  document.getElementById('minerar-progresso').hidden = true;
  mostrarAbaDeMinerar(aba);

  modalAberto = abrirModal(document.getElementById('modal-minerar'), {
    aoFechar: () => { modalAberto = null; modalDeMinerar = null; },
  });
  modalDeMinerar = modalAberto;
  focarAbaDeMinerar(aba);
}

function mostrarAbaDeMinerar(aba) {
  document.querySelector(`input[name="aba-minerar"][value="${aba}"]`).checked = true;
  document.getElementById('minerar-colar').hidden   = aba !== 'colar';
  document.getElementById('minerar-arquivo').hidden = aba !== 'arquivo';
}

function focarAbaDeMinerar(aba) {
  document.getElementById(aba === 'colar' ? 'minerar-frases' : 'btn-minerar-escolher').focus();
}

/** O progresso (ADD-04) toma o lugar das abas e dos campos até a última frase. */
function mostrarProgressoDeMinerar(feitas, total) {
  document.getElementById('minerar-edicao').hidden    = true;
  document.getElementById('minerar-progresso').hidden = false;
  document.getElementById('minerar-progresso-rotulo').textContent = textoDaVoz('ADD-04', { n: feitas, total });
  const barra = document.querySelector('#minerar-progresso .minerar-progresso__barra');
  barra.setAttribute('aria-valuenow', String(feitas));
  barra.setAttribute('aria-valuemax', String(total));
  barra.firstElementChild.style.width = `${total ? (feitas / total) * 100 : 0}%`;
}

// ─── Colar ───

/** As linhas com texto, sem as em branco: uma frase por linha, no Colar e no .txt. */
function linhasDoTexto(texto) {
  return texto.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
}

function linhasColadas() {
  return linhasDoTexto(document.getElementById('minerar-frases').value);
}

/** A contagem ao vivo (“3 frases”) e o botão “Minerar 3 frases”. */
function atualizarContagemDeColar() {
  const n = linhasColadas().length;
  document.getElementById('minerar-contagem').textContent = textoDaVoz('PAI-05', { n });
  document.getElementById('btn-minerar-colar').textContent = n
    ? textoDaVoz('ADD-12.minerar', { n })
    : textoDaVoz('ADD-01.botao');
}

/** O erro do campo (ADD-03), dito por `aria-invalid` e ligado ao campo. `null` tira. */
function mostrarErroDeColar(mensagem) {
  const campo = document.getElementById('minerar-frases');
  const erro  = document.getElementById('minerar-frases-erro');
  erro.textContent = mensagem || '';
  erro.hidden = !mensagem;
  if (mensagem) campo.setAttribute('aria-invalid', 'true');
  else          campo.removeAttribute('aria-invalid');
}

/** Roda `minerar` se nenhuma outra mineração está em curso; senão, não faz nada. */
async function umaMineracaoPorVez(minerar) {
  if (mineracaoEmCurso) return;
  mineracaoEmCurso = true;
  try { await minerar(); }
  finally { mineracaoEmCurso = false; }
}

function minerarColadas() {
  return umaMineracaoPorVez(minerarColadasAgora);
}

async function minerarColadasAgora() {
  const linhas = linhasColadas();
  if (linhas.length === 0) {
    mostrarErroDeColar(textoDaVoz('ADD-03'));
    document.getElementById('minerar-frases').focus();
    return;
  }
  const fonte  = document.getElementById('minerar-fonte').value.trim() || FONTE_MANUAL;
  const titulo = document.getElementById('minerar-titulo').value.trim();
  const resultado = await minerarEmSequencia(linhas.map(texto => ({ texto, contexto: { fonte, titulo, detalhe: '' } })));
  concluirMineracao(resultado, n => textoDaVoz('ADD-05', { n }));
}

// ─── Arquivo .txt ───

/** O nome do arquivo escolhido na área (ou o convite, sem arquivo), e limpa o resultado anterior. */
function mostrarArquivoEscolhido(nome) {
  document.getElementById('minerar-arquivo-nome').textContent = nome || textoDaVoz('ADD-12.arquivo');
  document.getElementById('btn-minerar-escolher').textContent =
    textoDaVoz(nome ? 'ADD-12.escolherOutro' : 'ADD-12.escolher');
  document.getElementById('btn-minerar-arquivo-sair').textContent = textoDaVoz('ADD-12.cancelar');
  mostrarFimDoArquivo({});
}

/** O fim que fica no modal: um erro (ADD-07, ADD-08) ou o nada novo (ADD-09), que troca Cancelar por Fechar. */
function mostrarFimDoArquivo({ erro, resultado }) {
  const noErro      = document.getElementById('minerar-arquivo-erro');
  const noResultado = document.getElementById('minerar-arquivo-resultado');
  noErro.textContent      = erro || '';
  noErro.hidden           = !erro;
  noResultado.textContent = resultado || '';
  noResultado.hidden      = !resultado;
  if (resultado) document.getElementById('btn-minerar-arquivo-sair').textContent = textoDaVoz('ADD-12.fechar');
}

/**
 * Importa ao escolher. Frases que já estão no histórico (ou repetidas no próprio
 * arquivo) ficam de fora; uma linha exportada daqui volta com o Contexto e a Palavra.
 */
function importarArquivoTxt(arquivo) {
  // Desde a escolha: enquanto o arquivo é lido, o Colar não começa outra (#9).
  return umaMineracaoPorVez(() => importarArquivoTxtAgora(arquivo));
}

async function importarArquivoTxtAgora(arquivo) {
  mostrarArquivoEscolhido(arquivo.name);

  let conteudo;
  try { conteudo = await lerArquivoDeTexto(arquivo); }
  catch { mostrarFimDoArquivo({ erro: textoDaVoz('ADD-07') }); return; }

  const linhas = linhasDoTexto(conteudo);
  if (linhas.length === 0) { mostrarFimDoArquivo({ erro: textoDaVoz('ADD-08') }); return; }

  const jaExistem = new Set(todasFrases.map(f => chaveDeRepetida(f.texto)));
  const novas = [];
  let duplicadas = 0;
  let invalidas  = 0;
  for (const linha of linhas) {
    const lida = lerLinhaDoTxt(linha);
    if (!lida) { invalidas++; continue; }
    const chave = chaveDeRepetida(lida.texto);
    if (jaExistem.has(chave)) { duplicadas++; continue; }
    jaExistem.add(chave);
    novas.push(lida);
  }

  if (novas.length === 0) {
    // Só a parte que aconteceu: nunca “0 linhas não puderam ser lidas”.
    const parte = !invalidas ? 'soRepetidas' : !duplicadas ? 'soIlegiveis' : 'ambas';
    mostrarFimDoArquivo({ resultado: textoDaVoz(`ADD-09.${parte}`, { duplicadas, invalidas }) });
    return;
  }

  const resultado = await minerarEmSequencia(novas);
  concluirMineracao(resultado, n => (duplicadas > 0
    ? textoDaVoz('ADD-10', { n, duplicadas })
    : textoDaVoz('ADD-05', { n })));
}

/** O texto do arquivo em UTF-8. Um binário (UTF-8 inválido ou com NUL) é ilegível (ADD-07). */
async function lerArquivoDeTexto(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (texto.includes('\u0000')) throw new Error('arquivo binário');
  return texto;
}

function chaveDeRepetida(texto) {
  return texto.replace(/\s+/g, ' ').trim().toLowerCase();
}

// ─── Gravar ───

/**
 * Grava as frases uma por vez pelo service worker e anda o progresso a cada
 * gravação confirmada. Cada uma é `{ texto, contexto, palavras? }`: `palavras`
 * (mesmo vazia) diz que a Palavra já veio com a linha, sem a detecção automática.
 */
async function minerarEmSequencia(frases) {
  const mineradas = [];
  let erroLocal = null;
  mostrarProgressoDeMinerar(0, frases.length);
  try {
    for (const { texto, contexto, palavras } of frases) {
      const resposta = await Mineracao.gravar({ texto, contexto, palavras, semNuvem: true });
      if (!resposta.ok) throw new Error(resposta.error);
      mineradas.push(resposta.frase);
      mostrarProgressoDeMinerar(mineradas.length, frases.length);
    }
  } catch (err) {
    erroLocal = err;
  }
  // A mineração só termina quando a nuvem também respondeu: até lá, outro
  // clique não começa uma segunda.
  const erroNaNuvem = await sincronizacao.subirFrases(mineradas);
  return { mineradas, erroLocal, erroNaNuvem };
}

/**
 * O fim: o toast de sucesso, ou o aviso ADD-06 quando a nuvem falhou. Uma
 * gravação que falhou neste computador fica como aviso GLB-01, com o que já
 * entrou contado no resto.
 */
function concluirMineracao({ mineradas, erroLocal, erroNaNuvem }, textoDoSucesso) {
  modalDeMinerar?.fechar();
  if (erroLocal) mostrarAvisoNaArea('minerar', { texto: textoDaVoz('GLB-01'), erro: erroLocal });
  if (erroNaNuvem) {
    mineradas.forEach(f => idsMineradosForaDaNuvem.add(f.id));
    mostrarAvisoForaDaNuvem(erroNaNuvem);
    return;
  }
  if (!erroLocal && mineradas.length > 0) mostrarToastDeSucesso(textoDoSucesso(mineradas.length));
}

/**
 * O aviso ADD-06: um só, que junta todas as frases mineradas que não subiram.
 * O card e o chip da conta dizem junto que este computador está sem sincronizar.
 */
function mostrarAvisoForaDaNuvem(erro) {
  mostrarFalhaNaNuvem(erro);
  mostrarAvisoNaArea('fora-da-nuvem', {
    texto: textoDaVoz('ADD-06.aviso', { n: idsMineradosForaDaNuvem.size }),
    acao: { rotulo: textoDaVoz('ADD-06.tentarDeNovo'), aoUsar: tentarSubirDeNovo },
    // Sem “Detalhes” aqui (decisão do dono): a causa já vai para o card Conta & sync.
    // Fechar só tira o aviso: elas seguem em pm_pending_sync, e o próximo carregamento tenta de novo.
    aoFechar: () => idsMineradosForaDaNuvem.clear(),
  });
}

async function tentarSubirDeNovo() {
  const frases = todasFrases.filter(f => idsMineradosForaDaNuvem.has(f.id));
  const erro = await sincronizacao.subirFrases(frases);
  if (erro) {
    mostrarAvisoForaDaNuvem(erro);
    return;
  }
  idsMineradosForaDaNuvem.clear();
  tirarAvisoDaArea('fora-da-nuvem');
  // A nuvem respondeu: o card e o chip da conta deixam de dizer “sem sincronizar”.
  Conta.mostrarSincronizacao(SITUACOES.SINCRONIZADO);
}

// ─── A linha do .txt ──────────────────────────────────────────────────────────
//
// “palavra : texto [Contexto: fonte - título - detalhe]”, uma frase por linha.
// A Palavra sai sem a posição (`word@3` → `word`), com os grupos separados por
// “ | ”. Uma frase sem Palavra cujo texto tem “ : ” sai com o prefixo vazio
// (“: texto”), para o “ : ” do texto não ser lido como o fim da Palavra (#9).

/** A Palavra como vai no .txt (“cold feet | wedding”), ou '' sem Palavra. */
function palavrasDoTxt(frase) {
  const kws = keywords[frase.id] || [];
  if (kws.length === 0) return '';
  return kws.map(w => w === '|' ? '|' : w.replace(/@\d+$/, '')).join(' ')
    .replace(/\s+\|\s+/g, ' | ').replace(/\s*\|\s*$/, '').trim();
}

/**
 * A linha da frase no .txt, para voltar inteira na leitura (`lerLinhaDoTxt`).
 * Um grupo da Palavra que já não está no texto (o texto foi editado depois)
 * fica de fora: lido de volta, ele sairia colado no começo do texto.
 */
function linhaDoTxt(frase) {
  const texto = frase.texto.replace(/\s+/g, ' ').trim();
  const palavra = palavrasDoTxt(frase).split(' | ')
    .filter(grupo => palavrasNoTexto(grupo, texto))
    .join(' | ');
  // Um “ : ” no texto, ou um “ :” no fim dele, seria lido como o fim da Palavra.
  const precisaDoPrefixoVazio = `${texto} `.includes(' : ') || texto.startsWith(':');
  const prefixo = palavra ? `${palavra} : ` : (precisaDoPrefixoVazio ? ': ' : '');
  return `${prefixo}${texto} ${contextoDaLinha(frase)}`;
}

/**
 * A linha que o Anki Bridge lê com o parser dele, que não conhece o prefixo
 * vazio: a Palavra como está, sem as duas regras do .txt.
 */
function linhaParaOAnki(frase) {
  const texto = frase.texto.replace(/\s+/g, ' ').trim();
  const palavra = palavrasDoTxt(frase);
  return `${palavra ? `${palavra} : ` : ''}${texto} ${contextoDaLinha(frase)}`;
}

function contextoDaLinha(frase) {
  const fonte   = sanitizarCampo(frase.contexto?.fonte || frase.streaming);
  const titulo  = sanitizarCampo(frase.contexto?.titulo);
  const detalhe = sanitizarCampo(frase.contexto?.detalhe);
  return `[Contexto: ${fonte} - ${titulo} - ${detalhe}]`;
}

/**
 * Lê uma linha do .txt: `{ texto, contexto, palavras? }`, ou `null` quando não
 * sobra texto. Uma linha no formato exportado (com “[Contexto: …]”) traz
 * `palavras`, mesmo vazia; uma linha simples fica sem, e ganha a Palavra
 * detectada como uma frase colada.
 *
 * O prefixo antes do primeiro “ : ” só é a Palavra se cada palavra dele estiver
 * no texto depois: é o que separa “harbour : The harbour : a quiet place.” de
 * “Note : this matters.” num .txt exportado antes do prefixo vazio existir.
 */
function lerLinhaDoTxt(linha) {
  let resto = linha.trim();
  let contexto = null;
  const ctx = resto.match(/\s*\[Contexto:\s*(.*)\]\s*$/);
  if (ctx) {
    resto = resto.slice(0, ctx.index).trim();
    contexto = lerContextoDoTxt(ctx[1]);
  }

  let texto = resto;
  let palavras = null;
  if (resto === ':' || resto.startsWith(': ')) {
    texto = resto.slice(1).trim();
    palavras = [];
  } else {
    const separador = `${resto} `.indexOf(' : ');
    if (separador >= 0) {
      const prefixo = resto.slice(0, separador).trim();
      const depois  = resto.slice(separador + 3).trim();
      // “palavra : [Contexto: …]”: a Palavra sem frase não é uma linha que dê para ler.
      if (ctx && !depois) return null;
      const achadas = palavrasNoTexto(prefixo, depois);
      if (achadas) { texto = depois; palavras = achadas; }
    }
  }

  if (!texto) return null;
  const fonte = contexto?.fonte || FONTE_IMPORTADO;
  return {
    texto,
    contexto: { fonte, titulo: contexto?.titulo || '', detalhe: contexto?.detalhe || '' },
    // Uma linha exportada daqui já diz a Palavra, mesmo sem nenhuma; uma
    // linha simples só diz quando o prefixo casou com o texto.
    ...(ctx || palavras ? { palavras: palavras || [] } : {}),
  };
}

/**
 * “fonte - título - detalhe”, com “Desconhecido” no lugar do vazio. Um Título
 * com “ - ” (“Dark - Season 1”) fica inteiro: a Fonte é a primeira parte e o
 * Detalhe, a última.
 */
function lerContextoDoTxt(texto) {
  const partes = texto.split(' - ').map(p => p.trim());
  const limpo = p => (p && !/^Desconhecido$/i.test(p) ? p : '');
  if (partes.length <= 3) {
    return { fonte: limpo(partes[0]), titulo: limpo(partes[1]), detalhe: limpo(partes[2]) };
  }
  return { fonte: limpo(partes[0]), titulo: limpo(partes.slice(1, -1).join(' - ')), detalhe: limpo(partes.at(-1)) };
}

/**
 * As Palavras de volta com a posição na frase (`word@índice`, `|` entre os
 * grupos), ou `null` se alguma não está no texto. Uma palavra repetida no
 * texto volta na primeira vez que aparece depois da anterior do mesmo grupo.
 */
function palavrasNoTexto(prefixo, texto) {
  const grupos = prefixo.split('|')
    .map(g => g.trim().split(/\s+/).filter(Boolean).map(w => w.toLowerCase()))
    .filter(g => g.length > 0);
  if (grupos.length === 0 || !texto) return null;
  const tokens = tokenizarFrase(texto);
  const palavras = [];
  for (const grupo of grupos) {
    if (palavras.length > 0) palavras.push('|');
    let depoisDe = 0;
    for (const palavra of grupo) {
      const i = tokens.findIndex((t, idx) => idx >= depoisDe && t.isWord && t.clean === palavra);
      if (i < 0) return null;
      palavras.push(`${palavra}@${i}`);
      depoisDe = i + 1;
    }
  }
  return palavras;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizarCampo(val) {
  const s = String(val ?? '').trim();
  return s && s !== 'undefined' && s !== 'null' ? s : 'Desconhecido';
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mostrarToast(msg) {
  document.getElementById('_toast')?.remove();
  const t = document.createElement('div');
  t.id = '_toast';
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '28px', right: '28px',
    background: '#7c3aed', color: 'white',
    padding: '9px 18px', borderRadius: '8px',
    fontSize: '13px', fontFamily: 'inherit',
    zIndex: '9999', boxShadow: '0 4px 14px rgba(124,58,237,0.4)',
    transition: 'opacity 0.3s',
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 1800);
}

function chromeGet(defaults) {
  return new Promise(resolve => chrome.storage.local.get(defaults, resolve));
}

function chromeSet(itens) {
  return new Promise(resolve => chrome.storage.local.set(itens, resolve));
}
