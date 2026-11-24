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

  const nomeDoTipoProprio = cru => (typeof cru?.nome === 'string' ? cru.nome.trim() : '');
  const parteDoTipoProprioValida = (mapa, parte) => PARTES_DO_TIPO_PROPRIO.includes(parte) && typeof mapa[parte] === 'string' && Boolean(mapa[parte]);

  function mapaDoTipoProprioValido(mapa) {
    if (!mapa || typeof mapa !== 'object') return false;
    const partes = Object.keys(mapa);
    return partes.length > 0 && partes.every(parte => parteDoTipoProprioValida(mapa, parte));
  }

  function tipoProprioValido(cru) {
    const nome = nomeDoTipoProprio(cru);
    const mapa = cru?.mapa;
    if (!nome || !mapaDoTipoProprioValido(mapa)) return null;
    return Object.freeze({ nome, mapa: Object.freeze(Object.fromEntries(PARTES_DO_TIPO_PROPRIO.filter(parte => parte in mapa).map(parte => [parte, mapa[parte]]))) });
  }

  const COMO_ESTA = valor => valor;

  const ESCOLHAS = Object.freeze({
    imageSource: { aceitos: Object.values(IMAGENS), comoTexto: String },
    ttsReserva: { aceitos: RESERVAS, comoTexto: COMO_ESTA },
    nivel: { aceitos: NIVEIS, comoTexto: COMO_ESTA },
    frente: { aceitos: FRENTES, comoTexto: COMO_ESTA },
  });

  function textosAceitos(cru) {
    const aceitos = {};
    for (const campo of CAMPOS_DE_TEXTO) {
      const valor = String(cru?.[campo] ?? '').trim();
      if (valor) aceitos[campo] = valor;
    }
    return aceitos;
  }

  function escolhasAceitas(cru) {
    const aceitas = {};
    for (const [campo, { aceitos, comoTexto }] of Object.entries(ESCOLHAS)) {
      const valor = comoTexto(cru?.[campo]);
      if (aceitos.includes(valor)) aceitas[campo] = valor;
    }
    return aceitas;
  }

  function normalizarIdioma(lang, cru) {
    const versao = Number.isInteger(cru?.versao) ? cru.versao : 0;
    const tipoProprio = tipoProprioValido(cru?.tipoProprio);
    return { ...PADRAO[lang], versao, ...textosAceitos(cru), ...escolhasAceitas(cru), ...(tipoProprio && { tipoProprio }) };
  }

  function normalizar(cru) {
    return Object.fromEntries(IDIOMAS_DO_ENVIO.map(lang => [lang, normalizarIdioma(lang, cru?.[lang])]));
  }

  let atuais = normalizar(null);

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
    IDIOMAS_DO_ENVIO,
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
