'use strict';

(function (raiz) {
  const NIVEL_INICIANTE = 'iniciante';
  const PALAVRAS_ENTRE_DUAS_QUE_PODEM_SER_UM_TERMO = 2;
  const MAXIMO_DE_LETRAS_PARA_A_IA = 500;

  function saoProximas(words, [primeira, segunda]) {
    return words.indexOf(segunda) - words.indexOf(primeira) - 1 <= PALAVRAS_ENTRE_DUAS_QUE_PODEM_SER_UM_TERMO;
  }

  function emDuvida(words, sobram) {
    if (sobram.length === 0) return words.length > 1;
    return sobram.length === 2 && saoProximas(words, sobram);
  }

  const podePerguntar = (nivel, texto, termosDaIA) => typeof termosDaIA === 'function'
    && nivel !== NIVEL_INICIANTE
    && texto.length <= MAXIMO_DE_LETRAS_PARA_A_IA;

  const ehPosicaoDaLinha = (posicao, total) => Number.isInteger(posicao) && posicao >= 0 && posicao < total;

  const termosValidos = (termos, total) => Array.isArray(termos)
    && termos.every(termo => Array.isArray(termo.posicoes) && termo.posicoes.length > 0 && termo.posicoes.every(posicao => ehPosicaoDaLinha(posicao, total)));

  const ehNome = termo => termo.tipo === 'nome';
  const juntaPalavras = termo => termo.posicoes.length > 1;

  function termosDesconhecidos(words, termos, conhece) {
    const porChave = new Map();
    for (const termo of termos.filter(umTermo => !ehNome(umTermo) && juntaPalavras(umTermo))) {
      const palavras = termo.posicoes.map(posicao => words[posicao]);
      if (!conhece(palavras)) porChave.set(palavras.map(word => word.clean).join(' '), palavras);
    }
    return [...porChave.values()];
  }

  function separar(words, sobram, termos, conhece) {
    const cobertas = new Set(termos.filter(termo => ehNome(termo) || juntaPalavras(termo)).flatMap(termo => termo.posicoes));
    return {
      desconhecidos: termosDesconhecidos(words, termos, conhece),
      soltas: sobram.filter(word => !cobertas.has(words.indexOf(word))),
    };
  }

  raiz.PalavraEmDuvida = Object.freeze({ MAXIMO_DE_LETRAS_PARA_A_IA, emDuvida, podePerguntar, termosValidos, separar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
