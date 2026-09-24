'use strict';

// A base compartilhada (catálogo da Voz e detecção de idioma) é carregada antes
// deste arquivo, pelo painel.html: a busca no catálogo é `PerpetualMiner.textoDaVoz`.
const { detectarIdioma, IDIOMAS, textoDaVoz, CATALOGO_DA_VOZ, Atalhos } = PerpetualMiner;
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
const { SITUACOES } = Conta;
const { mostrarToastDeSucesso, abrirModal, montarAviso } = PerpetualMiner.Veio;

// ─── Constantes ──────────────────────────────────────────────────────────────

const POR_PAGINA = 10;

// O atalho de legenda gravado em Configurações › Atalhos (lib/atalhos.js), que
// o vazio de Frases (PAI-02) ensina. Começa no padrão até a leitura voltar.
let atalhoDeLegenda = Atalhos.ATALHOS_PADRAO.legenda;

// As Fontes que o catálogo nomeia (PAI-29). Os nomes antigos gravados em
// frases de antes apontam para o nome de hoje.
const APELIDOS_DE_FONTE = { amazon: 'primevideo', hbomax: 'max', disney: 'disneyplus', star: 'starplus' };

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

// Firestore REST — sem nenhum SDK (evita violações de CSP em extensões MV3)
const FIRESTORE_BASE    = 'https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents';
const GOOGLE_USERINFO   = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
const FIREBASE_API_KEY  = 'AIzaSyDrbDVUvv8wyoYqjCr5jEMBJPPsIP2k1Ak';
const FB_SIGNIN_URL     = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`;
const FB_REFRESH_URL    = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
const BRIDGE_URL        = 'http://127.0.0.1:8766';
const BRIDGE_PRESETS_KEY = 'ankiBridgePresets';
const DEFAULT_BRIDGE_PRESETS = {
  en: { deckName: 'CIMV', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' },
  ru: { deckName: 'RUSSIAN', imageSource: '1', ttsWordTld: 'ru',  ttsPhraseTld: 'ru' },
};

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

// usuarioLogado: { uid, email, displayName, photoURL, accessToken, expiresAt } | null
let usuarioLogado = null;

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
let bridgePresets      = structuredClone(DEFAULT_BRIDGE_PRESETS);
let bridgePollingId    = null;
let bridgeActiveJobIds = [];
const bridgeCleanupPromptedKeys = new Set();
let bridgeAnalyticsRange = 'today';
let bridgeVocabularyTimer = null;
let bridgeVocabularyDeck = { lang: 'en' };

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupListeners();
  inicializarBridgeUI();
  Shell.aoEntrarNaArea('anki', () => atualizarBridgeWorkspaceData({ includeAnki: true, launchAnki: true }));
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
    usuarioLogado = {
      ...data.pm_user_info,
      accessToken:  data.pm_firebase_auth.idToken,
      refreshToken: data.pm_firebase_auth.refreshToken || null,
      expiresAt:    data.pm_firebase_auth.expiresAt,
    };
    atualizarUIAuth(usuarioLogado);
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
      accessToken:  fbData.idToken,
      refreshToken: fbData.refreshToken,
      expiresAt:    Date.now() + 55 * 60 * 1000,
    };
    chrome.storage.local.set({
      pm_firebase_auth: {
        uid:          usuarioLogado.uid,
        idToken:      fbData.idToken,
        refreshToken: fbData.refreshToken,
        expiresAt:    usuarioLogado.expiresAt,
      },
      pm_user_info: { uid: usuarioLogado.uid, email: usuarioLogado.email, displayName: usuarioLogado.displayName, photoURL: usuarioLogado.photoURL },
    });

    atualizarUIAuth(usuarioLogado);

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

// ─── Falhas na nuvem ─────────────────────────────────────────────────────────
//
// Um problema de sync aparece só no card Conta & sync e no chip (Q4 da spec de
// Configurações), nunca num toast. A falha carrega a situação que a Conta mostra:
// EXPIROU quando a sessão não renova, RECUSADO quando as regras do Firestore
// recusam a conta, e SEM_SINCRONIZAR para o resto (rede, nuvem fora do ar).

function erroDaNuvem(mensagem, situacao) {
  const erro = new Error(mensagem);
  erro.situacao = situacao;
  return erro;
}

async function erroDaResposta(resp) {
  const corpo = await resp.json().catch(() => ({}));
  const mensagem = corpo?.error?.message || `HTTP ${resp.status}`;
  if (resp.status === 401) return erroDaNuvem(mensagem, SITUACOES.EXPIROU);
  if (resp.status === 403 || corpo?.error?.status === 'PERMISSION_DENIED') return erroDaNuvem(mensagem, SITUACOES.RECUSADO);
  return new Error(mensagem);
}

// `semSincronizar` é o que a falha genérica mostra: depois de uma primeira
// subida que não chegou à nuvem, é a falha dela (CFG-09).
function situacaoDoErro(err, semSincronizar = SITUACOES.SEM_SINCRONIZAR) {
  return err?.situacao || semSincronizar;
}

function mostrarFalhaNaNuvem(err, semSincronizar) {
  Conta.mostrarSincronizacao(situacaoDoErro(err, semSincronizar), { detalhes: err?.message || String(err) });
}

// Retorna um Firebase ID token válido, renovando silenciosamente via refresh token
async function getValidToken() {
  if (!usuarioLogado) throw new Error('Não autenticado');

  const expirando = !usuarioLogado.accessToken || Date.now() > (usuarioLogado.expiresAt || 0) - 2 * 60 * 1000;
  if (!expirando) return usuarioLogado.accessToken;

  if (!usuarioLogado.refreshToken) throw erroDaNuvem('Sem refresh token', SITUACOES.EXPIROU);

  const resp = await fetch(FB_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: usuarioLogado.refreshToken }),
  });
  if (!resp.ok) {
    // Qualquer recusa da renovação é a sessão que acabou (CFG-08).
    const recusa = await erroDaResposta(resp);
    throw erroDaNuvem(recusa.message, SITUACOES.EXPIROU);
  }

  const data = await resp.json();
  usuarioLogado.accessToken  = data.id_token;
  usuarioLogado.refreshToken = data.refresh_token;
  usuarioLogado.expiresAt    = Date.now() + 55 * 60 * 1000;
  chrome.storage.local.set({
    pm_firebase_auth: {
      uid:          usuarioLogado.uid,
      idToken:      data.id_token,
      refreshToken: data.refresh_token,
      expiresAt:    usuarioLogado.expiresAt,
    },
  });
  return data.id_token;
}

// ─── Firestore REST API ───────────────────────────────────────────────────────

async function fsRequest(method, path, body = null, _retry = false) {
  const token = await getValidToken();
  const url   = `${FIRESTORE_BASE}/${path}`;
  const opts  = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const resp = await fetch(url, opts);

  if (resp.status === 401 && !_retry) {
    // Token recusado — força renovação e tenta uma vez mais
    usuarioLogado.accessToken = null;
    usuarioLogado.expiresAt   = 0;
    return fsRequest(method, path, body, true);
  }

  // 404 em DELETE = documento já não existe, tudo certo
  if (resp.status === 404 && method === 'DELETE') return null;

  if (!resp.ok) throw await erroDaResposta(resp);
  return resp.json().catch(() => null);
}

async function firestoreGetAll() {
  const frases = [];
  let pageToken = '';
  do {
    const path = `usuarios/${usuarioLogado.uid}/frases?pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
    const data = await fsRequest('GET', path);
    (data?.documents || []).forEach(doc => frases.push(docToObj(doc.fields)));
    pageToken = data?.nextPageToken || '';
  } while (pageToken);
  return frases;
}

// campos: array de strings com os campos a atualizar (ex: ['keywords']).
// Se null, envia todos os campos. Retorna Promise para poder ser aguardada.
async function firestorePatch(frase, campos = null) {
  if (!usuarioLogado) return;
  let path = `usuarios/${usuarioLogado.uid}/frases/${frase.id}`;
  if (campos?.length) {
    // updateMask garante que SOMENTE esses campos são escritos — o resto é preservado
    path += '?' + campos.map(c => `updateMask.fieldPaths=${encodeURIComponent(c)}`).join('&');
  }
  return fsRequest('PATCH', path, { fields: objToFields(frase) });
}

async function firestoreBatchUpsert(frases) {
  if (!usuarioLogado || frases.length === 0) return;
  const token = await getValidToken();
  const ROOT  = `projects/perpetualminer-4c219/databases/(default)/documents`;
  const LOTE  = 500;
  for (let i = 0; i < frases.length; i += LOTE) {
    const writes = frases.slice(i, i + LOTE).map(f => ({
      update: { name: `${ROOT}/usuarios/${usuarioLogado.uid}/frases/${f.id}`, fields: objToFields(f) },
    }));
    const resp = await fetch(`${FIRESTORE_BASE}:batchWrite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
    });
    if (!resp.ok) throw await erroDaResposta(resp);
  }
}

async function firestoreBatchDelete(ids) {
  if (!usuarioLogado || ids.length === 0) return;
  // Usa DELETE individual por documento (mesmo endpoint que leitura/escrita já funcionam)
  const resultados = await Promise.allSettled(ids.map(id =>
    fsRequest('DELETE', `usuarios/${usuarioLogado.uid}/frases/${id}`)
  ));
  const falha = resultados.find(r => r.status === 'rejected');
  if (falha) throw falha.reason;
}

// JS Object → Firestore fields
function objToFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    if (typeof val === 'string')       fields[key] = { stringValue: val };
    else if (typeof val === 'number')  fields[key] = { integerValue: String(val) };
    else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
    else if (Array.isArray(val))       fields[key] = {
      arrayValue: { values: val.map(v => ({ stringValue: String(v) })) },
    };
    else if (typeof val === 'object')  fields[key] = {
      mapValue: { fields: objToFields(val) },
    };
  }
  return fields;
}

// Firestore fields → JS Object
function docToObj(fields) {
  const obj = {};
  for (const [key, val] of Object.entries(fields || {})) {
    if      ('stringValue'  in val) obj[key] = val.stringValue;
    else if ('integerValue' in val) obj[key] = Number(val.integerValue);
    else if ('booleanValue' in val) obj[key] = val.booleanValue;
    else if ('arrayValue'   in val) obj[key] = (val.arrayValue.values || [])
      .map(v => v.stringValue ?? String(v.integerValue ?? ''));
    else if ('mapValue'     in val) obj[key] = docToObj(val.mapValue.fields);
    else obj[key] = null;
  }
  return obj;
}

// ─── Migração e Sync ──────────────────────────────────────────────────────────

async function migrarParaFirestore() {
  const { frases = [] } = await chromeGet({ frases: [] });
  if (frases.length > 0) {
    Conta.mostrarSincronizacao(SITUACOES.PRIMEIRA_SUBIDA, { n: frases.length });
    try {
      await firestoreBatchUpsert(frases);
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
  let falhaNasOrfas = null;
  try {
    let firestoreFrases = await firestoreGetAll();

    // ── Apagar tudo que a nuvem não confirmou: sai o que foi gravado até aquela hora ──
    const apagadasAgora = await concluirApagarTudoPendente(firestoreFrases);
    firestoreFrases = firestoreFrases.filter(f => !apagadasAgora.has(String(f.id)));

    // ── Tombstone local: retry de deletes que falharam no Firestore neste dispositivo ──
    const { pm_deleted_ids = [] } = await chromeGet({ pm_deleted_ids: [] });
    if (pm_deleted_ids.length > 0) {
      const deletedSet  = new Set(pm_deleted_ids.map(String));
      const paraApagar  = firestoreFrases.filter(f => deletedSet.has(String(f.id))).map(f => String(f.id));
      firestoreFrases   = firestoreFrases.filter(f => !deletedSet.has(String(f.id)));
      if (paraApagar.length > 0) {
        // Retry silencioso: tenta deletar do Firestore o que ficou pendente
        firestoreBatchDelete(paraApagar)
          .then(() => limparTombstone(paraApagar))
          .catch(err => console.warn('[Firestore] retry delete pendente falhou:', err.message));
      }
    }

    // ── Tombstone cross-device: Firestore (fonte de verdade) + sync (fallback offline) ──
    // Lê ambos em paralelo e faz a união — garante que deleções recentes (ainda não
    // propagadas pelo Chrome sync) e deleções offline (sem Firestore) são cobertas.
    const [tombstoneFS, tombstoneCS] = await Promise.all([
      lerTombstoneFirestore(),
      lerTombstoneSync(),
    ]);
    const tombstoneSet = new Set([...tombstoneFS, ...tombstoneCS, ...apagadasAgora]);

    if (tombstoneSet.size > 0) {
      // Retry: se ainda estão no Firestore (delete falhou), apaga agora
      const paraApagar = firestoreFrases.filter(f => tombstoneSet.has(String(f.id))).map(f => String(f.id));
      firestoreFrases  = firestoreFrases.filter(f => !tombstoneSet.has(String(f.id)));
      if (paraApagar.length > 0) {
        firestoreBatchDelete(paraApagar)
          .then(() => limparTombstoneSync(paraApagar))
          .catch(err => console.warn('[Firestore] retry delete cross-device falhou:', err.message));
      }
    }

    const firestoreIds = new Set(firestoreFrases.map(f => f.id));
    const { frases: localFrases = [] } = await chromeGet({ frases: [] });

    // ── Regra fundamental: o tombstone é a ÚNICA razão para descartar uma frase local.
    // Qualquer frase no local storage que não foi explicitamente deletada (tombstone)
    // é válida e deve ser enviada ao Firestore se ainda não chegou lá.
    // Isso cobre: sync em voo, sync falhou, adição manual, importação, etc.

    // Orphans: frases locais ausentes do Firestore que não foram deletadas intencionalmente
    const orphans = localFrases.filter(f =>
      !firestoreIds.has(f.id) && !tombstoneSet.has(String(f.id))
    );

    // Limpa local: remove apenas frases tombstoned (deletadas intencionalmente)
    const localSemTombstoned = localFrases.filter(f => !tombstoneSet.has(String(f.id)));
    if (localSemTombstoned.length !== localFrases.length) {
      chrome.storage.local.set({ frases: localSemTombstoned });
    }

    // Limpa pm_pending_sync de entradas tombstoned (evita crescimento indefinido)
    if (tombstoneSet.size > 0) {
      chromeGet({ pm_pending_sync: [] }).then(({ pm_pending_sync = [] }) => {
        const filtrado = pm_pending_sync.filter(id => !tombstoneSet.has(id));
        if (filtrado.length !== pm_pending_sync.length)
          chrome.storage.local.set({ pm_pending_sync: filtrado });
      });
    }

    if (orphans.length > 0) {
      const resultados  = await Promise.allSettled(orphans.map(f => firestorePatch(f)));
      const sincronizados = orphans.filter((_, i) => resultados[i].status === 'fulfilled');
      const enviados      = sincronizados.map(f => String(f.id));
      const falhas        = resultados.filter(r => r.status === 'rejected');

      // Remove do pm_pending_sync os enviados com sucesso
      if (enviados.length > 0) {
        const enviadosSet = new Set(enviados);
        chromeGet({ pm_pending_sync: [] }).then(({ pm_pending_sync }) => {
          chrome.storage.local.set({ pm_pending_sync: pm_pending_sync.filter(id => !enviadosSet.has(id)) });
        });
      }

      if (falhas.length > 0) {
        console.error('[Firestore] orphans com falha:', falhas.length, falhas[0].reason?.message);
        falhaNasOrfas = { quantas: falhas.length, causas: falhas.map(r => r.reason) };
      }

      // Adiciona à lista exibida apenas os que chegaram ao Firestore com sucesso
      firestoreFrases.push(...sincronizados);
    }

    // ── Merge das marcas de Enviada ao Anki (`status: 'exported'`) e Exportada
    // (`exportadaTxt`) ──────────────────────────────────────────────────────
    // Se o local tem a marca mas o Firestore ainda não (falha de rede, service
    // worker em voo), preserva a marca na exibição e retenta o sync.
    // Se o Firestore já tem a marca (outro dispositivo marcou), aplica ao local
    // storage para que ela se propague cross-device.
    {
      const MARCAS = [['status', STATUS_ENVIADA_AO_ANKI], ['exportadaTxt', true]];
      const localById = new Map(localFrases.map(f => [String(f.id), f]));
      const pendentesNaNuvem = [];
      let   localPrecisaAtualizar = false;
      const localAtualizado = [...localSemTombstoned];

      firestoreFrases = firestoreFrases.map(f => {
        const idStr = String(f.id);
        const local = localById.get(idStr);
        if (!local) return f;
        let nuvem = f;

        for (const [campo, valor] of MARCAS) {
          // Caso 1: local marcado, Firestore ainda não — aplica e retenta
          if (local[campo] === valor && nuvem[campo] !== valor) nuvem = { ...nuvem, [campo]: valor };

          // Caso 2: Firestore marcado, local ainda não — atualiza local
          if (f[campo] === valor && local[campo] !== valor) {
            const idx = localAtualizado.findIndex(lf => String(lf.id) === idStr);
            if (idx !== -1) { localAtualizado[idx] = { ...localAtualizado[idx], [campo]: valor }; }
            localPrecisaAtualizar = true;
          }
        }

        if (nuvem !== f) pendentesNaNuvem.push(nuvem);
        return nuvem;
      });

      if (pendentesNaNuvem.length > 0) {
        firestoreBatchUpsert(pendentesNaNuvem).catch(err =>
          console.warn('[Firestore] retry das marcas Enviada/Exportada:', err.message)
        );
      }
      if (localPrecisaAtualizar) {
        chrome.storage.local.set({ frases: localAtualizado });
      }
    }

    todasFrases = firestoreFrases;
    if (falhaNasOrfas) mostrarSyncIncompleto(falhaNasOrfas, localSemTombstoned.length, semSincronizar);
    else Conta.mostrarSincronizacao(SITUACOES.SINCRONIZADO);
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
// campos opcional: ['keywords'], ['texto'], etc. — passa direto para firestorePatch.
function salvarFraseFirestore(frase, campos = null) {
  if (!usuarioLogado) return;
  firestorePatch(frase, campos).catch(err => {
    console.error('[Firestore] patch:', frase.id, err.message);
    mostrarFalhaNaNuvem(err);
  });
}

// ─── Tombstone cross-device ───────────────────────────────────────────────────
//
// FONTE DE VERDADE: Firestore  →  usuarios/{uid}/meta/deleted
//   Cada deleção é um campo independente no mapa "ids": { phraseId: deletedAt }
//   Usando updateMask por campo, dois dispositivos escrevem simultaneamente
//   sem conflito (Firestore mescla os campos automaticamente).
//
// FALLBACK OFFLINE: chrome.storage.sync  →  uma chave por frase: pm_del_{phraseId}
//   Cobre o caso em que o Firestore está inacessível. O sync do Chrome propaga
//   com delay, então não é suficiente sozinho como fonte de verdade.

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const TOMB_FS_PATH     = () => `usuarios/${usuarioLogado.uid}/meta/deleted`;

// ── Tombstone Firestore ───────────────────────────────────────────────────────

/** Lê o tombstone do Firestore. Retorna Set<string> de phraseIds ainda no TTL. */
async function lerTombstoneFirestore() {
  try {
    const data = await fsRequest('GET', TOMB_FS_PATH());
    const fields = data?.fields?.ids?.mapValue?.fields;
    if (!fields) return new Set();
    const agora = Date.now();
    const ids   = new Set();
    for (const [phraseId, val] of Object.entries(fields)) {
      const deletedAt = Number(val.integerValue ?? val.stringValue ?? 0);
      if (agora - deletedAt < TOMBSTONE_TTL_MS) ids.add(phraseId);
    }
    return ids;
  } catch {
    return new Set(); // Firestore inacessível → fallback para sync
  }
}

/** Grava cada id como campo independente no documento meta/deleted (tombstone.js). */
async function gravarTombstoneFirestore(ids) {
  if (!usuarioLogado || ids.length === 0) return;
  const { mascara, corpo } = tombstoneFirestore(ids, Date.now());
  return fsRequest('PATCH', `${TOMB_FS_PATH()}?${mascara}`, corpo);
}

// ── Tombstone chrome.storage.sync (fallback offline) ─────────────────────────

/** Retorna Set de phraseIds deletados via sync e ainda dentro do TTL. */
function lerTombstoneSync() {
  return new Promise(resolve => {
    chrome.storage.sync.get(null, (items) => {
      const agora     = Date.now();
      const ids       = new Set();
      const expirados = [];
      for (const [key, deletedAt] of Object.entries(items || {})) {
        if (!key.startsWith(TOMB_PREFIX)) continue;
        const phraseId = key.slice(TOMB_PREFIX.length);
        if (agora - Number(deletedAt) < TOMBSTONE_TTL_MS) {
          ids.add(phraseId);
        } else {
          expirados.push(key);
        }
      }
      if (expirados.length > 0) chrome.storage.sync.remove(expirados);
      resolve(ids);
    });
  });
}

/** Grava cada id como chave independente no sync — sem conflito entre devices. */
function marcarParaDeletarSync(ids) {
  chrome.storage.sync.set(tombstonesSync(ids, Date.now()));
}

function limparTombstoneSync(ids) {
  chrome.storage.sync.remove(ids.map(id => `${TOMB_PREFIX}${id}`));
}

// ─── Tombstone local: retry de deletes que falharam no Firestore ──────────────

async function marcarParaDeletar(ids) {
  const { pm_deleted_ids = [] } = await chromeGet({ pm_deleted_ids: [] });
  const conjunto = new Set([...pm_deleted_ids, ...ids]);
  chrome.storage.local.set({ pm_deleted_ids: [...conjunto] });
}

function limparTombstone(ids) {
  chromeGet({ pm_deleted_ids: [] }).then(({ pm_deleted_ids = [] }) => {
    const removidos = new Set(ids);
    chrome.storage.local.set({ pm_deleted_ids: pm_deleted_ids.filter(id => !removidos.has(id)) });
  });
}

// Um Apagar tudo com a nuvem fora do ar deixou pm_apagar_tudo ({ uid, ate }). No
// primeiro sync desta conta que alcança a nuvem, toda frase dela gravada até `ate`
// (o id de uma frase é a hora em que ela foi gravada) ganha tombstone e sai; o que
// foi minerado depois, em qualquer computador, fica. Devolve os ids apagados.
async function concluirApagarTudoPendente(firestoreFrases) {
  const { pm_apagar_tudo: pendente } = await chromeGet({ pm_apagar_tudo: null });
  if (!pendente || pendente.uid !== usuarioLogado.uid) return new Set();
  const ids = firestoreFrases.filter(f => Number(f.id) <= pendente.ate).map(f => String(f.id));
  if (ids.length > 0) {
    marcarParaDeletarSync(ids);
    await marcarParaDeletar(ids);
    await gravarTombstoneFirestore(ids);
    await firestoreBatchDelete(ids);
    limparTombstone(ids);
  }
  chrome.storage.local.remove('pm_apagar_tudo');
  return new Set(ids);
}

/**
 * Apaga as frases da nuvem, deixando o tombstone antes. Devolve o erro quando o
 * DELETE falha (a frase fica pendente em `pm_deleted_ids`), ou `null`.
 */
async function removerFrasesFirestore(ids) {
  if (!ids.length) return null;
  const idsStr = ids.map(String);
  // 1. Tombstone Firestore (fonte de verdade, imediata, sem race condition)
  //    + tombstone sync (fallback para quando o Firestore estiver inacessível)
  //    + tombstone local (retry do DELETE caso falhe)
  marcarParaDeletarSync(idsStr);
  await marcarParaDeletar(idsStr);
  if (!usuarioLogado) return null;
  // Grava tombstone no Firestore antes de deletar — garante que qualquer device
  // que abrir o painel logo após já veja a deleção, mesmo sem Chrome sync propagado
  gravarTombstoneFirestore(idsStr).catch(err =>
    console.warn('[Firestore] tombstone write falhou:', err.message)
  );
  try {
    await firestoreBatchDelete(idsStr);
    limparTombstone(idsStr);
    return null;
  } catch (err) {
    console.error('[Firestore] delete falhou, ficará pendente:', err.message);
    return err;
  }
}

// As frases deste computador ficam marcadas como apagadas antes de a nuvem ser
// lida: com ela fora do ar, o sync seguinte não as traz de volta. E até a nuvem
// confirmar, fica lembrado “apagar tudo até agora” (pm_apagar_tudo), para o sync
// seguinte apagar também o que outro computador gravou antes e daqui não se via.
// Resolve com true quando não há mais nada a apagar na nuvem (ou não há conta).
async function apagarTudoFirestore(idsDesteComputador) {
  if (!usuarioLogado) return true;
  marcarParaDeletarSync(idsDesteComputador);
  await marcarParaDeletar(idsDesteComputador);
  const ate = Math.max(Date.now(), ...idsDesteComputador.map(Number));
  await chromeSet({ pm_apagar_tudo: { uid: usuarioLogado.uid, ate } });
  try {
    const frases = await firestoreGetAll();
    const ids    = [...new Set([...idsDesteComputador, ...frases.map(f => String(f.id))])];
    marcarParaDeletarSync(ids);
    await marcarParaDeletar(ids);
    await gravarTombstoneFirestore(ids);
    await firestoreBatchDelete(ids);
    limparTombstone(ids);
    chrome.storage.local.remove('pm_apagar_tudo');
    return true;
  } catch (e) {
    console.error('[Firestore] apagar tudo falhou:', e);
    mostrarFalhaNaNuvem(e);
    return false;
  }
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
  document.getElementById('btn-export').addEventListener('click', exportarTxt);
  document.getElementById('btn-send-anki').addEventListener('click', enviarSelecionadasAoAnki);
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

  document.getElementById('btn-save-bridge-presets-main')?.addEventListener('click', salvarBridgePresets);
  document.getElementById('btn-bridge-progress-close').addEventListener('click', fecharBridgeProgressModal);
  document.getElementById('btn-bridge-refresh').addEventListener('click', atualizarBridgeProgress);
  document.getElementById('btn-bridge-retry-failed').addEventListener('click', retentarJobsFalhos);
  document.getElementById('bridge-progress-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-retry-job]');
    if (btn) continuarBridgeJob(btn.dataset.retryJob);
  });
  document.getElementById('btn-bridge-analytics-refresh-main')?.addEventListener('click', () => {
    atualizarBridgeWorkspaceData({ includeAnki: true, refreshAnki: true, launchAnki: true });
  });
  document.getElementById('btn-bridge-anki-repair')?.addEventListener('click', repararBridgeAnki);
  bridgeAnalyticsLangEl()?.addEventListener('change', atualizarBridgeAnalytics);
  bridgeAnalyticsFromEl()?.addEventListener('change', () => {
    bridgeAnalyticsRange = 'custom';
    marcarBridgeAnalyticsRange();
    atualizarBridgeAnalytics();
  });
  bridgeAnalyticsToEl()?.addEventListener('change', () => {
    bridgeAnalyticsRange = 'custom';
    marcarBridgeAnalyticsRange();
    atualizarBridgeAnalytics();
  });
  document.querySelectorAll('[data-analytics-range], [data-analytics-range-main]').forEach(btn => {
    btn.addEventListener('click', () => {
      bridgeAnalyticsRange = btn.dataset.analyticsRange || btn.dataset.analyticsRangeMain;
      aplicarDatasBridgeAnalytics();
      marcarBridgeAnalyticsRange();
      atualizarBridgeAnalytics();
    });
  });
  document.getElementById('bridge-analytics-jobs-main')?.addEventListener('click', (e) => {
    const retryBtn = e.target.closest('[data-retry-job]');
    const debugBtn = e.target.closest('[data-debug-job]');
    if (retryBtn) {
      continuarBridgeJob(retryBtn.dataset.retryJob);
      return;
    }
    if (debugBtn) baixarBridgeDebugBundle(debugBtn.dataset.debugJob);
  });
  byId('bridge-vocab-search')?.addEventListener('input', agendarAtualizacaoBridgeVocabulary);
  byId('bridge-vocab-status')?.addEventListener('change', () => atualizarBridgeVocabulary());
  byId('bridge-vocab-type')?.addEventListener('change', () => atualizarBridgeVocabulary());
  byId('bridge-vocab-lang')?.addEventListener('change', () => atualizarBridgeVocabulary());
}

async function inicializarBridgeUI() {
  const data = await chromeGet({ [BRIDGE_PRESETS_KEY]: DEFAULT_BRIDGE_PRESETS });
  bridgePresets = normalizarBridgePresets(data[BRIDGE_PRESETS_KEY]);
  preencherBridgePresetInputs();
  aplicarDatasBridgeAnalytics();
  marcarBridgeAnalyticsRange();
  atualizarBridgeWorkspaceData({ includeAnki: false });
}

function normalizarBridgePresets(raw) {
  return {
    en: { ...DEFAULT_BRIDGE_PRESETS.en, ...(raw?.en || {}) },
    ru: { ...DEFAULT_BRIDGE_PRESETS.ru, ...(raw?.ru || {}) },
  };
}

function byId(id) {
  return document.getElementById(id);
}

function bridgePresetEl(lang, field) {
  return byId(`preset-main-${lang}-${field}`) || byId(`preset-${lang}-${field}`);
}

function bridgeAnalyticsLangEl() {
  return byId('bridge-analytics-lang-main') || byId('bridge-analytics-lang');
}

function bridgeAnalyticsFromEl() {
  return byId('bridge-analytics-from-main') || byId('bridge-analytics-from');
}

function bridgeAnalyticsToEl() {
  return byId('bridge-analytics-to-main') || byId('bridge-analytics-to');
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}

function setBridgeStatusText(value) {
  setText('bridge-analytics-status-main', value);
}

function setBridgeHtml(id, value) {
  const el = byId(id);
  if (el) el.innerHTML = value;
}

function readBridgePresetValue(lang, field, fallback) {
  const el = bridgePresetEl(lang, field);
  return el?.value?.trim() || fallback;
}

function setBridgePresetValue(lang, field, value) {
  [byId(`preset-main-${lang}-${field}`), byId(`preset-${lang}-${field}`)]
    .filter(Boolean)
    .forEach(el => { el.value = value; });
}

function preencherBridgePresetInputs() {
  setBridgePresetValue('en', 'deck', bridgePresets.en.deckName);
  setBridgePresetValue('en', 'image', bridgePresets.en.imageSource);
  setBridgePresetValue('en', 'word-tld', bridgePresets.en.ttsWordTld);
  setBridgePresetValue('en', 'phrase-tld', bridgePresets.en.ttsPhraseTld);
  setBridgePresetValue('ru', 'deck', bridgePresets.ru.deckName);
  setBridgePresetValue('ru', 'image', bridgePresets.ru.imageSource);
  setBridgePresetValue('ru', 'word-tld', bridgePresets.ru.ttsWordTld);
  setBridgePresetValue('ru', 'phrase-tld', bridgePresets.ru.ttsPhraseTld);
  const vocabLang = byId('bridge-vocab-lang');
  if (vocabLang) vocabLang.value = bridgeVocabularyDeck.lang || 'en';
}

async function salvarBridgePresets() {
  bridgePresets = {
    en: {
      deckName: readBridgePresetValue('en', 'deck', DEFAULT_BRIDGE_PRESETS.en.deckName),
      imageSource: bridgePresetEl('en', 'image')?.value || DEFAULT_BRIDGE_PRESETS.en.imageSource,
      ttsWordTld: readBridgePresetValue('en', 'word-tld', DEFAULT_BRIDGE_PRESETS.en.ttsWordTld),
      ttsPhraseTld: readBridgePresetValue('en', 'phrase-tld', DEFAULT_BRIDGE_PRESETS.en.ttsPhraseTld),
    },
    ru: {
      deckName: readBridgePresetValue('ru', 'deck', DEFAULT_BRIDGE_PRESETS.ru.deckName),
      imageSource: bridgePresetEl('ru', 'image')?.value || DEFAULT_BRIDGE_PRESETS.ru.imageSource,
      ttsWordTld: readBridgePresetValue('ru', 'word-tld', DEFAULT_BRIDGE_PRESETS.ru.ttsWordTld),
      ttsPhraseTld: readBridgePresetValue('ru', 'phrase-tld', DEFAULT_BRIDGE_PRESETS.ru.ttsPhraseTld),
    },
  };
  await new Promise(resolve => chrome.storage.local.set({ [BRIDGE_PRESETS_KEY]: bridgePresets }, resolve));
  preencherBridgePresetInputs();
  if (Shell.areaAtual() === 'anki') atualizarBridgeDeckStats({ refresh: true, launch: true });
  mostrarToast('Presets do Anki Bridge salvos.');
}

// ─── Sidebar & Dropdowns ──────────────────────────────────────────────────────

function dataIsoLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function aplicarDatasBridgeAnalytics() {
  const fromEl = bridgeAnalyticsFromEl();
  const toEl = bridgeAnalyticsToEl();
  if (!fromEl || !toEl) return;
  const hoje = new Date();
  if (bridgeAnalyticsRange === 'today') {
    const iso = dataIsoLocal(hoje);
    fromEl.value = iso;
    toEl.value = iso;
  } else if (bridgeAnalyticsRange === 'month') {
    fromEl.value = dataIsoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    toEl.value = dataIsoLocal(hoje);
  } else if (bridgeAnalyticsRange === 'all') {
    fromEl.value = '';
    toEl.value = '';
  }
}

function marcarBridgeAnalyticsRange() {
  document.querySelectorAll('[data-analytics-range], [data-analytics-range-main]').forEach(btn => {
    const value = btn.dataset.analyticsRange || btn.dataset.analyticsRangeMain;
    btn.classList.toggle('active', value === bridgeAnalyticsRange);
  });
}

function filtrosBridgeAnalytics() {
  const params = new URLSearchParams();
  const lang = bridgeAnalyticsLangEl()?.value || 'all';
  const from = bridgeAnalyticsFromEl()?.value || '';
  const to = bridgeAnalyticsToEl()?.value || '';
  params.set('lang', lang);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return params.toString();
}

async function atualizarBridgeAnalytics() {
  if (!byId('bridge-analytics-status-main')) return;
  setBridgeStatusText('Atualizando...');
  try {
    const query = filtrosBridgeAnalytics();
    const [summaryResp, jobsResp] = await Promise.all([
      fetch(`${BRIDGE_URL}/analytics/summary?${query}`),
      fetch(`${BRIDGE_URL}/analytics/jobs?${query}`),
    ]);
    if (!summaryResp.ok || !jobsResp.ok) throw new Error('analytics_unavailable');
    const summary = await summaryResp.json();
    const jobsData = await jobsResp.json();
    renderizarBridgeAnalyticsSummary(summary);
    renderizarBridgeAnalyticsJobs(jobsData.jobs || []);
    const statusText = `${summary.jobs?.total || 0} job(s) no filtro`;
    setBridgeStatusText(statusText);
  } catch {
    setBridgeStatusText('Analytics indisponivel. Verifique se o bridge esta online.');
    setText('bridge-cost-total', '$0.0000');
    setBridgeHtml('bridge-analytics-metrics-main', '');
    setBridgeHtml('bridge-image-rates-main', '');
    setBridgeHtml('bridge-analytics-jobs-main', '');
  }
}

async function atualizarBridgeWorkspaceData(options = {}) {
  const tasks = [atualizarBridgeAnalytics()];
  if (options.includeAnki !== false) {
    tasks.push(atualizarBridgeDeckStats({
      refresh: Boolean(options.refreshAnki),
      launch: Boolean(options.launchAnki),
    }));
  }
  await Promise.allSettled(tasks);
}

function queryBridgeDeckStats(options = {}) {
  const params = new URLSearchParams();
  [
    ['en', bridgePresets.en?.deckName || DEFAULT_BRIDGE_PRESETS.en.deckName],
    ['ru', bridgePresets.ru?.deckName || DEFAULT_BRIDGE_PRESETS.ru.deckName],
  ].forEach(([lang, deckName]) => {
    params.append('deck', deckName);
    params.append('lang', lang);
  });
  if (options.refresh) params.set('refresh', '1');
  if (options.launch) params.set('launch', '1');
  return params.toString();
}

function formatarBridgeAnkiRepairMessage(data = {}) {
  const processRows = [
    ...(Array.isArray(data.pids) ? data.pids.map(pid => ({ pid })) : []),
    ...(Array.isArray(data.processes) ? data.processes : []),
    ...(Array.isArray(data.kill?.remaining) ? data.kill.remaining : []),
    ...(Array.isArray(data.kill?.processes) ? data.kill.processes : []),
  ];
  const pids = [...new Set(processRows.map(row => Number(row?.pid || row)).filter(Boolean))].join(', ') || 'desconhecidos';
  if (data.accessDenied || data.kill?.accessDenied || data.code === 'anki_repair_access_denied') {
    return `Windows recusou fechar o Anki invisivel (processos: ${pids}). Feche o Anki pelo Gerenciador de Tarefas como administrador ou reinicie o Windows; depois retente o job.`;
  }
  return data.detail || data.after?.collectionDetail || 'anki_repair_failed';
}

async function atualizarBridgeDeckStats(options = {}) {
  const el = byId('bridge-anki-stats-main');
  if (!el) return;
  el.innerHTML = '<div class="bridge-analytics-empty">Atualizando Anki...</div>';
  try {
    const resp = await fetch(`${BRIDGE_URL}/anki/stats/decks?${queryBridgeDeckStats(options)}`);
    if (!resp.ok) throw new Error('anki_stats_unavailable');
    const data = await resp.json();
    renderizarBridgeDeckStats(data);
    await atualizarBridgeVocabulary();
  } catch (err) {
    el.innerHTML = '<div class="bridge-analytics-empty">Cards e termos por idioma indisponiveis. Use Reparar Anki e atualize novamente.</div>';
  }
}

async function repararBridgeAnki() {
  const btn = byId('btn-bridge-anki-repair');
  const el = byId('bridge-anki-stats-main');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Reparando...';
  }
  if (el) {
    el.innerHTML = '<div class="bridge-analytics-empty">Fechando Anki travado e reabrindo...</div>';
  }
  let timeout = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 45000);
    const resp = await fetch(`${BRIDGE_URL}/anki/repair`, { method: 'POST', signal: controller.signal });
    clearTimeout(timeout);
    timeout = null;
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      const message = formatarBridgeAnkiRepairMessage(data);
      if (data.after?.collectionReady || data.after?.connectAvailable) {
        mostrarToast(message);
        await atualizarBridgeDeckStats({ refresh: true });
        return;
      }
      throw new Error(message);
    }
    mostrarToast('Anki reparado. Atualizando cards e termos.');
    await atualizarBridgeDeckStats({ refresh: true });
  } catch (err) {
    if (el) {
      el.innerHTML = `<div class="bridge-analytics-empty">Nao foi possivel reparar o Anki: ${esc(err.message || err)}</div>`;
    }
    mostrarToast('Nao foi possivel reparar o Anki.');
  } finally {
    if (timeout) clearTimeout(timeout);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Reparar Anki';
    }
  }
}

function formatInt(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function ankiVocabularyCount(stats) {
  if (!stats) return 0;
  if (stats.vocabulary?.phraseVocabulary != null) return Number(stats.vocabulary.phraseVocabulary);
  return Number(stats.uniqueTermTokens ?? stats.uniqueTerms ?? stats.uniqueFronts ?? 0);
}

function ankiTargetTermCount(stats) {
  if (!stats) return 0;
  if (stats.vocabulary?.targetTerms != null) return Number(stats.vocabulary.targetTerms);
  return Number(stats.uniqueTerms ?? stats.uniqueFronts ?? 0);
}

function ankiAvgNewVocabulary(stats) {
  return Number(stats?.vocabulary?.avgNewPhraseVocabularyPerCard || 0).toFixed(2);
}

function renderizarBridgeDeckStats(data) {
  const el = byId('bridge-anki-stats-main');
  if (!el) return;
  const decks = Array.isArray(data?.decks) ? data.decks : [];
  const totals = data?.totals || {};
  if (!decks.length) {
    el.innerHTML = '<div class="bridge-analytics-empty">Nenhum baralho configurado.</div>';
    return;
  }

  const totalReviewed = Number(totals.reviewed || 0);
  const totalMature = Number(totals.mature || 0);
  const totalMaturePct = totalReviewed ? Math.min(100, Math.max(0, (totalMature / totalReviewed) * 100)) : 0;
  const staleNotice = data?.stale
    ? `<div class="bridge-analytics-empty">Mostrando cache anterior. Atualizacao do Anki falhou: ${esc(data.message || 'AnkiConnect indisponivel')}</div>`
    : '';
  const sourceNotice = data?.source === 'collection.anki2'
    ? '<div class="bridge-analytics-empty">Stats lidos do banco local do Anki. Para enviar cards, o AnkiConnect ainda precisa abrir normalmente.</div>'
    : '';
  const totalCard = `<article class="bridge-anki-total">
    <span>Vocabulario na Frente</span>
    <strong>${formatInt(ankiVocabularyCount(totals))} palavras</strong>
    <div class="bridge-anki-meta">
      <span>${formatInt(totals.cards)} cards</span>
      <span>${formatInt(ankiTargetTermCount(totals))} termos alvo</span>
      <span>${ankiAvgNewVocabulary(totals)} novos/card</span>
      <span>${formatInt(totals.mature)} maduros</span>
    </div>
    <div class="bridge-anki-bar"><div style="width:${totalMaturePct}%"></div></div>
  </article>`;

  const deckCards = decks.map(deck => {
    const label = deck.lang === 'ru' ? 'Russo' : 'Ingles';
    const reviewed = Number(deck.reviewed || 0);
    const mature = Number(deck.mature || 0);
    const maturePct = reviewed ? Math.min(100, Math.max(0, (mature / reviewed) * 100)) : 0;
    const missing = deck.missing ? ' bridge-anki-missing' : '';
    const subtitle = deck.missing ? 'Baralho nao encontrado' : `${formatInt(deck.notes)} notas`;
    return `<article class="bridge-anki-deck${missing}">
      <span>${esc(label)} | ${esc(deck.deckName || '')}</span>
      <strong>${formatInt(ankiVocabularyCount(deck))} palavras</strong>
      <div class="bridge-anki-meta">
        <span>${formatInt(deck.cards)} cards</span>
        <span>${formatInt(ankiTargetTermCount(deck))} termos alvo</span>
        <span>${ankiAvgNewVocabulary(deck)} novos/card</span>
        <span>${formatInt(deck.new)} novos</span>
        <span>${formatInt(deck.young + deck.learning)} recentes</span>
        <span>${formatInt(deck.mature)} maduros</span>
      </div>
      <div class="bridge-anki-bar"><div style="width:${maturePct}%"></div></div>
      <div class="bridge-analytics-job-meta">${esc(subtitle)} | ${formatPct(deck.maturePct)} maturidade</div>
    </article>`;
  }).join('');

  el.innerHTML = staleNotice + sourceNotice + totalCard + deckCards;
}

function agendarAtualizacaoBridgeVocabulary() {
  clearTimeout(bridgeVocabularyTimer);
  bridgeVocabularyTimer = setTimeout(() => atualizarBridgeVocabulary(), 250);
}

function queryBridgeVocabulary() {
  const params = new URLSearchParams();
  const lang = byId('bridge-vocab-lang')?.value || bridgeVocabularyDeck.lang || 'en';
  bridgeVocabularyDeck.lang = lang;
  const deckName = bridgePresets[lang]?.deckName || DEFAULT_BRIDGE_PRESETS[lang]?.deckName;
  params.set('deck', deckName);
  params.set('lang', lang);
  params.set('limit', '10000');
  const q = byId('bridge-vocab-search')?.value?.trim() || '';
  const status = byId('bridge-vocab-status')?.value || 'all';
  const type = byId('bridge-vocab-type')?.value || 'all';
  if (q) params.set('q', q);
  if (status !== 'all') params.set('status', status);
  if (type !== 'all') params.set('type', type);
  return params.toString();
}

async function atualizarBridgeVocabulary() {
  const listEl = byId('bridge-vocab-list');
  const summaryEl = byId('bridge-vocab-summary');
  if (!listEl) return;
  listEl.innerHTML = '<div class="bridge-analytics-empty">Atualizando vocabulario...</div>';
  if (summaryEl) summaryEl.textContent = 'Calculando vocabulario da Frente...';
  try {
    const resp = await fetch(`${BRIDGE_URL}/anki/vocabulary?${queryBridgeVocabulary()}`);
    if (!resp.ok) throw new Error('vocabulary_unavailable');
    const data = await resp.json();
    renderizarBridgeVocabulary(data);
  } catch {
    if (summaryEl) summaryEl.textContent = 'Vocabulario indisponivel.';
    listEl.innerHTML = '<div class="bridge-analytics-empty">Nao foi possivel carregar o vocabulario.</div>';
  }
}

function statusVocabLabel(status) {
  const labels = {
    new: 'Novo',
    recent: 'Recente',
    mature: 'Maduro',
    mixed: 'Misto',
    seen: 'Visto',
  };
  return labels[status] || status || 'Visto';
}

function typeVocabLabel(type) {
  const labels = {
    word: 'Palavra',
    term: 'Termo',
  };
  return labels[type] || 'Item';
}

function renderizarBridgeVocabulary(data) {
  const listEl = byId('bridge-vocab-list');
  const summaryEl = byId('bridge-vocab-summary');
  if (!listEl) return;
  const words = Array.isArray(data?.words) ? data.words : [];
  const totalWords = Number(data?.totalWords || 0);
  if (summaryEl) {
    const shown = words.length;
    const langLabel = data?.lang === 'ru' ? 'Russo' : 'Ingles';
    summaryEl.textContent = `${formatInt(totalWords)} item${totalWords === 1 ? '' : 's'} em ${langLabel} | mostrando ${formatInt(shown)}`;
  }
  if (!words.length) {
    listEl.innerHTML = '<div class="bridge-analytics-empty">Nenhum item encontrado.</div>';
    return;
  }
  listEl.innerHTML = `<table class="bridge-vocab-table">
    <thead>
      <tr>
        <th>Item</th>
        <th>Tipo</th>
        <th>Cards</th>
        <th>Status</th>
        <th>Maduros</th>
        <th>Recentes</th>
        <th>Novos</th>
      </tr>
    </thead>
    <tbody>
      ${words.map(word => `<tr>
        <td class="bridge-vocab-word">${esc(word.word || '')}</td>
        <td><span class="bridge-vocab-type-pill ${esc(word.type || 'word')}">${esc(typeVocabLabel(word.type))}</span></td>
        <td>${formatInt(word.cards)}</td>
        <td><span class="bridge-vocab-status-pill ${esc(word.status || 'seen')}">${esc(statusVocabLabel(word.status))}</span></td>
        <td>${formatInt(word.mature)}</td>
        <td>${formatInt(word.recent)}</td>
        <td>${formatInt(word.new)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDataCurta(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function statusLabelBridge(status) {
  const mapa = {
    completed: 'OK',
    failed: 'Falhou',
    partial: 'Parcial',
    running: 'Rodando',
    queued: 'Fila',
  };
  return mapa[status] || status || 'N/D';
}

function renderizarBridgeAnalyticsSummary(summary) {
  const metricsEl = byId('bridge-analytics-metrics-main');
  const ratesEl = byId('bridge-image-rates-main');
  if (!metricsEl || !ratesEl) return;
  const costs = summary.costs || {};
  const jobs = summary.jobs || {};
  const cards = summary.cards || {};
  const images = summary.images || {};
  const total = formatUsd(costs.totalUsd);
  setText('bridge-cost-total', total);
  const metrics = [
    ['Cards', formatUsd(costs.cardUsd)],
    ['Imagem IA', formatUsd(costs.imageGenerationUsd)],
    ['Judge', formatUsd(costs.imageJudgeUsd)],
    ['Guard', formatUsd(costs.imageGuardUsd)],
    ['Frases OK', `${cards.successful || 0}/${cards.requested || 0}`],
    ['Jobs OK', `${jobs.completed || 0}/${jobs.total || 0}`],
    ['Economia', formatUsd(images.savingsUsd)],
  ];
  metricsEl.innerHTML = metrics.map(([label, value]) => `
    <div class="bridge-metric">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </div>
  `).join('');

  const rates = [
    ['Google', images.realPct, images.real],
    ['Gerada', images.generatedPct, images.generated],
    ['Pulada', images.skippedPct, images.skipped],
    ['Falhou', images.failedPct, images.failed],
  ];
  ratesEl.innerHTML = rates.map(([label, pct, count]) => {
    const width = Math.max(0, Math.min(100, Number(pct || 0)));
    return `<div class="bridge-rate">
      <div class="bridge-rate-top"><span>${esc(label)}</span><strong>${formatPct(pct)}</strong></div>
      <div class="bridge-rate-bar"><div style="width:${width}%"></div></div>
      <small>${Number(count || 0)} imagem(ns)</small>
    </div>`;
  }).join('');
}

function renderizarBridgeAnalyticsJobs(jobs) {
  const el = byId('bridge-analytics-jobs-main');
  if (!el) return;
  if (!Array.isArray(jobs) || jobs.length === 0) {
    el.innerHTML = '<div class="bridge-analytics-empty">Sem jobs nesse filtro.</div>';
    return;
  }
  el.innerHTML = jobs.slice(0, 12).map(job => {
    const costs = job.costs || {};
    const images = job.images || {};
    const erro = job.lastError ? `<div class="bridge-job-error">${esc(job.lastError)}</div>` : '';
    const canRetry = ['failed', 'partial'].includes(job.status);
    const retryBtn = canRetry
      ? `<button class="bridge-debug-btn bridge-retry-job-btn" data-retry-job="${esc(job.jobId)}" title="Continuar job" aria-label="Continuar job">Continuar</button>`
      : '';
    return `<div class="bridge-analytics-job">
      <div class="bridge-analytics-job-main">
        <div>
          <div class="bridge-analytics-job-id">${esc(job.jobId)}</div>
          <div class="bridge-analytics-job-meta">${esc(formatDataCurta(job.createdAt))} | ${esc((job.lang || '').toUpperCase())} | ${esc(statusLabelBridge(job.status))}</div>
        </div>
        <div class="bridge-job-actions">
          ${retryBtn}
          <button class="bridge-debug-btn" data-debug-job="${esc(job.jobId)}" title="Baixar debug bundle" aria-label="Baixar debug bundle">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="bridge-analytics-job-stats">
        <span>${formatUsd(costs.totalUsd)}</span>
        <span>Frases ${Number(job.successfulCards || 0)}/${Number(job.requestedCards || 0)}</span>
        <span>G ${Number(images.real || 0)} / IA ${Number(images.generated || 0)}</span>
      </div>
      ${erro}
    </div>`;
  }).join('');
}

async function baixarBridgeDebugBundle(jobId) {
  if (!jobId) return;
  try {
    const resp = await fetch(`${BRIDGE_URL}/jobs/${encodeURIComponent(jobId)}/debug-bundle`);
    if (!resp.ok) throw new Error('debug_bundle_unavailable');
    const data = await resp.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anki-bridge-debug-${jobId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    mostrarToast('Debug bundle baixado.');
  } catch {
    mostrarToast('Falha ao baixar debug bundle.');
  }
}

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

/** O cabeçalho de data (PAI-11): hoje · ontem · há 3 dias. */
function rotuloDoDia(dataStr) {
  const partes = String(dataStr || '').split('/');
  if (partes.length !== 3) return dataStr || '';
  const dia  = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje - dia) / 86400000);
  if (Number.isNaN(dias) || dias < 0) return dataStr;
  if (dias === 0) return textoDaVoz('PAI-11.hoje');
  if (dias === 1) return textoDaVoz('PAI-11.ontem');
  return textoDaVoz('PAI-11.diasAtras', { n: dias });
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

function ehRussa(f) {
  return f.idioma === IDIOMAS.RUSSO || detectarIdioma(f.texto || '') === IDIOMAS.RUSSO;
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

/** A Fonte como o catálogo a chama: um nome antigo gravado vira o de hoje. */
function chaveDaFonte(fonte) {
  return APELIDOS_DE_FONTE[fonte] || fonte;
}

/**
 * A Fonte da frase: a do Contexto, senão a gravada em `streaming`. O selo e o
 * filtro de Fonte leem daqui, para o filtro achar a Fonte que o selo mostra.
 */
function fonteDaFrase(f) {
  return chaveDaFonte(f.contexto?.fonte || f.streaming || '');
}

/** O nome da Fonte (PAI-29). Uma Fonte fora do catálogo sai com o nome gravado. */
function nomeDaFonte(fonte) {
  const chave = chaveDaFonte(fonte);
  return Object.hasOwn(CATALOGO_DA_VOZ['PAI-29'], chave) ? textoDaVoz(`PAI-29.${chave}`) : fonte;
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
    detalhes: String(erro?.message || erro),
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

async function apagarFrases(ids) {
  const apagadas = new Set(ids);
  todasFrases = todasFrases.filter(f => !apagadas.has(f.id));
  ids.forEach(id => { delete keywords[id]; selecionadas.delete(id); });
  if (edicaoDeTexto && apagadas.has(edicaoDeTexto.id)) edicaoDeTexto = null;
  await new Promise(resolve => chrome.storage.local.set({ frases: todasFrases }, resolve));
  atualizarTotal();
  aplicarFiltro();
  // Uma frase só não precisa de toast: o cartão sumindo já é a resposta (PAI-16).
  if (ids.length > 1) mostrarToastDeSucesso(textoDaVoz('PAI-14', { n: ids.length }));
  await apagarDaNuvem(ids);
}

async function apagarDaNuvem(ids) {
  const erro = await removerFrasesFirestore(ids);
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
  const erro = await removerFrasesFirestore(ids);
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
  const naNuvem = apagarTudoFirestore(ids);
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
  if (usuarioLogado && exportadas.length > 0) {
    Promise.allSettled(exportadas.map(f => firestorePatch(f, ['exportadaTxt']))).then(resultados => {
      const falha = resultados.find(r => r.status === 'rejected');
      if (falha) mostrarFalhaNaNuvem(falha.reason);
    });
  }
  mostrarToastDeSucesso(textoDaVoz('PAI-19', { n: linhas.length }));
}

function montarLinhaMining(frase) {
  const textoLimpo = frase.texto.replace(/\s+/g, ' ').trim();
  const kw = palavrasDoTxt(frase);
  const fonte   = sanitizarCampo(frase.contexto?.fonte || frase.streaming);
  const titulo  = sanitizarCampo(frase.contexto?.titulo);
  const detalhe = sanitizarCampo(frase.contexto?.detalhe);
  const prefixoKeyword = kw ? `${kw} : ` : '';
  return `${prefixoKeyword}${textoLimpo} [Contexto: ${fonte} - ${titulo} - ${detalhe}]`;
}

async function enviarSelecionadasAoAnki() {
  if (selecionadas.size === 0) {
    mostrarToast('Selecione as frases que deseja enviar ao Anki.');
    return;
  }

  await salvarBridgePresets();

  let health;
  try {
    health = await fetch(`${BRIDGE_URL}/health`);
  } catch {
    mostrarToast('Anki Bridge offline. Inicie o serviço residente no PC.');
    return;
  }
  if (!health.ok) {
    mostrarToast('Anki Bridge indisponível.');
    return;
  }

  const escolhidas = todasFrases.filter(f => selecionadas.has(f.id));
  const porIdioma = { en: [], ru: [] };
  for (const frase of escolhidas) {
    const lang = (frase.idioma || 'Inglês') === 'Russo' ? 'ru' : 'en';
    porIdioma[lang].push(frase);
  }

  const jobsCriados = [];
  for (const lang of ['en', 'ru']) {
    const lote = porIdioma[lang];
    if (lote.length === 0) continue;
    const preset = bridgePresets[lang];
    const payload = {
      lang,
      deckName: preset.deckName,
      imageSource: preset.imageSource,
      tts: {
        wordTld: preset.ttsWordTld,
        phraseTld: preset.ttsPhraseTld,
      },
      entries: lote.map(frase => ({
        phraseId: frase.id,
        line: montarLinhaMining(frase),
      })),
    };
    const resp = await fetch(`${BRIDGE_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      mostrarToast(`Falha ao criar job ${lang.toUpperCase()}: ${err.error || resp.status}`);
      return;
    }
    const data = await resp.json();
    jobsCriados.push(data.jobId);
  }

  if (jobsCriados.length === 0) {
    mostrarToast('Nenhum job foi criado.');
    return;
  }

  bridgeActiveJobIds = jobsCriados;
  abrirBridgeProgressModal();
  mostrarToast(`${jobsCriados.length} lote(s) enviado(s) ao bridge.`);
  iniciarBridgePolling();
}

function abrirBridgeProgressModal() {
  document.getElementById('bridge-progress-modal').classList.remove('hidden');
  atualizarBridgeProgress();
}

function fecharBridgeProgressModal() {
  document.getElementById('bridge-progress-modal').classList.add('hidden');
}

function iniciarBridgePolling() {
  if (bridgePollingId) clearInterval(bridgePollingId);
  atualizarBridgeProgress();
  bridgePollingId = setInterval(atualizarBridgeProgress, 3000);
}

async function atualizarBridgeProgress() {
  try {
    const resp = await fetch(`${BRIDGE_URL}/jobs`);
    if (!resp.ok) throw new Error('jobs_unavailable');
    const data = await resp.json();
    renderizarBridgeJobs(data.jobs || []);
    await reconciliarExportacoesBridge(data.jobs || []);
  } catch {
    document.getElementById('bridge-progress-subtitle').textContent = 'Não foi possível ler o status do bridge.';
  }
}

function traduzirStage(stage) {
  const mapa = {
    queued: 'Na fila',
    generate_cards: 'Gerando cards',
    extract_prompts: 'Extraindo prompts',
    generate_audio: 'Gerando áudio',
    generate_images: 'Gerando imagens',
    wait_anki: 'Aguardando Anki',
    send_to_anki: 'Enviando ao Anki',
    completed: 'Concluído',
    failed: 'Falhou',
    partial: 'Parcial',
  };
  return mapa[stage] || stage || 'Aguardando';
}

function bridgeJobDetail(state, progress) {
  if (state.ankiError === 'repair_access_denied') {
    return formatarBridgeAnkiRepairMessage(state.repairPayload || {});
  }
  return state.lastError || progress.label || `Stage atual: ${traduzirStage(state.stage)}`;
}

function renderizarBridgeJobs(jobs) {
  const lista = document.getElementById('bridge-progress-list');
  const subtitle = document.getElementById('bridge-progress-subtitle');
  if (!Array.isArray(jobs) || jobs.length === 0) {
    lista.innerHTML = '<div class="empty-state">Nenhum job encontrado.</div>';
    subtitle.textContent = 'Sem jobs no bridge.';
    return;
  }

  const ativos = bridgeActiveJobIds.length
    ? jobs.filter(j => bridgeActiveJobIds.includes(j.jobId))
    : jobs.slice(0, 8);
  subtitle.textContent = `${ativos.length} job(s) acompanhados`;
  lista.innerHTML = ativos.map(job => {
    const state = job.state || {};
    const progress = state.progress || {};
    const total = Number(progress.total || 0);
    const done = Number(progress.done || 0);
    const status = state.status || job.status;
    const pct = total > 0 ? Math.max(5, Math.min(100, Math.round((done / total) * 100))) : (status === 'completed' ? 100 : 12);
    const detail = bridgeJobDetail(state, progress);
    const retryBtn = ['failed', 'partial'].includes(status)
      ? `<button class="bridge-debug-btn bridge-retry-job-btn" data-retry-job="${esc(job.jobId)}" title="Continuar job">Continuar</button>`
      : '';
    return `<div class="bridge-job-card">
      <div class="bridge-job-top">
        <div class="bridge-job-title">${esc(job.jobId)} • ${job.lang === 'ru' ? 'Russo' : 'Inglês'}</div>
        <div class="bridge-job-status">${esc(traduzirStage(state.stage || status))}</div>
      </div>
      <div class="bridge-job-meta">Status: ${esc(status)} • Atualizado: ${esc(state.updatedAt || job.updatedAt || '')}</div>
      <div class="bridge-job-bar"><div class="bridge-job-fill" style="width:${pct}%"></div></div>
      <div class="bridge-job-detail">${esc(detail)}</div>
      ${retryBtn ? `<div class="bridge-job-actions bridge-job-actions-footer">${retryBtn}</div>` : ''}
    </div>`;
  }).join('');

  if (ativos.every(job => ['completed', 'failed', 'partial'].includes((job.state?.status || job.status)))) {
    clearInterval(bridgePollingId);
    bridgePollingId = null;
  }
}

async function reconciliarExportacoesBridge(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return;
  const jobsAtivos = jobs.filter(job => bridgeActiveJobIds.includes(job.jobId));
  if (jobsAtivos.length === 0) return;
  const idsParaExportar = new Set();
  const idsFalhos = new Set();

  for (const job of jobsAtivos) {
    const state = job.state || {};
    for (const phraseId of state.successfulPhraseIds || []) {
      idsParaExportar.add(Number(phraseId));
    }
    for (const phraseId of state.failedPhraseIds || []) {
      idsFalhos.add(Number(phraseId));
    }
  }
  idsFalhos.forEach(id => idsParaExportar.delete(id));

  const todosFinalizados = jobsAtivos.every(job => ['completed', 'failed', 'partial'].includes(job.state?.status || job.status));
  if (!todosFinalizados || idsParaExportar.size === 0) return;

  if (todosFinalizados) {
    const idsExistentes = idsBridgeEnviadosExistentes(idsParaExportar);
    const promptKey = bridgeCleanupKey(jobsAtivos, idsExistentes);
    if (idsExistentes.length > 0 && !bridgeCleanupPromptedKeys.has(promptKey)) {
      bridgeCleanupPromptedKeys.add(promptKey);
      if (confirm(`Apagar do Perpetual Miner as ${idsExistentes.length} frases enviadas ao Anki?`)) {
        await apagarFrasesEnviadasBridge(idsExistentes);
        mostrarToast(`${idsExistentes.length} frase${idsExistentes.length > 1 ? 's' : ''} apagada${idsExistentes.length > 1 ? 's' : ''} do Perpetual Miner.`);
        return;
      }
    }
  }

  await marcarFrasesExportadasBridge(idsParaExportar);
}

function idsBridgeEnviadosExistentes(idsSet) {
  const existentes = [];
  const vistos = new Set();
  for (const frase of todasFrases) {
    const id = Number(frase.id);
    if (!idsSet.has(id) || vistos.has(id)) continue;
    existentes.push(id);
    vistos.add(id);
  }
  return existentes;
}

function bridgeCleanupKey(jobs, ids) {
  const jobKey = jobs.map(job => job.jobId).sort().join('|');
  const idsKey = ids.map(String).sort().join('|');
  return `${jobKey}::${idsKey}`;
}

async function apagarFrasesEnviadasBridge(ids) {
  const idsSet = new Set(ids.map(Number));
  todasFrases = todasFrases.filter(frase => !idsSet.has(Number(frase.id)));
  idsSet.forEach(id => {
    delete keywords[id];
    selecionadas.delete(id);
  });
  atualizarContadorSelecao();
  await new Promise(resolve => chrome.storage.local.set({ frases: todasFrases }, resolve));
  const erro = await removerFrasesFirestore(ids);
  if (erro) mostrarFalhaNaNuvem(erro);
  atualizarTotal();
  aplicarFiltro();
}

async function marcarFrasesExportadasBridge(idsParaExportar) {
  let houveMudanca = false;
  const exportadas = [];
  todasFrases = todasFrases.map(frase => {
    if (!idsParaExportar.has(Number(frase.id)) || foiEnviadaAoAnki(frase)) return frase;
    houveMudanca = true;
    const atualizada = { ...frase, status: STATUS_ENVIADA_AO_ANKI };
    exportadas.push(atualizada);
    return atualizada;
  });

  if (!houveMudanca) return;

  selecionadas.clear();
  atualizarContadorSelecao();
  await new Promise(resolve => chrome.storage.local.set({ frases: todasFrases }, resolve));
  if (usuarioLogado && exportadas.length > 0) {
    firestoreBatchUpsert(exportadas).catch(() => {});
  }
  aplicarFiltro();
  mostrarToast(`${exportadas.length} frase${exportadas.length > 1 ? 's' : ''} enviada${exportadas.length > 1 ? 's' : ''} ao Anki.`);
}

async function continuarBridgeJob(jobId, { silent = false } = {}) {
  if (!jobId) return false;
  try {
    const resp = await fetch(`${BRIDGE_URL}/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
    if (!resp.ok) throw new Error(`retry_failed_${resp.status}`);
    if (!bridgeActiveJobIds.includes(jobId)) {
      bridgeActiveJobIds.push(jobId);
    }
    abrirBridgeProgressModal();
    iniciarBridgePolling();
    if (!silent) mostrarToast('Job reenfileirado para continuar.');
    return true;
  } catch {
    if (!silent) mostrarToast('Falha ao continuar job.');
    return false;
  }
}

async function retentarJobsFalhos() {
  if (bridgeActiveJobIds.length === 0) {
    mostrarToast('Nenhum job ativo para retentar.');
    return;
  }
  const resp = await fetch(`${BRIDGE_URL}/jobs`);
  if (!resp.ok) {
    mostrarToast('Falha ao consultar jobs do bridge.');
    return;
  }
  const data = await resp.json();
  const falhos = (data.jobs || []).filter(job =>
    bridgeActiveJobIds.includes(job.jobId) &&
    ['failed', 'partial'].includes(job.state?.status || job.status)
  );
  if (falhos.length === 0) {
    mostrarToast('Nenhum job falho para retentar.');
    return;
  }
  const resultados = await Promise.all(falhos.map(job => continuarBridgeJob(job.jobId, { silent: true })));
  const ok = resultados.filter(Boolean).length;
  mostrarToast(ok > 0 ? `${ok} job(s) reenfileirado(s).` : 'Falha ao retentar jobs.');
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
  if (usuarioLogado && editadas.length > 0) {
    Promise.allSettled(editadas.map(f => firestorePatch(f))).then(resultados => {
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

function fecharModalDeMinerar() {
  modalDeMinerar?.fechar();
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

function linhasColadas() {
  return document.getElementById('minerar-frases').value
    .split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
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

async function minerarColadas() {
  if (mineracaoEmCurso) return;
  const linhas = linhasColadas();
  if (linhas.length === 0) {
    mostrarErroDeColar(textoDaVoz('ADD-03'));
    document.getElementById('minerar-frases').focus();
    return;
  }
  const fonte  = document.getElementById('minerar-fonte').value.trim() || 'manual';
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
async function importarArquivoTxt(arquivo) {
  if (mineracaoEmCurso) return;
  mostrarArquivoEscolhido(arquivo.name);

  let conteudo;
  try { conteudo = await lerArquivoDeTexto(arquivo); }
  catch { mostrarFimDoArquivo({ erro: textoDaVoz('ADD-07') }); return; }

  const linhas = conteudo.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
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
    mostrarFimDoArquivo({ resultado: textoDaVoz('ADD-09', { duplicadas, invalidas }) });
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
  mineracaoEmCurso = true;
  const mineradas = [];
  let erroLocal = null;
  mostrarProgressoDeMinerar(0, frases.length);
  try {
    for (const { texto, contexto, palavras } of frases) {
      const resposta = await pedirAoServiceWorker({
        type: 'SALVAR_HISTORICO',
        texto,
        origem: contexto.fonte,
        contexto,
        idioma: detectarIdioma(texto),
        palavras,
        semNuvem: true,
      });
      if (!resposta?.ok) throw new Error(resposta?.error || 'save_failed');
      mineradas.push(resposta.frase);
      mostrarProgressoDeMinerar(mineradas.length, frases.length);
    }
  } catch (err) {
    erroLocal = err;
  } finally {
    mineracaoEmCurso = false;
  }
  const erroNaNuvem = await subirMineradas(mineradas);
  return { mineradas, erroLocal, erroNaNuvem };
}

function pedirAoServiceWorker(mensagem) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(mensagem, (resposta) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resposta);
    });
  });
}

/** Sobe as frases de uma vez. Devolve o erro da nuvem, ou `null` (também sem conta). */
async function subirMineradas(frases) {
  if (!usuarioLogado || frases.length === 0) return null;
  try {
    await firestoreBatchUpsert(frases);
  } catch (err) {
    return err;
  }
  await tirarDaFilaDeSync(frases.map(f => String(f.id)));
  return null;
}

async function tirarDaFilaDeSync(ids) {
  const subiram = new Set(ids);
  const { pm_pending_sync = [] } = await chromeGet({ pm_pending_sync: [] });
  const restantes = pm_pending_sync.filter(id => !subiram.has(id));
  if (restantes.length !== pm_pending_sync.length) await chromeSet({ pm_pending_sync: restantes });
}

/**
 * O fim: o toast de sucesso, ou o aviso ADD-06 quando a nuvem falhou. Uma
 * gravação que falhou neste computador fica como aviso GLB-01, com o que já
 * entrou contado no resto.
 */
function concluirMineracao({ mineradas, erroLocal, erroNaNuvem }, textoDoSucesso) {
  fecharModalDeMinerar();
  if (erroLocal) mostrarAvisoNaArea('minerar', { texto: textoDaVoz('GLB-01'), erro: erroLocal });
  if (erroNaNuvem) {
    mineradas.forEach(f => idsMineradosForaDaNuvem.add(f.id));
    mostrarAvisoForaDaNuvem(erroNaNuvem);
    mostrarFalhaNaNuvem(erroNaNuvem);
    return;
  }
  if (!erroLocal && mineradas.length > 0) mostrarToastDeSucesso(textoDoSucesso(mineradas.length));
}

/** O aviso ADD-06: um só, que junta todas as frases mineradas que não subiram. */
function mostrarAvisoForaDaNuvem(erro) {
  mostrarAvisoNaArea('fora-da-nuvem', {
    texto: textoDaVoz('ADD-06.aviso', { n: idsMineradosForaDaNuvem.size }),
    acao: { rotulo: textoDaVoz('ADD-06.tentarDeNovo'), aoUsar: tentarSubirDeNovo },
    erro,
    // Fechar só tira o aviso: elas seguem em pm_pending_sync, e o próximo carregamento tenta de novo.
    aoFechar: () => idsMineradosForaDaNuvem.clear(),
  });
}

async function tentarSubirDeNovo() {
  const frases = todasFrases.filter(f => idsMineradosForaDaNuvem.has(f.id));
  const erro = await subirMineradas(frases);
  if (erro) {
    mostrarAvisoForaDaNuvem(erro);
    mostrarFalhaNaNuvem(erro);
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

function linhaDoTxt(frase) {
  const texto = frase.texto.replace(/\s+/g, ' ').trim();
  const palavra = palavrasDoTxt(frase);
  const precisaDoPrefixoVazio = texto.includes(' : ') || texto.startsWith(':');
  const prefixo = palavra ? `${palavra} : ` : (precisaDoPrefixoVazio ? ': ' : '');
  const fonte   = sanitizarCampo(frase.contexto?.fonte || frase.streaming);
  const titulo  = sanitizarCampo(frase.contexto?.titulo);
  const detalhe = sanitizarCampo(frase.contexto?.detalhe);
  return `${prefixo}${texto} [Contexto: ${fonte} - ${titulo} - ${detalhe}]`;
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
  const fonte = contexto?.fonte || 'importado';
  return {
    texto,
    contexto: { fonte, titulo: contexto?.titulo || '', detalhe: contexto?.detalhe || '' },
    ...(ctx ? { palavras: palavras || [] } : (palavras ? { palavras } : {})),
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
