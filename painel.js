'use strict';

// A base compartilhada (catálogo da Voz e detecção de idioma) é carregada antes
// deste arquivo, pelo painel.html: a busca no catálogo é `PerpetualMiner.textoDaVoz`.
const { detectarIdioma, IDIOMAS, textoDaVoz, CATALOGO_DA_VOZ } = PerpetualMiner;
// A lista de Frases é montada com os componentes da Base Veio (veio/componentes.js).
const {
  iconeVeio, montarChipDaPalavra, escreverFraseClicavel, andarEntrePalavras, focarPalavra, refletirSelecao,
} = PerpetualMiner.Veio;
// O shell (painel-shell.js) é dono da sidebar: o total e o ponto da Conexão com o
// Anki. A conta (painel-conta.js) desenha o chip e o card Conta & sync. Este
// arquivo conta aos dois o que muda.
const Shell = PerpetualMiner.Shell;
const Conta = PerpetualMiner.Conta;
const { SITUACOES } = Conta;
const { mostrarToastDeSucesso } = PerpetualMiner.Veio;

// ─── Constantes ──────────────────────────────────────────────────────────────

const POR_PAGINA = 10;

// O atalho de legenda gravado em Configurações › Atalhos (lib/atalhos.js), que
// o vazio de Frases (PAI-02) ensina. Começa no padrão até a leitura voltar.
let atalhoDeLegenda = PerpetualMiner.Atalhos.ATALHOS_PADRAO.legenda;

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

// ─── Estado global ───────────────────────────────────────────────────────────

let todasFrases        = [];
let frasesVisiveis     = [];
let paginaAtual        = 1;
let filtroFonte         = 'all';
let filtroIdioma       = 'all';
let esconderExportadas = false;
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

let modoModal          = 'bulk';
let idEdicaoIndividual = null;
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
  PerpetualMiner.Atalhos.acompanharAtalhos(({ legenda }) => {
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

// Configurações › Conta & sync e o chip da sidebar mostram quem entrou.
function atualizarUIAuth(user) {
  Conta.mostrarConta(user);
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
    const tombstoneSet = new Set([...tombstoneFS, ...tombstoneCS]);

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

    // ── Merge status 'exported' ──────────────────────────────────────────────
    // Se o local tem status='exported' mas o Firestore ainda não (falha de rede,
    // serviço worker em voo), preserva o status na exibição e retenta o sync.
    // Se o Firestore já tem status='exported' (outro dispositivo exportou), aplica
    // ao local storage para que o status se propague cross-device.
    {
      const localById = new Map(localFrases.map(f => [String(f.id), f]));
      const pendingExportSync = [];
      let   localPrecisaAtualizar = false;
      const localAtualizado = [...localSemTombstoned];

      firestoreFrases = firestoreFrases.map(f => {
        const idStr = String(f.id);
        const local = localById.get(idStr);

        // Caso 1: local exportado, Firestore ainda não — aplica e retenta
        if (local?.status === 'exported' && f.status !== 'exported') {
          pendingExportSync.push({ ...f, status: 'exported' });
          return { ...f, status: 'exported' };
        }

        // Caso 2: Firestore exportado, local ainda não — atualiza local
        if (f.status === 'exported' && local && local.status !== 'exported') {
          const idx = localAtualizado.findIndex(lf => String(lf.id) === idStr);
          if (idx !== -1) { localAtualizado[idx] = { ...localAtualizado[idx], status: 'exported' }; }
          localPrecisaAtualizar = true;
        }

        return f;
      });

      if (pendingExportSync.length > 0) {
        firestoreBatchUpsert(pendingExportSync).catch(err =>
          console.warn('[Firestore] retry status exported:', err.message)
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

// O total aparece no item Frases da sidebar e na entrada do Apagar tudo
// (Configurações › Zona de perigo), que fica indisponível sem frases.
function atualizarTotal() {
  const n = todasFrases.length;
  Shell.mostrarTotalDeFrases(n);
  const apagarTudo = document.getElementById('btn-apagar-tudo');
  apagarTudo.disabled = n === 0;
  if (n === 0)      apagarTudo.textContent = textoDaVoz('CFG-20');
  else if (n === 1) apagarTudo.textContent = textoDaVoz('CFG-24.uma');
  else              apagarTudo.textContent = textoDaVoz('CFG-24.todas', { n });
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

async function removerFrasesFirestore(ids) {
  if (!ids.length) return;
  const idsStr = ids.map(String);
  // 1. Tombstone Firestore (fonte de verdade, imediata, sem race condition)
  //    + tombstone sync (fallback para quando o Firestore estiver inacessível)
  //    + tombstone local (retry do DELETE caso falhe)
  marcarParaDeletarSync(idsStr);
  await marcarParaDeletar(idsStr);
  if (!usuarioLogado) return;
  // Grava tombstone no Firestore antes de deletar — garante que qualquer device
  // que abrir o painel logo após já veja a deleção, mesmo sem Chrome sync propagado
  gravarTombstoneFirestore(idsStr).catch(err =>
    console.warn('[Firestore] tombstone write falhou:', err.message)
  );
  try {
    await firestoreBatchDelete(idsStr);
    limparTombstone(idsStr);
  } catch (err) {
    console.error('[Firestore] delete falhou, ficará pendente:', err.message);
    mostrarFalhaNaNuvem(err);
  }
}

async function apagarTudoFirestore() {
  if (!usuarioLogado) return;
  try {
    const frases = await firestoreGetAll();
    const ids    = frases.map(f => String(f.id));
    marcarParaDeletarSync(ids);
    await marcarParaDeletar(ids);
    await gravarTombstoneFirestore(ids);
    await firestoreBatchDelete(ids);
    limparTombstone(ids);
  } catch (e) {
    console.error('[Firestore] apagar tudo falhou:', e);
    mostrarFalhaNaNuvem(e);
  }
}

function atualizarContadorSelecao() {
  const el     = document.getElementById('selection-count');
  const btnDel = document.getElementById('btn-delete-selected');
  if (!el) return;
  const n = selecionadas.size;
  if (n === 0) {
    el.classList.add('hidden');
    btnDel?.classList.add('hidden');
  } else {
    el.textContent = `${n} selecionada${n > 1 ? 's' : ''}`;
    el.classList.remove('hidden');
    btnDel?.classList.remove('hidden');
  }
  atualizarBotoesSel();
}

function idsPaginaAtual() {
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  return frasesVisiveis.slice(inicio, inicio + POR_PAGINA).map(f => f.id);
}

function selecionarPagina() {
  const ids = idsPaginaAtual();
  const todasMarcadas = ids.every(id => selecionadas.has(id));
  if (todasMarcadas) {
    ids.forEach(id => selecionadas.delete(id));
  } else {
    ids.forEach(id => selecionadas.add(id));
  }
  ids.forEach(refletirSelecaoNoCartao);
  atualizarContadorSelecao();
}

function selecionarTodosVisiveis() {
  const ids = frasesVisiveis.map(f => f.id);
  const todasMarcadas = ids.every(id => selecionadas.has(id));
  if (todasMarcadas) {
    ids.forEach(id => selecionadas.delete(id));
  } else {
    ids.forEach(id => selecionadas.add(id));
  }
  idsPaginaAtual().forEach(refletirSelecaoNoCartao);
  atualizarContadorSelecao();
}

function atualizarBotoesSel() {
  const btnPag   = document.getElementById('btn-sel-pagina');
  const btnTodos = document.getElementById('btn-sel-todos');
  if (!btnPag || !btnTodos) return;

  const idsPag   = idsPaginaAtual();
  // “Selecionar página” (PAI-31): marcado com a página inteira, misto com parte.
  document.getElementById('frases-selecao').hidden = !listaCarregada || idsPag.length === 0;
  refletirSelecao(document.getElementById('sel-pagina'), idsPag.filter(id => selecionadas.has(id)).length, idsPag.length);
  const pagAtiva = idsPag.length > 0 && idsPag.every(id => selecionadas.has(id));
  btnPag.classList.toggle('sel-active', pagAtiva);
  btnPag.title = pagAtiva ? 'Desmarcar página atual' : 'Selecionar página atual';

  const total      = frasesVisiveis.length;
  const todosAtivo = total > 0 && frasesVisiveis.every(f => selecionadas.has(f.id));
  btnTodos.classList.toggle('sel-active', todosAtivo);
  btnTodos.textContent = `Todas (${total})`;
  btnTodos.title = todosAtivo ? 'Desmarcar todas' : `Selecionar todas (${total})`;
}

function deletarSelecionadas() {
  const n = selecionadas.size;
  if (n === 0) return;
  if (!confirm(`Deseja deletar as ${n} frase${n > 1 ? 's' : ''} selecionadas?\nEsta ação não pode ser desfeita.`)) return;
  const ids = [...selecionadas];
  todasFrases = todasFrases.filter(f => !selecionadas.has(f.id));
  ids.forEach(id => delete keywords[id]);
  selecionadas.clear();
  atualizarContadorSelecao();
  removerFrasesFirestore(ids);
  chrome.storage.local.set({ frases: todasFrases }, () => {
    atualizarTotal();
    aplicarFiltro();
    mostrarToast(`${ids.length} frase${ids.length > 1 ? 's' : ''} deletada${ids.length > 1 ? 's' : ''}!`);
  });
}

// ─── Listeners ────────────────────────────────────────────────────────────────

function setupListeners() {
  document.getElementById('btn-apagar-tudo').addEventListener('click', apagarTudo);
  document.getElementById('btn-export').addEventListener('click', exportarTxt);
  document.getElementById('btn-send-anki').addEventListener('click', enviarSelecionadasAoAnki);
  document.getElementById('btn-bulk-edit').addEventListener('click', abrirModalBulk);
  document.getElementById('btn-sel-pagina').addEventListener('click', selecionarPagina);
  document.getElementById('sel-pagina').addEventListener('change', selecionarPagina);
  document.getElementById('btn-minerar-frases').addEventListener('click', abrirModalMultiAdd);
  document.getElementById('btn-sel-todos').addEventListener('click', selecionarTodosVisiveis);

  // Adição em Massa
  document.getElementById('btn-multi-add').addEventListener('click', abrirModalMultiAdd);
  document.getElementById('btn-bulk-add-close').addEventListener('click',  fecharModalMultiAdd);
  document.getElementById('btn-bulk-add-cancel').addEventListener('click', fecharModalMultiAdd);
  document.getElementById('btn-bulk-add-save').addEventListener('click',   salvarMultiAdd);
  document.getElementById('bulk-add-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('bulk-add-modal')) fecharModalMultiAdd();
  });
  document.getElementById('bulk-add-modal').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModalMultiAdd();
  });

  // Importador .txt
  document.getElementById('btn-import').addEventListener('click', abrirImportador);
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) { importarArquivoTxt(file); e.target.value = ''; }
  });

  document.getElementById('btn-delete-selected')?.addEventListener('click', deletarSelecionadas);

  document.getElementById('btn-modal-close').addEventListener('click',  fecharModal);
  document.getElementById('btn-modal-cancel').addEventListener('click', fecharModal);
  document.getElementById('btn-modal-save').addEventListener('click',   salvarModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-modal')) fecharModal();
  });
  document.getElementById('edit-modal').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModal();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvarModal(); }
  });

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
    const btnClear    = e.target.closest('[data-action="clear-kw"]');
    const btnAddSep   = e.target.closest('[data-action="add-sep"]');
    const palavraEl   = e.target.closest('.veio-palavra-clicavel');
    if (btnCopy)     { copiarFrase(btnCopy.dataset.id);                         return; }
    if (btnDel)      { deletarFrase(Number(btnDel.dataset.id));                 return; }
    if (btnEdit)     { abrirEdicaoIndividual(Number(btnEdit.dataset.id));       return; }
    if (btnEditText) { editarTextoFrase(Number(btnEditText.dataset.id));        return; }
    if (btnClear)    { clearKeywords(Number(btnClear.dataset.id));              return; }
    if (btnAddSep)   { addSeparator(Number(btnAddSep.dataset.id));             return; }
    if (palavraEl)   { escolherPalavra(palavraEl);                              return; }
  });
  lista.addEventListener('keydown', aoTeclarNaFrase);

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

  const aoMudar = (aplicar) => () => { aplicar(); voltarAPrimeiraPagina(); };
  fonte.addEventListener('change',   aoMudar(() => { filtroFonte = fonte.value; }));
  idioma.addEventListener('change',  aoMudar(() => { filtroIdioma = idioma.value; }));
  ordem.addEventListener('change',   aoMudar(() => { ordemAtual = ordem.value; }));
  ocultar.addEventListener('change', aoMudar(() => { esconderExportadas = ocultar.checked; }));
  busca.addEventListener('input',    aoMudar(() => { buscaAtual = busca.value; mostrarLimparBusca(); }));
  document.getElementById('btn-limpar-busca').addEventListener('click', limparBusca);
}

function mostrarLimparBusca() {
  document.getElementById('btn-limpar-busca').hidden = !buscaAtual;
}

/** Fonte, idioma ou o toggle ligados. A ordem não esconde frase, então não conta. */
function filtrosLigados() {
  return filtroFonte !== 'all' || filtroIdioma !== 'all' || esconderExportadas;
}

function limparFiltros() {
  filtroFonte = 'all';
  filtroIdioma = 'all';
  esconderExportadas = false;
  document.getElementById('filtro-fonte').value = 'all';
  document.getElementById('filtro-idioma').value = 'all';
  document.getElementById('filtro-ocultar').checked = false;
  voltarAPrimeiraPagina();
}

function limparBusca() {
  buscaAtual = '';
  const busca = document.getElementById('busca-frases');
  busca.value = '';
  mostrarLimparBusca();
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
  if (esconderExportadas)
    resultado = resultado.filter(f => f.status !== 'exported');
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
    atualizarBotoesSel();
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
  atualizarBotoesSel();
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
    // Até o #31 trazer o menu Minerar frases, o botão abre a adição em massa de hoje.
    acoes.append(botaoDoVazio(textoDaVoz('PAI-02.acao'), abrirModalMultiAdd, 'veio-botao--primario'));
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
  if (atalhoDeLegenda) return [criar('kbd', 'veio-kbd', PerpetualMiner.Atalhos.rotuloDoAtalho(atalhoDeLegenda))];
  const definir = criar('a', 'frases-vazio__definir-atalho', textoDaVoz('GLB-02.definir'));
  definir.href = '#configuracoes/atalhos';
  return [criar('kbd', 'veio-kbd veio-kbd--sem-atalho', textoDaVoz('GLB-02.semAtalho')), ' ', definir];
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
  escreverPalavras(texto, f);

  const corpo = criar('div', 'frase-corpo');
  corpo.append(texto);
  const chip = montarLinhaDoChip(f);
  if (chip) corpo.append(chip);
  corpo.append(montarContexto(f));

  cartao.append(marcar, corpo, montarAcoesDeHoje(f));
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
  // Hoje o Envio e o Exportar .txt gravam o mesmo `exported`; o #30 separa o
  // Exportada, e o selo passa a dizer qual dos dois.
  if (f.status === 'exported') linha.append(criar('span', 'veio-selo veio-selo--ok', textoDaVoz('PAI-08.enviada')));
  return linha;
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

// As 4 ações só-ícone do cartão (PAI-30). O que cada uma faz continua o de hoje
// até o #30 reconstruí-las.
function montarAcoesDeHoje(f) {
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

// ─── Edição Inline de Texto ───────────────────────────────────────────────────

function editarTextoFrase(id) {
  const cartao = cartaoNaLista(id);
  if (!cartao) return;
  const frase = todasFrases.find(f => f.id === id);
  if (!frase) return;
  const phraseText = cartao.querySelector('.veio-frase__texto');
  if (!phraseText || phraseText.querySelector('textarea')) return; // já editando

  const textarea = document.createElement('textarea');
  textarea.className = 'veio-campo';
  textarea.value = frase.texto;
  textarea.rows  = Math.max(2, Math.ceil(frase.texto.length / 55));
  phraseText.innerHTML = '';
  phraseText.appendChild(textarea);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const novoTexto = textarea.value.trim();
    if (novoTexto && novoTexto !== frase.texto) salvarTextoFrase(id, novoTexto);
    else aplicarFiltro();
  };

  textarea.addEventListener('blur', commit);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { committed = true; aplicarFiltro(); }
  });
}

function salvarTextoFrase(id, novoTexto) {
  const idx = todasFrases.findIndex(f => f.id === id);
  if (idx < 0) return;
  todasFrases[idx] = { ...todasFrases[idx], texto: novoTexto };
  chrome.storage.local.set({ frases: todasFrases });
  salvarFraseFirestore(todasFrases[idx]);
  aplicarFiltro();
  mostrarToast('Frase atualizada!');
}

// ─── Phrase Actions ───────────────────────────────────────────────────────────

function copiarFrase(id) {
  const frase = todasFrases.find(f => String(f.id) === String(id));
  if (!frase) return;
  navigator.clipboard.writeText(frase.texto).then(() => mostrarToast('Copiado!'));
}

function deletarFrase(id) {
  todasFrases = todasFrases.filter(f => f.id !== id);
  delete keywords[id];
  selecionadas.delete(id);
  atualizarContadorSelecao();
  removerFrasesFirestore([id]);
  chrome.storage.local.set({ frases: todasFrases }, () => {
    atualizarTotal();
    aplicarFiltro();
  });
}

function apagarTudo() {
  if (!confirm('Apagar TODAS as frases?\nEsta ação não pode ser desfeita.')) return;
  todasFrases = [];
  Object.keys(keywords).forEach(k => delete keywords[k]);
  selecionadas.clear();
  atualizarContadorSelecao();
  apagarTudoFirestore();
  chrome.storage.local.set({ frases: [] }, () => {
    atualizarTotal();
    paginaAtual = 1;
    aplicarFiltro();
  });
}

function exportarTxt() {
  if (selecionadas.size === 0) { mostrarToast('Selecione as frases que deseja exportar.'); return; }
  const linhas = todasFrases
    .filter(f => selecionadas.has(f.id))
    .map(f => {
      const textoLimpo = f.texto.replace(/\s+/g, ' ').trim();
      const kw = keywords[f.id]?.length
        ? keywords[f.id].map(w => w === '|' ? '|' : w.replace(/@\d+$/, '')).join(' ')
            .replace(/\s+\|\s+/g, ' | ').replace(/\s*\|\s*$/, '').trim()
        : '';
      const fonte   = sanitizarCampo(f.contexto?.fonte   || f.streaming);
      const titulo  = sanitizarCampo(f.contexto?.titulo);
      const detalhe = sanitizarCampo(f.contexto?.detalhe);
      const prefixoKeyword = kw ? `${kw} : ` : '';
      return `${prefixoKeyword}${textoLimpo} [Contexto: ${fonte} - ${titulo} - ${detalhe}]`;
    }).filter(l => l.trim().length > 0);

  const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'perpetualminer-export.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const exportadas = [];
  todasFrases = todasFrases.map(f => {
    if (selecionadas.has(f.id)) { const u = { ...f, status: 'exported' }; exportadas.push(u); return u; }
    return f;
  });
  selecionadas.clear();
  atualizarContadorSelecao();
  chrome.storage.local.set({ frases: todasFrases }, () => {
    atualizarTotal();
    aplicarFiltro();
  });
  if (usuarioLogado && exportadas.length > 0) firestoreBatchUpsert(exportadas);
  mostrarToast(`${linhas.length} frases exportadas!`);
}

function montarLinhaMining(frase) {
  const textoLimpo = frase.texto.replace(/\s+/g, ' ').trim();
  const kw = keywords[frase.id]?.length
    ? keywords[frase.id].map(w => w === '|' ? '|' : w.replace(/@\d+$/, '')).join(' ')
        .replace(/\s+\|\s+/g, ' | ').replace(/\s*\|\s*$/, '').trim()
    : '';
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
  await removerFrasesFirestore(ids);
  atualizarTotal();
  aplicarFiltro();
}

async function marcarFrasesExportadasBridge(idsParaExportar) {
  let houveMudanca = false;
  const exportadas = [];
  todasFrases = todasFrases.map(frase => {
    if (!idsParaExportar.has(Number(frase.id)) || frase.status === 'exported') return frase;
    houveMudanca = true;
    const atualizada = { ...frase, status: 'exported' };
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

// ─── Modal de Edição ──────────────────────────────────────────────────────────

function abrirModalBulk() {
  if (selecionadas.size === 0) { mostrarToast('Selecione ao menos uma frase para editar.'); return; }
  modoModal = 'bulk'; idEdicaoIndividual = null;
  const n = selecionadas.size;
  document.getElementById('modal-title').textContent    = `Editar ${n} frase${n > 1 ? 's' : ''} selecionada${n > 1 ? 's' : ''}`;
  document.getElementById('modal-subtitle').textContent = 'Campos em branco não serão alterados';
  document.getElementById('modal-fonte').value = document.getElementById('modal-titulo').value = document.getElementById('modal-detalhe').value = '';
  abrirModal();
}

function abrirEdicaoIndividual(id) {
  const frase = todasFrases.find(f => f.id === id);
  if (!frase) return;
  modoModal = 'individual'; idEdicaoIndividual = id;
  const preview = frase.texto.length > 65 ? frase.texto.substring(0, 65) + '…' : frase.texto;
  document.getElementById('modal-title').textContent    = 'Editar Metadados';
  document.getElementById('modal-subtitle').textContent = `"${preview}"`;
  document.getElementById('modal-fonte').value   = frase.contexto?.fonte   || frase.streaming || '';
  document.getElementById('modal-titulo').value  = frase.contexto?.titulo  || '';
  document.getElementById('modal-detalhe').value = frase.contexto?.detalhe || '';
  abrirModal();
  document.getElementById('modal-titulo').focus();
}

function abrirModal() {
  document.getElementById('edit-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('modal-fonte').focus(), 50);
}

function fecharModal() { document.getElementById('edit-modal').classList.add('hidden'); }

function salvarModal() {
  const fonteVal   = document.getElementById('modal-fonte').value.trim();
  const tituloVal  = document.getElementById('modal-titulo').value.trim();
  const detalheVal = document.getElementById('modal-detalhe').value.trim();
  fecharModal();
  if (modoModal === 'bulk') salvarEdicaoEmMassa(fonteVal, tituloVal, detalheVal);
  else                      salvarEdicaoIndividual(idEdicaoIndividual, fonteVal, tituloVal, detalheVal);
}

function salvarEdicaoEmMassa(fonteVal, tituloVal, detalheVal) {
  const editadas = [];
  todasFrases = todasFrases.map(f => {
    if (!selecionadas.has(f.id)) return f;
    const ctx = { ...(f.contexto || { fonte: f.streaming || '', titulo: '', detalhe: '' }) };
    if (fonteVal)   ctx.fonte   = fonteVal;
    if (tituloVal)  ctx.titulo  = tituloVal;
    if (detalheVal) ctx.detalhe = detalheVal;
    const updated = { ...f, ...(fonteVal ? { streaming: fonteVal } : {}), contexto: ctx };
    editadas.push(updated);
    return updated;
  });
  selecionadas.clear();
  atualizarContadorSelecao();
  chrome.storage.local.set({ frases: todasFrases }, () => {
    construirFiltroDeFonte();
    aplicarFiltro(); mostrarToast('Metadados atualizados!');
  });
  if (usuarioLogado && editadas.length > 0) {
    Promise.allSettled(editadas.map(f => firestorePatch(f))).then(resultados => {
      const falhas = resultados.filter(r => r.status === 'rejected');
      if (falhas.length > 0) mostrarFalhaNaNuvem(falhas[0].reason);
    });
  }
}

function salvarEdicaoIndividual(id, fonteVal, tituloVal, detalheVal) {
  const idx = todasFrases.findIndex(f => f.id === id);
  if (idx < 0) return;
  const f = todasFrases[idx];
  const novaFonte = fonteVal || f.contexto?.fonte || f.streaming || '';
  todasFrases[idx] = { ...f, streaming: novaFonte, contexto: { fonte: novaFonte, titulo: tituloVal, detalhe: detalheVal } };
  chrome.storage.local.set({ frases: todasFrases }, () => {
    construirFiltroDeFonte(); aplicarFiltro(); mostrarToast('Frase atualizada!');
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

// ─── Multi-Add (Adição em Massa) ─────────────────────────────────────────────

function autoKeywordsForPhrase(frase) {
  return new Promise(resolve => {
    if (!chrome.runtime?.sendMessage) {
      resolve([]);
      return;
    }
    chrome.runtime.sendMessage({ type: 'AUTO_KEYWORDS_FOR_PHRASE', frase }, response => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve(Array.isArray(response?.keywords) ? response.keywords : []);
    });
  });
}

async function preencherAutoKeywords(frases) {
  for (const frase of frases) {
    if (frase.keywords?.length) continue;
    const idioma = String(frase.idioma || '').toLowerCase();
    if (!idioma.includes('ingl')) continue;
    const kws = await autoKeywordsForPhrase(frase);
    if (kws.length > 0) {
      frase.keywords = kws;
      frase.autoKeyword = true;
    }
  }
  return frases;
}

function abrirModalMultiAdd() {
  document.getElementById('bulk-add-textarea').value = '';
  document.getElementById('bulk-add-fonte').value    = '';
  document.getElementById('bulk-add-titulo').value   = '';
  document.getElementById('bulk-add-progress-wrap').classList.add('hidden');
  document.getElementById('bulk-add-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('bulk-add-textarea').focus(), 50);
}

function fecharModalMultiAdd() {
  document.getElementById('bulk-add-modal').classList.add('hidden');
}

async function salvarMultiAdd() {
  const raw    = document.getElementById('bulk-add-textarea').value;
  const fonte  = document.getElementById('bulk-add-fonte').value.trim() || 'manual';
  const titulo = document.getElementById('bulk-add-titulo').value.trim();

  const linhas = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (linhas.length === 0) { mostrarToast('Cole ao menos uma frase.'); return; }

  const wrapEl  = document.getElementById('bulk-add-progress-wrap');
  const barEl   = document.getElementById('bulk-add-progress-bar');
  const labelEl = document.getElementById('bulk-add-progress-label');
  wrapEl.classList.remove('hidden');

  const agora = Date.now();
  const novas = linhas.map((texto, i) => {
    barEl.style.width   = `${Math.round(((i + 1) / linhas.length) * 100)}%`;
    labelEl.textContent = `${i + 1} de ${linhas.length}…`;
    return {
      texto,
      data:      new Date().toLocaleDateString('pt-BR'),
      streaming: fonte,
      id:        agora + i,
      idioma:    detectarIdioma(texto),
      contexto:  { fonte, titulo, detalhe: '' },
    };
  });
  await preencherAutoKeywords(novas);

  const { frases: local = [] } = await chromeGet({ frases: [] });
  const todas = [...novas, ...local];
  await new Promise(resolve => chrome.storage.local.set({ frases: todas }, resolve));

  if (usuarioLogado) {
    try { await firestoreBatchUpsert(novas); }
    catch (err) { mostrarFalhaNaNuvem(err); }
  }

  todasFrases = todas;
  atualizarTotal();
  fecharModalMultiAdd();
  finalizarCarregamento();
  const n = novas.length;
  mostrarToast(`${n} frase${n !== 1 ? 's' : ''} adicionada${n !== 1 ? 's' : ''}!`);
}

// ─── Importador de Arquivo .txt ───────────────────────────────────────────────

function abrirImportador() {
  document.getElementById('import-file-input').click();
}

async function importarArquivoTxt(file) {
  let texto;
  try { texto = await file.text(); }
  catch { mostrarToast('Não foi possível ler o arquivo.'); return; }

  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (linhas.length === 0) { mostrarToast('Arquivo vazio.'); return; }

  const overlay   = document.getElementById('import-overlay');
  const barEl     = document.getElementById('import-overlay-bar');
  const titleEl   = document.getElementById('import-overlay-title');
  const subEl     = document.getElementById('import-overlay-sub');
  const labelEl   = document.getElementById('import-overlay-label');
  overlay.classList.remove('hidden');
  titleEl.textContent = `Importando ${linhas.length} linha${linhas.length !== 1 ? 's' : ''}…`;

  // Textos existentes para deduplicação (compara lowercase)
  const textosExistentes = new Set(todasFrases.map(f => f.texto.trim().toLowerCase()));

  const novas = [];
  const agora = Date.now();
  let duplicatas = 0;
  let invalidas  = 0;

  for (let i = 0; i < linhas.length; i++) {
    barEl.style.width   = `${Math.round(((i + 1) / linhas.length) * 100)}%`;
    labelEl.textContent = `Linha ${i + 1} de ${linhas.length}`;

    const parsed = parsearLinhaExportada(linhas[i]);
    if (!parsed) { invalidas++; continue; }

    const chave = parsed.texto.toLowerCase();
    if (textosExistentes.has(chave)) { duplicatas++; continue; }

    textosExistentes.add(chave);
    novas.push({
      texto:     parsed.texto,
      data:      new Date().toLocaleDateString('pt-BR'),
      streaming: parsed.fonte || 'importado',
      id:        agora + i,
      idioma:    detectarIdioma(parsed.texto),
      contexto:  { fonte: parsed.fonte, titulo: parsed.titulo, detalhe: parsed.detalhe },
    });
  }

  overlay.classList.add('hidden');
  barEl.style.width = '0%';

  if (novas.length === 0) {
    const msgs = [];
    if (duplicatas > 0) msgs.push(`${duplicatas} duplicata${duplicatas !== 1 ? 's' : ''}`);
    if (invalidas  > 0) msgs.push(`${invalidas} inválida${invalidas  !== 1 ? 's' : ''}`);
    mostrarToast('Nenhuma frase nova. ' + msgs.join(', ') + '.');
    return;
  }

  await preencherAutoKeywords(novas);
  subEl.textContent = '';
  const { frases: local = [] } = await chromeGet({ frases: [] });
  const todas = [...novas, ...local];
  await new Promise(resolve => chrome.storage.local.set({ frases: todas }, resolve));

  if (usuarioLogado) {
    try { await firestoreBatchUpsert(novas); }
    catch (e) { console.error('[Import] Firestore falhou:', e); }
  }

  todasFrases = todas;
  atualizarTotal();
  finalizarCarregamento();

  let msg = `${novas.length} frase${novas.length !== 1 ? 's' : ''} importada${novas.length !== 1 ? 's' : ''}!`;
  if (duplicatas > 0) msg += ` (${duplicatas} duplicata${duplicatas !== 1 ? 's' : ''} ignorada${duplicatas !== 1 ? 's' : ''})`;
  mostrarToast(msg);
}

// Parser para o formato exportado: "keyword : texto [Contexto: fonte - titulo - detalhe]"
function parsearLinhaExportada(linha) {
  // Extrai [Contexto: ...] do final
  const ctxMatch = linha.match(/\[Contexto:\s*(.+?)\]\s*$/);
  let resto  = linha;
  let fonte = '', titulo = '', detalhe = '';

  if (ctxMatch) {
    resto = linha.slice(0, ctxMatch.index).trim();
    const partes = ctxMatch[1].split(' - ');
    fonte   = (partes[0] || '').replace(/^Desconhecido$/i, '').trim();
    titulo  = (partes[1] || '').replace(/^Desconhecido$/i, '').trim();
    detalhe = (partes[2] || '').replace(/^Desconhecido$/i, '').trim();
  }

  // Remove prefixo de keyword ("palavra : texto" → "texto")
  const sepIdx = resto.indexOf(' : ');
  const texto  = sepIdx >= 0 ? resto.slice(sepIdx + 3).trim() : resto.trim();

  if (!texto) return null;
  return { texto, fonte, titulo, detalhe };
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
