'use strict';

(function (raiz) {
  const IDIOMAS_DA_MINERACAO = Object.freeze(['en', 'ru']);

  const LIMITE_PADRAO = 20;
  const LIMITE_MINIMO = 1;
  const LIMITE_MAXIMO = 100;

  const CHAVES = Object.freeze({
    ajustes: 'pm_auto_miner_settings',
    diario: 'pm_auto_miner_daily',
    ultimoEvento: 'pm_auto_miner_last_event',
    estadoPublicado: 'pm_auto_miner_state_view',
  });

  const MENSAGEM_ESTADO_MUDOU = 'AUTO_MINER_STATE_CHANGED';

  function ajustesPadrao() {
    return Object.fromEntries(IDIOMAS_DA_MINERACAO.map(lang => [lang, { enabled: false, dailyLimit: LIMITE_PADRAO }]));
  }

  function diaDe(momento = new Date()) {
    const mes = String(momento.getMonth() + 1).padStart(2, '0');
    const dia = String(momento.getDate()).padStart(2, '0');
    return `${momento.getFullYear()}-${mes}-${dia}`;
  }

  function prenderLimite(valor) {
    return Math.max(LIMITE_MINIMO, Math.min(LIMITE_MAXIMO, Number(valor || LIMITE_PADRAO)));
  }

  function normalizarAjustes(bruto) {
    const padrao = ajustesPadrao();
    return Object.fromEntries(IDIOMAS_DA_MINERACAO.map(lang => [lang, {
      enabled: Boolean(bruto?.[lang]?.enabled),
      dailyLimit: prenderLimite(bruto?.[lang]?.dailyLimit ?? padrao[lang].dailyLimit),
    }]));
  }

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

  function contagemDeHoje(estado, lang, agora = new Date()) {
    if (estado?.daily?.date !== diaDe(agora)) return 0;
    return Number(estado.daily[lang]?.count || 0);
  }

  function noLimiteDeHoje(estado, lang, agora = new Date()) {
    return contagemDeHoje(estado, lang, agora) >= Number(estado?.settings?.[lang]?.dailyLimit || 0);
  }

  function idiomasLigados(estado) {
    return IDIOMAS_DA_MINERACAO.filter(lang => estado?.settings?.[lang]?.enabled);
  }

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
