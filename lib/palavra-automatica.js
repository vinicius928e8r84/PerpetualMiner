'use strict';

(function (raiz) {
  const { detectarIdioma, contarLetras, IDIOMAS, Mineracao } = raiz;

  const AUTO_KEYWORD_MIN_SCORE = 70;
  const AUTO_KEYWORD_MAX_EN_GROUPS = 2;
  const AUTO_MINER_MAX_EN_KEYWORDS = AUTO_KEYWORD_MAX_EN_GROUPS;

  function autoCleanWord(value) {
    return String(value || '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  }

  function autoTermParts(value) {
    return String(value || '').toLowerCase().match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || [];
  }

  function autoTermKey(parts) {
    return parts.map(autoCleanWord).filter(Boolean).join(' ');
  }

  const AUTO_KEYWORD_STOP_WORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
    'each', 'few', 'for', 'from', 'further',
    'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
    'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', 'it', "it's", 'its', 'itself',
    'just', 'me', 'more', 'most', 'my', 'myself',
    'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves',
    'out', 'over', 'own', 'same', 'she', "she's", 'should', 'so', 'some', 'such',
    'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', "there's",
    'these', 'they', "they're", 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
    'was', 'we', "we're", 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
    'you', 'your', 'yours', 'yourself', 'yourselves',
  ]);

  const AUTO_KEYWORD_STOP_WORDS_RU = new Set([
    'а', 'без', 'бы', 'в', 'вам', 'вас', 'все', 'всё', 'вы', 'где', 'да', 'для', 'до', 'его', 'ее', 'её',
    'если', 'есть', 'же', 'за', 'и', 'из', 'или', 'им', 'их', 'к', 'как', 'ко', 'когда', 'ли', 'мне',
    'мы', 'на', 'над', 'нас', 'не', 'него', 'нее', 'неё', 'нет', 'ни', 'но', 'ну', 'о', 'об', 'он',
    'она', 'они', 'оно', 'от', 'по', 'под', 'при', 'с', 'со', 'так', 'там', 'тебе', 'тебя', 'то',
    'только', 'ты', 'у', 'уже', 'что', 'чтобы', 'это', 'я',
  ]);

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

  function pickAutoKeywordCandidates(words, vocab, limit = 1) {
    const candidates = [
      ...idiomCandidates(words, vocab),
      ...contentExpressionCandidates(words, vocab),
      ...actionObjectCandidates(words, vocab),
      ...patternCandidates(words, vocab),
      ...phrasalVerbCandidates(words, vocab),
      ...unknownWordCandidates(words, vocab),
    ];
    candidates.sort((a, b) => b.score - a.score || a.wordIndexes[0] - b.wordIndexes[0]);
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
        const score = autoKnownScore(vocab.termInfo.get(term), {
          unknown: 122,
          new: 94,
          recent: 84,
          mixed: 70,
          seen: 60,
          mature: 36,
        });
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

      const score = autoKnownScore(vocab.termInfo.get(term), {
        unknown: 124,
        new: 96,
        recent: 86,
        mixed: 72,
        seen: 62,
        mature: 38,
      });
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

      const score = autoKnownScore(vocab.termInfo.get(term), {
        unknown: 118,
        new: 92,
        recent: 82,
        mixed: 68,
        seen: 58,
        mature: 34,
      });
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
        const score = autoKnownScore(vocab.termInfo.get(term), {
          unknown: 72,
          new: 52,
          recent: 44,
          mixed: 36,
          seen: 30,
          mature: 18,
        });
        out.push({
          score: score + parts.length,
          wordIndexes: words.slice(start, start + parts.length).map(word => word.index),
        });
      }
    }
    return out;
  }

  const AUTO_PHRASAL_SCORES = {
    unknown: 60,
    new: 50,
    recent: 42,
    mixed: 34,
    seen: 28,
    mature: 16,
  };

  function phrasalVerbCandidates(words, vocab) {
    const out = [];
    for (let i = 0; i < words.length - 1; i++) out.push(...phrasalCandidatesAt(words, i, vocab));
    return out;
  }

  function phrasalParts(words, i) {
    const parts = [words[i].clean, words[i + 1].clean];
    const trailer = words[i + 2]?.clean;
    if (trailer && AUTO_PHRASAL_TRAILERS.has(trailer)) parts.push(trailer);
    return parts;
  }

  function isPhrasalVerbWorthOffering(word, term, vocab) {
    if (vocab.terms.has(term)) return false;
    return AUTO_STRONG_PHRASAL_ROOTS.has(word.clean) || autoHasUnknownContentWord([word], vocab);
  }

  function phrasalCandidatesAt(words, i, vocab) {
    const first = words[i];
    if (AUTO_KEYWORD_STOP_WORDS.has(first.clean) || !AUTO_PHRASAL_PARTICLES.has(words[i + 1].clean)) return [];
    const parts = phrasalParts(words, i);
    const term = autoTermKey(parts);
    if (!isPhrasalVerbWorthOffering(first, term, vocab)) return [];
    const score = genericPhrasalScore(first.clean, vocab.termInfo.get(term), AUTO_PHRASAL_SCORES);
    const wordIndexes = words.slice(i, i + parts.length).map(word => word.index);
    return [{ score: score + parts.length, wordIndexes }];
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

  const AUTO_STATUS_WITH_OWN_SCORE = new Set(['mature', 'recent', 'new', 'mixed']);

  function autoKnownScore(info, scores) {
    if (!info) return scores.unknown || 0;
    const status = String(info.status || 'seen');
    const own = AUTO_STATUS_WITH_OWN_SCORE.has(status) ? scores[status] : 0;
    return own || scores.seen || 0;
  }

  function isAutoMinerCleanText(texto) {
    const clean = normalizeAutoMinerText(texto);
    if (clean.length < 4) return false;
    if (/^[\d\s:.,!?-]+$/.test(clean)) return false;
    if (contarLetras(clean) < 2) return false;
    const lower = clean.toLowerCase();
    return ![
      'skip intro', 'skip recap', 'next episode', 'prime video', 'audio', 'subtitles',
      'pular abertura', 'próximo episódio', 'legendas', 'temporada', 'episódio',
    ].some(part => lower === part || lower.includes(part));
  }

  function keywordGroups(keywords) {
    const groups = [];
    let current = [];
    for (const item of keywords || []) {
      if (item === '|') {
        if (current.length) groups.push(current);
        current = [];
      } else {
        current.push(item);
      }
    }
    if (current.length) groups.push(current);
    return groups;
  }

  function palavrasDoTexto(texto) {
    const tokens = Mineracao.tokenizar(texto || '');
    const words = tokens
      .map((tok, index) => ({ ...tok, index }))
      .filter(tok => tok.isWord && tok.clean);
    return { tokens, words };
  }

  function escolherRusso(words, tokens, vocab, options) {
    if (!vocab.available) return [];
    const candidates = russianUnknownWordCandidates(words, vocab);
    candidates.sort((a, b) => b.score - a.score || a.wordIndexes[0] - b.wordIndexes[0]);
    return candidatesToKeywords(candidates.slice(0, options.limit || 1), tokens);
  }

  function escolherIngles(words, tokens, vocab, options) {
    if (!vocab.available && options.requireVocabulary) return [];
    const limit = Math.min(options.limit || AUTO_KEYWORD_MAX_EN_GROUPS, AUTO_KEYWORD_MAX_EN_GROUPS);
    return candidatesToKeywords(pickAutoKeywordCandidates(words, vocab, limit), tokens);
  }

  function escolher(texto, lang, vocab, options = {}) {
    const { tokens, words } = palavrasDoTexto(texto);
    if (!words.length) return [];
    const escolhaDoIdioma = lang === 'ru' ? escolherRusso : escolherIngles;
    return escolhaDoIdioma(words, tokens, vocab, options);
  }

  async function escolherCom(texto, lang, vocabulario, options = {}) {
    if (!palavrasDoTexto(texto).words.length) return [];
    const vocab = typeof vocabulario === 'function' ? await vocabulario() : vocabulario;
    return escolher(texto, lang, vocab, options);
  }

  async function avaliar(texto, lang, vocabulario) {
    if (!isAutoMinerCleanText(texto)) return { accept: false, reason: 'low_quality_text' };
    if (lang === 'ru') {
      const keywords = await escolherCom(texto, 'ru', vocabulario, { limit: 2 });
      const groups = keywordGroups(keywords);
      if (groups.length !== 1) return { accept: false, reason: groups.length === 0 ? 'no_new_item' : 'not_i_plus_1' };
      return { accept: true, reason: 'ru_i_plus_1', keywords };
    }

    if (normalizeAutoMinerText(texto).length > 240) return { accept: false, reason: 'too_long_en' };
    const keywords = await escolherCom(texto, 'en', vocabulario, { limit: AUTO_MINER_MAX_EN_KEYWORDS, requireVocabulary: true });
    const groups = keywordGroups(keywords);
    if (groups.length === 0) return { accept: false, reason: 'no_new_item' };
    return { accept: true, reason: groups.length > 1 ? 'en_multi_new_items' : 'en_new_item', keywords };
  }

  function chaveDoTermo(valor) {
    return autoTermKey(autoTermParts(valor));
  }

  function normalizeAutoMinerText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  raiz.PalavraAutomatica = Object.freeze({
    MAXIMO_DE_GRUPOS_EN: AUTO_KEYWORD_MAX_EN_GROUPS,
    escolher,
    escolherCom,
    avaliar,
    chaveDoTermo,
    normalizarTexto: normalizeAutoMinerText,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
