'use strict';

// A base compartilhada: o catálogo da Voz e a detecção de idioma.
importScripts('lib/voz/catalogo.js', 'lib/voz/texto.js', 'lib/idioma.js', 'lib/mineracao.js', 'lib/ajustes-de-envio.js', 'lib/mineracao-do-dia.js', 'lib/vocabulario-da-mineracao.js', 'lib/pedido-ao-anki.js', 'lib/sincronizacao.js');
const { textoDaVoz, detectarIdioma, IDIOMAS, MineracaoDoDia, Mineracao, VocabularioDaMineracao, Sincronizacao } = PerpetualMiner;

// During an upgrade, close the old readable area before migrating bearer tokens.
// A failed migration leaves it restricted rather than exposing the credentials.
if (chrome.storage.local.setAccessLevel) {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
    .then(() => Sincronizacao.lerCredenciais())
    .then(() => chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }))
    .catch(() => console.warn('[Auth] session migration failed'));
}

// Em pasta descompactada, recarrega a extensão quando os arquivos mudam.
importScripts('lib/arquivos-da-extensao.js', 'lib/auto-recarregar.js');
PerpetualMiner.AutoRecarregar.iniciar();

const BRIDGE_URL        = 'http://127.0.0.1:8766';
const AUTO_MINER_SETTINGS_KEY = MineracaoDoDia.CHAVES.ajustes;
const AUTO_MINER_DAILY_KEY = MineracaoDoDia.CHAVES.diario;
const AUTO_MINER_LAST_EVENT_KEY = MineracaoDoDia.CHAVES.ultimoEvento;
// Com uma leitura guardada para cair de volta, a Conexão muda não segura a Mineração automática por mais que isto.
const AUTO_KEYWORD_RENEW_TIMEOUT_MS = 8000;
const AUTO_KEYWORD_MIN_SCORE = 70;
const AUTO_KEYWORD_MAX_EN_GROUPS = 2;
const AUTO_MINER_MAX_EN_KEYWORDS = AUTO_KEYWORD_MAX_EN_GROUPS;

const AUTO_KEYWORD_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', 'it', "it's", 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'same', 'she', "she's", 'should', 'so', 'some', 'such',
  'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', "there's",
  'these', 'they', "they're", 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
  'was', 'we', "we're", 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'you', 'your', 'yours', 'yourself', 'yourselves',
]);

const AUTO_KEYWORD_STOP_WORDS_RU = new Set([
  'а', 'без', 'бы', 'в', 'вам', 'вас', 'все', 'всё', 'вы', 'где', 'да', 'для', 'до', 'его', 'ее', 'её',
  'если', 'есть', 'же', 'за', 'и', 'из', 'или', 'им', 'их', 'к', 'как', 'ко', 'когда', 'ли', 'мне',
  'мы', 'на', 'над', 'нас', 'не', 'него', 'нее', 'неё', 'нет', 'ни', 'но', 'ну', 'о', 'об', 'он',
  'она', 'они', 'оно', 'от', 'по', 'под', 'при', 'с', 'со', 'так', 'там', 'тебе', 'тебя', 'то',
  'только', 'ты', 'у', 'уже', 'что', 'чтобы', 'это', 'я',
]);

const AUTO_KEYWORD_PATTERNS = [
  'as soon as', 'as long as', 'as far as', 'as if', 'as though',
  'even though', 'even if', 'rather than', 'instead of', 'because of', 'due to',
  'in order to', 'so that', 'so as to', 'used to', 'be used to', 'get used to',
  'be supposed to', 'about to', 'going to', 'have to', 'had better',
  'no matter', 'let alone', 'at least', 'at all', 'after all',
  'in spite of', 'out of', 'up to', 'in charge of', 'on behalf of',
].map(autoTermParts);

const AUTO_KEYWORD_IDIOMS = [
  'around the clock',
].map(autoTermParts);

const AUTO_PHRASAL_PARTICLES = new Set([
  'about', 'across', 'after', 'along', 'around', 'aside', 'away', 'back', 'by',
  'down', 'forward', 'in', 'into', 'off', 'on', 'out', 'over', 'through',
  'together', 'up',
]);

const AUTO_PHRASAL_TRAILERS = new Set([
  'about', 'across', 'after', 'against', 'at', 'by', 'for', 'from', 'into',
  'of', 'on', 'over', 'through', 'to', 'with',
]);

const AUTO_CONTENT_LINKERS = new Set(['of']);

const AUTO_ACTION_OBJECT_WORDS = new Set([
  'plough', 'ploughing', 'plow', 'plowing', 'sow', 'sowing',
  'plant', 'planting', 'harvest', 'harvesting', 'reap', 'reaping',
]);

const AUTO_STRONG_SINGLE_WORDS = new Set([
  'nursing', 'weaned', 'weaning', 'gruel', 'sow',
]);

const AUTO_STRONG_PHRASAL_ROOTS = new Set([
  'fritter', 'frittered', 'frittering',
]);

const MENU_MINERAR_SELECAO = 'minerar-perpetualminer';

// Os itens do menu ficam gravados entre versões, e o id mudou junto com a cópia
// (MIN-08). Sem o removeAll, quem atualiza a extensão fica com dois itens.
function registrarMenuDeContexto() {
  return new Promise(resolve => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_MINERAR_SELECAO,
        title: textoDaVoz('MIN-08'),
        contexts: ['selection'],
      });
      resolve();
    });
  });
}

chrome.runtime.onInstalled.addListener(aoInstalar);

/**
 * O menu de contexto é criado como sempre; só a instalação (não a atualização)
 * abre a Boas-vindas numa aba (item 8 da lista fechada, ONB-01) e deixa a
 * configuração começada em `pm_boas_vindas`, que põe o lembrete “Configuração
 * pela metade” no popup e em Frases até ela chegar a Tudo pronto (item 9,
 * lib/configuracao.js). Quem atualiza nunca passou pela Boas-vindas: sem a
 * chave, não vê lembrete.
 */
async function aoInstalar(detalhes) {
  registrarMenuDeContexto();
  if (detalhes?.reason === 'install') {
    // A aba abre mesmo com o disco recusando: sem a chave, só falta o lembrete.
    await chrome.storage.local.set({ pm_boas_vindas: { agoraNao: [], concluida: false } }).catch(() => {});
    chrome.tabs.create({ url: chrome.runtime.getURL('painel.html#boas-vindas') });
  }
}

chrome.contextMenus.onClicked.addListener(minerarSelecaoDoMenu);

function minerarSelecaoDoMenu(info, tab) {
  if (info.menuItemId !== MENU_MINERAR_SELECAO) return;

  const selecao = info.selectionText?.trim();
  if (!selecao) return;

  const contexto = Mineracao.contextoDaSelecao({ url: info.pageUrl || tab?.url, titulo: tab?.title });

  salvarFrase(selecao, contexto.fonte, contexto, detectarIdioma(selecao));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Um player em iframe sem permissão de clipboard pede a cópia ao frame de cima
  // da mesma aba. Só o content script desta extensão alcança este canal; uma
  // página não, então ela não consegue sobrescrever o clipboard por aqui. A
  // resposta diz se a cópia saiu, para o overlay só afirmar o que aconteceu.
  if (request.type === 'COPIAR_NO_FRAME_DE_CIMA') {
    const texto = request.texto;
    if (sender.id !== chrome.runtime.id || sender.tab?.id == null) return;
    if (typeof texto !== 'string' || !texto.trim()) return;
    chrome.tabs.sendMessage(sender.tab.id, { type: 'COPIAR_PARA_CLIPBOARD', texto }, { frameId: 0 })
      .then(resposta => sendResponse({ ok: resposta?.ok === true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // Um frame sem vídeo pergunta se outro frame da aba tem um (um player num iframe
  // de outra origem), antes de dizer que a página não tem vídeo (MIN-10). Só um
  // frame com vídeo responde; sem resposta, não há.
  if (request.type === 'HA_VIDEO_EM_OUTRO_FRAME') {
    if (sender.id !== chrome.runtime.id || sender.tab?.id == null) return;
    chrome.tabs.sendMessage(sender.tab.id, { type: 'TEM_VIDEO_NESTE_FRAME' })
      .then(resposta => sendResponse({ temVideo: resposta?.temVideo === true }))
      .catch(() => sendResponse({ temVideo: false }));
    return true;
  }

  if (request.type === 'SALVAR_HISTORICO') {
    // O Minerar frases do painel manda `palavras` quando a linha já trazia a
    // Palavra (um .txt exportado daqui, mesmo sem nenhuma): ela volta como está,
    // sem a detecção automática. Ele também manda `semNuvem`, porque sobe as
    // frases de uma vez no fim e precisa saber se a nuvem falhou (ADD-06).
    const palavras = Array.isArray(request.palavras) ? request.palavras.map(String) : null;
    salvarFrase(
      request.texto,
      request.origem,
      request.contexto  || null,
      request.idioma    || 'Inglês',
      palavras?.length ? { keywords: palavras, autoKeyword: false } : {},
      { comPalavraAutomatica: !palavras, comNuvem: !request.semNuvem },
    )
      .then(frase => sendResponse({ ok: true, frase }))
      .catch(err => sendResponse({ ok: false, error: err?.message || 'save_failed' }));
    return true;
  }

  if (request.type === 'AUTO_MINER_GET_STATE') {
    getAutoMinerState()
      .then(state => sendResponse({ ok: true, state }))
      .catch(err => sendResponse({ ok: false, error: err?.message || 'auto_miner_state_failed' }));
    return true;
  }

  if (request.type === 'AUTO_MINER_SET_SETTINGS') {
    setAutoMinerSettings(request.settings || {})
      .then(state => {
        publicarEstadoDaAutomatica(state);
        sendResponse({ ok: true, state });
      })
      .catch(err => sendResponse({ ok: false, error: err?.message || 'auto_miner_settings_failed' }));
    return true;
  }

  if (request.type === 'AUTO_MINER_CANDIDATE') {
    handleAutoMinerCandidate(request)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({ ok: false, action: 'skip', reason: err?.message || 'auto_miner_failed' }));
    return true;
  }
});

// Toda leitura-modificação-escrita de `frases` e `pm_pending_sync` passa por esta
// fila. Sem ela, gravações concorrentes (ex.: várias frases de uma foto) leem
// o mesmo histórico e cada escrita apaga as frases gravadas pelas outras.
let filaDeGravacao = Promise.resolve();

function naFilaDeGravacao(tarefa) {
  const resultado = filaDeGravacao.then(tarefa);
  filaDeGravacao = resultado.catch(() => {});
  return resultado;
}

// Id maior que todos os do histórico: frases gravadas no mesmo milissegundo
// (ou logo depois de o service worker reiniciar) nunca repetem id.
function proximoIdDeFrase(historico) {
  const maiorId = historico.reduce((maior, frase) => Math.max(maior, Number(frase.id) || 0), 0);
  return Math.max(Date.now(), maiorId + 1);
}

function marcarPendenteDeSync(id) {
  return naFilaDeGravacao(async () => {
    const { pm_pending_sync } = await chromeGet({ pm_pending_sync: [] });
    await chromeSet({ pm_pending_sync: [...new Set([...pm_pending_sync, String(id)])] });
  });
}

function desmarcarPendenteDeSync(id) {
  return naFilaDeGravacao(async () => {
    const { pm_pending_sync } = await chromeGet({ pm_pending_sync: [] });
    const updated = pm_pending_sync.filter(pendente => pendente !== String(id));
    if (updated.length !== pm_pending_sync.length) await chromeSet({ pm_pending_sync: updated });
  });
}

async function salvarFrase(texto, origem, contexto = null, idioma = 'Inglês', extras = {},
  { comPalavraAutomatica = true, comNuvem = true } = {}) {
  const novaFrase = {
    texto,
    data:      new Date().toLocaleDateString('pt-BR'),
    streaming: origem,
    id:        0,           // definido na fila de gravação
    idioma,
    ...(contexto && { contexto }),
    ...extras,
  };
  const autoKeywords = novaFrase.keywords?.length || !comPalavraAutomatica
    ? (novaFrase.keywords || [])
    : await autoKeywordsForPhrase(novaFrase);
  if (autoKeywords.length > 0 && !novaFrase.keywords?.length) {
    novaFrase.keywords = autoKeywords;
    novaFrase.autoKeyword = true;
  }

  // Grava a frase e o retry na mesma escrita local, antes de tentar a nuvem.
  // Uma falha na nuvem (inclusive na renovação do token) deixa o retry
  // registrado; apenas o upload confirmado o retira.
  await naFilaDeGravacao(async () => {
    const data = await chromeGet({ frases: [], pm_pending_sync: [] });
    novaFrase.id = proximoIdDeFrase(data.frases);
    const pending = new Set([...data.pm_pending_sync, String(novaFrase.id)]);
    await chromeSet({
      frases:          [novaFrase, ...data.frases],
      pm_pending_sync: [...pending],
    });
  });

  // Se o usuário estiver logado, sincroniza com o Firestore em background
  if (comNuvem) sincronizarComFirestore(novaFrase);
  return novaFrase;
}

// A nuvem da conta conectada (a sessão renova o token pelo refresh token do
// Firebase se expirou), ou null sem conta. O REST do Firestore é de lib/sincronizacao.js.
async function nuvemDaConta() {
  const { pm_user_info: perfil } = await chromeGet({ pm_user_info: null });
  if (!perfil) return null;
  const credenciais = await Sincronizacao.lerCredenciais();
  if (!credenciais?.uid || credenciais.uid !== perfil.uid) return null;
  const sessao = PerpetualMiner.Sincronizacao.criarSessao({
    credenciais,
    aoRenovar: Sincronizacao.guardarCredenciais,
  });
  return PerpetualMiner.Sincronizacao.nuvemHttp({ sessao });
}

async function sincronizarComFirestore(frase) {
  try {
    const nuvem = await nuvemDaConta();
    if (!nuvem) return;
    await nuvem.gravarFrase(frase);
    // Sucesso: garante que não está na fila de pending
    desmarcarPendenteDeSync(frase.id);
  } catch (err) {
    console.warn('[Firestore] Sync falhou:', err?.message);
    // Offline ou erro de rede: marca para retry no próximo carregamento do painel
    marcarPendenteDeSync(frase.id);
  }
}

function isEnglishPhrase(frase) {
  const idioma = String(frase?.idioma || '').toLowerCase();
  return idioma.includes('ingl') || idioma === 'en' || (!idioma && detectarIdioma(frase?.texto || '') === IDIOMAS.INGLES);
}

function autoTokenizar(texto) {
  return (String(texto || '').match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[^\p{L}\p{N}]/gu) || []).map(tok => {
    const isWord = /[\p{L}\p{N}]/u.test(tok);
    return { text: tok, isWord, clean: isWord ? autoCleanWord(tok) : null };
  });
}

function autoCleanWord(value) {
  return String(value || '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function autoTermParts(value) {
  return String(value || '').toLowerCase().match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || [];
}

function autoTermKey(parts) {
  return parts.map(autoCleanWord).filter(Boolean).join(' ');
}

async function autoKeywordsForPhrase(frase) {
  try {
    if (!isEnglishPhrase(frase)) return [];
    return await autoKeywordsForEnglishPhrase(frase, {
      limit: AUTO_KEYWORD_MAX_EN_GROUPS,
      requireVocabulary: true,
    });
  } catch {
    return [];
  }
}

async function autoKeywordsForPhraseByLang(frase, lang, options = {}) {
  if (lang === 'ru') return autoKeywordsForRussianPhrase(frase, options);
  return autoKeywordsForEnglishPhrase(frase, options);
}

async function autoKeywordsForEnglishPhrase(frase, options = {}) {
  const tokens = autoTokenizar(frase?.texto || '');
  const words = tokens
    .map((tok, index) => ({ ...tok, index }))
    .filter(tok => tok.isWord && tok.clean);
  if (!words.length) return [];
  const vocab = await getAutoKeywordVocabulary('en');
  if (!vocab.available && options.requireVocabulary) return [];
  const candidates = pickAutoKeywordCandidates(words, vocab, Math.min(options.limit || AUTO_KEYWORD_MAX_EN_GROUPS, AUTO_KEYWORD_MAX_EN_GROUPS));
  return candidatesToKeywords(candidates, tokens);
}

async function autoKeywordsForRussianPhrase(frase, options = {}) {
  const tokens = autoTokenizar(frase?.texto || '');
  const words = tokens
    .map((tok, index) => ({ ...tok, index }))
    .filter(tok => tok.isWord && tok.clean);
  if (!words.length) return [];
  const vocab = await getAutoKeywordVocabulary('ru');
  if (!vocab.available) return [];
  const candidates = russianUnknownWordCandidates(words, vocab);
  candidates.sort((a, b) => b.score - a.score || a.wordIndexes[0] - b.wordIndexes[0]);
  return candidatesToKeywords(candidates.slice(0, options.limit || 1), tokens);
}

function pickAutoKeywordCandidates(words, vocab, limit = 1) {
  const candidates = [
    ...idiomCandidates(words, vocab),
    ...contentExpressionCandidates(words, vocab),
    ...actionObjectCandidates(words, vocab),
    ...patternCandidates(words, vocab),
    ...phrasalVerbCandidates(words, vocab),
    ...unknownWordCandidates(words, vocab),
  ];
  candidates.sort((a, b) => b.score - a.score || a.wordIndexes[0] - b.wordIndexes[0]);
  return dedupeAutoCandidates(candidates.filter(candidate => candidate.score >= AUTO_KEYWORD_MIN_SCORE)).slice(0, limit);
}

function dedupeAutoCandidates(candidates) {
  const used = new Set();
  const out = [];
  for (const candidate of candidates) {
    if (candidate.wordIndexes.some(index => used.has(index))) continue;
    candidate.wordIndexes.forEach(index => used.add(index));
    out.push(candidate);
  }
  return out;
}

function candidatesToKeywords(candidates, tokens) {
  const out = [];
  candidates.forEach((candidate, idx) => {
    if (idx > 0) out.push('|');
    for (const index of candidate.wordIndexes) {
      const clean = tokens[index]?.clean;
      if (clean) out.push(`${clean}@${index}`);
    }
  });
  return out;
}

function idiomCandidates(words, vocab) {
  const out = [];
  for (let start = 0; start < words.length; start++) {
    for (const parts of AUTO_KEYWORD_IDIOMS) {
      if (!autoContainsTerm(words, start, parts)) continue;
      const term = autoTermKey(parts);
      if (vocab.terms.has(term)) continue;
      const score = autoKnownScore(vocab.termInfo.get(term), {
        unknown: 122,
        new: 94,
        recent: 84,
        mixed: 70,
        seen: 60,
        mature: 36,
      });
      out.push({
        score: score + parts.length,
        wordIndexes: words.slice(start, start + parts.length).map(word => word.index),
      });
    }
  }
  return out;
}

function contentExpressionCandidates(words, vocab) {
  const out = [];
  for (let i = 0; i < words.length - 2; i++) {
    const first = words[i];
    const linker = words[i + 1];
    const third = words[i + 2];
    if (!AUTO_CONTENT_LINKERS.has(linker.clean)) continue;
    if (!isAutoKeywordWord(first.clean) || !isAutoKeywordWord(third.clean)) continue;

    const parts = [first.clean, linker.clean, third.clean];
    const term = autoTermKey(parts);
    if (vocab.terms.has(term)) continue;
    if (!autoHasUnknownContentWord([first, third], vocab)) continue;

    const score = autoKnownScore(vocab.termInfo.get(term), {
      unknown: 124,
      new: 96,
      recent: 86,
      mixed: 72,
      seen: 62,
      mature: 38,
    });
    out.push({
      score: score + Math.min(8, first.clean.length + third.clean.length),
      wordIndexes: [first.index, linker.index, third.index],
    });
  }
  return out;
}

function actionObjectCandidates(words, vocab) {
  const out = [];
  for (let i = 0; i < words.length - 1; i++) {
    const action = words[i];
    const object = words[i + 1];
    if (!isAutoActionObjectStart(action.clean)) continue;
    if (!isAutoKeywordWord(object.clean)) continue;

    const parts = [action.clean, object.clean];
    const term = autoTermKey(parts);
    if (vocab.terms.has(term)) continue;
    if (!autoHasUnknownContentWord([action, object], vocab)) continue;

    const score = autoKnownScore(vocab.termInfo.get(term), {
      unknown: 118,
      new: 92,
      recent: 82,
      mixed: 68,
      seen: 58,
      mature: 34,
    });
    out.push({
      score: score + Math.min(8, action.clean.length + object.clean.length),
      wordIndexes: [action.index, object.index],
    });
  }
  return out;
}

function patternCandidates(words, vocab) {
  const out = [];
  for (let start = 0; start < words.length; start++) {
    for (const parts of AUTO_KEYWORD_PATTERNS) {
      if (!autoContainsTerm(words, start, parts)) continue;
      const term = autoTermKey(parts);
      if (vocab.terms.has(term)) continue;
      const score = autoKnownScore(vocab.termInfo.get(term), {
        unknown: 72,
        new: 52,
        recent: 44,
        mixed: 36,
        seen: 30,
        mature: 18,
      });
      out.push({
        score: score + parts.length,
        wordIndexes: words.slice(start, start + parts.length).map(word => word.index),
      });
    }
  }
  return out;
}

function phrasalVerbCandidates(words, vocab) {
  const out = [];
  for (let i = 0; i < words.length - 1; i++) {
    const first = words[i].clean;
    const second = words[i + 1].clean;
    if (AUTO_KEYWORD_STOP_WORDS.has(first)) continue;

    if (AUTO_PHRASAL_PARTICLES.has(second)) {
      const parts = [first, second];
      const maybeThird = words[i + 2]?.clean;
      if (maybeThird && AUTO_PHRASAL_TRAILERS.has(maybeThird)) parts.push(maybeThird);
      const term = autoTermKey(parts);
      if (vocab.terms.has(term)) continue;
      if (!AUTO_STRONG_PHRASAL_ROOTS.has(first) && !autoHasUnknownContentWord([words[i]], vocab)) continue;
      const score = genericPhrasalScore(first, vocab.termInfo.get(term), {
        unknown: 60,
        new: 50,
        recent: 42,
        mixed: 34,
        seen: 28,
        mature: 16,
      });
      out.push({
        score: score + parts.length,
        wordIndexes: words.slice(i, i + parts.length).map(word => word.index),
      });
    }

    if (i + 2 < words.length && AUTO_PHRASAL_PARTICLES.has(words[i + 1].clean) && AUTO_PHRASAL_TRAILERS.has(words[i + 2].clean)) {
      const parts = [first, words[i + 1].clean, words[i + 2].clean];
      const term = autoTermKey(parts);
      if (vocab.terms.has(term)) continue;
      if (!AUTO_STRONG_PHRASAL_ROOTS.has(first) && !autoHasUnknownContentWord([words[i]], vocab)) continue;
      const score = genericPhrasalScore(first, vocab.termInfo.get(term), {
        unknown: 60,
        new: 50,
        recent: 42,
        mixed: 34,
        seen: 28,
        mature: 16,
      });
      out.push({
        score,
        wordIndexes: words.slice(i, i + 3).map(word => word.index),
      });
    }
  }
  return out;
}

function unknownWordCandidates(words, vocab) {
  return words
    .filter(word => isAutoKeywordWord(word.clean) && !vocab.words.has(word.clean))
    .map(word => ({
      score: singleWordScore(word.clean),
      wordIndexes: [word.index],
    }));
}

function russianUnknownWordCandidates(words, vocab) {
  return words
    .filter(word => isAutoKeywordRussianWord(word.clean) && !vocab.words.has(word.clean))
    .map(word => ({
      score: 75 + Math.min(25, word.clean.length),
      wordIndexes: [word.index],
    }));
}

function autoContainsTerm(words, start, parts) {
  if (start + parts.length > words.length) return false;
  return parts.every((part, idx) => words[start + idx].clean === part);
}

function autoHasUnknownContentWord(words, vocab) {
  return words.some(word => isAutoKeywordWord(word.clean) && !vocab.words.has(word.clean));
}

function genericPhrasalScore(first, info, scores) {
  const base = autoKnownScore(info, scores);
  return AUTO_STRONG_PHRASAL_ROOTS.has(first) ? base + 58 : base;
}

function singleWordScore(word) {
  const strong = AUTO_STRONG_SINGLE_WORDS.has(word) ? 55 : 0;
  const length = Math.min(16, word.length);
  const shortAction = word.length <= 3 && AUTO_STRONG_SINGLE_WORDS.has(word) ? 14 : 0;
  return 70 + length + strong + shortAction;
}

function isAutoActionObjectStart(word) {
  return !AUTO_KEYWORD_STOP_WORDS.has(word) && (AUTO_ACTION_OBJECT_WORDS.has(word) || (word.length > 5 && word.endsWith('ing')));
}

function isAutoKeywordWord(word) {
  return Boolean(
    word
    && word.length >= 3
    && /[a-z]/i.test(word)
    && !/\d/.test(word)
    && !AUTO_KEYWORD_STOP_WORDS.has(word)
  );
}

function isAutoKeywordRussianWord(word) {
  return Boolean(
    word
    && word.length >= 2
    && /[\u0400-\u04FF]/.test(word)
    && !/\d/.test(word)
    && !AUTO_KEYWORD_STOP_WORDS_RU.has(word)
  );
}

async function getAutoKeywordVocabulary(lang = 'en') {
  const normalizedLang = lang === 'ru' ? 'ru' : 'en';
  const deckName = await getAutoKeywordDeckName(normalizedLang);
  const cacheKey = VocabularioDaMineracao.chaveDoIdioma(normalizedLang);
  const cached = await chromeGet({ [cacheKey]: null });
  // A última leitura daquele Baralho não tem prazo: com ela em dia, nem pergunta à Conexão;
  // vencida, tenta renovar e, se a Conexão não responde, é ela que continua valendo.
  const ultimaLeitura = VocabularioDaMineracao.doBaralho(cached[cacheKey], deckName);
  if (ultimaLeitura && VocabularioDaMineracao.estaEmDia(ultimaLeitura)) return autoVocabularyFromCache(ultimaLeitura);

  let data = null;
  // O Baralho dos Ajustes de envio e, se ele não responde, o padrão (o mesmo do painel).
  const baralhoPadrao = PerpetualMiner.AjustesDeEnvio.baralhoPadrao(normalizedLang);
  for (const deck of [...new Set([deckName, baralhoPadrao])].filter(Boolean)) {
    try {
      const resp = await PerpetualMiner.PedidoAoAnki.pedir(BRIDGE_URL, PerpetualMiner.PedidoAoAnki.vocabulario(deck, normalizedLang), {
        signal: ultimaLeitura ? AbortSignal.timeout(AUTO_KEYWORD_RENEW_TIMEOUT_MS) : undefined,
      });
      if (!resp.ok) continue;
      data = await resp.json();
      break;
    } catch {
      continue;
    }
  }
  if (!data) return ultimaLeitura ? autoVocabularyFromCache(ultimaLeitura) : autoEmptyVocabulary(false);

  const words = [];
  const terms = [];
  const wordInfo = {};
  const termInfo = {};
  for (const item of data?.words || []) {
    const text = autoTermKey(autoTermParts(item.word || ''));
    if (!text) continue;
    if (item.type === 'term') {
      terms.push(text);
      termInfo[text] = autoVocabularyInfo(item);
    } else {
      words.push(text);
      wordInfo[text] = autoVocabularyInfo(item);
    }
  }

  const createdAt = Date.now();
  const marca = await VocabularioDaMineracao.marcaDaLeitura(ultimaLeitura, data.source, BRIDGE_URL, createdAt);
  const payload = { cacheVersion: VocabularioDaMineracao.VERSAO, deckName, createdAt, ...marca, words, terms, wordInfo, termInfo };
  chrome.storage.local.set({ [cacheKey]: payload });
  return autoVocabularyFromCache(payload);
}

function autoEmptyVocabulary(available = true) {
  return { available, words: new Set(), terms: new Set(), wordInfo: new Map(), termInfo: new Map() };
}

function autoVocabularyFromCache(value) {
  const wordInfo = new Map(Object.entries(value.wordInfo || {}));
  const termInfo = new Map(Object.entries(value.termInfo || {}));
  for (const word of value.words || []) {
    if (!wordInfo.has(word)) wordInfo.set(word, { status: 'seen' });
  }
  for (const term of value.terms || []) {
    if (!termInfo.has(term)) termInfo.set(term, { status: 'seen' });
  }
  return {
    available: true,
    words: new Set(value.words || []),
    terms: new Set(value.terms || []),
    wordInfo,
    termInfo,
  };
}

function autoVocabularyInfo(item) {
  return {
    status: String(item.status || 'seen'),
    cards: Number(item.cards || 0),
    new: Number(item.new || 0),
    recent: Number(item.recent || 0),
    mature: Number(item.mature || 0),
  };
}

function autoKnownScore(info, scores) {
  if (!info) return scores.unknown || 0;
  const status = String(info.status || 'seen');
  if (status === 'mature') return scores.mature || scores.seen || 0;
  if (status === 'recent') return scores.recent || scores.seen || 0;
  if (status === 'new') return scores.new || scores.seen || 0;
  if (status === 'mixed') return scores.mixed || scores.seen || 0;
  return scores.seen || 0;
}

async function handleAutoMinerCandidate(request) {
  const texto = normalizeAutoMinerText(request.texto || '');
  if (!texto) {
    await recordAutoMinerEvent({ action: 'skip', reason: 'empty', texto, lang: normalizeAutoMinerLang(request.lang), contexto: request.contexto || null });
    return { action: 'skip', reason: 'empty' };
  }

  const lang = normalizeAutoMinerLang(request.lang || detectarIdioma(texto));
  const state = await getAutoMinerState();
  const langSettings = state.settings[lang];
  if (!langSettings?.enabled) {
    await recordAutoMinerEvent({ action: 'skip', reason: 'disabled', texto, lang, contexto: request.contexto || null });
    return { action: 'skip', reason: 'disabled', state };
  }
  if (MineracaoDoDia.noLimiteDeHoje(state, lang)) {
    await recordAutoMinerEvent({ action: 'skip', reason: 'daily_limit', texto, lang, contexto: request.contexto || null });
    return { action: 'skip', reason: 'daily_limit', state };
  }

  const evaluation = await evaluateAutoMinerPhrase(texto, lang, request.contexto || null);
  if (!evaluation.accept) {
    await recordAutoMinerEvent({ action: 'skip', reason: evaluation.reason, texto, lang, contexto: request.contexto || null, evaluation });
    return { action: 'skip', reason: evaluation.reason, state, evaluation };
  }

  const data = await chromeGet({ frases: [] });
  const textKey = autoMinerTextKey(texto);
  if ((data.frases || []).some(frase => autoMinerTextKey(frase.texto) === textKey)) {
    await recordAutoMinerEvent({ action: 'skip', reason: 'duplicate', texto, lang, contexto: request.contexto || null, evaluation });
    return { action: 'skip', reason: 'duplicate', state, evaluation };
  }

  const saveExtras = {
    autoMiner: true,
    autoMinerReason: evaluation.reason || 'accepted',
    ...(lang === 'en' ? { keywords: evaluation.keywords, autoKeyword: true } : {}),
  };
  const frase = await salvarFrase(texto, request.origem || 'auto', request.contexto || null, lang === 'ru' ? 'Russo' : 'Inglês', saveExtras);
  const updatedState = await incrementAutoMinerDaily(lang);
  publicarEstadoDaAutomatica(updatedState);
  await recordAutoMinerEvent({ action: 'saved', reason: evaluation.reason || 'accepted', texto, lang, contexto: request.contexto || null, evaluation, phraseId: frase.id });
  return { action: 'saved', frase, evaluation, state: updatedState };
}

async function recordAutoMinerEvent(event) {
  const payload = {
    at: Date.now(),
    action: event.action || 'skip',
    reason: event.reason || '',
    texto: normalizeAutoMinerText(event.texto || ''),
    lang: normalizeAutoMinerLang(event.lang || detectarIdioma(event.texto || '')),
    contexto: event.contexto || null,
    phraseId: event.phraseId || null,
    evaluation: event.evaluation ? {
      accept: Boolean(event.evaluation.accept),
      reason: event.evaluation.reason || '',
      keywords: event.evaluation.keywords || [],
    } : null,
  };
  await chromeSet({ [AUTO_MINER_LAST_EVENT_KEY]: payload });
}

async function evaluateAutoMinerPhrase(texto, lang, contexto = null) {
  if (!isAutoMinerCleanText(texto)) return { accept: false, reason: 'low_quality_text' };
  const frase = { texto, idioma: lang === 'ru' ? 'Russo' : 'Inglês', contexto };
  if (lang === 'ru') {
    const keywords = await autoKeywordsForPhraseByLang(frase, 'ru', { limit: 2 });
    const groups = keywordGroups(keywords);
    if (groups.length !== 1) return { accept: false, reason: groups.length === 0 ? 'no_new_item' : 'not_i_plus_1' };
    return { accept: true, reason: 'ru_i_plus_1', keywords };
  }

  if (normalizeAutoMinerText(texto).length > 240) return { accept: false, reason: 'too_long_en' };
  const keywords = await autoKeywordsForPhraseByLang(frase, 'en', { limit: AUTO_MINER_MAX_EN_KEYWORDS, requireVocabulary: true });
  const groups = keywordGroups(keywords);
  if (groups.length === 0) return { accept: false, reason: 'no_new_item' };
  return { accept: true, reason: groups.length > 1 ? 'en_multi_new_items' : 'en_new_item', keywords };
}

function isAutoMinerCleanText(texto) {
  const clean = normalizeAutoMinerText(texto);
  if (clean.length < 4) return false;
  if (/^[\d\s:.,!?-]+$/.test(clean)) return false;
  if ((clean.match(/[A-Za-z\u0400-\u04FF]/g) || []).length < 2) return false;
  const lower = clean.toLowerCase();
  return ![
    'skip intro', 'skip recap', 'next episode', 'prime video', 'audio', 'subtitles',
    'pular abertura', 'próximo episódio', 'legendas', 'temporada', 'episódio',
  ].some(part => lower === part || lower.includes(part));
}

function keywordGroups(keywords) {
  const groups = [];
  let current = [];
  for (const item of keywords || []) {
    if (item === '|') {
      if (current.length) groups.push(current);
      current = [];
    } else {
      current.push(item);
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

async function getAutoMinerState() {
  const data = await chromeGet({
    [AUTO_MINER_SETTINGS_KEY]: MineracaoDoDia.ajustesPadrao(),
    [AUTO_MINER_DAILY_KEY]: null,
  });
  const settings = MineracaoDoDia.normalizarAjustes(data[AUTO_MINER_SETTINGS_KEY]);
  const daily = MineracaoDoDia.normalizarDiario(data[AUTO_MINER_DAILY_KEY], settings);
  return { settings, daily };
}

async function setAutoMinerSettings(partial) {
  const current = await getAutoMinerState();
  const settings = MineracaoDoDia.normalizarAjustes({
    ...current.settings,
    ...(partial || {}),
    en: { ...current.settings.en, ...(partial.en || {}) },
    ru: { ...current.settings.ru, ...(partial.ru || {}) },
  });
  const daily = MineracaoDoDia.normalizarDiario(current.daily, settings);
  await chromeSet({ [AUTO_MINER_SETTINGS_KEY]: settings, [AUTO_MINER_DAILY_KEY]: daily });
  return { settings, daily };
}

async function incrementAutoMinerDaily(lang) {
  const state = await getAutoMinerState();
  const daily = MineracaoDoDia.normalizarDiario(state.daily, state.settings);
  daily[lang].count += 1;
  await chromeSet({ [AUTO_MINER_DAILY_KEY]: daily });
  return { settings: state.settings, daily };
}

function normalizeAutoMinerLang(value) {
  const lang = String(value || '').toLowerCase();
  return lang.includes('ru') || lang.includes('rus') || lang.includes('рус') ? 'ru' : 'en';
}

function normalizeAutoMinerText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function autoMinerTextKey(value) {
  return normalizeAutoMinerText(value).toLowerCase();
}

// O contador da mineração automática de hoje, somando só os idiomas ligados
// (MIN-09). Sem badge com os dois desligados: um contador parado em 0 diria que
// a mineração automática está funcionando e não minerou nada.
//
// Quem manda no badge é o armazenamento, não quem escreveu nele. Para a
// passagem do tempo, que não gera `storage.onChanged`, veja `agendarViradaDoDia`.

// As cores do badge são as únicas cores escritas fora de `veio/tokens.css`:
// `chrome.action` não lê CSS. São cópias de `--veio-accent` e `--veio-accent-ink`,
// e a exceção está registrada em `veio/README.md`, junto com a do `icone.svg`.
const BADGE_COR_DE_FUNDO = '#F5B83D';
const BADGE_COR_DO_TEXTO = '#1A1204';
const ALARME_VIRADA_DO_DIA = 'pm-virada-do-dia';

/**
 * O badge da mineração automática, ou null quando não há badge nenhum.
 *
 * @param {{settings: object, daily: object}} state
 * @returns {{texto: string, titulo: string} | null}
 */
function badgeDaMineracaoAutomatica(state) {
  const ligados = MineracaoDoDia.idiomasLigados(state);
  if (!ligados.length) return null;

  const total = ligados.reduce((soma, lang) => soma + MineracaoDoDia.contagemDeHoje(state, lang), 0);
  const todosNoLimite = ligados.every(lang => MineracaoDoDia.noLimiteDeHoje(state, lang));

  // O número do badge não passa pelo catálogo: o limite de cada idioma é no
  // máximo 100, então a soma nunca chega aos milhares onde o PT-BR poria ponto —
  // e o badge do Chrome corta em poucos caracteres. O tooltip, esse é do catálogo.
  return {
    texto: String(total),
    titulo: todosNoLimite
      ? textoDaVoz('MIN-09.noLimite')
      : textoDaVoz('MIN-09.contador', { n: total }),
  };
}

/** Põe na toolbar o badge do estado de agora. */
async function atualizarBadgeDaToolbar() {
  if (!chrome.action?.setBadgeText) return;

  const badge = badgeDaMineracaoAutomatica(await getAutoMinerState());

  // Sem badge, o tooltip volta a ser o nome da extensão. Escrito por extenso: um
  // título vazio deixa `getTitle` vazio, e não devolve o padrão do manifesto.
  await chrome.action.setBadgeText({ text: badge ? badge.texto : '' });
  await chrome.action.setTitle({ title: badge ? badge.titulo : chrome.runtime.getManifest().name });
  if (!badge) return;

  // O par de cores anda junto: o texto escuro sobre o ouro é o contraste de
  // 10,4:1 da spec. `minimum_chrome_version` no manifesto garante as duas.
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COR_DE_FUNDO });
  await chrome.action.setBadgeTextColor({ color: BADGE_COR_DO_TEXTO });
}

/**
 * Agenda a virada da mineração automática após a próxima meia-noite local.
 *
 * O alarme dispara uma vez só e é reagendado a cada disparo, em vez de repetir a
 * cada 24 h: um período fixo escorregaria uma hora para sempre na primeira
 * mudança de horário de verão, e o badge de ontem ficaria na toolbar até 1h.
 *
 * A virada não regrava o diário: `getAutoMinerState` o normaliza pelas regras
 * de `MineracaoDoDia`. O listener renova o badge e chama
 * `publicarEstadoDaAutomatica` mesmo sem uma nova frase ou um ajuste gravado.
 * Regressão: `e2e/tests/mineracao-automatica-virada.spec.js`.
 */
async function agendarViradaDoDia() {
  // O alarme sobrevive ao service worker, então recriá-lo a cada despertar à toa
  // só empurraria a próxima meia-noite para longe. Depois de disparar ele some
  // sozinho, e aí esta chamada agenda o da meia-noite seguinte.
  if (await chrome.alarms?.get(ALARME_VIRADA_DO_DIA)) return;

  const proximaMeiaNoite = new Date();
  proximaMeiaNoite.setHours(24, 0, 5, 0);
  await chrome.alarms?.create(ALARME_VIRADA_DO_DIA, { when: proximaMeiaNoite.getTime() });
}

// Os `?.` daqui para baixo são pelos testes Node de `test_auto_keyword.js`, que
// rodam este arquivo com um `chrome` mínimo, sem `alarms` nem `onChanged`.
chrome.alarms?.onAlarm.addListener(alarme => {
  if (alarme.name !== ALARME_VIRADA_DO_DIA) return;
  agendarViradaDoDia();
  atualizarBadgeDaToolbar();
  getAutoMinerState().then(publicarEstadoDaAutomatica);
});

// Na partida do Chrome o badge não volta sozinho, e nada garante que outro
// evento acorde o service worker logo. Escutar a partida é o que o acorda; o
// trabalho é o do fim do arquivo, que roda a cada despertar.
chrome.runtime.onStartup?.addListener(() => {});

chrome.storage.onChanged?.addListener((changes, area) => {
  if (area !== 'local') return;
  if (AUTO_MINER_SETTINGS_KEY in changes || AUTO_MINER_DAILY_KEY in changes) atualizarBadgeDaToolbar();
});

// O service worker acorda e dorme o tempo todo — inclusive na partida do Chrome,
// que é quando este arquivo roda de novo. Ao acordar, o badge que está na toolbar
// pode ser o de ontem.
agendarViradaDoDia();
atualizarBadgeDaToolbar();

/**
 * Centraliza a publicação espontânea do estado pelos canais de `MineracaoDoDia`.
 * As respostas aos pedidos de leitura e de ajuste continuam diretas ao solicitante.
 *
 * Depois de confirmar a gravação do contador, publicar antes do diagnóstico:
 * uma falha ao gravar o último evento não pode reter o estado já confirmado.
 * Regressão: `e2e/tests/mineracao-automatica-publicacao.spec.js`.
 */
function publicarEstadoDaAutomatica(state) {
  chrome.storage.local.set({ [MineracaoDoDia.CHAVES.estadoPublicado]: { settings: state.settings, daily: state.daily, updatedAt: Date.now() } });
  chrome.tabs?.query?.({}, tabs => {
    for (const tab of tabs || []) {
      if (!tab.id) continue;
      try {
        chrome.tabs.sendMessage(tab.id, { type: MineracaoDoDia.MENSAGEM_ESTADO_MUDOU, state }, () => {
          void chrome.runtime.lastError;
        });
      } catch {
        // Aba sem content script ou indisponivel.
      }
    }
  });
}

async function getAutoKeywordDeckName(lang = 'en') {
  const normalizedLang = lang === 'ru' ? 'ru' : 'en';
  return (await PerpetualMiner.AjustesDeEnvio.ler())[normalizedLang].deckName;
}

/** Wrapper de chrome.storage.local.get que retorna Promise */
function chromeGet(defaults) {
  return new Promise(resolve => chrome.storage.local.get(defaults, resolve));
}

// Uma gravação recusada (cota, armazenamento indisponível) rejeita: quem espera
// por ela — o overlay, pela resposta de SALVAR_HISTORICO — precisa saber.
function chromeSet(values) {
  return new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
    const erro = chrome.runtime.lastError;
    if (erro) reject(new Error(erro.message));
    else resolve();
  }));
}
