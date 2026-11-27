'use strict';

(function (raiz) {
  const NIVEL_INICIANTE = 'iniciante';
  const NIVEL_INTERMEDIARIO = 'intermediario';
  const NIVEL_AVANCADO = 'avancado';
  const PALAVRAS_ENTRE_DUAS_QUE_PODEM_SER_UM_TERMO = 2;
  const MAXIMO_DE_LETRAS_PARA_A_IA = 500;

  function saoProximas(words, [primeira, segunda]) {
    return words.indexOf(segunda) - words.indexOf(primeira) - 1 <= PALAVRAS_ENTRE_DUAS_QUE_PODEM_SER_UM_TERMO;
  }

  function emDuvida(words, sobram) {
    if (sobram.length === 0) return words.length > 1;
    return sobram.length === 2 && saoProximas(words, sobram);
  }

  const QUALQUER = 'qualquer';
  const COMUM = 'comum';

  // O tipo da coisa nova que cada Nível aceita (#903): só aqui. `comum` pede o Termo comum; `qualquer`, comum ou não.
  // O Iniciante só vê palavra solta comum e nunca pergunta à IA; o nome é conhecido, nunca uma coisa nova.
  const TIPOS_POR_NIVEL = Object.freeze({
    [NIVEL_INICIANTE]: Object.freeze({ palavra: COMUM }),
    [NIVEL_INTERMEDIARIO]: Object.freeze({ palavra: QUALQUER, phrasal_verb: COMUM, expressao: COMUM }),
    [NIVEL_AVANCADO]: Object.freeze({ palavra: QUALQUER, phrasal_verb: QUALQUER, expressao: QUALQUER, giria: QUALQUER }),
  });

  function nivelAceita(nivel, tipo, comum) {
    const aceitos = TIPOS_POR_NIVEL[nivel] || TIPOS_POR_NIVEL[NIVEL_INTERMEDIARIO];
    return aceitos[tipo] === QUALQUER || (aceitos[tipo] === COMUM && comum === true);
  }

  const podePerguntar = (nivel, texto, termosDaIA) => typeof termosDaIA === 'function'
    && nivel !== NIVEL_INICIANTE
    && texto.length <= MAXIMO_DE_LETRAS_PARA_A_IA;

  const ehPosicaoDaLinha = (posicao, total) => Number.isInteger(posicao) && posicao >= 0 && posicao < total;

  const termosValidos = (termos, total) => Array.isArray(termos)
    && termos.every(termo => Array.isArray(termo.posicoes) && termo.posicoes.length > 0 && termo.posicoes.every(posicao => ehPosicaoDaLinha(posicao, total)));

  const ehNome = termo => termo.tipo === 'nome';
  const juntaPalavras = termo => termo.posicoes.length > 1;
  // Uma palavra só que a IA chama de gíria, phrasal verb ou expressão guarda o tipo; "palavra" é a palavra solta de sempre.
  const ehPalavraComTipo = termo => !juntaPalavras(termo) && !ehNome(termo) && termo.tipo !== 'palavra';
  const cobreAsPalavras = termo => ehNome(termo) || juntaPalavras(termo) || ehPalavraComTipo(termo);

  function termosDesconhecidos(words, sobram, termos, conhece) {
    const porChave = new Map();
    for (const termo of termos.filter(umTermo => !ehNome(umTermo) && (juntaPalavras(umTermo) || ehPalavraComTipo(umTermo)))) {
      const palavras = termo.posicoes.map(posicao => words[posicao]);
      const desconhecido = juntaPalavras(termo) ? !conhece(palavras) : sobram.includes(palavras[0]);
      if (desconhecido) porChave.set(palavras.map(word => word.clean).join(' '), { palavras, tipo: termo.tipo, comum: termo.comum });
    }
    return [...porChave.values()];
  }

  function separar(words, sobram, termos, conhece) {
    const cobertas = new Set(termos.filter(cobreAsPalavras).flatMap(termo => termo.posicoes));
    return {
      desconhecidos: termosDesconhecidos(words, sobram, termos, conhece),
      soltas: sobram.filter(word => !cobertas.has(words.indexOf(word))),
    };
  }

  raiz.PalavraEmDuvida = Object.freeze({ MAXIMO_DE_LETRAS_PARA_A_IA, TIPOS_POR_NIVEL, nivelAceita, emDuvida, podePerguntar, termosValidos, separar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
