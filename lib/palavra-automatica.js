'use strict';

(function (raiz) {
  const { detectarIdioma, contarLetras, IDIOMAS, Mineracao, PalavraEmDuvida, PalavrasGramaticais, PalavrasFrequentes } = raiz;

  const AUTO_KEYWORD_MIN_SCORE = 70;
  const AUTO_KEYWORD_MAX_EN_GROUPS = 2;

  function autoCleanWord(value) {
    return String(value || '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  }

  function autoTermParts(value) {
    return String(value || '').toLowerCase().match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || [];
  }

  function autoTermKey(parts) {
    return parts.map(autoCleanWord).filter(Boolean).join(' ');
  }

  const { EN: AUTO_KEYWORD_STOP_WORDS, RU: AUTO_KEYWORD_STOP_WORDS_RU } = PalavrasGramaticais;

  const AUTO_KEYWORD_PATTERNS = [
    'as soon as', 'as long as', 'as far as', 'as if', 'as though',
    'even though', 'even if', 'rather than', 'instead of', 'because of', 'due to',
    'in order to', 'so that', 'so as to', 'used to', 'be used to', 'get used to',
    'be supposed to', 'about to', 'going to', 'have to', 'had better',
    'no matter', 'let alone', 'at least', 'at all', 'after all',
    'in spite of', 'out of', 'up to', 'in charge of', 'on behalf of',
  ].map(autoTermParts);

  const AUTO_KEYWORD_IDIOMS = [
    'around the clock',
  ].map(autoTermParts);

  const AUTO_PHRASAL_PARTICLES = new Set([
    'about', 'across', 'after', 'along', 'around', 'aside', 'away', 'back', 'by',
    'down', 'forward', 'in', 'into', 'off', 'on', 'out', 'over', 'through',
    'together', 'up',
  ]);

  const AUTO_PHRASAL_TRAILERS = new Set([
    'about', 'across', 'after', 'against', 'at', 'by', 'for', 'from', 'into',
    'of', 'on', 'over', 'through', 'to', 'with',
  ]);

  const AUTO_CONTENT_LINKERS = new Set(['of']);

  const AUTO_ACTION_OBJECT_WORDS = new Set([
    'plough', 'ploughing', 'plow', 'plowing', 'sow', 'sowing',
    'plant', 'planting', 'harvest', 'harvesting', 'reap', 'reaping',
  ]);

  const AUTO_STRONG_SINGLE_WORDS = new Set([
    'nursing', 'weaned', 'weaning', 'gruel', 'sow',
  ]);

  const AUTO_STRONG_PHRASAL_ROOTS = new Set([
    'fritter', 'frittered', 'frittering',
  ]);

  const PONTOS_DO_IDIOMA = Object.freeze({ unknown: 122, new: 94, recent: 84, mixed: 70, seen: 60, mature: 36 });
  const PONTOS_DA_EXPRESSAO_DE_CONTEUDO = Object.freeze({ unknown: 124, new: 96, recent: 86, mixed: 72, seen: 62, mature: 38 });
  const PONTOS_DA_ACAO_COM_OBJETO = Object.freeze({ unknown: 118, new: 92, recent: 82, mixed: 68, seen: 58, mature: 34 });
  const PONTOS_DO_PADRAO = Object.freeze({ unknown: 72, new: 52, recent: 44, mixed: 36, seen: 30, mature: 18 });
  const PHRASAL_VERB_SCORES = Object.freeze({ unknown: 60, new: 50, recent: 42, mixed: 34, seen: 28, mature: 16 });

  const STATUS_WITH_OWN_SCORE = new Set(['mature', 'recent', 'new', 'mixed']);

  function pickAutoKeywordCandidates(words, vocab, limit = 1) {
    const candidates = [
      ...idiomCandidates(words, vocab),
      ...contentExpressionCandidates(words, vocab),
      ...actionObjectCandidates(words, vocab),
      ...patternCandidates(words, vocab),
      ...phrasalVerbCandidates(words, vocab),
      ...unknownWordCandidates(words, vocab),
    ];
    candidates.sort(bestScoreFirst);
    return dedupeAutoCandidates(candidates.filter(candidate => candidate.score >= AUTO_KEYWORD_MIN_SCORE)).slice(0, limit);
  }

  function dedupeAutoCandidates(candidates) {
    const used = new Set();
    const out = [];
    for (const candidate of candidates) {
      if (candidate.wordIndexes.some(index => used.has(index))) continue;
      candidate.wordIndexes.forEach(index => used.add(index));
      out.push(candidate);
    }
    return out;
  }

  function candidatesToKeywords(candidates, tokens) {
    const out = [];
    candidates.forEach((candidate, idx) => {
      if (idx > 0) out.push('|');
      for (const index of candidate.wordIndexes) {
        const clean = tokens[index]?.clean;
        if (clean) out.push(`${clean}@${index}`);
      }
    });
    return out;
  }

  function idiomCandidates(words, vocab) {
    const out = [];
    for (let start = 0; start < words.length; start++) {
      for (const parts of AUTO_KEYWORD_IDIOMS) {
        if (!autoContainsTerm(words, start, parts)) continue;
        const term = autoTermKey(parts);
        if (vocab.terms.has(term)) continue;
        const score = autoKnownScore(vocab.termInfo.get(term), PONTOS_DO_IDIOMA);
        out.push({
          score: score + parts.length,
          wordIndexes: words.slice(start, start + parts.length).map(word => word.index),
        });
      }
    }
    return out;
  }

  function contentExpressionCandidates(words, vocab) {
    const out = [];
    for (let i = 0; i < words.length - 2; i++) {
      const first = words[i];
      const linker = words[i + 1];
      const third = words[i + 2];
      if (!AUTO_CONTENT_LINKERS.has(linker.clean)) continue;
      if (!isAutoKeywordWord(first.clean) || !isAutoKeywordWord(third.clean)) continue;

      const parts = [first.clean, linker.clean, third.clean];
      const term = autoTermKey(parts);
      if (vocab.terms.has(term)) continue;
      if (!autoHasUnknownContentWord([first, third], vocab)) continue;

      const score = autoKnownScore(vocab.termInfo.get(term), PONTOS_DA_EXPRESSAO_DE_CONTEUDO);
      out.push({
        score: score + Math.min(8, first.clean.length + third.clean.length),
        wordIndexes: [first.index, linker.index, third.index],
      });
    }
    return out;
  }

  function actionObjectCandidates(words, vocab) {
    const out = [];
    for (let i = 0; i < words.length - 1; i++) {
      const action = words[i];
      const object = words[i + 1];
      if (!isAutoActionObjectStart(action.clean)) continue;
      if (!isAutoKeywordWord(object.clean)) continue;

      const parts = [action.clean, object.clean];
      const term = autoTermKey(parts);
      if (vocab.terms.has(term)) continue;
      if (!autoHasUnknownContentWord([action, object], vocab)) continue;

      const score = autoKnownScore(vocab.termInfo.get(term), PONTOS_DA_ACAO_COM_OBJETO);
      out.push({
        score: score + Math.min(8, action.clean.length + object.clean.length),
        wordIndexes: [action.index, object.index],
      });
    }
    return out;
  }

  function patternCandidates(words, vocab) {
    const out = [];
    for (let start = 0; start < words.length; start++) {
      for (const parts of AUTO_KEYWORD_PATTERNS) {
        if (!autoContainsTerm(words, start, parts)) continue;
        const term = autoTermKey(parts);
        if (vocab.terms.has(term)) continue;
        const score = autoKnownScore(vocab.termInfo.get(term), PONTOS_DO_PADRAO);
        out.push({
          score: score + parts.length,
          wordIndexes: words.slice(start, start + parts.length).map(word => word.index),
        });
      }
    }
    return out;
  }

  function phrasalVerbAt(words, start) {
    const [verbo, particula, complemento] = words.slice(start, start + 3);
    if (AUTO_KEYWORD_STOP_WORDS.has(verbo.clean) || !AUTO_PHRASAL_PARTICLES.has(particula.clean)) return null;
    return complemento && AUTO_PHRASAL_TRAILERS.has(complemento.clean) ? [verbo, particula, complemento] : [verbo, particula];
  }

  function isNewPhrasalVerb(parts, vocab) {
    const [verbo] = parts;
    return !vocab.terms.has(autoTermKey(parts.map(word => word.clean)))
      && (AUTO_STRONG_PHRASAL_ROOTS.has(verbo.clean) || autoHasUnknownContentWord([verbo], vocab));
  }

  function phrasalVerbCandidates(words, vocab) {
    const out = [];
    for (let i = 0; i < words.length - 1; i++) {
      const parts = phrasalVerbAt(words, i);
      if (!parts || !isNewPhrasalVerb(parts, vocab)) continue;
      const info = vocab.termInfo.get(autoTermKey(parts.map(word => word.clean)));
      out.push({
        score: genericPhrasalScore(parts[0].clean, info, PHRASAL_VERB_SCORES) + parts.length,
        wordIndexes: parts.map(word => word.index),
      });
    }
    return out;
  }

  function unknownWordCandidates(words, vocab) {
    return words
      .filter(word => isAutoKeywordWord(word.clean) && !vocab.words.has(word.clean))
      .map(word => ({
        score: singleWordScore(word.clean),
        wordIndexes: [word.index],
      }));
  }

  function russianUnknownWordCandidates(words, vocab) {
    return words
      .filter(word => isAutoKeywordRussianWord(word.clean) && !vocab.words.has(word.clean))
      .map(word => ({
        score: 75 + Math.min(25, word.clean.length),
        wordIndexes: [word.index],
      }));
  }

  function autoContainsTerm(words, start, parts) {
    if (start + parts.length > words.length) return false;
    return parts.every((part, idx) => words[start + idx].clean === part);
  }

  function autoHasUnknownContentWord(words, vocab) {
    return words.some(word => isAutoKeywordWord(word.clean) && !vocab.words.has(word.clean));
  }

  function genericPhrasalScore(first, info, scores) {
    const base = autoKnownScore(info, scores);
    return AUTO_STRONG_PHRASAL_ROOTS.has(first) ? base + 58 : base;
  }

  function singleWordScore(word) {
    const strong = AUTO_STRONG_SINGLE_WORDS.has(word) ? 55 : 0;
    const length = Math.min(16, word.length);
    const shortAction = word.length <= 3 && AUTO_STRONG_SINGLE_WORDS.has(word) ? 14 : 0;
    return 70 + length + strong + shortAction;
  }

  function isAutoActionObjectStart(word) {
    return !AUTO_KEYWORD_STOP_WORDS.has(word) && (AUTO_ACTION_OBJECT_WORDS.has(word) || (word.length > 5 && word.endsWith('ing')));
  }

  function isAutoKeywordWord(word) {
    return Boolean(
      word
      && word.length >= 3
      && /[a-z]/i.test(word)
      && !/\d/.test(word)
      && !AUTO_KEYWORD_STOP_WORDS.has(word)
    );
  }

  function isAutoKeywordRussianWord(word) {
    return Boolean(
      word
      && word.length >= 2
      && detectarIdioma(word) === IDIOMAS.RUSSO
      && !/\d/.test(word)
      && !AUTO_KEYWORD_STOP_WORDS_RU.has(word)
    );
  }

  function autoKnownScore(info, scores) {
    if (!info) return scores.unknown || 0;
    const status = String(info.status || 'seen');
    return scores[STATUS_WITH_OWN_SCORE.has(status) ? status : 'seen'] || scores.seen || 0;
  }

  function isMineracaoAutomaticaCleanText(texto) {
    const clean = normalizeMineracaoAutomaticaText(texto);
    if (clean.length < 4) return false;
    if (/^[\d\s:.,!?-]+$/.test(clean)) return false;
    if (contarLetras(clean) < 2) return false;
    const lower = clean.toLowerCase();
    return ![
      'skip intro', 'skip recap', 'next episode', 'prime video', 'audio', 'subtitles',
      'pular abertura', 'próximo episódio', 'legendas', 'temporada', 'episódio',
    ].some(part => lower === part || lower.includes(part));
  }

  function palavrasDoTexto(texto) {
    const tokens = Mineracao.tokenizar(texto || '');
    const words = tokens
      .map((tok, index) => ({ ...tok, index }))
      .filter(tok => tok.isWord && tok.clean);
    return { tokens, words };
  }

  function bestScoreFirst(a, b) {
    return b.score - a.score || a.wordIndexes[0] - b.wordIndexes[0];
  }

  function escolherEmRusso(words, tokens, vocab, options) {
    if (!vocab.available) return [];
    const candidates = russianUnknownWordCandidates(words, vocab);
    candidates.sort(bestScoreFirst);
    return candidatesToKeywords(candidates.slice(0, options.limit || 1), tokens);
  }

  function escolherEmIngles(words, tokens, vocab, options) {
    if (!vocab.available && options.requireVocabulary) return [];
    const candidates = pickAutoKeywordCandidates(words, vocab, Math.min(options.limit || AUTO_KEYWORD_MAX_EN_GROUPS, AUTO_KEYWORD_MAX_EN_GROUPS));
    return candidatesToKeywords(candidates, tokens);
  }

  function escolher(texto, lang, vocab, options = {}) {
    const { tokens, words } = palavrasDoTexto(texto);
    if (!words.length) return [];
    const escolherNoIdioma = lang === 'ru' ? escolherEmRusso : escolherEmIngles;
    return escolherNoIdioma(words, tokens, vocab, options);
  }

  async function escolherCom(texto, lang, vocabulario, options = {}) {
    if (!palavrasDoTexto(texto).words.length) return [];
    const vocab = typeof vocabulario === 'function' ? await vocabulario() : vocabulario;
    return escolher(texto, lang, vocab, options);
  }

  const PRONOMES_DE_OBJETO = new Set(['it', 'them', 'him', 'her', 'me', 'you', 'us']);
  const MAXIMO_DE_PALAVRAS_DE_UM_TERMO = 5;
  const NOME_PROPRIO = /^\p{Lu}.*\p{Ll}/u;
  const FIM_DE_FRASE = /[.!?\u2026]/;

  const NIVEL_INICIANTE = 'iniciante';
  const LIMITES_DO_INICIANTE = Object.freeze({ palavrasDaLinhaCurta: 3, palavrasConhecidasParaALinhaNormal: 200 });

  const ELIMINACAO_DO_IDIOMA = Object.freeze({
    en: { codigo: 'en', contaComoPalavra: isAutoKeywordWord, tamanhoMaximo: 240, motivoDoAceito: 'en_new_item' },
    ru: { codigo: 'ru', contaComoPalavra: isAutoKeywordRussianWord, tamanhoMaximo: Infinity, motivoDoAceito: 'ru_i_plus_1' },
  });

  const recusar = reason => ({ accept: false, reason });

  function ehConhecido(itens, informacoes, chave) {
    return itens.has(chave) && informacoes.get(chave)?.status !== 'new';
  }

  function termosPossiveis(words) {
    const termos = [];
    for (let inicio = 0; inicio < words.length; inicio++) {
      const fimMaximo = Math.min(words.length, inicio + MAXIMO_DE_PALAVRAS_DE_UM_TERMO);
      for (let fim = inicio + 2; fim <= fimMaximo; fim++) {
        termos.push({ chave: autoTermKey(words.slice(inicio, fim).map(word => word.clean)), inicio, fim });
      }
    }
    return termos;
  }

  function posicoesDeTermosConhecidos(words, vocab) {
    const posicoes = new Set();
    for (const { chave, inicio, fim } of termosPossiveis(words)) {
      if (!ehConhecido(vocab.terms, vocab.termInfo, chave)) continue;
      for (let posicao = inicio; posicao < fim; posicao++) posicoes.add(posicao);
    }
    return posicoes;
  }

  function abreAFrase({ tokens, words }, posicao) {
    if (posicao === 0) return true;
    const entre = tokens.slice(words[posicao - 1].index + 1, words[posicao].index).map(token => token.text).join('');
    return FIM_DE_FRASE.test(entre);
  }

  function ehNomeProprio(linha, posicao) {
    return NOME_PROPRIO.test(linha.words[posicao].text) && !abreAFrase(linha, posicao);
  }

  function primeirasOcorrencias(words) {
    return words.filter((word, posicao) => words.findIndex(outra => outra.clean === word.clean) === posicao);
  }

  function coisasQueSobram(linha, vocab, idioma) {
    const cobertas = posicoesDeTermosConhecidos(linha.words, vocab);
    const sobram = linha.words.filter((word, posicao) => idioma.contaComoPalavra(word.clean)
      && !cobertas.has(posicao)
      && !ehConhecido(vocab.words, vocab.wordInfo, word.clean)
      && !ehNomeProprio(linha, posicao));
    return primeirasOcorrencias(sobram);
  }

  function particulaSeparada(words, posicao) {
    const [pronome, particula] = words.slice(posicao + 1, posicao + 3);
    const separada = pronome && particula && PRONOMES_DE_OBJETO.has(pronome.clean) && AUTO_PHRASAL_PARTICLES.has(particula.clean);
    return separada ? [words[posicao], particula] : null;
  }

  function palavrasDaCoisaNova(words, nova) {
    const posicao = words.indexOf(nova);
    if (!AUTO_STRONG_PHRASAL_ROOTS.has(nova.clean)) return [nova];
    const colada = posicao + 1 < words.length ? phrasalVerbAt(words, posicao) : null;
    return colada || particulaSeparada(words, posicao) || [nova];
  }

  function palavrasConhecidas(vocab) {
    let total = 0;
    for (const palavra of vocab.words) {
      if (ehConhecido(vocab.words, vocab.wordInfo, palavra)) total++;
    }
    return total;
  }

  function linhaLongaParaOIniciante(linha, vocab) {
    const { palavrasDaLinhaCurta, palavrasConhecidasParaALinhaNormal } = LIMITES_DO_INICIANTE;
    return linha.words.length > palavrasDaLinhaCurta && palavrasConhecidas(vocab) < palavrasConhecidasParaALinhaNormal;
  }

  const aceitar = (idioma, linha, palavras) => ({
    accept: true,
    reason: idioma.motivoDoAceito,
    keywords: candidatesToKeywords([{ wordIndexes: palavras.map(word => word.index) }], linha.tokens),
  });

  // Uma coisa nova: as palavras dela, o tipo e se é comum. Só o tipo e o "comum" decidem o Nível.
  function veredito(coisas, linha, idioma, nivel) {
    if (coisas.length === 0) return recusar('nada_novo');
    if (coisas.length > 1) return recusar('nao_e_i_mais_1');
    const [{ palavras, tipo, comum }] = coisas;
    if (!PalavraEmDuvida.nivelAceita(nivel, tipo, comum)) return recusar('fora_do_nivel');
    return aceitar(idioma, linha, palavras);
  }

  const coisasDasPalavras = (linha, sobram, idioma) => sobram.map(nova => ({
    palavras: palavrasDaCoisaNova(linha.words, nova),
    tipo: 'palavra',
    comum: PalavrasFrequentes.ehFrequente(idioma.codigo, nova.clean),
  }));

  const avaliarPorEliminacao = (linha, sobram, idioma, nivel) => veredito(coisasDasPalavras(linha, sobram, idioma), linha, idioma, nivel);

  async function perguntarATermos(termosDaIA) {
    try {
      return await termosDaIA();
    } catch {
      return null;
    }
  }

  function coisasComOsTermos(linha, vocab, sobram, termos, idioma) {
    const conhece = palavras => ehConhecido(vocab.terms, vocab.termInfo, autoTermKey(palavras.map(word => word.clean)));
    const { desconhecidos, soltas } = PalavraEmDuvida.separar(linha.words, sobram, termos, conhece);
    return [...desconhecidos, ...coisasDasPalavras(linha, soltas, idioma)];
  }

  async function avaliarEmDuvida({ linha, vocab, idioma, nivel, sobram, sozinho }, termosDaIA) {
    const termos = await perguntarATermos(termosDaIA);
    const doCodigo = PalavraEmDuvida.termosValidos(termos, linha.words.length) ? veredito(coisasComOsTermos(linha, vocab, sobram, termos, idioma), linha, idioma, nivel) : sozinho;
    return { ...doCodigo, iaPerguntada: true };
  }

  const resolver = valor => (typeof valor === 'function' ? valor() : valor);

  function recusaDoTexto(texto, idioma) {
    if (!isMineracaoAutomaticaCleanText(texto)) return recusar('low_quality_text');
    if (normalizeMineracaoAutomaticaText(texto).length > idioma.tamanhoMaximo) return recusar('too_long_en');
    return null;
  }

  const recusaDoNivel = (linha, vocab, nivel) => (nivel === NIVEL_INICIANTE && linhaLongaParaOIniciante(linha, vocab) ? recusar('linha_longa') : null);

  async function avaliarAsCoisasNovas({ texto, linha, vocab, idioma, nivel }, termosDaIA) {
    const sobram = coisasQueSobram(linha, vocab, idioma);
    const sozinho = avaliarPorEliminacao(linha, sobram, idioma, nivel);
    const perguntar = PalavraEmDuvida.emDuvida(linha.words, sobram) && PalavraEmDuvida.podePerguntar(nivel, normalizeMineracaoAutomaticaText(texto), termosDaIA);
    return perguntar ? avaliarEmDuvida({ linha, vocab, idioma, nivel, sobram, sozinho }, termosDaIA) : sozinho;
  }

  async function avaliar(texto, lang, { vocabulario, nivel: nivelDaPessoa, termos: termosDaIA }) {
    const idioma = ELIMINACAO_DO_IDIOMA[lang] || ELIMINACAO_DO_IDIOMA.en;
    const doTexto = recusaDoTexto(texto, idioma);
    if (doTexto) return doTexto;
    const vocab = await resolver(vocabulario);
    if (!vocab.available) return recusar('sem_vocabulario');
    const nivel = await resolver(nivelDaPessoa);
    const linha = palavrasDoTexto(texto);
    return recusaDoNivel(linha, vocab, nivel) || avaliarAsCoisasNovas({ texto, linha, vocab, idioma, nivel }, termosDaIA);
  }

  function chaveDoTermo(valor) {
    return autoTermKey(autoTermParts(valor));
  }

  function normalizeMineracaoAutomaticaText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  raiz.PalavraAutomatica = Object.freeze({
    MAXIMO_DE_GRUPOS_EN: AUTO_KEYWORD_MAX_EN_GROUPS,
    LIMITES_DO_INICIANTE,
    escolher,
    escolherCom,
    avaliar,
    chaveDoTermo,
    normalizarTexto: normalizeMineracaoAutomaticaText,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
