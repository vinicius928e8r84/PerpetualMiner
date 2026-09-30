'use strict';

// Os Ajustes de envio num lugar só: o Baralho padrão de cada idioma, a forma
// gravada em `ankiBridgePresets` e o salvar que não sobrescreve o que outra aba
// salvou depois.
//
// Quem lê o baralho (a aba Ajustes de envio, Baralhos e termos, Vocabulário, o
// Envio ao Anki e a Palavra automática do service worker) lê daqui, então o
// Baralho padrão é o mesmo em todo o front. O bridge tem os próprios padrões,
// que ficam fora deste passo.
//
// Cada idioma grava uma `versao`: o formulário lembra a versão que leu, e salvar
// recusa quando a gravada mudou desde então (outra aba salvou no meio). Salvar
// um idioma nunca toca no outro.

(function (raiz) {
  const CHAVE = 'ankiBridgePresets';
  const IDIOMAS_DO_ENVIO = Object.freeze(['en', 'ru']);

  // Os valores de `imageSource` que o bridge entende.
  const IMAGENS = Object.freeze({ FOTO_REAL: '1', GERADA_POR_IA: '2' });

  const PADRAO = Object.freeze({
    en: Object.freeze({ deckName: 'CIMV', imageSource: IMAGENS.FOTO_REAL, ttsWordTld: 'com', ttsPhraseTld: 'co.uk' }),
    ru: Object.freeze({ deckName: 'RUSSIAN', imageSource: IMAGENS.FOTO_REAL, ttsWordTld: 'ru', ttsPhraseTld: 'ru' }),
  });

  const CAMPOS_DE_TEXTO = ['deckName', 'ttsWordTld', 'ttsPhraseTld'];

  let atuais = normalizar(null);

  // A forma com callback: é a que o service worker e os stubs dos testes antigos têm.
  function lerGravado() {
    return new Promise(resolve => chrome.storage.local.get({ [CHAVE]: null }, dados => resolve(dados[CHAVE])));
  }

  function gravar(valor) {
    return new Promise((resolve, reject) => chrome.storage.local.set({ [CHAVE]: valor }, () => {
      const erro = chrome.runtime?.lastError;
      if (erro) reject(new Error(erro.message));
      else resolve();
    }));
  }

  /** Um idioma completo: o que falta ou está em branco volta ao padrão. */
  function normalizarIdioma(lang, cru) {
    const padrao = PADRAO[lang];
    const idioma = { ...padrao, versao: Number.isInteger(cru?.versao) ? cru.versao : 0 };
    for (const campo of CAMPOS_DE_TEXTO) {
      const valor = String(cru?.[campo] ?? '').trim();
      if (valor) idioma[campo] = valor;
    }
    if (Object.values(IMAGENS).includes(String(cru?.imageSource))) idioma.imageSource = String(cru.imageSource);
    return idioma;
  }

  function normalizar(cru) {
    return Object.fromEntries(IDIOMAS_DO_ENVIO.map(lang => [lang, normalizarIdioma(lang, cru?.[lang])]));
  }

  /** Os ajustes gravados, sempre completos. */
  async function ler() {
    atuais = normalizar(await lerGravado());
    return atuais;
  }

  /** Os últimos ajustes lidos por esta página (os padrões antes da primeira leitura). */
  function atual() {
    return atuais;
  }

  /**
   * Grava os campos de um idioma, se ninguém gravou esse idioma depois de
   * `versaoLida`. O outro idioma fica como está gravado.
   *
   * @returns {Promise<{ ok: true, ajustes } | { ok: false, motivo: 'desatualizada', ajustes }>}
   */
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

  /** Chama `ouvinte(ajustes)` agora e a cada gravação, desta aba ou de outra. */
  function acompanhar(ouvinte) {
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local' || !(CHAVE in mudancas)) return;
      atuais = normalizar(mudancas[CHAVE].newValue);
      ouvinte(atuais);
    });
    return ler().then(ajustes => { ouvinte(ajustes); return ajustes; });
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
    IDIOMAS: IDIOMAS_DO_ENVIO,
    IMAGENS,
    PADRAO,
    normalizar,
    ler,
    atual,
    salvar,
    acompanhar,
    baralhoPadrao,
    nomeDoBaralho,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
