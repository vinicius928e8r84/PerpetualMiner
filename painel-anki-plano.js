'use strict';

// O card do plano do ChatGPT na aba Custos (#159, BRG-40): os Cartões que o plano fez, o que a chave teria cobrado por eles
// (“Você economizou”) e Gerenciar uso ↗, porque a OpenAI não manda o % da cota ao app (se mandar, a barra entra aqui). Os números
// vêm da Conexão com o Anki (`plan` de cada linha de `POST /analytics/jobs`); a linha sem Cartão do plano não tem `plan`.
// `painel-anki.js` pede o card (`cartao`) com os Envios do idioma escolhido e o seu `dinheiro` (V7, BRG-26).

(function (raiz) {
  const { textoDaVoz } = raiz;
  const numero = valor => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

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
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
