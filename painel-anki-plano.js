'use strict';

// O card do plano do ChatGPT na aba Custos (#159, BRG-40): os Cartões que o plano fez, o que a chave teria cobrado por eles
// (“Você economizou”) e Gerenciar uso ↗, porque a OpenAI não manda o % da cota ao app (se mandar, a barra entra aqui). Os números
// vêm da Conexão com o Anki (`plan` de cada linha de `POST /analytics/jobs`); a linha sem Cartão do plano não tem `plan`.
// `painel-anki.js` pede o card (`cartao`) com os Envios do idioma escolhido e o seu `dinheiro` (V7, BRG-26).
// Aqui moram também as contas da aba (`SomaDosCustos`): as partes do custo de um Envio e a soma de vários, o total sempre a soma das partes que a tela
// mostra (#9), com a correção das frases da Criação (#169, `correctionUsd`, só nas linhas de períodos que a tiveram) à parte da criação de cartões.

(function (raiz) {
  const { textoDaVoz } = raiz;

  // Cada parte do custo e o campo de `costs` de onde ela vem (`POST /analytics/jobs`).
  const PARTES = {
    cartoes: 'cardUsd', geradas: 'imageGenerationUsd', escolha: 'imageJudgeUsd', triagem: 'imageGuardUsd', outros: 'otherUsd', correcao: 'correctionUsd',
  };

  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  /** As partes do custo de um envio; o total é a soma delas. */
  function partes(envio) {
    const custos = envio.costs || {};
    const p = Object.fromEntries(Object.entries(PARTES).map(([parte, campo]) => [parte, numero(custos[campo])]));
    p.total = Object.values(p).reduce((a, b) => a + b, 0);
    return p;
  }

  /** Os envios somados: as partes e o total, os Cartões, os envios concluídos e as imagens por `origens` (`chave` de cada uma em `images`). */
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

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  /** O card, ou null quando nenhum Envio do período teve Cartão feito pelo plano. */
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

  raiz.PlanoDosCustos = { cartao };
  raiz.SomaDosCustos = { numero, partes, somar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
