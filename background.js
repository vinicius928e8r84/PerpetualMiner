'use strict';

importScripts('lib/voz/catalogo.js', 'lib/voz/catalogo-configuracoes.js', 'lib/voz/catalogo-anki.js', 'lib/voz/catalogo-boas-vindas.js', 'lib/voz/catalogo-envio.js', 'lib/voz/texto.js', 'lib/idioma.js', 'lib/mineracao.js', 'lib/ajustes-de-envio.js', 'lib/mineracao-do-dia.js', 'lib/vocabulario-da-mineracao.js', 'lib/palavras-frequentes-en.js', 'lib/palavras-frequentes-ru.js', 'lib/palavras-frequentes.js', 'lib/palavras-gramaticais.js', 'lib/palavra-em-duvida.js', 'lib/palavra-automatica.js', 'lib/mineracao-automatica-decisao.js', 'lib/pedido-ao-anki.js', 'lib/termos-da-linha.js', 'lib/pareamento.js', 'lib/envio-gravado.js', 'lib/apagar-frases-pendente.js', 'lib/historico.js', 'lib/nuvem-do-firestore.js', 'lib/sincronizacao.js');
const { textoDaVoz, detectarIdioma, idiomaDe, IDIOMAS, MineracaoDoDia, Mineracao, MineracaoAutomatica, VocabularioDaMineracao, PalavraAutomatica, AjustesDeEnvio, TermosDaLinha, ConversaComOAnki, Sincronizacao } = PerpetualMiner;

if (chrome.storage.local.setAccessLevel) {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
    .then(() => Sincronizacao.lerCredenciais())
    .then(() => chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }))
    .catch(() => console.warn('[Auth] session migration failed'));
}

importScripts('lib/arquivos-da-extensao.js', 'lib/auto-recarregar.js');
PerpetualMiner.AutoRecarregar.iniciar();

const MINERACAO_AUTOMATICA_SETTINGS_KEY = MineracaoDoDia.CHAVES.ajustes;
const MINERACAO_AUTOMATICA_DAILY_KEY = MineracaoDoDia.CHAVES.diario;
const MINERACAO_AUTOMATICA_LAST_EVENT_KEY = MineracaoDoDia.CHAVES.ultimoEvento;
const MENU_MINERAR_SELECAO = 'minerar-perpetualminer';

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

async function aoInstalar(evento) {
  registrarMenuDeContexto();
  await chrome.storage.local.remove('pm_pending_sync').catch(() => {});
  if (evento?.reason === 'install') {
    await chrome.storage.local.set({ pm_boas_vindas: { agoraNao: [], concluida: false } }).catch(() => {});
    chrome.tabs.create({ url: chrome.runtime.getURL('painel/painel.html#boas-vindas') });
  }
  await historico.esquecerExportadas().catch(err => console.warn('[Histórico] tirar a marca Exportada falhou', err));
}

chrome.contextMenus.onClicked.addListener(minerarSelecaoDoMenu);

function minerarSelecaoDoMenu(info, tab) {
  if (info.menuItemId !== MENU_MINERAR_SELECAO) return;

  const selecao = info.selectionText?.trim();
  if (!selecao) return;

  const contexto = Mineracao.contextoDaSelecao({ url: info.pageUrl || tab?.url, titulo: tab?.title });

  salvarComPalavraAutomatica({ texto: selecao, origem: contexto.fonte, contexto, idioma: detectarIdioma(selecao) });
}

function veioDeUmaAbaDestaExtensao(remetente) {
  return remetente.id === chrome.runtime.id && remetente.tab?.id != null;
}

function copiarNoFrameDeCima(request, remetente, responder) {
  const texto = request.texto;
  if (typeof texto !== 'string' || !texto.trim()) return;
  chrome.tabs.sendMessage(remetente.tab.id, { type: 'COPIAR_PARA_CLIPBOARD', texto }, { frameId: 0 })
    .then(resposta => responder({ ok: resposta?.ok === true }))
    .catch(() => responder({ ok: false }));
  return true;
}

function haVideoEmOutroFrame(request, remetente, responder) {
  chrome.tabs.sendMessage(remetente.tab.id, { type: 'TEM_VIDEO_NESTE_FRAME' })
    .then(resposta => responder({ temVideo: resposta?.temVideo === true }))
    .catch(() => responder({ temVideo: false }));
  return true;
}

const palavrasEscolhidas = request => (Array.isArray(request.palavras) ? request.palavras.map(String) : null);

const extrasDasPalavras = palavras => (palavras?.length ? { keywords: palavras, autoKeyword: false } : {});

const capturaDoPedido = (request, palavras) => ({
  texto: request.texto,
  origem: request.origem,
  contexto: request.contexto || null,
  idioma: request.idioma || IDIOMAS.INGLES,
  extras: extrasDasPalavras(palavras),
});

function minerarDoPedido(request, remetente, responder) {
  const palavras = palavrasEscolhidas(request);
  const salvar = palavras ? minerar : salvarComPalavraAutomatica;
  salvar(capturaDoPedido(request, palavras), { comNuvem: !request.semNuvem })
    .then(frase => responder({ ok: true, frase }))
    .catch(err => responder({ ok: false, error: err?.message || 'save_failed' }));
  return true;
}

function responderEstadoDaMineracaoAutomatica(request, remetente, responder) {
  getMineracaoAutomaticaState()
    .then(state => responder({ ok: true, state }))
    .catch(err => responder({ ok: false, error: err?.message || 'auto_miner_state_failed' }));
  return true;
}

function guardarAjustesDaMineracaoAutomatica(request, remetente, responder) {
  setMineracaoAutomaticaSettings(request.settings || {})
    .then(state => {
      publicarEstadoDaAutomatica(state);
      responder({ ok: true, state });
    })
    .catch(err => responder({ ok: false, error: err?.message || 'auto_miner_settings_failed' }));
  return true;
}

function atenderCandidataDaMineracaoAutomatica(request, remetente, responder) {
  handleMineracaoAutomaticaCandidate(request)
    .then(result => responder({ ok: true, ...result }))
    .catch(err => responder({ ok: false, action: 'skip', reason: err?.message || 'auto_miner_failed' }));
  return true;
}

const ATENDENTES_DE_MENSAGEM = Object.freeze({
  COPIAR_NO_FRAME_DE_CIMA: { soDeUmaAba: true, atender: copiarNoFrameDeCima },
  HA_VIDEO_EM_OUTRO_FRAME: { soDeUmaAba: true, atender: haVideoEmOutroFrame },
  MINERAR: { atender: minerarDoPedido },
  MINERACAO_AUTOMATICA_GET_STATE: { atender: responderEstadoDaMineracaoAutomatica },
  MINERACAO_AUTOMATICA_SET_SETTINGS: { atender: guardarAjustesDaMineracaoAutomatica },
  MINERACAO_AUTOMATICA_CANDIDATE: { atender: atenderCandidataDaMineracaoAutomatica },
});

function aoReceberMensagem(request, remetente, responder) {
  const atendente = Object.hasOwn(ATENDENTES_DE_MENSAGEM, request.type) ? ATENDENTES_DE_MENSAGEM[request.type] : null;
  if (!atendente) return;
  if (atendente.soDeUmaAba && !veioDeUmaAbaDestaExtensao(remetente)) return;
  return atendente.atender(request, remetente, responder);
}

chrome.runtime.onMessage.addListener(aoReceberMensagem);

const historico = PerpetualMiner.Historico.criar({ armazenamento: { get: chromeGet, set: chromeSet } });

const novaFraseDaCaptura = ({ texto, origem, contexto, idioma, extras }) => ({
  texto,
  data:      new Date().toLocaleDateString('pt-BR'),
  streaming: origem,
  id:        0,
  idioma,
  ...(contexto && { contexto }),
  ...extras,
});

async function comPalavraAutomatica(captura) {
  const palavras = await autoKeywordsForPhrase(captura);
  if (!palavras.length) return captura;
  return { ...captura, extras: { ...captura.extras, keywords: palavras, autoKeyword: true } };
}

async function minerar(captura, { comNuvem = true, soSe = null } = {}) {
  const novaFrase = novaFraseDaCaptura(captura);
  const gravada = await (soSe ? historico.acrescentarSe(novaFrase, soSe) : historico.acrescentar(novaFrase));
  if (!gravada) return null;

  if (comNuvem) sincronizarComFirestore(gravada);
  return gravada;
}

async function salvarComPalavraAutomatica(captura, opcoes) {
  return minerar(await comPalavraAutomatica(captura), opcoes);
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

function getAutoKeywordVocabulary(lang = 'en') {
  return VocabularioDaMineracao.vocabulario(lang);
}

function autoVocabularyFromCache(value) {
  return VocabularioDaMineracao.vocabularioDaLeitura(value);
}

const termosDaLinha = TermosDaLinha.criar({ conversa: ConversaComOAnki });

const mineracaoAutomatica = MineracaoAutomatica.criar({
  vocabulario: lang => getAutoKeywordVocabulary(lang),
  nivel: async lang => (await AjustesDeEnvio.ler())[lang].nivel,
  termos: (lang, texto) => termosDaLinha.perguntar(lang, texto),
  historico: {
    salvarSeNova: (captura, jaTem) => minerar(captura, { soSe: jaTem }),
  },
  ajustes: {
    ler: () => getMineracaoAutomaticaState(),
    contarMais: lang => incrementMineracaoAutomaticaDaily(lang),
    publicar: state => publicarEstadoDaAutomatica(state),
    registrar: evento => chromeSet({ [MINERACAO_AUTOMATICA_LAST_EVENT_KEY]: evento }),
  },
  relogio: { agora: () => Date.now() },
});

function handleMineracaoAutomaticaCandidate(request) {
  return mineracaoAutomatica.candidata(request);
}

function evaluateMineracaoAutomaticaPhrase(texto, lang) {
  return mineracaoAutomatica.avaliar(texto, lang);
}

async function getMineracaoAutomaticaState() {
  const data = await chromeGet({
    [MINERACAO_AUTOMATICA_SETTINGS_KEY]: MineracaoDoDia.ajustesPadrao(),
    [MINERACAO_AUTOMATICA_DAILY_KEY]: null,
  });
  const settings = MineracaoDoDia.normalizarAjustes(data[MINERACAO_AUTOMATICA_SETTINGS_KEY]);
  const daily = MineracaoDoDia.normalizarDiario(data[MINERACAO_AUTOMATICA_DAILY_KEY], settings);
  return { settings, daily };
}

async function setMineracaoAutomaticaSettings(partial) {
  const current = await getMineracaoAutomaticaState();
  const settings = MineracaoDoDia.normalizarAjustes({
    ...current.settings,
    ...(partial || {}),
    en: { ...current.settings.en, ...(partial.en || {}) },
    ru: { ...current.settings.ru, ...(partial.ru || {}) },
  });
  const daily = MineracaoDoDia.normalizarDiario(current.daily, settings);
  await chromeSet({ [MINERACAO_AUTOMATICA_SETTINGS_KEY]: settings, [MINERACAO_AUTOMATICA_DAILY_KEY]: daily });
  return { settings, daily };
}

async function incrementMineracaoAutomaticaDaily(lang) {
  const state = await getMineracaoAutomaticaState();
  const daily = MineracaoDoDia.normalizarDiario(state.daily, state.settings);
  daily[lang].count += 1;
  await chromeSet({ [MINERACAO_AUTOMATICA_DAILY_KEY]: daily });
  return { settings: state.settings, daily };
}

const BADGE_COR_DE_FUNDO = '#F5B83D';
const BADGE_COR_DO_TEXTO = '#1A1204';
const ALARME_VIRADA_DO_DIA = 'pm-virada-do-dia';

function badgeDaMineracaoAutomatica(state) {
  const ligados = MineracaoDoDia.idiomasLigados(state);
  if (!ligados.length) return null;

  const total = ligados.reduce((soma, lang) => soma + MineracaoDoDia.contagemDeHoje(state, lang), 0);
  const todosNoLimite = ligados.every(lang => MineracaoDoDia.noLimiteDeHoje(state, lang));

  return {
    texto: String(total),
    titulo: todosNoLimite
      ? textoDaVoz('MIN-09.noLimite')
      : textoDaVoz('MIN-09.contador', { n: total }),
  };
}

async function atualizarBadgeDaToolbar() {
  const badge = badgeDaMineracaoAutomatica(await getMineracaoAutomaticaState());

  await chrome.action.setBadgeText({ text: badge ? badge.texto : '' });
  await chrome.action.setTitle({ title: badge ? badge.titulo : chrome.runtime.getManifest().name });
  if (!badge) return;

  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COR_DE_FUNDO });
  await chrome.action.setBadgeTextColor({ color: BADGE_COR_DO_TEXTO });
}

async function agendarViradaDoDia() {
  if (await chrome.alarms.get(ALARME_VIRADA_DO_DIA)) return;

  const proximaMeiaNoite = new Date();
  proximaMeiaNoite.setHours(24, 0, 5, 0);
  await chrome.alarms.create(ALARME_VIRADA_DO_DIA, { when: proximaMeiaNoite.getTime() });
}

chrome.alarms.onAlarm.addListener(alarme => {
  if (alarme.name !== ALARME_VIRADA_DO_DIA) return;
  agendarViradaDoDia();
  atualizarBadgeDaToolbar();
  getMineracaoAutomaticaState().then(publicarEstadoDaAutomatica);
});

chrome.runtime.onStartup.addListener(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (MINERACAO_AUTOMATICA_SETTINGS_KEY in changes || MINERACAO_AUTOMATICA_DAILY_KEY in changes) atualizarBadgeDaToolbar();
});

agendarViradaDoDia();
atualizarBadgeDaToolbar();
PerpetualMiner.ApagarFrasesPendente.ligar({ chrome });

function publicarEstadoDaAutomatica(state) {
  chrome.storage.local.set({ [MineracaoDoDia.CHAVES.estadoPublicado]: { settings: state.settings, daily: state.daily, updatedAt: Date.now() } });
  chrome.tabs.query({}, tabs => {
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
