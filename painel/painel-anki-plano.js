'use strict';

// O card do plano do ChatGPT na aba Custos (#159, BRG-40): os Cartões que o plano fez, o que a chave teria cobrado por eles
// (“Você economizou”) e Gerenciar uso ↗, porque a OpenAI não manda o % da cota ao app (se mandar, a barra entra aqui). Os números
// vêm da Conexão com o Anki (`plan` de cada linha de `POST /analytics/jobs`); a linha sem Cartão do plano não tem `plan`.
// `painel-anki.js` pede o card (`cartao`) com os Envios do idioma escolhido e o seu `dinheiro` (V7, BRG-26).
// Aqui moram também as contas da aba (`SomaDosCustos`): as partes do custo de um Envio e a soma de vários, o total sempre a soma das partes que a tela
// mostra (#9), com a correção das frases da Criação (#169, `correctionUsd`, só nas linhas de períodos que a tiveram) à parte da criação de cartões.

(function (raiz) {
  const { elemento } = raiz.Veio;
  const { textoDaVoz } = raiz;

  const PARTES = {
    cartoes: 'cardUsd', geradas: 'imageGenerationUsd', escolha: 'imageJudgeUsd', triagem: 'imageGuardUsd', outros: 'otherUsd', correcao: 'correctionUsd',
  };
  const STATUS_DO_ENVIO = {
    completed: { tom: 'ok', selo: 'veio-selo--ok', retomavel: false },
    partial: { tom: 'parte', selo: 'veio-selo--parte', retomavel: true },
    failed: { tom: 'erro', selo: 'veio-selo--erro', retomavel: true },
  };
  const ANDANDO = { tom: 'andando', selo: 'veio-selo--info', retomavel: false };
  const FRASES_APAGADAS = 'frases_apagadas';

  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  function partes(envio) {
    const custos = envio.costs || {};
    const p = Object.fromEntries(Object.entries(PARTES).map(([parte, campo]) => [parte, numero(custos[campo])]));
    p.total = Object.values(p).reduce((a, b) => a + b, 0);
    return p;
  }

  function somar(envios, origens) {
    const soma = { ...Object.fromEntries(Object.keys(PARTES).map(parte => [parte, 0])), total: 0, economia: 0,
      pedidas: 0, enviadas: 0, concluidos: 0, n: envios.length, imagens: 0 };
    for (const origem of origens) soma[origem.chave] = 0;
    for (const envio of envios) {
      const p = partes(envio);
      for (const chave of [...Object.keys(PARTES), 'total']) soma[chave] += p[chave];
      soma.economia += numero(envio.images?.savingsUsd);
      soma.pedidas += numero(envio.requestedCards);
      soma.enviadas += numero(envio.successfulCards);
      if (envio.status === 'completed') soma.concluidos += 1;
      for (const origem of origens) {
        soma[origem.chave] += numero(envio.images?.[origem.chave]);
        soma.imagens += numero(envio.images?.[origem.chave]);
      }
    }
    return soma;
  }

  function cartao(envios, dinheiro) {
    const feitos = envios.reduce((soma, envio) => soma + numero(envio.plan?.cards), 0);
    if (!feitos) return null;
    const economizou = envios.reduce((soma, envio) => soma + numero(envio.plan?.wouldCostUsd), 0);
    const gerenciar = elemento('a', 'veio-botao veio-botao--link', textoDaVoz('BRG-40.gerenciar'));
    Object.assign(gerenciar, { href: raiz.ColunaDoChatGPT.GERENCIAR_USO, target: '_blank', rel: 'noopener noreferrer' });
    const secao = elemento('section', 'anki-cartao',
      elemento('h3', null, textoDaVoz('BRG-40.titulo'), ' ', elemento('small', null, `· ${textoDaVoz('BRG-40.cartoes', { n: feitos })}`)),
      elemento('p', null, textoDaVoz('BRG-40.economizou', { valor: dinheiro(economizou) })),
      elemento('p', 'anki-apoio', textoDaVoz('BRG-40.nota')),
      elemento('p', null, gerenciar));
    secao.id = 'anki-custos-plano';
    secao.setAttribute('aria-label', textoDaVoz('BRG-40.titulo'));
    return secao;
  }

  function dataIso(data) {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  }

  function datasDoPeriodo(periodo) {
    const hoje = new Date();
    if (periodo === 'hoje') return { periodo, de: dataIso(hoje), ate: dataIso(hoje) };
    if (periodo === 'mes') return { periodo, de: dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: dataIso(hoje) };
    return { periodo: 'tudo', de: '', ate: '' };
  }

  function vistaDaLeitura(dados) {
    if (!dados) return 'carregando';
    return dados.envios.length ? 'dados' : 'vazio';
  }

  function vistaDepoisDaResposta({ carregando, erro, desligada, dados }) {
    if (carregando) return 'carregando';
    if (erro || desligada) return 'erro';
    return vistaDaLeitura(dados);
  }

  function vistaDosCustos(retrato) {
    if (retrato.desligada && retrato.dados) return 'antiga';
    if (!retrato.respondeu) return 'esqueleto';
    return vistaDepoisDaResposta(retrato);
  }

  const enviosDaResposta = dados => (Array.isArray(dados.jobs) ? dados.jobs : []);
  const causaDaFalha = desfecho => (desfecho.status >= 300 ? `HTTP ${desfecho.status}` : desfecho.detalhes);

  function resultadoDaLeitura(desfecho, pedido) {
    if (desfecho.ok) return { envios: enviosDaResposta(desfecho.dados), erro: null };
    return { envios: null, erro: `${pedido} · ${causaDaFalha(desfecho)}` };
  }

  function enviosDoIdioma(envios, idioma) {
    return [...envios]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .filter(envio => idioma === 'all' || envio.lang === idioma);
  }

  function statusDoEnvio(envio) {
    return STATUS_DO_ENVIO[envio.status] || ANDANDO;
  }

  function situacaoDoDetalhe(envio, { apagados, falhasAoRetomar }) {
    const apagado = envio.lastError === FRASES_APAGADAS || apagados.has(envio.jobId);
    return { apagado, retomavel: statusDoEnvio(envio).retomavel && !apagado, falhaAoRetomar: falhasAoRetomar.get(envio.jobId) };
  }

  function naoEntraram(envio) {
    return numero(envio.failedCards) || Math.max(0, numero(envio.requestedCards) - numero(envio.successfulCards));
  }

  function linhasDosCustos(p) {
    const linhas = [
      ['BRG-08.criacaoDeCartoes', p.cartoes],
      ['BRG-08.imagensGeradas', p.geradas],
      ['BRG-29.escolhaETriagem', p.escolha + p.triagem],
    ];
    if (p.outros > 0) linhas.push(['BRG-29.outros', p.outros]);
    if (p.correcao > 0) linhas.push(['BRG-51', p.correcao]);
    return linhas;
  }

  raiz.PlanoDosCustos = { cartao };
  raiz.RetratoDosCustos = {
    datasDoPeriodo, enviosDoIdioma, linhasDosCustos, naoEntraram, resultadoDaLeitura, situacaoDoDetalhe, statusDoEnvio, vistaDosCustos,
  };
  raiz.SomaDosCustos = { numero, partes, somar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
