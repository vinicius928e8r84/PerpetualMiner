'use strict';

(function (raiz) {
  const EN = new Set([
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

  const RU = new Set([
    'а', 'без', 'бы', 'в', 'вам', 'вас', 'все', 'всё', 'вы', 'где', 'да', 'для', 'до', 'его', 'ее', 'её',
    'если', 'есть', 'же', 'за', 'и', 'из', 'или', 'им', 'их', 'к', 'как', 'ко', 'когда', 'ли', 'мне',
    'мы', 'на', 'над', 'нас', 'не', 'него', 'нее', 'неё', 'нет', 'ни', 'но', 'ну', 'о', 'об', 'он',
    'она', 'они', 'оно', 'от', 'по', 'под', 'при', 'с', 'со', 'так', 'там', 'тебе', 'тебя', 'то',
    'только', 'ты', 'у', 'уже', 'что', 'чтобы', 'это', 'я',
  ]);

  raiz.PalavrasGramaticais = Object.freeze({ EN, RU });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
