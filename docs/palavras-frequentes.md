# The frequent words of the Iniciante

The Iniciante's Mineração automática only accepts a new word that is common. "Common" for a single word comes from a fixed list of frequent words per Idioma, `lib/palavras-frequentes-en.js` and `lib/palavras-frequentes-ru.js`, read through `lib/palavras-frequentes.js`, because no AI is asked about a line with one new word. Lists of phrasal verbs or slang are what the owner refused as fixed lists; a list of frequent words is closed, so a list is fine for it.

## Where the lists come from

- **Source:** [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave, the 2018 lists `content/2018/en/en_50k.txt` and `content/2018/ru/ru_50k.txt`: word counts over the OpenSubtitles 2018 subtitle corpus ([OPUS](https://opus.nlpl.eu/OpenSubtitles-v2018.php)). Subtitles are what the Mineração automática reads, so what is frequent there is what a learner meets first.
- **License:** the content is CC BY-SA 4.0 (the code of that repository is MIT), which allows copying, adapting and using it, even commercially, with credit and under the same license. The word lists in `lib/palavras-frequentes-en.js` and `lib/palavras-frequentes-ru.js` are an adaptation (a cut of the first words), so they stay under CC BY-SA 4.0, credited here to Hermit Dave and the OpenSubtitles corpus; the rest of the repository keeps its own license (AGPL-3.0). A change to the lists stays CC BY-SA 4.0 too.
- **What was taken:** the first 1500 words that qualify in each list (the number is what fits in one file under the repository's size limit, and it is the same for both Idiomas), in the file's order (most frequent first), keeping only words made of letters: Latin `a-z` with at least 3 letters for English (the length the rule counts as a word), Cyrillic `а-яё` with at least 2 letters for Russian. Numbers, words with an apostrophe or hyphen and one-letter words are left out. Nothing was added or reordered by hand.
- **How a word is looked up:** lowercased, with `PalavrasFrequentes.ehFrequente(lang, palavra)`. An inflected form that is not frequent on its own (a rare plural, a rare Russian case ending) is not on the list, so the Iniciante does not get it.

## Where the numbers live

The two numbers of the Iniciante's line, how many words a short line has (3) and how many known words the Vocabulário needs before the normal size returns (200), are `LIMITES_DO_INICIANTE` in `lib/palavra-automatica.js`; the tests name them from there.
