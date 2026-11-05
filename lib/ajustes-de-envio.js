'use strict';

// Os Ajustes de envio num lugar só: o Baralho padrão de cada idioma, a forma
// gravada em `ankiBridgePresets` e o salvar que não sobrescreve o que outra aba
// salvou depois.
//
// Quem lê o baralho (a aba Ajustes de envio, Baralhos e termos, Vocabulário, o
// Envio ao Anki e a Palavra automática do service worker) lê daqui, então o
// Baralho padrão é o mesmo em todo o front. O motor tem os próprios padrões,
// que ficam fora deste passo.
//
// Cada idioma grava uma `versao`: o formulário lembra a versão que leu, e salvar
// recusa quando a gravada mudou desde então (outra aba salvou no meio). Salvar
// um idioma nunca toca no outro.

(function (raiz) {
  const CHAVE = 'ankiBridgePresets';
  const IDIOMAS_DO_ENVIO = Object.freeze(['en', 'ru']);

  // Os valores de `imageSource` que o motor entende.
  const IMAGENS = Object.freeze({ FOTO_REAL: '1', GERADA_POR_IA: '2' });

  // A voz de reserva, usada quando a do Google falha (#174): um provedor da lista, ou `nenhuma`. A lista é aberta a outros
  // provedores: um provedor novo entra aqui e na Conexão. A voz do Anki (`{{tts}}`) não entra. O padrão é o da Conexão, e por isso
  // o pedido do Envio só leva a reserva quando a pessoa a mudou.
  const RESERVAS = Object.freeze(['openai', 'nenhuma']);

  // Os sotaques da voz do Google, por nome de lugar: o domínio é o que a Conexão recebe, e a pessoa não precisa saber qual é qual.
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

  // O estilo do Cartão (#162, #163): o nível de cada idioma, os mesmos nos dois. Os nomes são os que a Conexão entende no pedido do Envio
  // (`nivel`). O Iniciante é o padrão da Conexão, e por isso o pedido só leva o nível quando a pessoa o mudou.
  const NIVEIS = Object.freeze(['iniciante', 'intermediario', 'avancado']);

  // A frente do Cartão (#166): cada idioma tem a sua. Os nomes são os que a Conexão entende em `POST /anki/card-front`. Diferente do nível, a frente não vai no
  // pedido do Envio: quem a troca é a Conexão, no modelo de Cartão do tipo de nota do idioma, ao salvar. Imagem primeiro não entra.
  const FRENTES = Object.freeze(['frase_com_audio', 'ouvir_primeiro', 'lacuna', 'producao', 'ditado', 'criacao']);

  // “Usar um tipo que já tenho” (#165): as partes do Cartão que a pessoa põe nos campos do tipo de nota dela, na ordem em que a Conexão as junta num campo. A Frase e a
  // resposta são obrigatórias, e em campos diferentes. Os nomes são os que a Conexão entende em `tipoProprio.mapa` (`complemento/tipo_proprio.py`).
  const PARTES_DO_TIPO_PROPRIO = Object.freeze(['frase', 'audio_da_frase', 'resposta', 'palavra', 'audio_da_palavra', 'imagem']);
  const PARTES_OBRIGATORIAS = Object.freeze(['frase', 'resposta']);

  const PADRAO = Object.freeze({
    en: Object.freeze({ deckName: 'CIMV', imageSource: IMAGENS.FOTO_REAL, ttsWordTld: 'com', ttsPhraseTld: 'co.uk', ttsReserva: RESERVAS[0], nivel: NIVEIS[0], frente: FRENTES[0] }),
    ru: Object.freeze({ deckName: 'RUSSIAN', imageSource: IMAGENS.FOTO_REAL, ttsWordTld: 'ru', ttsPhraseTld: 'ru', ttsReserva: RESERVAS[0], nivel: NIVEIS[0], frente: FRENTES[0] }),
  });

  const CAMPOS_DE_TEXTO = ['deckName', 'ttsWordTld', 'ttsPhraseTld'];

  let atuais = normalizar(null);

  // A forma com callback: é a que o service worker e os stubs dos testes antigos têm.
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

  /** O `tipoProprio` gravado (`{ nome, mapa }`) ou null: um mapa torto (parte desconhecida, campo em branco) não é lido. A Frase e a resposta em campos diferentes é regra da tela e da Conexão. */
  function tipoProprioValido(cru) {
    const nome = typeof cru?.nome === 'string' ? cru.nome.trim() : '';
    const mapa = cru?.mapa;
    if (!nome || !mapa || typeof mapa !== 'object') return null;
    const partes = Object.keys(mapa);
    if (!partes.length || partes.some(parte => !PARTES_DO_TIPO_PROPRIO.includes(parte) || typeof mapa[parte] !== 'string' || !mapa[parte])) return null;
    return Object.freeze({ nome, mapa: Object.freeze(Object.fromEntries(PARTES_DO_TIPO_PROPRIO.filter(parte => parte in mapa).map(parte => [parte, mapa[parte]]))) });
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
    if (RESERVAS.includes(cru?.ttsReserva)) idioma.ttsReserva = cru.ttsReserva;
    if (NIVEIS.includes(cru?.nivel)) idioma.nivel = cru.nivel;
    if (FRENTES.includes(cru?.frente)) idioma.frente = cru.frente;
    const tipoProprio = tipoProprioValido(cru?.tipoProprio);  // sem a chave quando a pessoa usa o estilo pronto: o gravado de quem nunca mexeu fica como era
    if (tipoProprio) idioma.tipoProprio = tipoProprio;
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

  /** O `tts` do pedido do Envio: os sotaques e, só se a pessoa mudou o padrão, a lista de reserva (vazia: sem reserva). */
  function ttsDoEnvio(ajustes) {
    const tts = { wordTld: ajustes.ttsWordTld, phraseTld: ajustes.ttsPhraseTld };
    if (ajustes.ttsReserva !== RESERVAS[0]) tts.reserva = ajustes.ttsReserva === 'nenhuma' ? [] : [ajustes.ttsReserva];
    return tts;
  }

  /** O que do estilo do Cartão e da voz vai no pedido do Envio: o `tts` e, só quando a pessoa mudou o nível do Iniciante (o que a Conexão faz sem ele), o `nivel`;
   *  e o `tipoProprio`, quando ela usa um tipo de nota que já tinha. */
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
