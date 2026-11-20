'use strict';

importScripts('lib/voz/catalogo.js', 'lib/voz/texto.js', 'lib/idioma.js', 'lib/mineracao.js', 'lib/ajustes-de-envio.js', 'lib/mineracao-do-dia.js', 'lib/vocabulario-da-mineracao.js', 'lib/palavra-automatica.js', 'lib/mineracao-automatica-decisao.js', 'lib/pedido-ao-anki.js', 'lib/pareamento.js', 'lib/envio-gravado.js', 'lib/apagar-frases-pendente.js', 'lib/sincronizacao.js', 'lib/historico.js');
const { textoDaVoz, detectarIdioma, idiomaDe, IDIOMAS, MineracaoDoDia, Mineracao, MineracaoAutomatica, VocabularioDaMineracao, PalavraAutomatica, Sincronizacao } = PerpetualMiner;

if (chrome.storage.local.setAccessLevel) {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
    .then(() => Sincronizacao.lerCredenciais())
    .then(() => chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }))
    .catch(() => console.warn('[Auth] session migration failed'));
}

importScripts('lib/arquivos-da-extensao.js', 'lib/auto-recarregar.js');
PerpetualMiner.AutoRecarregar.iniciar();

const AUTO_MINER_SETTINGS_KEY = MineracaoDoDia.CHAVES.ajustes;
const AUTO_MINER_DAILY_KEY = MineracaoDoDia.CHAVES.diario;
const AUTO_MINER_LAST_EVENT_KEY = MineracaoDoDia.CHAVES.ultimoEvento;
const AUTO_KEYWORD_RENEW_TIMEOUT_MS = 8000;
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

async function aoInstalar(detalhes) {
  registrarMenuDeContexto();
  await chrome.storage.local.remove('pm_pending_sync').catch(() => {});
  if (detalhes?.reason === 'install') {
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

  if (request.type === 'HA_VIDEO_EM_OUTRO_FRAME') {
    if (sender.id !== chrome.runtime.id || sender.tab?.id == null) return;
    chrome.tabs.sendMessage(sender.tab.id, { type: 'TEM_VIDEO_NESTE_FRAME' })
      .then(resposta => sendResponse({ temVideo: resposta?.temVideo === true }))
      .catch(() => sendResponse({ temVideo: false }));
    return true;
  }

  if (request.type === 'SALVAR_HISTORICO') {
    const palavras = Array.isArray(request.palavras) ? request.palavras.map(String) : null;
    salvarFrase(
      request.texto,
      request.origem,
      request.contexto  || null,
      request.idioma    || IDIOMAS.INGLES,
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

const historico = PerpetualMiner.Historico.criar({ armazenamento: { get: chromeGet, set: chromeSet } });

async function salvarFrase(texto, origem, contexto = null, idioma = IDIOMAS.INGLES, extras = {},
  { comPalavraAutomatica = true, comNuvem = true, soSe = null } = {}) {
  const novaFrase = {
    texto,
    data:      new Date().toLocaleDateString('pt-BR'),
    streaming: origem,
    id:        0,
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

  const gravada = await (soSe ? historico.acrescentarSe(novaFrase, soSe) : historico.acrescentar(novaFrase));
  if (!gravada) return null;

  if (comNuvem) sincronizarComFirestore(gravada);
  return gravada;
}

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
  } catch (err) {
    console.warn('[Firestore] Sync falhou:', err?.message);
  }
}

function isEnglishPhrase(frase) {
  const idioma = String(frase?.idioma || '').toLowerCase();
  return idioma.includes('ingl') || idioma === 'en' || (!idioma && detectarIdioma(frase?.texto || '') === IDIOMAS.INGLES);
}

async function autoKeywordsForPhrase(frase) {
  try {
    if (!isEnglishPhrase(frase)) return [];
    return await autoKeywordsForPhraseByLang(frase, 'en', {
      limit: PalavraAutomatica.MAXIMO_DE_GRUPOS_EN,
      requireVocabulary: true,
    });
  } catch {
    return [];
  }
}

async function autoKeywordsForPhraseByLang(frase, lang, options = {}) {
  return PalavraAutomatica.escolherCom(frase?.texto || '', lang, () => getAutoKeywordVocabulary(lang === 'ru' ? 'ru' : 'en'), options);
}

async function getAutoKeywordVocabulary(lang = 'en') {
  const normalizedLang = lang === 'ru' ? 'ru' : 'en';
  const deckName = await getAutoKeywordDeckName(normalizedLang);
  const cacheKey = VocabularioDaMineracao.chaveDoIdioma(normalizedLang);
  const cached = await chromeGet({ [cacheKey]: null });
  const ultimaLeitura = VocabularioDaMineracao.doBaralho(cached[cacheKey], deckName);
  if (ultimaLeitura && VocabularioDaMineracao.estaEmDia(ultimaLeitura)) return autoVocabularyFromCache(ultimaLeitura);

  const desfecho = await PerpetualMiner.ConversaComOAnki.pedir(PerpetualMiner.PedidoAoAnki.vocabulario(deckName, normalizedLang),
    ultimaLeitura ? { prazoMs: AUTO_KEYWORD_RENEW_TIMEOUT_MS } : {});
  const data = desfecho.ok ? desfecho.dados : null;
  if (!data) return ultimaLeitura ? autoVocabularyFromCache(ultimaLeitura) : autoEmptyVocabulary(false);

  const words = [];
  const terms = [];
  const wordInfo = {};
  const termInfo = {};
  for (const item of data?.words || []) {
    const text = PalavraAutomatica.chaveDoTermo(item.word || '');
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
  const payload = { cacheVersion: VocabularioDaMineracao.VERSAO, deckName, createdAt, words, terms, wordInfo, termInfo };
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

const mineracaoAutomatica = MineracaoAutomatica.criar({
  vocabulario: lang => getAutoKeywordVocabulary(lang),
  historico: {
    salvarSeNova: ({ texto, origem, contexto, idioma, extras }, jaTem) => salvarFrase(texto, origem, contexto, idioma, extras, { soSe: jaTem }),
  },
  ajustes: {
    ler: () => getAutoMinerState(),
    contarMais: lang => incrementAutoMinerDaily(lang),
    publicar: state => publicarEstadoDaAutomatica(state),
    registrar: evento => chromeSet({ [AUTO_MINER_LAST_EVENT_KEY]: evento }),
  },
  relogio: { agora: () => Date.now() },
});

function handleAutoMinerCandidate(request) {
  return mineracaoAutomatica.candidata(request);
}

function evaluateAutoMinerPhrase(texto, lang) {
  return mineracaoAutomatica.avaliar(texto, lang);
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

// As cores do badge são as únicas cores escritas fora de `veio/tokens.css`:
// `chrome.action` não lê CSS. São cópias de `--veio-accent` e `--veio-accent-ink`,
// e a exceção está registrada em `veio/README.md`, junto com a do `icone.svg`.
const BADGE_COR_DE_FUNDO = '#F5B83D';
const BADGE_COR_DO_TEXTO = '#1A1204';
const ALARME_VIRADA_DO_DIA = 'pm-virada-do-dia';

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

// O `chrome` mínimo de `test_auto_keyword.js` não tem `alarms` nem `onChanged`: a API que falta só deixa de agir.
function metodoDoChrome(alvo, nome) {
  if (!alvo || typeof alvo[nome] !== 'function') return null;
  return alvo[nome].bind(alvo);
}

function ouvirChrome(alvo, ouvinte) {
  if (!alvo || typeof alvo.addListener !== 'function') return;
  alvo.addListener(ouvinte);
}

async function atualizarBadgeDaToolbar() {
  if (!metodoDoChrome(chrome.action, 'setBadgeText')) return;

  const badge = badgeDaMineracaoAutomatica(await getAutoMinerState());

  // Sem badge, o tooltip volta a ser o nome da extensão. Escrito por extenso: um
  // título vazio deixa `getTitle` vazio, e não devolve o padrão do manifesto.
  await chrome.action.setBadgeText({ text: badge ? badge.texto : '' });
  await chrome.action.setTitle({ title: badge ? badge.titulo : chrome.runtime.getManifest().name });
  if (!badge) return;

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
  // O alarme sobrevive ao service worker: recriá-lo a cada despertar empurraria a meia-noite. Depois de disparar ele some,
  // e esta chamada agenda o da seguinte.
  const lerAlarme = metodoDoChrome(chrome.alarms, 'get');
  const criarAlarme = metodoDoChrome(chrome.alarms, 'create');
  if (!lerAlarme || !criarAlarme) return;
  if (await lerAlarme(ALARME_VIRADA_DO_DIA)) return;

  const proximaMeiaNoite = new Date();
  proximaMeiaNoite.setHours(24, 0, 5, 0);
  await criarAlarme(ALARME_VIRADA_DO_DIA, { when: proximaMeiaNoite.getTime() });
}

ouvirChrome(chrome.alarms && chrome.alarms.onAlarm, alarme => {
  if (alarme.name !== ALARME_VIRADA_DO_DIA) return;
  agendarViradaDoDia();
  atualizarBadgeDaToolbar();
  getAutoMinerState().then(publicarEstadoDaAutomatica);
});

// Na partida do Chrome o badge não volta sozinho: escutar a partida acorda o service worker, que faz o trabalho do fim do arquivo.
ouvirChrome(chrome.runtime.onStartup, () => {});

ouvirChrome(chrome.storage.onChanged, (changes, area) => {
  if (area !== 'local') return;
  if (AUTO_MINER_SETTINGS_KEY in changes || AUTO_MINER_DAILY_KEY in changes) atualizarBadgeDaToolbar();
});

agendarViradaDoDia();
atualizarBadgeDaToolbar();
PerpetualMiner.ApagarFrasesPendente.ligar({ chrome, ouvirChrome });

function publicarEstadoDaAutomatica(state) {
  chrome.storage.local.set({ [MineracaoDoDia.CHAVES.estadoPublicado]: { settings: state.settings, daily: state.daily, updatedAt: Date.now() } });
  const listarAbas = metodoDoChrome(chrome.tabs, 'query');
  if (!listarAbas) return;
  listarAbas({}, tabs => {
    for (const tab of tabs || []) {
      if (!tab.id) continue;
      try {
        chrome.tabs.sendMessage(tab.id, { type: MineracaoDoDia.MENSAGEM_ESTADO_MUDOU, state }, () => {
          void chrome.runtime.lastError;
        });
      } catch {}
    }
  });
}

async function getAutoKeywordDeckName(lang = 'en') {
  const normalizedLang = lang === 'ru' ? 'ru' : 'en';
  return (await PerpetualMiner.AjustesDeEnvio.ler())[normalizedLang].deckName;
}

function chromeGet(defaults) {
  return new Promise(resolve => chrome.storage.local.get(defaults, resolve));
}

function chromeSet(values) {
  return new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
    const erro = chrome.runtime.lastError;
    if (erro) reject(new Error(erro.message));
    else resolve();
  }));
}
