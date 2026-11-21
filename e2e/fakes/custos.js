'use strict';

const PARCELAS_DO_TOTAL = ['cardUsd', 'imageJudgeUsd', 'imageGuardUsd', 'imageGenerationUsd', 'otherUsd', 'correctionUsd'];
const CAMPO_DO_PREFIXO = [['[image_judge]', 'imageJudgeUsd'], ['[image_guard]', 'imageGuardUsd']];
const CUSTO_DA_LINHA = [['cardUsd', 'cartoes'], ['imageJudgeUsd', 'escolha'], ['imageGuardUsd', 'triagem'], ['imageGenerationUsd', 'geradas'], ['otherUsd', 'outros']];
const IMAGEM_DA_LINHA = [['real', 'real'], ['generated', 'geradas'], ['skipped', 'sem'], ['failed', 'falhas']];

const arredondar = valor => Math.round(valor * 1e6) / 1e6;
const somar = (a, b) => a + b;
const terminouComFalha = status => ['failed', 'partial'].includes(status);

const antesDoComeco = (dia, de) => Boolean(de) && dia < de;
const depoisDoFim = (dia, ate) => Boolean(ate) && dia > ate;
const dentroDoPeriodo = (dia, { de, ate }) => !antesDoComeco(dia, de) && !depoisDoFim(dia, ate);

const palavraDo = registro => String(registro.keyword || '');
const custoDo = registro => registro.cost_usd || 0;

function campoDaPalavra(palavra) {
  const doPrefixo = CAMPO_DO_PREFIXO.find(([prefixo]) => palavra.startsWith(prefixo));
  return doPrefixo ? doPrefixo[1] : 'cardUsd';
}

const SOMA_DO_TIPO = new Map([
  ['tokens', (soma, registro) => { soma.custos[campoDaPalavra(palavraDo(registro))] += custoDo(registro); }],
  ['correction_tokens', (soma, registro) => { soma.correcao = (soma.correcao || 0) + custoDo(registro); }],
  ['plan_tokens', (soma, registro) => { soma.doPlano.add(palavraDo(registro)); soma.naChave += registro.would_cost_usd || 0; }],
]);

function somaDosRegistros(registros) {
  const soma = {
    custos: { cardUsd: 0, imageJudgeUsd: 0, imageGuardUsd: 0, imageGenerationUsd: 0, otherUsd: 0, totalUsd: 0 },
    correcao: null, doPlano: new Set(), naChave: 0,
  };
  for (const registro of registros) SOMA_DO_TIPO.get(registro.type)?.(soma, registro);
  return soma;
}

function custosComTotal({ custos, correcao }) {
  const comCorrecao = correcao === null ? { ...custos } : { ...custos, correctionUsd: correcao };
  comCorrecao.totalUsd = PARCELAS_DO_TOTAL.reduce((total, campo) => total + (comCorrecao[campo] || 0), 0);
  return comCorrecao;
}

const resumoDoPlano = ({ doPlano, naChave }) => (doPlano.size ? { plan: { cards: doPlano.size, wouldCostUsd: arredondar(naChave) } } : {});

function resumoDosCustos(registros, de, ate) {
  const contados = registros.filter(registro => dentroDoPeriodo(String(registro.date || '').slice(0, 10), { de, ate }));
  const soma = somaDosRegistros(contados);
  const arredondados = Object.fromEntries(Object.entries(custosComTotal(soma)).map(([chave, valor]) => [chave, arredondar(valor)]));
  return { costs: arredondados, images: imagensZeradas(), matchedRecords: contados.length, ...resumoDoPlano(soma) };
}

function imagensZeradas() {
  return {
    total: 0, real: 0, generated: 0, skipped: 0, failed: 0, generatedAttempted: 0, savingsUsd: 0,
    realPct: 0, generatedPct: 0, skippedPct: 0, failedPct: 0, generatedAttemptPct: 0,
  };
}

function cartoesQueFalharam(state, pedidas, enviadas) {
  const marcados = state.failedPhraseIds.length;
  return terminouComFalha(state.status) ? Math.max(marcados, pedidas - enviadas) : marcados;
}

function linhaDoEnvio(envio, resumo) {
  const { state, corpo } = envio;
  const pedidas = new Set(envio.entries.map(e => e.phraseId)).size;
  const enviadas = state.successfulPhraseIds.length;
  return {
    jobId: envio.jobId, createdAt: envio.createdAt, updatedAt: state.updatedAt, lang: envio.lang,
    deckName: corpo.deckName || '', imageSource: corpo.imageSource || '', status: state.status, stage: state.stage,
    requestedCards: pedidas, successfulCards: enviadas, failedCards: cartoesQueFalharam(state, pedidas, enviadas), lastError: state.lastError,
    costs: resumo.costs, images: resumo.images, matchedRecords: resumo.matchedRecords, ...(resumo.plan ? { plan: resumo.plan } : {}),
  };
}

const doIdioma = (linha, lang) => lang === 'all' || linha.lang === lang;

function linhasDosCustosDaFila({ definidas, envios, registrosDeCusto }, corpo) {
  const { lang = 'all', from: de, to: ate } = corpo || {};
  const doPeriodo = linha => doIdioma(linha, lang) && dentroDoPeriodo(String(linha.createdAt).slice(0, 10), { de, ate });
  if (definidas) return definidas.filter(doPeriodo);
  return envios.filter(doPeriodo)
    .map(envio => linhaDoEnvio(envio, resumoDosCustos(registrosDeCusto.get(envio.jobId) || [], de, ate)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

const contagemPelosNomes = (pares, valores) => Object.fromEntries(pares.map(([campo, nome]) => [campo, valores[nome] || 0]));

function custosDaLinha(custos) {
  const costs = { ...contagemPelosNomes(CUSTO_DA_LINHA, custos), ...(custos.correcao ? { correctionUsd: custos.correcao } : {}) };
  costs.totalUsd = Object.values(costs).reduce(somar, 0);
  return costs;
}

function imagensDaLinha(imagens, economia) {
  const contadas = contagemPelosNomes(IMAGEM_DA_LINHA, imagens);
  const total = Object.values(contadas).reduce(somar, 0);
  const pct = parte => (total ? Math.round((parte / total) * 1000) / 10 : 0);
  return {
    ...imagensZeradas(), ...contadas, savingsUsd: economia, total,
    realPct: pct(contadas.real), generatedPct: pct(contadas.generated), skippedPct: pct(contadas.skipped), failedPct: pct(contadas.failed),
  };
}

const cartoesEnviados = ({ enviadas, status, pedidas }) => enviadas ?? (status === 'completed' ? pedidas : 0);

function linhaDeCustos({
  jobId, lang = 'en', createdAt, status = 'completed', stage, pedidas = 1, enviadas, lastError = null,
  custos = {}, imagens = {}, economia = 0, baralho = '', plano = null,
}) {
  const successfulCards = cartoesEnviados({ enviadas, status, pedidas });
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
    failedCards: terminouComFalha(status) ? pedidas - successfulCards : 0,
    lastError,
    costs: custosDaLinha(custos),
    images: imagensDaLinha(imagens, economia),
    matchedRecords: 1,
    ...(plano ? { plan: { cards: plano.cartoes, wouldCostUsd: plano.economia } } : {}),
  };
}

module.exports = { resumoDosCustos, linhaDeCustos, linhasDosCustosDaFila };
