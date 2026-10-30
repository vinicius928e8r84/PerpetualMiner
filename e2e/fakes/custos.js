'use strict';

// A linha de Custos do fake da Conexão com o Anki (`anki.js`: `definirCustos`), no formato que o contrato dá.

/** As imagens de uma linha de Custos sem nenhuma imagem (as chaves do contrato). */
function imagensZeradas() {
  return {
    total: 0, real: 0, generated: 0, skipped: 0, failed: 0, generatedAttempted: 0, savingsUsd: 0,
    realPct: 0, generatedPct: 0, skippedPct: 0, failedPct: 0, generatedAttemptPct: 0,
  };
}

/** Um Envio da aba Custos no formato de `JobAnalytics.jobs` (bridge/analytics.py), o das linhas do contrato. */
function linhaDeCustos({
  jobId, lang = 'en', createdAt, status = 'completed', stage, pedidas = 1, enviadas, lastError = null,
  custos = {}, imagens = {}, economia = 0, baralho = '',
}) {
  const costs = {
    cardUsd: custos.cartoes || 0,
    imageJudgeUsd: custos.escolha || 0,
    imageGuardUsd: custos.triagem || 0,
    imageGenerationUsd: custos.geradas || 0,
    otherUsd: custos.outros || 0,
  };
  costs.totalUsd = Object.values(costs).reduce((a, b) => a + b, 0);
  const images = {
    ...imagensZeradas(),
    real: imagens.real || 0,
    generated: imagens.geradas || 0,
    skipped: imagens.sem || 0,
    failed: imagens.falhas || 0,
    savingsUsd: economia,
  };
  images.total = images.real + images.generated + images.skipped + images.failed;
  const pct = parte => (images.total ? Math.round((parte / images.total) * 1000) / 10 : 0);
  Object.assign(images, { realPct: pct(images.real), generatedPct: pct(images.generated), skippedPct: pct(images.skipped), failedPct: pct(images.failed) });
  const successfulCards = enviadas ?? (status === 'completed' ? pedidas : 0);
  return {
    jobId,
    createdAt,
    updatedAt: createdAt,
    lang,
    deckName: baralho,
    imageSource: 'real',
    status,
    stage: stage || status,
    requestedCards: pedidas,
    successfulCards,
    failedCards: ['failed', 'partial'].includes(status) ? pedidas - successfulCards : 0,
    lastError,
    costs,
    images,
    matchedRecords: 1,
  };
}

module.exports = { linhaDeCustos, imagensZeradas };
