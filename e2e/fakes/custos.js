'use strict';

// Os custos do fake da Conexão: o resumo dos registros de um Envio e a linha da aba Custos (`POST /analytics/jobs`), com as
// mesmas chaves de `complemento/custos.py`. Só os registros de texto (e a correção da Criação, #169); as imagens são do #144.

/** O resumo dos registros de custo de um Envio, como `custos.resumir` do complemento (só os registros de texto). */
function resumoDosCustos(registros, de, ate) {
  const custos = { cardUsd: 0, imageJudgeUsd: 0, imageGuardUsd: 0, imageGenerationUsd: 0, otherUsd: 0, totalUsd: 0 };
  let contados = 0;
  const doPlano = new Set(); // os Cartões que o plano do ChatGPT fez (#159)
  let naChave = 0;
  let correcao = null; // a correção das frases da Criação (#169): só tem a chave quando algum registro dela cai no período
  for (const registro of registros) {
    const dia = String(registro.date || '').slice(0, 10);
    if ((de && dia < de) || (ate && dia > ate)) continue;
    contados += 1;
    const palavra = String(registro.keyword || '');
    const campo = palavra.startsWith('[image_judge]') ? 'imageJudgeUsd' : palavra.startsWith('[image_guard]') ? 'imageGuardUsd' : 'cardUsd';
    if (registro.type === 'tokens') custos[campo] += registro.cost_usd || 0;
    if (registro.type === 'correction_tokens') correcao = (correcao || 0) + (registro.cost_usd || 0);
    if (registro.type === 'plan_tokens') { doPlano.add(palavra); naChave += registro.would_cost_usd || 0; }
  }
  if (correcao !== null) custos.correctionUsd = correcao;
  custos.totalUsd = custos.cardUsd + custos.imageJudgeUsd + custos.imageGuardUsd + custos.imageGenerationUsd + custos.otherUsd + (custos.correctionUsd || 0);
  const arredondados = Object.fromEntries(Object.entries(custos).map(([chave, valor]) => [chave, Math.round(valor * 1e6) / 1e6]));
  const plano = doPlano.size ? { plan: { cards: doPlano.size, wouldCostUsd: Math.round(naChave * 1e6) / 1e6 } } : {};
  return { costs: arredondados, images: imagensZeradas(), matchedRecords: contados, ...plano };
}

function imagensZeradas() {
  return {
    total: 0, real: 0, generated: 0, skipped: 0, failed: 0, generatedAttempted: 0, savingsUsd: 0,
    realPct: 0, generatedPct: 0, skippedPct: 0, failedPct: 0, generatedAttemptPct: 0,
  };
}

/** As linhas de Custos do período e do idioma pedidos (`POST /analytics/jobs`), como `JobAnalytics.jobs`: as que o teste definiu (`definidas`) ou as dos Envios da fila. */
function linhasDosCustosDaFila({ definidas, envios, registrosDeCusto }, corpo) {
  const { lang = 'all', from: de, to: ate } = corpo || {};
  const doPeriodo = linha => (lang === 'all' || linha.lang === lang) && (!de || String(linha.createdAt).slice(0, 10) >= de) && (!ate || String(linha.createdAt).slice(0, 10) <= ate);
  if (definidas) return definidas.filter(doPeriodo);
  return envios.filter(doPeriodo).map(envio => {
    const resumo = resumoDosCustos(registrosDeCusto.get(envio.jobId) || [], de, ate);
    const pedidas = new Set(envio.entries.map(e => e.phraseId)).size;
    const enviadas = envio.state.successfulPhraseIds.length;
    const falharam = ['failed', 'partial'].includes(envio.state.status) ? Math.max(envio.state.failedPhraseIds.length, pedidas - enviadas) : envio.state.failedPhraseIds.length;
    return {
      jobId: envio.jobId, createdAt: envio.createdAt, updatedAt: envio.state.updatedAt, lang: envio.lang,
      deckName: envio.corpo.deckName || '', imageSource: envio.corpo.imageSource || '', status: envio.state.status, stage: envio.state.stage,
      requestedCards: pedidas, successfulCards: enviadas, failedCards: falharam, lastError: envio.state.lastError,
      costs: resumo.costs, images: resumo.images, matchedRecords: resumo.matchedRecords, ...(resumo.plan ? { plan: resumo.plan } : {}),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Um Envio da aba Custos no formato das linhas do contrato (`POST /analytics/jobs`). `plano`: { cartoes, economia }. */
function linhaDeCustos({
  jobId, lang = 'en', createdAt, status = 'completed', stage, pedidas = 1, enviadas, lastError = null,
  custos = {}, imagens = {}, economia = 0, baralho = '', plano = null,
}) {
  const costs = {
    cardUsd: custos.cartoes || 0,
    imageJudgeUsd: custos.escolha || 0,
    imageGuardUsd: custos.triagem || 0,
    imageGenerationUsd: custos.geradas || 0,
    otherUsd: custos.outros || 0,
    ...(custos.correcao ? { correctionUsd: custos.correcao } : {}), // a correção das frases da Criação (#169)
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
    ...(plano ? { plan: { cards: plano.cartoes, wouldCostUsd: plano.economia } } : {}), // o Envio que o plano escreveu (#159)
  };
}

module.exports = { resumoDosCustos, linhaDeCustos, linhasDosCustosDaFila };
