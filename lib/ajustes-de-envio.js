'use strict';

(function (raiz) {
  const CHAVE = 'ankiBridgePresets';
  const IDIOMAS_DO_ENVIO = Object.freeze(['en', 'ru']);

  const IMAGENS = Object.freeze({ FOTO_REAL: '1', GERADA_POR_IA: '2' });

  const RESERVAS = Object.freeze(['openai', 'nenhuma']);

  const SOTAQUES = {
    en: [
      ['com', 'BRG-07.sotaqueEstadosUnidos'],
      ['co.uk', 'BRG-07.sotaqueReinoUnido'],
      ['com.au', 'BRG-07.sotaqueAustralia'],
      ['co.in', 'BRG-07.sotaqueIndia'],
      ['ca', 'BRG-07.sotaqueCanada'],
      ['ie', 'BRG-07.sotaqueIrlanda'],
      ['co.za', 'BRG-07.sotaqueAfricaDoSul'],
    ],
    ru: [['ru', 'BRG-07.sotaqueRussia']],
  };

  const NIVEIS = Object.freeze(['iniciante', 'intermediario', 'avancado']);

  const FRENTES_POR_NIVEL = Object.freeze({ producao: Object.freeze(['iniciante']) });
  const frenteDisponivel = (frente, nivel) => !FRENTES_POR_NIVEL[frente] || FRENTES_POR_NIVEL[frente].includes(nivel);
  const FRENTES = Object.freeze(['frase_com_audio', 'ouvir_primeiro', 'lacuna', 'producao', 'ditado', 'criacao']);

  const PARTES_DO_TIPO_PROPRIO = Object.freeze(['frase', 'audio_da_frase', 'resposta', 'palavra', 'audio_da_palavra', 'imagem']);
  const PARTES_OBRIGATORIAS = Object.freeze(['frase', 'resposta']);

  const PADRAO = Object.freeze({
    en: Object.freeze({ deckName: 'PerpetualMiner::Inglês', imageSource: IMAGENS.FOTO_REAL, ttsWordTld: 'com', ttsPhraseTld: 'co.uk', ttsReserva: RESERVAS[0], nivel: NIVEIS[0], frente: FRENTES[0] }),
    ru: Object.freeze({ deckName: 'PerpetualMiner::Russo', imageSource: IMAGENS.FOTO_REAL, ttsWordTld: 'ru', ttsPhraseTld: 'ru', ttsReserva: RESERVAS[0], nivel: NIVEIS[0], frente: FRENTES[0] }),
  });

  const CAMPOS_DE_TEXTO = ['deckName', 'ttsWordTld', 'ttsPhraseTld'];

  let atuais = normalizar(null);

  function lerGravado() {
    return new Promise((resolve, reject) => chrome.storage.local.get({ [CHAVE]: null }, dados => {
      const erro = chrome.runtime?.lastError;
      if (erro) reject(new Error(erro.message));
      else if (!dados) reject(new Error('storage_read_failed'));
      else resolve(dados[CHAVE]);
    }));
  }

  function gravar(valor) {
    return new Promise((resolve, reject) => chrome.storage.local.set({ [CHAVE]: valor }, () => {
      const erro = chrome.runtime?.lastError;
      if (erro) reject(new Error(erro.message));
      else resolve();
    }));
  }

  function tipoProprioValido(cru) {
    const nome = typeof cru?.nome === 'string' ? cru.nome.trim() : '';
    const mapa = cru?.mapa;
    if (!nome || !mapa || typeof mapa !== 'object') return null;
    const partes = Object.keys(mapa);
    if (!partes.length || partes.some(parte => !PARTES_DO_TIPO_PROPRIO.includes(parte) || typeof mapa[parte] !== 'string' || !mapa[parte])) return null;
    return Object.freeze({ nome, mapa: Object.freeze(Object.fromEntries(PARTES_DO_TIPO_PROPRIO.filter(parte => parte in mapa).map(parte => [parte, mapa[parte]]))) });
  }

  function normalizarIdioma(lang, cru) {
    const padrao = PADRAO[lang];
    const idioma = { ...padrao, versao: Number.isInteger(cru?.versao) ? cru.versao : 0 };
    for (const campo of CAMPOS_DE_TEXTO) {
      const valor = String(cru?.[campo] ?? '').trim();
      if (valor) idioma[campo] = valor;
    }
    if (Object.values(IMAGENS).includes(String(cru?.imageSource))) idioma.imageSource = String(cru.imageSource);
    if (RESERVAS.includes(cru?.ttsReserva)) idioma.ttsReserva = cru.ttsReserva;
    if (NIVEIS.includes(cru?.nivel)) idioma.nivel = cru.nivel;
    if (FRENTES.includes(cru?.frente)) idioma.frente = cru.frente;
    const tipoProprio = tipoProprioValido(cru?.tipoProprio);
    if (tipoProprio) idioma.tipoProprio = tipoProprio;
    return idioma;
  }

  function normalizar(cru) {
    return Object.fromEntries(IDIOMAS_DO_ENVIO.map(lang => [lang, normalizarIdioma(lang, cru?.[lang])]));
  }

  async function ler() {
    atuais = normalizar(await lerGravado());
    return atuais;
  }

  function atual() {
    return atuais;
  }

  async function salvar(lang, campos, versaoLida) {
    if (!IDIOMAS_DO_ENVIO.includes(lang)) throw new Error(`Idioma fora dos Ajustes de envio: ${lang}`);
    const ajustes = normalizar(await lerGravado());
    if (ajustes[lang].versao !== versaoLida) {
      atuais = ajustes;
      return { ok: false, motivo: 'desatualizada', ajustes };
    }
    const novo = normalizarIdioma(lang, { ...campos, versao: versaoLida + 1 });
    const novos = { ...ajustes, [lang]: novo };
    await gravar(novos);
    atuais = novos;
    return { ok: true, ajustes: novos };
  }

  function acompanhar(ouvinte) {
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local' || !(CHAVE in mudancas)) return;
      atuais = normalizar(mudancas[CHAVE].newValue);
      ouvinte(atuais);
    });
    return ler().then(ajustes => { ouvinte(ajustes); return ajustes; });
  }

  function ttsDoEnvio(ajustes) {
    const tts = { wordTld: ajustes.ttsWordTld, phraseTld: ajustes.ttsPhraseTld };
    if (ajustes.ttsReserva !== RESERVAS[0]) tts.reserva = ajustes.ttsReserva === 'nenhuma' ? [] : [ajustes.ttsReserva];
    return tts;
  }

  function vozENivel(ajustes) {
    return { tts: ttsDoEnvio(ajustes), ...(ajustes.nivel !== NIVEIS[0] && { nivel: ajustes.nivel }), ...(ajustes.tipoProprio && { tipoProprio: ajustes.tipoProprio }) };
  }

  function baralhoPadrao(lang) {
    return PADRAO[lang]?.deckName || '';
  }

  /** O nome do baralho sem o `::` do Anki: os níveis ficam separados por ›. */
  function nomeDoBaralho(nome) {
    return String(nome || '').split('::').map(parte => parte.trim()).filter(Boolean).join(' › ');
  }

  raiz.AjustesDeEnvio = Object.freeze({
    CHAVE,
    CODIGOS_DO_BRIDGE: IDIOMAS_DO_ENVIO,
    IMAGENS,
    RESERVAS,
    SOTAQUES,
    NIVEIS,
    FRENTES,
    frenteDisponivel,
    PADRAO,
    PARTES_DO_TIPO_PROPRIO,
    PARTES_OBRIGATORIAS,
    normalizar,
    ler,
    atual,
    salvar,
    ttsDoEnvio,
    vozENivel,
    acompanhar,
    baralhoPadrao,
    nomeDoBaralho,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
