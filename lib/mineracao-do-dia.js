'use strict';

// O dia da mineração automática, num lugar só: o que é “hoje”, quanto cada
// idioma minerou hoje, se já está no limite, e por onde o estado chega a quem o
// mostra. O service worker (que guarda e conta), o content script (que decide se
// pede mais uma frase), o popup e a Boas-vindas usam este módulo; nem o service
// worker nem o content script comparam data ou limite por conta própria. O popup
// e a Boas-vindas só mostram o que o service worker publica.
//
// O estado é `{ settings, daily }`:
//   settings  { en: { enabled, dailyLimit }, ru: { ... } }
//   daily     { date: 'AAAA-MM-DD', en: { count }, ru: { count } }
//
// A contagem de um dia só vale naquele dia: as consultas de contagem/limite
// tratam o contador de outro dia como zero, mesmo sem receber um novo estado.
//
// Os pedidos de leitura/ajuste seguem o contrato de `lib/mineracao-automatica.js`.
// `CHAVES.estadoPublicado` é o retrato no storage para o popup e o painel;
// `MENSAGEM_ESTADO_MUDOU` é o aviso às abas. O contrato de publicação está
// em `publicarEstadoDaAutomatica`, em `background.js`.
//
// Carregado pelo service worker, pelo content script, pelo popup e pelo painel.

(function (raiz) {
  /** Os idiomas da mineração automática, na ordem em que aparecem. */
  const IDIOMAS_DA_MINERACAO = Object.freeze(['en', 'ru']);

  const LIMITE_PADRAO = 20;
  const LIMITE_MINIMO = 1;
  const LIMITE_MAXIMO = 100;

  /** As chaves do storage da mineração automática. */
  const CHAVES = Object.freeze({
    ajustes: 'pm_auto_miner_settings',
    diario: 'pm_auto_miner_daily',
    ultimoEvento: 'pm_auto_miner_last_event',
    estadoPublicado: 'pm_auto_miner_state_view',
  });

  /** O aviso que o service worker manda a cada aba quando o estado muda. */
  const MENSAGEM_ESTADO_MUDOU = 'AUTO_MINER_STATE_CHANGED';

  /** Os ajustes de quem nunca mexeu: tudo desligado, no limite padrão. */
  function ajustesPadrao() {
    return Object.fromEntries(IDIOMAS_DA_MINERACAO.map(lang => [lang, { enabled: false, dailyLimit: LIMITE_PADRAO }]));
  }

  /** O dia de um momento como o contador o grava: AAAA-MM-DD, no relógio local. */
  function diaDe(momento = new Date()) {
    const mes = String(momento.getMonth() + 1).padStart(2, '0');
    const dia = String(momento.getDate()).padStart(2, '0');
    return `${momento.getFullYear()}-${mes}-${dia}`;
  }

  function prenderLimite(valor) {
    return Math.max(LIMITE_MINIMO, Math.min(LIMITE_MAXIMO, Number(valor || LIMITE_PADRAO)));
  }

  /** Os ajustes gravados (ou nenhum) como o resto do código os lê: o limite entre 1 e 100. */
  function normalizarAjustes(bruto) {
    const padrao = ajustesPadrao();
    return Object.fromEntries(IDIOMAS_DA_MINERACAO.map(lang => [lang, {
      enabled: Boolean(bruto?.[lang]?.enabled),
      dailyLimit: prenderLimite(bruto?.[lang]?.dailyLimit ?? padrao[lang].dailyLimit),
    }]));
  }

  /** O contador gravado, trazido para o dia de `agora`: de outro dia, volta a zero; nenhum passa do limite. */
  function normalizarDiario(bruto, ajustes, agora = new Date()) {
    const hoje = diaDe(agora);
    const doDia = bruto && bruto.date === hoje ? bruto : null;
    return {
      date: hoje,
      ...Object.fromEntries(IDIOMAS_DA_MINERACAO.map(lang => [lang, {
        count: Math.min(Number(doDia?.[lang]?.count || 0), ajustes[lang].dailyLimit),
      }])),
    };
  }

  /** Quantas frases um idioma minerou automaticamente hoje. */
  function contagemDeHoje(estado, lang, agora = new Date()) {
    if (estado?.daily?.date !== diaDe(agora)) return 0;
    return Number(estado.daily[lang]?.count || 0);
  }

  /** Se um idioma já bateu o limite de hoje. */
  function noLimiteDeHoje(estado, lang, agora = new Date()) {
    return contagemDeHoje(estado, lang, agora) >= Number(estado?.settings?.[lang]?.dailyLimit || 0);
  }

  /** Os idiomas ligados, na ordem de `IDIOMAS_DA_MINERACAO`. */
  function idiomasLigados(estado) {
    return IDIOMAS_DA_MINERACAO.filter(lang => estado?.settings?.[lang]?.enabled);
  }

  /**
   * Se a aba deve pedir mais uma frase deste idioma: ligado e abaixo do limite
   * de hoje. É a pergunta do content script, e o service worker confere de novo.
   */
  function podeMinerarAgora(estado, lang, agora = new Date()) {
    return Boolean(estado?.settings?.[lang]?.enabled) && !noLimiteDeHoje(estado, lang, agora);
  }

  raiz.MineracaoDoDia = Object.freeze({
    IDIOMAS_DA_MINERACAO,
    CHAVES,
    MENSAGEM_ESTADO_MUDOU,
    ajustesPadrao,
    diaDe,
    normalizarAjustes,
    normalizarDiario,
    contagemDeHoje,
    noLimiteDeHoje,
    idiomasLigados,
    podeMinerarAgora,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
